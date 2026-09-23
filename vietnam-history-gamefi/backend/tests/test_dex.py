import base64
import json
from decimal import Decimal

import httpx
import pytest
from solders.keypair import Keypair

from app.dex.interface import SOL_MINT, DexOrder, DexOrderRequestData, token_registry
from app.dex.jupiter_provider import JupiterDexProvider
from app.dex.mock_provider import MockDexProvider
from conftest import login


def auth_headers(player: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {player['access_token']}"}


class QuoteProvider:
    name = "raydium"
    supports_execution = True
    pool_id = "test-pool"
    program_id = "test-program"

    def get_order(self, request):
        return DexOrder(
            request_id="raydium_test_quote",
            input_symbol=request.input_token.symbol,
            output_symbol=request.output_token.symbol,
            in_amount=request.amount,
            out_amount="99401095",
            input_decimals=request.input_token.decimals,
            output_decimals=request.output_token.decimals,
            provider=self.name,
            router=self.pool_id,
            mode="exact-in",
            fee_bps=25,
            slippage_bps=request.slippage_bps,
            transaction=None,
            executable=True,
            simulation=False,
        )

    def execute(self, signed_transaction, request_id):
        raise AssertionError("not used")


def test_devnet_config_uses_executable_raydium_provider(client):
    response = client.get("/dex/config")
    assert response.status_code == 200
    assert response.json()["network"] == "devnet"
    assert response.json()["provider"] == "raydium"
    assert response.json()["supports_execution"] is True
    assert response.json()["pool_id"] == "6dg1ELPzBmmqs7UDTr8pAZmGNQY9XymEDo6KQx8h4J2r"
    assert {token["symbol"] for token in response.json()["tokens"]} == {"SOL", "HKDV"}


def test_dex_order_requires_wallet_session_and_returns_executable_quote(client):
    wallet, player = login(client)
    client.app.state.dex_provider = QuoteProvider()
    body = {
        "wallet": wallet,
        "input_symbol": "SOL",
        "output_symbol": "HKDV",
        "amount": "1000000000",
        "slippage_bps": 50,
        "idempotency_key": "dex-test-order-1",
    }
    assert client.post("/dex/order", json=body).status_code == 401
    response = client.post("/dex/order", json=body, headers=auth_headers(player))
    assert response.status_code == 200, response.text
    order = response.json()
    assert order["provider"] == "raydium"
    assert order["simulation"] is False
    assert order["executable"] is True
    assert order["transaction"] is None
    assert order["out_amount"] == "99401095"


def test_dex_rejects_another_wallet_and_invalid_pair(client):
    wallet, player = login(client)
    another_wallet = str(Keypair().pubkey())
    body = {
        "wallet": another_wallet,
        "input_symbol": "SOL",
        "output_symbol": "HKDV",
        "amount": "1",
        "idempotency_key": "dex-test-order-2",
    }
    assert client.post("/dex/order", json=body, headers=auth_headers(player)).status_code == 403
    body.update(wallet=wallet, output_symbol="SOL")
    assert client.post("/dex/order", json=body, headers=auth_headers(player)).status_code == 422


def test_mock_provider_quotes_both_directions_without_transaction():
    provider = MockDexProvider(Decimal("100"))
    tokens = token_registry("testnet")
    request = DexOrderRequestData(
        wallet=str(Keypair().pubkey()),
        input_token=tokens["USDC"],
        output_token=tokens["SOL"],
        amount="250000000",
        slippage_bps=100,
    )
    order = provider.get_order(request)
    assert order.out_amount == "2500000000"
    assert not order.executable
    assert order.simulation


def test_jupiter_provider_without_key_is_reported_unavailable_without_breaking_startup():
    provider = JupiterDexProvider("", "https://api.jup.ag/swap/v2")
    assert provider.supports_execution is False
    tokens = token_registry("mainnet-beta", str(Keypair().pubkey()))
    with pytest.raises(Exception, match="JUPITER_API_KEY"):
        provider.get_order(DexOrderRequestData(
            wallet=str(Keypair().pubkey()),
            input_token=tokens["SOL"],
            output_token=tokens["HKDV"],
            amount="1",
            slippage_bps=50,
        ))


def test_jupiter_provider_maps_order_and_execute_contract():
    requests = []
    mainnet_hkdv_mint = str(Keypair().pubkey())

    def handler(request: httpx.Request):
        requests.append(request)
        assert request.headers["x-api-key"] == "test-key"
        if request.url.path.endswith("/order"):
            assert request.url.params["inputMint"] == SOL_MINT
            assert request.url.params["outputMint"] == mainnet_hkdv_mint
            assert request.url.params["slippageBps"] == "50"
            return httpx.Response(200, json={
                "requestId": "request_123",
                "inAmount": "1000000000",
                "outAmount": "150000000",
                "transaction": base64.b64encode(b"transaction").decode(),
                "router": "metis",
                "mode": "manual",
                "feeBps": 2,
                "lastValidBlockHeight": 1234,
            })
        assert request.url.path.endswith("/execute")
        assert json.loads(request.content)["requestId"] == "request_123"
        return httpx.Response(200, json={
            "status": "Success",
            "signature": "signature_123",
            "code": 0,
            "totalInputAmount": "1000000000",
            "totalOutputAmount": "150000000",
        })

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = JupiterDexProvider("test-key", "https://api.jup.ag/swap/v2", client)
    tokens = token_registry("mainnet-beta", mainnet_hkdv_mint)
    order = provider.get_order(DexOrderRequestData(
        wallet=str(Keypair().pubkey()),
        input_token=tokens["SOL"],
        output_token=tokens["HKDV"],
        amount="1000000000",
        slippage_bps=50,
    ))
    assert order.executable and not order.simulation
    assert order.router == "metis"
    result = provider.execute(base64.b64encode(b"signed transaction").decode(), order.request_id)
    assert result.status == "Success"
    assert result.signature == "signature_123"
    assert len(requests) == 2
