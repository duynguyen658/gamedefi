from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.dependencies import require_session, require_wallet
from app.api.quest import DEFAULT_QUESTS, quest_scenario_id
from app.blockchain.interface import PreparedRewardSubmission
from app.blockchain.solana_adapter import SolanaAdapterError, SolanaSubmissionError
from app.core.security import SessionPrincipal, normalize_wallet
from app.rewards.persistence import (
    RewardClaimRecord,
    RewardClaimUnavailable,
    RewardConflict,
    RewardEventRecord,
)
from app.rewards.reconciliation import reconcile_claim, reconcile_wallet
from app.schemas import QuestRewardClaimRequest, RewardClaimRequest, RewardOut

router = APIRouter(tags=["reward"])


def reward_out(record: RewardClaimRecord) -> RewardOut:
    explorer = (
        f"https://explorer.solana.com/tx/{record.tx_signature}?cluster={record.network}"
        if record.tx_signature
        else None
    )
    return RewardOut(
        id=record.id,
        claim_id=record.claim_id,
        wallet=record.wallet,
        chain="solana",
        network=record.network,
        source_type=record.source_type,
        source_id=record.source_id,
        battle_id=record.source_id if record.source_type == "battle" else None,
        amount=record.amount,
        tx_digest=record.tx_signature,
        receipt_address=record.receipt_address,
        status=record.status,
        error=record.error,
        created_at=record.created_at.isoformat(),
        updated_at=record.updated_at.isoformat(),
        explorer_url=explorer,
    )


def submit_event_reward(
    *,
    request: Request,
    event: RewardEventRecord,
    amount: int,
) -> RewardClaimRecord:
    settings = request.app.state.settings
    if settings.solana_network == "mainnet-beta" and not settings.reward_mainnet_enabled:
        raise HTTPException(status_code=503, detail="Reward Mainnet đang tạm đóng để kiểm tra vận hành")
    repository = request.app.state.reward_claims
    adapter = request.app.state.resolver.get("solana")
    try:
        claim, _created = repository.reserve_claim(event=event, amount=amount)
        if claim.status in {"submitted", "submission_unknown"}:
            try:
                reconcile_claim(repository, adapter, claim, settings.reward_distributor_authority)
            except SolanaAdapterError as exc:
                repository.mark_submission_uncertain(claim.claim_id, str(exc))
            current = repository.get_claim(claim.claim_id) or claim
            if (
                current.status == "submission_unknown"
                and current.tx_signature
                and current.receipt_address
                and current.signed_transaction
                and current.last_valid_block_height is not None
            ):
                persisted = PreparedRewardSubmission(
                    signature=current.tx_signature,
                    receipt_address=current.receipt_address,
                    signed_transaction=current.signed_transaction,
                    last_valid_block_height=current.last_valid_block_height,
                )
                try:
                    adapter.submit_reward(persisted)
                    repository.mark_submission_sent(current.claim_id)
                except SolanaSubmissionError as exc:
                    repository.mark_submission_uncertain(current.claim_id, str(exc))
            return repository.get_claim(claim.claim_id) or current
        if claim.status in {"confirmed", "preparing"}:
            return claim

        claim, acquired = repository.acquire_submission(claim.claim_id)
        if not acquired:
            return claim
        prepared = adapter.prepare_reward(
            claim.wallet,
            claim.amount,
            bytes.fromhex(claim.claim_id),
        )
        repository.mark_prepared(
            claim.claim_id,
            signature=prepared.signature,
            receipt_address=prepared.receipt_address,
            signed_transaction=prepared.signed_transaction,
            last_valid_block_height=prepared.last_valid_block_height,
        )
        try:
            adapter.submit_reward(prepared)
            repository.mark_submission_sent(claim.claim_id)
        except SolanaSubmissionError as exc:
            repository.mark_submission_uncertain(claim.claim_id, str(exc))
        current = repository.get_claim(claim.claim_id) or claim
        try:
            reconcile_claim(repository, adapter, current, settings.reward_distributor_authority)
        except SolanaAdapterError as exc:
            repository.mark_submission_uncertain(claim.claim_id, str(exc))
        return repository.get_claim(claim.claim_id) or current
    except RewardClaimUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RewardConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SolanaAdapterError as exc:
        if "claim" in locals():
            repository.mark_failed(claim.claim_id, str(exc))
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/rewards/claim", response_model=RewardOut)
def claim_battle_reward(
    body: RewardClaimRequest,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể claim phần thưởng on-chain")
    from app.core.store import store

    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại")
    repository = request.app.state.reward_claims
    event = repository.get_event(
        network=request.app.state.settings.solana_network,
        wallet=normalize_wallet(principal.chain, principal.wallet),
        source_type="battle",
        source_id=body.battle_id,
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy trận đánh đã được backend ghi nhận")
    if event.wallet != normalize_wallet(principal.chain, principal.wallet):
        raise HTTPException(status_code=403, detail="Trận đánh không thuộc về ví này")
    if not event.eligible:
        raise HTTPException(status_code=409, detail="Chỉ chiến thắng mới đủ điều kiện nhận HKDV")
    return reward_out(submit_event_reward(
        request=request,
        event=event,
        amount=request.app.state.settings.battle_reward_amount_base_units,
    ))


@router.post("/rewards/quests/claim", response_model=RewardOut)
def claim_quest_reward(
    body: QuestRewardClaimRequest,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể claim phần thưởng on-chain")
    from app.core.store import store

    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại")
    quest = next((item for item in DEFAULT_QUESTS if item["id"] == body.quest_id), None)
    if quest is None:
        raise HTTPException(status_code=404, detail="Nhiệm vụ không tồn tại")
    if quest["faction_id"] is not None and player.faction_id != quest["faction_id"]:
        raise HTTPException(status_code=403, detail="Nhiệm vụ không thuộc faction của người chơi")
    repository = request.app.state.reward_claims
    network = request.app.state.settings.solana_network
    wallet = normalize_wallet(principal.chain, principal.wallet)
    completed = repository.count_eligible_battles(
        network=network,
        wallet=wallet,
        scenario_id=quest_scenario_id(quest["id"]),
    )
    if completed < quest["required_battles"]:
        raise HTTPException(status_code=409, detail="Nhiệm vụ chưa hoàn thành đủ số trận thắng")
    event = repository.record_event(
        network=network,
        wallet=wallet,
        source_type="quest",
        source_id=quest["id"],
        qualifier=quest_scenario_id(quest["id"]),
        eligible=True,
        metadata={"required_battles": quest["required_battles"], "completed_battles": completed},
    )
    return reward_out(submit_event_reward(
        request=request,
        event=event,
        amount=request.app.state.settings.quest_reward_amount_base_units,
    ))


@router.get("/players/{wallet}/rewards", response_model=list[RewardOut])
def list_rewards(
    wallet: str,
    request: Request,
    chain: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, wallet)
    if chain is not None and chain.lower() != principal.chain:
        raise HTTPException(status_code=403, detail="Chain không thuộc phiên đăng nhập")
    normalized = normalize_wallet(principal.chain, principal.wallet)
    repository = request.app.state.reward_claims
    settings = request.app.state.settings
    adapter = request.app.state.resolver.get(principal.chain)
    try:
        reconcile_wallet(
            repository,
            adapter,
            network=settings.solana_network,
            wallet=normalized,
            distributor=settings.reward_distributor_authority,
        )
    except SolanaAdapterError:
        # History remains available from PostgreSQL while the public RPC is degraded.
        pass
    return [
        reward_out(record)
        for record in repository.list_wallet(
            network=settings.solana_network,
            wallet=normalized,
            limit=limit,
        )
    ]
