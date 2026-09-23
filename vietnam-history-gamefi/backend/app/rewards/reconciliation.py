from __future__ import annotations

from dataclasses import dataclass

from app.blockchain.interface import BlockchainAdapter
from app.rewards.persistence import RewardClaimRecord, RewardRepository


@dataclass(frozen=True)
class RewardReconciliationResult:
    checked: int = 0
    confirmed: int = 0
    failed: int = 0
    pending: int = 0


def reconcile_claim(
    repository: RewardRepository,
    adapter: BlockchainAdapter,
    claim: RewardClaimRecord,
    distributor: str,
) -> str:
    if not claim.tx_signature:
        repository.mark_failed(claim.claim_id, "Claim chưa có chữ ký Solana")
        return "failed"
    transaction = adapter.get_transaction(claim.tx_signature)
    if transaction is None or transaction.status == "pending":
        return "pending"
    if transaction.status == "failure":
        repository.mark_reconciled(claim.claim_id, "failed", "Giao dịch reward thất bại on-chain")
        return "failed"
    receipt = adapter.get_reward_receipt(bytes.fromhex(claim.claim_id))
    if (
        transaction.sender == distributor
        and receipt is not None
        and receipt.get("claim_id") == claim.claim_id
        and receipt.get("recipient") == claim.wallet
        and int(receipt.get("amount", -1)) == claim.amount
    ):
        repository.mark_reconciled(claim.claim_id, "confirmed")
        return "confirmed"
    repository.mark_submission_uncertain(
        claim.claim_id,
        "Giao dịch thành công nhưng signer hoặc receipt reward chưa khớp",
    )
    return "pending"


def reconcile_wallet(
    repository: RewardRepository,
    adapter: BlockchainAdapter,
    *,
    network: str,
    wallet: str,
    distributor: str,
) -> RewardReconciliationResult:
    checked = confirmed = failed = pending = 0
    for claim in repository.pending_wallet(network=network, wallet=wallet):
        checked += 1
        status = reconcile_claim(repository, adapter, claim, distributor)
        if status == "confirmed":
            confirmed += 1
        elif status == "failed":
            failed += 1
        else:
            pending += 1
    return RewardReconciliationResult(checked, confirmed, failed, pending)
