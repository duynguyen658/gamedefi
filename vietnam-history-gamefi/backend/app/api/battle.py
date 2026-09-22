from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal
from app.core.store import store
from app.domain.battle_engine import BattleEngine, SCENARIOS
from app.schemas import BattleRequest, BattleResultOut, CombatTurnLog

router = APIRouter(prefix="/battles", tags=["battle"])


@router.post("", response_model=BattleResultOut)
def start_battle(body: BattleRequest, principal: SessionPrincipal = Depends(require_session)):
    require_wallet(principal, body.player_wallet)
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=401, detail="Phiên không có player hợp lệ")
    if player.faction_id is None:
        raise HTTPException(status_code=409, detail="Cần chọn faction trước khi bắt đầu trận đánh")
    if body.scenario_id not in SCENARIOS:
        raise HTTPException(status_code=422, detail="Kịch bản không tồn tại")
    if body.tactical_formation not in {"standard", "defensive", "aggressive"}:
        raise HTTPException(status_code=422, detail="Đội hình không hợp lệ")
    if body.advisor_id and not store.player_can_use_advisor(principal.chain, principal.wallet, body.advisor_id):
        raise HTTPException(status_code=403, detail="Ví chưa sở hữu Tướng Cố Vấn này")

    record = BattleEngine.resolve_battle(
        player_wallet=body.player_wallet,
        scenario_id=body.scenario_id,
        tactical_formation=body.tactical_formation,
        advisor_id=body.advisor_id,
    )

    combat_logs = [CombatTurnLog(**log) for log in record.combat_logs]

    msg = (
        "Chiến thắng vang dội! Đã lưu kết quả trận đánh và trao thưởng."
        if record.victory
        else "Quân ta đã nỗ lực chiến đấu và tích lũy thêm kinh nghiệm trận mạc."
    )

    return BattleResultOut(
        battle_id=record.battle_id,
        scenario_id=record.scenario_id,
        victory=record.victory,
        turns_taken=record.turns_taken,
        player_casualties=record.player_casualties,
        enemy_casualties=record.enemy_casualties,
        reward_rice=record.reward_rice,
        reward_gold=record.reward_gold,
        reward_xp=record.reward_xp,
        combat_logs=combat_logs,
        message=msg,
    )


@router.get("/{battle_id}", response_model=BattleResultOut)
def get_battle(battle_id: str):
    record = store.get_battle(battle_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi trận đánh")

    combat_logs = [CombatTurnLog(**log) for log in record.combat_logs]

    return BattleResultOut(
        battle_id=record.battle_id,
        scenario_id=record.scenario_id,
        victory=record.victory,
        turns_taken=record.turns_taken,
        player_casualties=record.player_casualties,
        enemy_casualties=record.enemy_casualties,
        reward_rice=record.reward_rice,
        reward_gold=record.reward_gold,
        reward_xp=record.reward_xp,
        combat_logs=combat_logs,
        message="Chi tiết trận đánh được truy xuất thành công.",
    )

