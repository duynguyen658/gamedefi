from __future__ import annotations

from dataclasses import dataclass

from app.blockchain.interface import BlockchainAdapter
from app.dex.persistence import DexSwapRepository


@dataclass(frozen=True)
class ReconciliationResult:
    checked: int = 0
    confirmed: int = 0
    failed: int = 0
    pending: int = 0


def reconcile_wallet(repository: DexSwapRepository, adapter: BlockchainAdapter, wallet: str) -> ReconciliationResult:
    checked = confirmed = failed = pending = 0
    for swap in repository.pending_wallet(wallet):
        checked += 1
        transaction = adapter.get_transaction(swap.signature or "")
        if transaction is None or transaction.status == "pending":
            pending += 1
        elif transaction.status == "success" and transaction.sender == swap.wallet:
            repository.mark_reconciled(swap.request_id, "confirmed")
            confirmed += 1
        elif transaction.status == "success":
            repository.mark_submission_uncertain(swap.request_id, "Fee payer on-chain không khớp ví tạo lệnh")
            pending += 1
        else:
            repository.mark_reconciled(swap.request_id, "failed")
            failed += 1
    return ReconciliationResult(checked, confirmed, failed, pending)
