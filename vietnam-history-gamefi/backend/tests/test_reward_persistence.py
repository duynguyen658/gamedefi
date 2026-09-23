from __future__ import annotations

from app.blockchain.interface import TransactionInfo
from app.rewards.persistence import RewardRepository
from app.rewards.reconciliation import reconcile_wallet


class ReceiptAdapter:
    def __init__(self, signature: str, wallet: str, claim_id: str, amount: int, distributor: str):
        self.signature = signature
        self.wallet = wallet
        self.claim_id = claim_id
        self.amount = amount
        self.distributor = distributor

    def get_transaction(self, digest: str):
        assert digest == self.signature
        return TransactionInfo(digest=digest, status="success", sender=self.distributor)

    def get_reward_receipt(self, claim_id: bytes):
        assert claim_id.hex() == self.claim_id
        return {
            "claim_id": self.claim_id,
            "recipient": self.wallet,
            "amount": self.amount,
        }


def test_reward_event_and_claim_are_durable_and_idempotent():
    repository = RewardRepository("sqlite+pysqlite://", create_schema=True)
    event = repository.record_event(
        network="devnet",
        wallet="wallet-one",
        source_type="battle",
        source_id="battle-one",
        qualifier="bach_dang_1288",
        eligible=True,
        metadata={"victory": True},
    )
    same_event = repository.record_event(
        network="devnet",
        wallet="wallet-one",
        source_type="battle",
        source_id="battle-one",
        qualifier="bach_dang_1288",
        eligible=True,
        metadata={"victory": True},
    )
    assert same_event.id == event.id
    assert repository.count_eligible_battles(
        network="devnet", wallet="wallet-one", scenario_id="bach_dang_1288"
    ) == 1

    first, created = repository.reserve_claim(event=event, amount=5_000_000)
    repeated, created_again = repository.reserve_claim(event=event, amount=5_000_000)
    assert created is True
    assert created_again is False
    assert repeated.claim_id == first.claim_id
    assert len(first.claim_id) == 64


def test_same_quest_source_is_scoped_to_each_wallet():
    repository = RewardRepository("sqlite+pysqlite://", create_schema=True)
    first_event = repository.record_event(
        network="devnet",
        wallet="wallet-one",
        source_type="quest",
        source_id="quest-one",
        qualifier="bach_dang_1288",
        eligible=True,
    )
    second_event = repository.record_event(
        network="devnet",
        wallet="wallet-two",
        source_type="quest",
        source_id="quest-one",
        qualifier="bach_dang_1288",
        eligible=True,
    )
    first_claim, _ = repository.reserve_claim(event=first_event, amount=10_000_000)
    second_claim, _ = repository.reserve_claim(event=second_event, amount=10_000_000)
    assert first_claim.claim_id != second_claim.claim_id


def test_reconciliation_requires_matching_transaction_and_receipt():
    repository = RewardRepository("sqlite+pysqlite://", create_schema=True)
    event = repository.record_event(
        network="devnet",
        wallet="wallet-one",
        source_type="quest",
        source_id="quest-one",
        qualifier="bach_dang_1288",
        eligible=True,
    )
    claim, _ = repository.reserve_claim(event=event, amount=10_000_000)
    claim, acquired = repository.acquire_submission(claim.claim_id)
    assert acquired is True
    repository.mark_prepared(
        claim.claim_id,
        signature="signature-one",
        receipt_address="receipt-one",
        signed_transaction="signed-transaction",
        last_valid_block_height=123,
    )
    distributor = "distributor-one"
    result = reconcile_wallet(
        repository,
        ReceiptAdapter("signature-one", "wallet-one", claim.claim_id, 10_000_000, distributor),
        network="devnet",
        wallet="wallet-one",
        distributor=distributor,
    )
    assert result.confirmed == 1
    assert repository.get_claim(claim.claim_id).status == "confirmed"
