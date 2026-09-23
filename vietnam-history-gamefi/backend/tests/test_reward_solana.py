import base64
import json
import struct

import httpx
from solders.hash import Hash
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from app.blockchain.borsh_utils import anchor_discriminator
from app.blockchain.solana_adapter import SolanaAdapter
from app.core.config import Settings


PROGRAM_ID = "8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN"
RECIPIENT = "HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK"


def test_prepares_and_submits_distributor_signed_reward(tmp_path):
    signer = Keypair()
    keypair_path = tmp_path / "reward-keypair.json"
    keypair_path.write_text(json.dumps(list(bytes(signer))))
    calls = []

    def handler(request):
        body = json.loads(request.content)
        calls.append(body["method"])
        if body["method"] == "getLatestBlockhash":
            return httpx.Response(200, json={"result": {"value": {
                "blockhash": str(Hash.new_unique()),
                "lastValidBlockHeight": 999,
            }}})
        if body["method"] == "sendTransaction":
            transaction = Transaction.from_bytes(base64.b64decode(body["params"][0]))
            return httpx.Response(200, json={"result": str(transaction.signatures[0])})
        raise AssertionError(body["method"])

    settings = Settings(
        solana_program_id=PROGRAM_ID,
        reward_distributor_authority=str(signer.pubkey()),
        reward_distributor_keypair_path=str(keypair_path),
    )
    adapter = SolanaAdapter(settings, httpx.Client(transport=httpx.MockTransport(handler)))
    claim_id = bytes(range(32))
    prepared = adapter.prepare_reward(RECIPIENT, 5_000_000, claim_id)
    transaction = Transaction.from_bytes(base64.b64decode(prepared.signed_transaction))
    instruction = transaction.message.instructions[0]
    assert bytes(instruction.data) == (
        anchor_discriminator("global", "distribute_reward")
        + claim_id
        + (5_000_000).to_bytes(8, "little")
    )
    assert transaction.verify_with_results() == [True]
    assert str(transaction.message.account_keys[0]) == str(signer.pubkey())
    assert prepared.last_valid_block_height == 999
    assert adapter.submit_reward(prepared) == prepared.signature
    assert calls == ["getLatestBlockhash", "sendTransaction"]


def test_reads_exact_reward_receipt():
    claim_id = bytes(range(32))
    recipient = Pubkey.from_string(RECIPIENT)
    raw = (
        anchor_discriminator("account", "RewardReceipt")
        + claim_id
        + bytes(recipient)
        + struct.pack("<QQB", 5_000_000, 42, 254)
    )

    def handler(request):
        body = json.loads(request.content)
        assert body["method"] == "getAccountInfo"
        return httpx.Response(200, json={"result": {"value": {
            "owner": PROGRAM_ID,
            "executable": False,
            "data": [base64.b64encode(raw).decode(), "base64"],
        }}})

    adapter = SolanaAdapter(
        Settings(solana_program_id=PROGRAM_ID),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )
    receipt = adapter.get_reward_receipt(claim_id)
    assert receipt["claim_id"] == claim_id.hex()
    assert receipt["recipient"] == RECIPIENT
    assert receipt["amount"] == 5_000_000
    assert receipt["slot"] == 42
