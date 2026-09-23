import base64
import json

import httpx
from solders.pubkey import Pubkey

from app.blockchain.solana_adapter import SPL_TOKEN_PROGRAM_ID
from app.core.config import Settings
from app.dex.interface import DexOrderRequestData, HKDV_MINT, SOL_MINT, token_registry
from app.dex.raydium_provider import RaydiumDexProvider


def put_pubkey(data: bytearray, offset: int, value: str) -> None:
    data[offset:offset + 32] = bytes(Pubkey.from_string(value))


def put_u64(data: bytearray, offset: int, value: int) -> None:
    data[offset:offset + 8] = value.to_bytes(8, "little")


def account(data: bytes, owner: str) -> dict:
    return {"data": [base64.b64encode(data).decode(), "base64"], "owner": owner}


def pool_accounts(settings: Settings) -> list[dict]:
    pool = bytearray(637)
    put_pubkey(pool, 8, settings.raydium_config_id)
    put_pubkey(pool, 72, settings.raydium_wsol_vault)
    put_pubkey(pool, 104, settings.raydium_hkdv_vault)
    put_pubkey(pool, 168, SOL_MINT)
    put_pubkey(pool, 200, HKDV_MINT)
    pool[389] = 0

    config = bytearray(236)
    put_u64(config, 12, 2_500)
    put_u64(config, 20, 120_000)
    put_u64(config, 28, 40_000)
    put_u64(config, 108, 2_500)

    wsol = bytearray(165)
    put_pubkey(wsol, 0, SOL_MINT)
    put_u64(wsol, 64, 1_000_000_000)
    hkdv = bytearray(165)
    put_pubkey(hkdv, 0, HKDV_MINT)
    put_u64(hkdv, 64, 100_000_000_000)
    return [
        account(pool, settings.raydium_cpmm_program_id),
        account(config, settings.raydium_cpmm_program_id),
        account(wsol, SPL_TOKEN_PROGRAM_ID),
        account(hkdv, SPL_TOKEN_PROGRAM_ID),
    ]


def test_raydium_provider_quotes_exact_cpmm_amount_and_submits():
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        calls.append(body["method"])
        if body["method"] == "getMultipleAccounts":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {
                "context": {"slot": 1}, "value": pool_accounts(settings),
            }})
        if body["method"] == "sendTransaction":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": "signature-123"})
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {
            "context": {"slot": 2},
            "value": [{"err": None, "confirmationStatus": "confirmed"}],
        }})

    provider = RaydiumDexProvider(settings, httpx.Client(transport=httpx.MockTransport(handler)))
    tokens = token_registry("devnet")
    order = provider.get_order(DexOrderRequestData(
        wallet="oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T",
        input_token=tokens["SOL"],
        output_token=tokens["HKDV"],
        amount="1000000",
        slippage_bps=50,
    ))
    assert order.out_amount == "99401095"
    assert order.fee_bps == 50
    assert order.price_impact_bps == 9  # Curve impact excludes the separately displayed 50 bps fee.
    assert order.executable and not order.simulation
    assert order.transaction is None
    assert provider.required_transaction_accounts() == {
        settings.raydium_cpmm_program_id, settings.raydium_pool_id,
    }

    result = provider.execute("signed-base64", order.request_id)
    assert result.status == "Success"
    assert result.signature == "signature-123"
    assert calls == ["getMultipleAccounts", "sendTransaction", "getSignatureStatuses"]


def test_raydium_provider_subtracts_accrued_fees_from_reserves():
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")
    values = pool_accounts(settings)
    pool = bytearray(base64.b64decode(values[0]["data"][0]))
    put_u64(pool, 341, 100)
    put_u64(pool, 357, 200)
    put_u64(pool, 397, 300)
    values[0] = account(pool, settings.raydium_cpmm_program_id)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": {
            "context": {"slot": 1}, "value": values,
        }})

    provider = RaydiumDexProvider(settings, httpx.Client(transport=httpx.MockTransport(handler)))
    assert provider._pool_state()["sol_reserve"] == 999_999_400
