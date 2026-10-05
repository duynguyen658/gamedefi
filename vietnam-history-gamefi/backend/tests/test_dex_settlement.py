from types import SimpleNamespace
from datetime import timedelta

from sqlalchemy import select

from app.blockchain.interface import TransactionInfo
from app.dex.interface import DEVNET_USDC_MINT, SOL_MINT
from app.dex.interface import DexOrder
from app.dex.persistence import DexSwapModel, DexSwapRepository, intent_digest, utcnow
from app.dex.reconciliation import reconcile_wallet
from app.dex.settlement import extract_settlement


WALLET = "oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T"


def swap(input_symbol: str, output_symbol: str):
    return SimpleNamespace(
        network="devnet", wallet=WALLET, input_symbol=input_symbol,
        output_symbol=output_symbol, in_amount="1000000000",
    )


def transaction(*, pre_sol: int, post_sol: int, pre_token: int, post_token: int):
    return {
        "transaction": {"message": {"accountKeys": [WALLET]}},
        "meta": {
            "err": None, "fee": 5000,
            "preBalances": [pre_sol], "postBalances": [post_sol],
            "preTokenBalances": [{"owner": WALLET, "mint": DEVNET_USDC_MINT,
                                  "uiTokenAmount": {"amount": str(pre_token)}}],
            "postTokenBalances": [{"owner": WALLET, "mint": DEVNET_USDC_MINT,
                                   "uiTokenAmount": {"amount": str(post_token)}}],
        },
    }


def test_extracts_received_token_and_network_fee():
    result = extract_settlement(swap("SOL", "USDC"), transaction(
        pre_sol=2_000_000_000, post_sol=999_995_000, pre_token=0, post_token=2_400_000,
    ))
    assert result is not None
    assert result.input_amount == "1000000000"
    assert result.output_amount == "2400000"
    assert result.network_fee_lamports == 5000


def test_extracts_net_sol_received_after_network_fee():
    result = extract_settlement(swap("USDC", "SOL"), transaction(
        pre_sol=1_000_000_000, post_sol=1_019_995_000,
        pre_token=2_000_000, post_token=1_000_000,
    ))
    assert result is not None
    assert result.output_amount == "20000000"


def test_wsol_transfer_excludes_rent_refund_from_received_sol():
    raw = transaction(pre_sol=1_000_000_000, post_sol=1_022_034_280,
                      pre_token=2_000_000, post_token=1_000_000)
    vault = "wsol-vault"
    wrapped = "temporary-wsol-account"
    raw["transaction"]["message"]["accountKeys"] = [WALLET, vault, wrapped]
    raw["meta"]["preTokenBalances"].append({
        "accountIndex": 1, "owner": "pool-authority", "mint": SOL_MINT,
        "uiTokenAmount": {"amount": "300000000"},
    })
    raw["meta"]["innerInstructions"] = [{"instructions": [
        {"parsed": {"type": "transfer", "info": {
            "source": vault, "destination": wrapped, "amount": "20000000",
        }}},
        {"parsed": {"type": "closeAccount", "info": {
            "account": wrapped, "destination": WALLET,
        }}},
    ]}]
    result = extract_settlement(swap("USDC", "SOL"), raw)
    assert result.output_amount == "20000000"

    raw["meta"]["innerInstructions"][0]["instructions"].pop(0)
    assert extract_settlement(swap("USDC", "SOL"), raw).output_amount is None


def test_does_not_report_failed_transaction_as_settled():
    raw = transaction(pre_sol=1, post_sol=1, pre_token=0, post_token=0)
    raw["meta"]["err"] = {"InstructionError": [0, "Custom"]}
    assert extract_settlement(swap("SOL", "USDC"), raw) is None


def test_pending_swap_is_reconciled_and_receipt_is_saved():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    order = DexOrder(
        request_id="settlement-test", input_symbol="SOL", output_symbol="USDC",
        in_amount="1000000000", out_amount="2300000", input_decimals=9,
        output_decimals=6, provider="raydium", router="pool", mode="exact-in",
        fee_bps=50, slippage_bps=50, transaction=None, executable=True, simulation=False,
    )
    repository.save_order(
        network="devnet", wallet=WALLET, key="settlement-key",
        digest=intent_digest(wallet=WALLET, network="devnet", input_symbol="SOL",
                             output_symbol="USDC", amount=order.in_amount, slippage_bps=50),
        order=order,
    )
    repository.reserve_execution(request_id=order.request_id, wallet=WALLET, signature="test-signature")
    raw = transaction(pre_sol=2_000_000_000, post_sol=999_995_000,
                      pre_token=0, post_token=2_400_000)

    class Adapter:
        def get_transaction(self, digest):
            return TransactionInfo(digest=digest, status="success", sender=WALLET, raw=raw)

    result = reconcile_wallet(repository, Adapter(), WALLET)
    saved = repository.get_order(network="devnet", wallet=WALLET, request_id=order.request_id)
    assert result.confirmed == 1
    assert saved.status == "confirmed"
    assert saved.total_output_amount == "2400000"
    assert saved.network_fee_lamports == 5000


def test_unseen_signature_expires_after_blockhash_and_grace_period():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    order = DexOrder(
        request_id="expiry-test", input_symbol="SOL", output_symbol="USDC",
        in_amount="1000000000", out_amount="2300000", input_decimals=9,
        output_decimals=6, provider="raydium", router="pool", mode="exact-in",
        fee_bps=50, slippage_bps=50, transaction=None, executable=True, simulation=False,
    )
    repository.save_order(
        network="devnet", wallet=WALLET, key="expiry-key", digest="expiry-digest", order=order,
    )
    repository.reserve_execution(request_id=order.request_id, wallet=WALLET,
                                 signature="never-landed", recent_blockhash="expired-blockhash")
    with repository.sessions.begin() as db:
        row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == order.request_id))
        row.submitted_at = utcnow() - timedelta(minutes=4)

    class Adapter:
        def get_transaction(self, _digest):
            return None

        def get_signature_status(self, _digest):
            return None

        def is_blockhash_valid(self, _blockhash):
            return False

    result = reconcile_wallet(repository, Adapter(), WALLET)
    saved = repository.get_order(network="devnet", wallet=WALLET, request_id=order.request_id)
    assert result.failed == 1
    assert saved.status == "failed"
    assert "Blockhash" in saved.error


def test_known_signature_is_not_expired_while_finalized_lookup_lags():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    order = DexOrder(
        request_id="finality-lag", input_symbol="SOL", output_symbol="USDC",
        in_amount="1000000000", out_amount="2300000", input_decimals=9,
        output_decimals=6, provider="raydium", router="pool", mode="exact-in",
        fee_bps=50, slippage_bps=50, transaction=None, executable=True, simulation=False,
    )
    repository.save_order(network="devnet", wallet=WALLET, key="finality-lag",
                          digest="finality-lag", order=order)
    repository.reserve_execution(request_id=order.request_id, wallet=WALLET,
                                 signature="known-signature", recent_blockhash="old-blockhash")
    with repository.sessions.begin() as db:
        row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == order.request_id))
        row.submitted_at = utcnow() - timedelta(minutes=4)

    class Adapter:
        def get_transaction(self, _digest):
            return None

        def get_signature_status(self, _digest):
            return "success"

        def is_blockhash_valid(self, _blockhash):
            raise AssertionError("a known signature must not be expired")

    result = reconcile_wallet(repository, Adapter(), WALLET)
    assert result.pending == 1
    assert repository.get_order(network="devnet", wallet=WALLET,
                                request_id=order.request_id).status == "pending_confirmation"
