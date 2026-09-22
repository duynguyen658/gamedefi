"""Anchor integration checks. Uses only the local validator at 127.0.0.1:8899."""
import base64
import re
import sys
import time
from pathlib import Path

import httpx
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from solders.transaction import Transaction

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.blockchain.borsh_utils import BorshWriter, anchor_discriminator
from app.blockchain.solana_adapter import SolanaAdapter
from app.core.config import Settings


def main():
    rpc_url = "http://127.0.0.1:8899"
    source = (ROOT / "blockchain/solana/programs/history_game/src/lib.rs").read_text()
    program = Pubkey.from_string(re.search(r'declare_id!\("([^"]+)"\)', source).group(1))
    assert program != SYSTEM_PROGRAM_ID, "Run anchor keys sync and anchor build first"
    http = httpx.Client(timeout=15)

    def rpc(method, params):
        response = http.post(rpc_url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        response.raise_for_status()
        body = response.json()
        if "error" in body:
            raise RuntimeError(body["error"])
        return body["result"]

    def finalized(signature):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            status = rpc("getSignatureStatuses", [[signature]])["value"][0]
            if status and status.get("confirmationStatus") == "finalized":
                assert status["err"] is None, status
                return
            time.sleep(0.2)
        raise TimeoutError("Local validator did not finalize transaction")

    owner = Keypair()
    finalized(rpc("requestAirdrop", [str(owner.pubkey()), 2_000_000_000]))
    proof = Pubkey.find_program_address([b"faction", bytes(owner.pubkey())], program)[0]

    def mint(reference):
        blockhash = Hash.from_string(rpc("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"])
        data = anchor_discriminator("global", "mint_faction") + BorshWriter().string(reference).string("").bytes()
        ix = Instruction(program, data, [AccountMeta(proof, False, True), AccountMeta(owner.pubkey(), True, True),
                                        AccountMeta(SYSTEM_PROGRAM_ID, False, False)])
        tx = Transaction.new_signed_with_payer([ix], owner.pubkey(), [owner], blockhash)
        sig = rpc("sendTransaction", [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "preflightCommitment": "confirmed"}])
        finalized(sig)

    try:
        mint("9")
    except RuntimeError as exc:
        assert "UnknownFaction" in str(exc), exc
    else:
        raise AssertionError("Unknown faction was accepted")
    mint("5")
    adapter = SolanaAdapter(Settings(solana_program_id=str(program), solana_rpc_url=rpc_url,
                                   factions_file=str(ROOT / "assets/nft/factions.json")))
    records = adapter.get_faction_nfts(str(owner.pubkey()))
    assert len(records) == 1 and records[0].faction_id == 5 and records[0].object_id == str(proof)
    try:
        mint("6")
    except RuntimeError:
        pass
    else:
        raise AssertionError("Wallet minted a second faction")
    assert not adapter.verify_ownership(str(Keypair().pubkey()), str(proof))
    print("PASS: invalid faction, mint, account layout, duplicate mint, ownership")


if __name__ == "__main__":
    main()
