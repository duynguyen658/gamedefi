import base64

from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from solders.message import Message
from solders.system_program import TransferParams, transfer
from solders.transaction import VersionedTransaction

from app.api.dex import signed_transaction_signature
from app.blockchain.interface import TransactionInfo
from app.dex.interface import DexExecution, DexOrder
from conftest import login


class ExecutableDexProvider:
    name = "test-router"
    supports_execution = True

    def __init__(self):
        self.order_calls = 0
        self.execute_calls = 0

    def get_order(self, request):
        self.order_calls += 1
        return DexOrder(
            request_id=f"order_owner_only_{self.order_calls}",
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
        self.execute_calls += 1
        signature = str(VersionedTransaction.from_bytes(base64.b64decode(signed_transaction)).signatures[0])
        return DexExecution("Success", signature, 0, "1", "100")


def headers(player):
    return {"Authorization": f"Bearer {player['access_token']}"}


def signed_transaction(owner: Keypair) -> str:
    instruction = transfer(TransferParams(
        from_pubkey=owner.pubkey(), to_pubkey=Keypair().pubkey(), lamports=1,
    ))
    message = Message.new_with_blockhash([instruction], owner.pubkey(), Hash.default())
    return base64.b64encode(bytes(VersionedTransaction(message, [owner]))).decode()


def order_body(wallet: str, key: str = "phase3-order-key") -> dict:
    return {
        "wallet": wallet,
        "input_symbol": "SOL",
        "output_symbol": "HKDV",
        "amount": "1",
        "slippage_bps": 50,
        "idempotency_key": key,
    }




def test_signed_transaction_requires_pool_in_raydium_instruction():
    owner = Keypair()
    recipient = Keypair().pubkey()
    unrelated_pool = Keypair().pubkey()
    transfer_instruction = transfer(TransferParams(
        from_pubkey=owner.pubkey(), to_pubkey=recipient, lamports=1,
    ))
    unrelated_instruction = Instruction(unrelated_pool, b"", [])
    message = Message.new_with_blockhash(
        [transfer_instruction, unrelated_instruction], owner.pubkey(), Hash.default(),
    )
    encoded = base64.b64encode(bytes(VersionedTransaction(message, [owner]))).decode()

    try:
        signed_transaction_signature(
            encoded,
            str(owner.pubkey()),
            (str(SYSTEM_PROGRAM_ID), str(unrelated_pool)),
        )
    except ValueError as exc:
        assert "không gọi đúng pool Raydium" in str(exc)
    else:
        raise AssertionError("transaction with an unrelated pool account must be rejected")


def test_signed_jupiter_transaction_must_match_quoted_message():
    owner = Keypair()
    quoted = signed_transaction(owner)
    assert signed_transaction_signature(quoted, str(owner.pubkey()), quoted_transaction=quoted)
    different = signed_transaction(owner)
    try:
        signed_transaction_signature(different, str(owner.pubkey()), quoted_transaction=quoted)
    except ValueError as exc:
        assert "khác giao dịch Jupiter" in str(exc)
    else:
        raise AssertionError("a different signed transaction must be rejected")


def test_order_is_idempotent_and_conflicting_reuse_is_rejected(client):
    owner_key = Keypair()
    wallet, player = login(client, owner_key)
    provider = ExecutableDexProvider()
    client.app.state.dex_provider = provider

    first = client.post("/dex/order", headers=headers(player), json=order_body(wallet))
    second = client.post("/dex/order", headers=headers(player), json=order_body(wallet))
    assert first.status_code == second.status_code == 200
    assert first.json()["request_id"] == second.json()["request_id"]
    assert provider.order_calls == 1

    conflict = order_body(wallet)
    conflict["amount"] = "2"
    response = client.post("/dex/order", headers=headers(player), json=conflict)
    assert response.status_code == 409
    assert provider.order_calls == 1


def test_executable_order_is_wallet_bound_and_single_use(client):
    owner_key = Keypair()
    owner_wallet, owner = login(client, owner_key)
    other_key = Keypair()
    other_wallet, other = login(client, other_key)
    provider = ExecutableDexProvider()
    client.app.state.dex_provider = provider
    order_response = client.post("/dex/order", headers=headers(owner), json=order_body(owner_wallet))
    assert order_response.status_code == 200
    request_id = order_response.json()["request_id"]

    wrong_owner = client.post("/dex/execute", headers=headers(other), json={
        "wallet": other_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction(other_key),
    })
    assert wrong_owner.status_code == 409

    execution = client.post("/dex/execute", headers=headers(owner), json={
        "wallet": owner_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction(owner_key),
    })
    assert execution.status_code == 200
    assert execution.json()["status"] == "Success"

    repeated = client.post("/dex/execute", headers=headers(owner), json={
        "wallet": owner_wallet,
        "request_id": request_id,
        "signed_transaction": signed_transaction(owner_key),
    })
    assert repeated.status_code == 409
    assert provider.execute_calls == 1

    history = client.get("/dex/history", headers=headers(owner))
    assert history.status_code == 200
    assert history.json()[0]["status"] == "confirmed"
    assert history.json()[0]["signature"] == execution.json()["signature"]


def test_history_is_wallet_scoped_and_reconciles_pending_signature(client, adapter):
    owner_key = Keypair()
    owner_wallet, owner = login(client, owner_key)
    other_wallet, other = login(client)
    provider = ExecutableDexProvider()
    client.app.state.dex_provider = provider
    order = client.post("/dex/order", headers=headers(owner), json=order_body(owner_wallet, "reconcile-key")).json()
    raw = signed_transaction(owner_key)
    signature = str(VersionedTransaction.from_bytes(base64.b64decode(raw)).signatures[0])
    client.app.state.dex_swaps.reserve_execution(
        request_id=order["request_id"], wallet=owner_wallet, signature=signature,
    )
    adapter.txs[signature] = TransactionInfo(signature, "success", sender=owner_wallet)

    response = client.post("/dex/reconcile", headers=headers(owner))
    assert response.status_code == 200
    assert response.json() == {"checked": 1, "confirmed": 1, "failed": 0, "pending": 0}
    assert client.get("/dex/history", headers=headers(other)).json() == []
    assert client.get("/dex/history", headers=headers(owner)).json()[0]["status"] == "confirmed"
