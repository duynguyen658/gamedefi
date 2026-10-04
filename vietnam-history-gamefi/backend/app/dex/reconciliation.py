from __future__ import annotations

from dataclasses import dataclass

from app.blockchain.interface import BlockchainAdapter
from app.dex.persistence import DexSwapRepository
from app.dex.settlement import extract_settlement


@dataclass(frozen=True)
class ReconciliationResult:
    checked: int = 0
    confirmed: int = 0
    failed: int = 0
    pending: int = 0


def reconcile_wallet(repository: DexSwapRepository, adapter: BlockchainAdapter, wallet: str) -> ReconciliationResult:
    checked = confirmed = failed = pending = 0
    processed: set[str] = set()
    for swap in repository.pending_wallet(wallet):
        checked += 1
        processed.add(swap.request_id)
        transaction = adapter.get_transaction(swap.signature or "")
        if transaction is None or transaction.status == "pending":
            pending += 1
        elif transaction.status == "success" and transaction.sender == swap.wallet:
            repository.mark_reconciled(swap.request_id, "confirmed")
            settlement = extract_settlement(swap, transaction.raw)
            if settlement:
                repository.save_settlement(
                    swap.request_id, input_amount=settlement.input_amount,
                    output_amount=settlement.output_amount,
                    network_fee_lamports=settlement.network_fee_lamports,
                )
            confirmed += 1
        elif transaction.status == "success":
            repository.mark_submission_uncertain(swap.request_id, "Fee payer on-chain không khớp ví tạo lệnh")
            pending += 1
        else:
            repository.mark_reconciled(swap.request_id, "failed")
            failed += 1
    for swap in repository.unsettled_wallet(wallet):
        if swap.request_id in processed:
            continue
        transaction = adapter.get_transaction(swap.signature or "")
        if transaction is None or transaction.status != "success" or transaction.sender != swap.wallet:
            continue
        settlement = extract_settlement(swap, transaction.raw)
        if settlement:
            repository.save_settlement(
                swap.request_id, input_amount=settlement.input_amount,
                output_amount=settlement.output_amount,
                network_fee_lamports=settlement.network_fee_lamports,
            )
    return ReconciliationResult(checked, confirmed, failed, pending)
