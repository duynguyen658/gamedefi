import base64
import json
from pathlib import Path

import httpx
import pytest
import base58
from app.blockchain.solana_adapter import SolanaAdapter, SolanaAdapterError
from app.core.config import Settings

VECTOR = json.loads((Path(__file__).resolve().parents[2] / "blockchain/solana/tests/faction-vector.json").read_text())


def adapter_for(account):
    def handler(request):
        body = json.loads(request.content)
        assert body["method"] == "getAccountInfo"
        assert body["params"][0] == VECTOR["proof_address"]
        return httpx.Response(200, json={"result": {"value": account}})
    return SolanaAdapter(Settings(solana_program_id=VECTOR["program_id"]), httpx.Client(transport=httpx.MockTransport(handler)))


def account(raw=None, **overrides):
    return {"owner": VECTOR["program_id"], "executable": False,
            "data": [base64.b64encode(raw if raw is not None else bytes.fromhex(VECTOR["proof_hex"])).decode(), "base64"], **overrides}


def test_reads_contract_asset_proof_layout_and_pda():
    adapter = adapter_for(account())
    nfts = adapter.get_faction_nfts(VECTOR["wallet"])
    assert len(nfts) == 1
    assert nfts[0].object_id == VECTOR["proof_address"]
    assert nfts[0].faction_id == 5
    assert adapter.verify_ownership(VECTOR["wallet"], VECTOR["proof_address"])
    assert not adapter.verify_ownership(VECTOR["wallet"], VECTOR["program_id"])


@pytest.mark.parametrize("value", [None, account(owner=VECTOR["wallet"]), account(executable=True),
    account(b"bad"), account(bytes(8) + bytes.fromhex(VECTOR["proof_hex"])[8:]),
    account(bytes.fromhex(VECTOR["proof_hex"])[:-1]),
    account(bytes.fromhex(VECTOR["proof_hex"])[:8] + bytes(32) + bytes.fromhex(VECTOR["proof_hex"])[40:]),
    account(data=["not base64!", "base64"])])
def test_rejects_missing_spoofed_or_truncated_proof(value):
    assert adapter_for(value).get_faction_nfts(VECTOR["wallet"]) == []


@pytest.mark.parametrize("response", [httpx.Response(502, text="bad gateway"), httpx.Response(200, text="not json"),
    httpx.Response(200, json={"error": {"message": "bad request"}})])
def test_rpc_errors_are_controlled(response):
    adapter = SolanaAdapter(Settings(), httpx.Client(transport=httpx.MockTransport(lambda r: response)))
    with pytest.raises(SolanaAdapterError):
        adapter.get_transaction("signature")


@pytest.mark.parametrize("program_id", ["", "11111111111111111111111111111111", "invalid"])
def test_requires_real_program_configuration(program_id):
    adapter = SolanaAdapter(Settings(solana_program_id=program_id))
    with pytest.raises(SolanaAdapterError):
        adapter.get_faction_nfts(VECTOR["wallet"])


def test_reward_and_server_mint_do_not_sign_or_simulate_transactions():
    adapter = SolanaAdapter(Settings())
    with pytest.raises(SolanaAdapterError):
        adapter.send_reward(VECTOR["wallet"], 1, 1)
    with pytest.raises(SolanaAdapterError):
        adapter.mint_faction(VECTOR["wallet"], 5)


def test_verifies_exact_mint_instruction_for_wallet_pda_and_faction():
    instruction = base58.b58encode(bytes.fromhex(VECTOR["instruction_hex"])).decode()

    def handler(request):
        body = json.loads(request.content)
        assert body["method"] == "getTransaction"
        return httpx.Response(200, json={"result": {
            "blockTime": 1_700_000_000,
            "meta": {"err": None},
            "transaction": {"message": {
                "accountKeys": [
                    VECTOR["wallet"],
                    VECTOR["proof_address"],
                    "11111111111111111111111111111111",
                    VECTOR["program_id"],
                ],
                "instructions": [{
                    "programIdIndex": 3,
                    "accounts": [1, 0, 2],
                    "data": instruction,
                }],
            }},
        }})

    adapter = SolanaAdapter(
        Settings(solana_program_id=VECTOR["program_id"]),
        httpx.Client(transport=httpx.MockTransport(handler)),
    )
    assert adapter.verify_faction_mint(
        VECTOR["wallet"], VECTOR["proof_address"], VECTOR["faction_id"], "signature"
    )
    assert not adapter.verify_faction_mint(
        VECTOR["wallet"], VECTOR["proof_address"], 6, "signature"
    )
    assert not adapter.verify_faction_mint(
        VECTOR["wallet"], VECTOR["program_id"], VECTOR["faction_id"], "signature"
    )
