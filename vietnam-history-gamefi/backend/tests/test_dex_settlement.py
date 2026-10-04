from types import SimpleNamespace

from app.blockchain.interface import TransactionInfo
from app.dex.interface import DEVNET_USDC_MINT
from app.dex.interface import DexOrder
from app.dex.persistence import DexSwapRepository, intent_digest
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
