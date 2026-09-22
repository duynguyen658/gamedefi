import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_session, require_wallet
from app.blockchain.solana_adapter import SolanaAdapterError
from app.core.config import get_settings
from app.core.security import SessionPrincipal, normalize_wallet
from app.core.store import store
from app.schemas import RewardClaimRequest, RewardOut

router = APIRouter(tags=["reward"])


@router.post("/rewards/claim", response_model=RewardOut)
def claim_reward(
    body: RewardClaimRequest,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể claim phần thưởng on-chain")
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại")

    battle = store.get_battle(body.battle_id)
    if battle is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy trận đánh")
    if normalize_wallet(player.chain, battle.player_wallet) != player.wallet:
        raise HTTPException(status_code=403, detail="Trận đánh không thuộc về ví này")
    if not battle.victory:
        raise HTTPException(status_code=409, detail="Chỉ chiến thắng mới đủ điều kiện nhận reward on-chain")
    if not store.reserve_reward_claim(player.chain, player.wallet, body.battle_id):
        raise HTTPException(status_code=409, detail="Reward của trận này đã được claim hoặc đang xử lý")

    adapter = request.app.state.resolver.get(player.chain)
    settings = get_settings()
    default_amount = settings.reward_amount_lamports
    # Reward amount là authority của backend/battle domain. Giữ field cũ trong
    # schema chỉ để tương thích request cũ, nhưng tuyệt đối không dùng giá trị client gửi.
    amount = default_amount

    # Derive a stable opaque u64 reference
    # from the authoritative UUID instead of accepting a client-controlled id.
    battle_reference = int.from_bytes(
        hashlib.blake2b(body.battle_id.encode("utf-8"), digest_size=8).digest(), "big"
    )
    try:
        digest = adapter.send_reward(player.wallet, amount, battle_reference)
    except SolanaAdapterError as exc:
        store.release_reward_claim(player.chain, player.wallet, body.battle_id)
        raise HTTPException(
            status_code=409,
            detail="Chưa triển khai treasury/claim reward Solana; chưa có SOL nào được chuyển",
        ) from exc
    except Exception:
        store.release_reward_claim(player.chain, player.wallet, body.battle_id)
        raise
    record = store.add_reward(player.chain, player.wallet, body.battle_id, amount, digest)
    return RewardOut(
        id=record.id,
        wallet=record.wallet,
        chain=record.chain,
        battle_id=record.battle_id,
        amount=record.amount,
        tx_digest=record.tx_digest,
        status=record.status,
    )


@router.get("/players/{wallet}/rewards", response_model=list[RewardOut])
def list_rewards(
    wallet: str,
    chain: str | None = None,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, wallet)
    if chain is not None and chain.lower() != principal.chain:
        raise HTTPException(status_code=403, detail="Chain không thuộc phiên đăng nhập")
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        return []
    return [
        RewardOut(
            id=r.id,
            wallet=r.wallet,
            chain=r.chain,
            battle_id=r.battle_id,
            amount=r.amount,
            tx_digest=r.tx_digest,
            status=r.status,
        )
        for r in store.rewards_of(player.chain, player.wallet)
    ]
