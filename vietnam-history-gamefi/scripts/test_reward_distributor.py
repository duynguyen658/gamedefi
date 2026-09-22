"""Local-validator integration checks for the HKDV reward distributor."""
import base64
import hashlib
import json
import re
import struct
import subprocess
import sys
import tempfile
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
from app.blockchain.borsh_utils import BorshReader, BorshWriter, anchor_discriminator

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")


def main():
    rpc_url = "http://127.0.0.1:8899"
    source = (ROOT / "blockchain/solana/programs/history_game/src/lib.rs").read_text()
    program = Pubkey.from_string(re.search(r'declare_id!\("([^"]+)"\)', source).group(1))
    http = httpx.Client(timeout=20)

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

    def airdrop(keypair, lamports=2_000_000_000):
        finalized(rpc("requestAirdrop", [str(keypair.pubkey()), lamports]))

    def send(ix, payer, signers):
        blockhash = Hash.from_string(
            rpc("getLatestBlockhash", [{"commitment": "confirmed"}])["value"]["blockhash"]
        )
        tx = Transaction.new_signed_with_payer([ix], payer.pubkey(), signers, blockhash)
        signature = rpc(
            "sendTransaction",
            [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "preflightCommitment": "confirmed"}],
        )
        finalized(signature)
        return signature

    def ata(owner, mint):
        return Pubkey.find_program_address(
            [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)], ASSOCIATED_TOKEN_PROGRAM_ID
        )[0]

    def token_amount(address):
        return int(rpc("getTokenAccountBalance", [str(address), {"commitment": "confirmed"}])["value"]["amount"])

    def account_data(address):
        value = rpc("getAccountInfo", [str(address), {"encoding": "base64", "commitment": "confirmed"}])["value"]
        assert value is not None
        return base64.b64decode(value["data"][0])

    def expect_failure(ix, payer, signers, expected_text):
        try:
            send(ix, payer, signers)
        except RuntimeError as exc:
            assert expected_text in str(exc), exc
        else:
            raise AssertionError(f"Expected transaction failure containing {expected_text}")

    admin = Keypair()
    distributor = Keypair()
    recipient = Keypair()
    attacker = Keypair()
    for wallet in (admin, distributor, recipient, attacker):
        airdrop(wallet)

    with tempfile.TemporaryDirectory(prefix="hkdv-reward-test-") as temp_dir:
        temp = Path(temp_dir)
        admin_file = temp / "admin.json"
        mint_file = temp / "mint.json"
        admin_file.write_text(json.dumps(list(bytes(admin))))
        mint_keypair = Keypair()
        mint_file.write_text(json.dumps(list(bytes(mint_keypair))))
        mint = mint_keypair.pubkey()

        def cli(*args):
            result = subprocess.run(args, check=True, capture_output=True, text=True)
            return result.stdout

        cli(
            "spl-token", "--url", rpc_url, "--fee-payer", str(admin_file),
            "create-token", "--decimals", "6", "--mint-authority", str(admin.pubkey()), str(mint_file),
        )
        cli(
            "spl-token", "--url", rpc_url, "--fee-payer", str(admin_file),
            "create-account", str(mint), "--owner", str(admin.pubkey()),
        )
        source_account = ata(admin.pubkey(), mint)
        cli(
            "spl-token", "--url", rpc_url, "--fee-payer", str(admin_file),
            "mint", str(mint), "1000", str(source_account), "--mint-authority", str(admin_file),
        )

        config = Pubkey.find_program_address([b"reward-config"], program)[0]
        vault = ata(config, mint)
        max_reward = 100_000_000
        init_data = (
            anchor_discriminator("global", "initialize_reward_distributor")
            + BorshWriter().pubkey(bytes(distributor.pubkey())).u64(max_reward).bytes()
        )
        init_ix = Instruction(program, init_data, [
            AccountMeta(config, False, True),
            AccountMeta(mint, False, False),
            AccountMeta(vault, False, True),
            AccountMeta(admin.pubkey(), True, True),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
            AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, False, False),
            AccountMeta(SYSTEM_PROGRAM_ID, False, False),
        ])
        send(init_ix, admin, [admin])

        config_reader = BorshReader(account_data(config), 8)
        assert Pubkey.from_bytes(config_reader.read_pubkey()) == admin.pubkey()
        assert Pubkey.from_bytes(config_reader.read_pubkey()) == distributor.pubkey()
        assert Pubkey.from_bytes(config_reader.read_pubkey()) == mint
        assert Pubkey.from_bytes(config_reader.read_pubkey()) == vault
        config_reader.read_u8()
        assert config_reader.read_u8() == 0
        assert config_reader.read_u64() == max_reward

        fund_amount = 500_000_000
        fund_data = anchor_discriminator("global", "fund_reward_vault") + BorshWriter().u64(fund_amount).bytes()
        fund_ix = Instruction(program, fund_data, [
            AccountMeta(config, False, False),
            AccountMeta(mint, False, False),
            AccountMeta(vault, False, True),
            AccountMeta(source_account, False, True),
            AccountMeta(admin.pubkey(), True, False),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
        ])
        send(fund_ix, admin, [admin])
        assert token_amount(vault) == fund_amount

        claim_id = hashlib.sha256(b"battle:test-victory-1").digest()
        receipt = Pubkey.find_program_address([b"reward", claim_id], program)[0]
        recipient_account = ata(recipient.pubkey(), mint)
        reward_amount = 5_000_000
        distribute_data = (
            anchor_discriminator("global", "distribute_reward")
            + claim_id
            + BorshWriter().u64(reward_amount).bytes()
        )
        distribute_accounts = [
            AccountMeta(config, False, True),
            AccountMeta(receipt, False, True),
            AccountMeta(vault, False, True),
            AccountMeta(mint, False, False),
            AccountMeta(recipient.pubkey(), False, False),
            AccountMeta(recipient_account, False, True),
            AccountMeta(distributor.pubkey(), True, True),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
            AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, False, False),
            AccountMeta(SYSTEM_PROGRAM_ID, False, False),
        ]
        distribute_ix = Instruction(program, distribute_data, distribute_accounts)
        send(distribute_ix, distributor, [distributor])
        assert token_amount(recipient_account) == reward_amount
        assert token_amount(vault) == fund_amount - reward_amount

        receipt_reader = BorshReader(account_data(receipt), 8)
        assert receipt_reader._take(32) == claim_id
        assert Pubkey.from_bytes(receipt_reader.read_pubkey()) == recipient.pubkey()
        assert receipt_reader.read_u64() == reward_amount

        expect_failure(distribute_ix, distributor, [distributor], "already in use")

        unauthorized_claim = hashlib.sha256(b"battle:unauthorized").digest()
        unauthorized_receipt = Pubkey.find_program_address([b"reward", unauthorized_claim], program)[0]
        unauthorized_data = (
            anchor_discriminator("global", "distribute_reward")
            + unauthorized_claim
            + BorshWriter().u64(reward_amount).bytes()
        )
        unauthorized_accounts = distribute_accounts.copy()
        unauthorized_accounts[1] = AccountMeta(unauthorized_receipt, False, True)
        unauthorized_accounts[6] = AccountMeta(attacker.pubkey(), True, True)
        expect_failure(
            Instruction(program, unauthorized_data, unauthorized_accounts),
            attacker,
            [attacker],
            "UnauthorizedDistributor",
        )

        large_claim = hashlib.sha256(b"battle:too-large").digest()
        large_receipt = Pubkey.find_program_address([b"reward", large_claim], program)[0]
        large_data = (
            anchor_discriminator("global", "distribute_reward")
            + large_claim
            + BorshWriter().u64(max_reward + 1).bytes()
        )
        large_accounts = distribute_accounts.copy()
        large_accounts[1] = AccountMeta(large_receipt, False, True)
        expect_failure(
            Instruction(program, large_data, large_accounts),
            distributor,
            [distributor],
            "RewardTooLarge",
        )

        withdraw_amount = 10_000_000
        withdraw_data = anchor_discriminator("global", "withdraw_reward_tokens") + BorshWriter().u64(withdraw_amount).bytes()
        withdraw_ix = Instruction(program, withdraw_data, [
            AccountMeta(config, False, False),
            AccountMeta(mint, False, False),
            AccountMeta(vault, False, True),
            AccountMeta(source_account, False, True),
            AccountMeta(admin.pubkey(), True, False),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
        ])
        send(withdraw_ix, admin, [admin])
        assert token_amount(vault) == fund_amount - reward_amount - withdraw_amount

    print("PASS: reward vault funding, payout, receipt replay guard, authority, cap, withdrawal")


if __name__ == "__main__":
    main()
