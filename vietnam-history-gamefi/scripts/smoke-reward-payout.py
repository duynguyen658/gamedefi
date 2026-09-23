#!/usr/bin/env python3
"""Submit one explicitly authorized HKDV reward smoke claim on Solana Devnet."""
from __future__ import annotations

import argparse
import time

from app.blockchain.solana_adapter import SolanaAdapter
from app.core.config import Settings
from app.rewards.persistence import RewardRepository
from app.rewards.reconciliation import reconcile_claim


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipient", required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--keypair", required=True)
    parser.add_argument("--amount", type=int, default=5_000_000)
    parser.add_argument("--submit-devnet", action="store_true")
    args = parser.parse_args()
    if not args.submit_devnet:
        parser.error("--submit-devnet is required because this sends a real Devnet transaction")

    settings = Settings(
        solana_network="devnet",
        reward_distributor_keypair_path=args.keypair,
    )
    repository = RewardRepository("sqlite+pysqlite://", create_schema=True)
    adapter = SolanaAdapter(settings)
    event = repository.record_event(
        network="devnet",
        wallet=args.recipient,
        source_type="battle",
        source_id=args.source_id,
        qualifier="phase6_smoke",
        eligible=True,
        metadata={"smoke_test": True},
    )
    claim, _ = repository.reserve_claim(event=event, amount=args.amount)
    claim_bytes = bytes.fromhex(claim.claim_id)
    existing = adapter.get_reward_receipt(claim_bytes)
    if existing:
        print({"status": "already_confirmed", "claim_id": claim.claim_id, "receipt": existing["address"]})
        return 0

    claim, acquired = repository.acquire_submission(claim.claim_id)
    if not acquired:
        raise RuntimeError("smoke claim could not acquire submission lock")
    prepared = adapter.prepare_reward(args.recipient, args.amount, claim_bytes)
    repository.mark_prepared(
        claim.claim_id,
        signature=prepared.signature,
        receipt_address=prepared.receipt_address,
        signed_transaction=prepared.signed_transaction,
        last_valid_block_height=prepared.last_valid_block_height,
    )
    adapter.submit_reward(prepared)
    repository.mark_submission_sent(claim.claim_id)

    final_status = "pending"
    for _ in range(12):
        current = repository.get_claim(claim.claim_id)
        final_status = reconcile_claim(
            repository,
            adapter,
            current,
            settings.reward_distributor_authority,
        )
        if final_status != "pending":
            break
        time.sleep(2)
    final = repository.get_claim(claim.claim_id)
    print({
        "status": final.status,
        "claim_id": final.claim_id,
        "signature": final.tx_signature,
        "receipt": final.receipt_address,
        "amount_base_units": final.amount,
    })
    return 0 if final.status == "confirmed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
