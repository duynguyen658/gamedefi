from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta, timezone

from app.blockchain.interface import BlockchainAdapter
from app.dex.persistence import DexSwapRepository, utcnow
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
        repository.mark_reconciliation_checked(swap.request_id)
        read_transaction = getattr(adapter, "get_dex_transaction", adapter.get_transaction)
        transaction = read_transaction(swap.signature or "")
        if transaction is None or transaction.status == "pending":
            # A finalized lookup can lag a confirmed signature. Check history
            # before declaring an old, no-longer-valid blockhash expired.
            submitted_at = swap.submitted_at
            if submitted_at and submitted_at.tzinfo is None:
                submitted_at = submitted_at.replace(tzinfo=timezone.utc)
            if (transaction is None and submitted_at
                    and utcnow() - submitted_at > timedelta(minutes=3)
                    and hasattr(adapter, "get_signature_status")):
                signature_status = adapter.get_signature_status(swap.signature or "")
                if signature_status == "failed":
                    repository.mark_reconciled(swap.request_id, "failed")
                    failed += 1
                    continue
                if signature_status is None and (
                    (swap.recent_blockhash and hasattr(adapter, "is_blockhash_valid")
                     and not adapter.is_blockhash_valid(swap.recent_blockhash))
                    or (not swap.recent_blockhash
                        and utcnow() - submitted_at > timedelta(minutes=30))
                ):
                    repository.mark_submission_uncertain(
                        swap.request_id, "Blockhash đã hết hạn và không tìm thấy giao dịch trên Solana",
                    )
                    repository.mark_reconciled(swap.request_id, "failed")
                    failed += 1
                    continue
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
        repository.mark_reconciliation_checked(swap.request_id)
        read_transaction = getattr(adapter, "get_dex_transaction", adapter.get_transaction)
        transaction = read_transaction(swap.signature or "")
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
