import base64
import json

import httpx
import pytest
from solders.pubkey import Pubkey

from app.blockchain.solana_adapter import SPL_TOKEN_PROGRAM_ID
from app.core.config import Settings
from app.dex.interface import DexOrderRequestData, DexSubmissionRejected, SOL_MINT, token_registry
from app.dex.raydium_provider import RaydiumDexProvider


def put_pubkey(data: bytearray, offset: int, value: str) -> None:
    data[offset:offset + 32] = bytes(Pubkey.from_string(value))


def put_u64(data: bytearray, offset: int, value: int) -> None:
    data[offset:offset + 8] = value.to_bytes(8, "little")


def account(data: bytes, owner: str) -> dict:
    return {"data": [base64.b64encode(data).decode(), "base64"], "owner": owner}


def pool_accounts(settings: Settings, symbol: str = "USDC") -> list[dict]:
    token = token_registry("devnet")[symbol]
    config_id = getattr(settings, f"raydium_{symbol.lower()}_config_id")
    wsol_vault = getattr(settings, f"raydium_{symbol.lower()}_wsol_vault")
    token_vault = getattr(settings, f"raydium_{symbol.lower()}_token_vault")
    pool = bytearray(637)
    put_pubkey(pool, 8, config_id)
    put_pubkey(pool, 72, wsol_vault)
    put_pubkey(pool, 104, token_vault)
    put_pubkey(pool, 168, SOL_MINT)
    put_pubkey(pool, 200, token.mint)
    pool[389] = 0

    config = bytearray(236)
    put_u64(config, 12, 2_500)
    put_u64(config, 20, 120_000)
    put_u64(config, 28, 40_000)
    put_u64(config, 108, 2_500)

    wsol = bytearray(165)
    put_pubkey(wsol, 0, SOL_MINT)
    put_u64(wsol, 64, 1_000_000_000)
    quote = bytearray(165)
    put_pubkey(quote, 0, token.mint)
    put_u64(quote, 64, 100_000_000_000)
    return [
        account(pool, settings.raydium_cpmm_program_id),
        account(config, settings.raydium_cpmm_program_id),
        account(wsol, SPL_TOKEN_PROGRAM_ID),
        account(quote, SPL_TOKEN_PROGRAM_ID),
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
        output_token=tokens["USDC"],
        amount="1000000",
        slippage_bps=50,
    ))
    assert order.out_amount == "99401095"
    assert order.fee_bps == 50
    assert order.price_impact_bps == 9  # Curve impact excludes the separately displayed 50 bps fee.
    assert order.executable and not order.simulation
    assert order.transaction is None
    assert provider.required_transaction_accounts(order.router) == (
        settings.raydium_cpmm_program_id, settings.raydium_usdc_pool_id,
    )

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
    assert provider._pool_state(provider.pools["USDC"])["sol_reserve"] == 999_999_400


def test_raydium_uses_separate_allowlisted_pool_for_usdt():
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["params"][0][0] == settings.raydium_usdt_pool_id
        return httpx.Response(200, json={"result": {"value": pool_accounts(settings, "USDT")}})
    provider = RaydiumDexProvider(settings, httpx.Client(transport=httpx.MockTransport(handler)))
    tokens = token_registry("devnet")
    order = provider.get_order(DexOrderRequestData(
        wallet="oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T",
        input_token=tokens["USDT"], output_token=tokens["SOL"],
        amount="1000000", slippage_bps=50,
    ))
    assert order.router == settings.raydium_usdt_pool_id
    assert order.out_amount.isdigit() and int(order.out_amount) > 0


def test_preflight_rejection_keeps_the_rpc_reason():
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {
            "code": -32002, "message": "Transaction simulation failed",
            "data": {"err": {"InstructionError": [2, "InsufficientFunds"]}},
        }})

    provider = RaydiumDexProvider(settings, httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(DexSubmissionRejected, match="InsufficientFunds"):
        provider.execute("signed-base64", "order")
