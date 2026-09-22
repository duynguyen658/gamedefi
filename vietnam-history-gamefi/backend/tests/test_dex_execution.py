import base64

from app.dex.interface import DexExecution, DexOrder
from conftest import login


class ExecutableDexProvider:
    name = "test-router"
    supports_execution = True

    def get_order(self, request):
        return DexOrder(
            request_id="order_owner_only",
            input_symbol=request.input_token.symbol,
            output_symbol=request.output_token.symbol,
            in_amount=request.amount,
            out_amount="100",
            input_decimals=request.input_token.decimals,
            output_decimals=request.output_token.decimals,
            provider=self.name,
            router="test",
            mode="test",
            fee_bps=0,
            slippage_bps=request.slippage_bps,
            transaction=base64.b64encode(b"unsigned transaction").decode(),
            executable=True,
            simulation=False,
        )

    def execute(self, signed_transaction, request_id):
        return DexExecution("Success", "signature", 0, "1", "100")


def headers(player):
    return {"Authorization": f"Bearer {player['access_token']}"}


def test_executable_order_is_wallet_bound_and_single_use(client):
    owner_wallet, owner = login(client)
    other_wallet, other = login(client)
    client.app.state.dex_provider = ExecutableDexProvider()
    order_response = client.post("/dex/order", headers=headers(owner), json={
        "wallet": owner_wallet,
        "input_symbol": "SOL",
        "output_symbol": "USDC",
        "amount": "1",
        "slippage_bps": 50,
    })
    assert order_response.status_code == 200
    request_id = order_response.json()["request_id"]
    signed_transaction = base64.b64encode(bytes(64)).decode()

    wrong_owner = client.post("/dex/execute", headers=headers(other), json={
        "wallet": other_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction,
    })
    assert wrong_owner.status_code == 409

    execution = client.post("/dex/execute", headers=headers(owner), json={
        "wallet": owner_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction,
    })
    assert execution.status_code == 200
    assert execution.json()["status"] == "Success"

    repeated = client.post("/dex/execute", headers=headers(owner), json={
        "wallet": owner_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction,
    })
    assert repeated.status_code == 409
