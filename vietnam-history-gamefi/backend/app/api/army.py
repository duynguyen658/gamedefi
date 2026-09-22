from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal
from app.core.store import store
from app.schemas import ArmyOut, EquipAdvisorRequest

router = APIRouter(prefix="/players", tags=["army"])


@router.get("/{wallet}/army", response_model=ArmyOut)
def get_player_army(wallet: str, principal: SessionPrincipal = Depends(require_session)):
    require_wallet(principal, wallet)
    army = store.get_army(wallet)
    adv = store.get_advisor(army.equipped_advisor_id) if army.equipped_advisor_id else None
    return ArmyOut(
        player_wallet=army.player_wallet,
        faction_id=army.faction_id,
        equipped_advisor_id=army.equipped_advisor_id,
        equipped_advisor_name=adv["name"] if adv else None,
        spearmen_count=army.spearmen_count,
        archers_count=army.archers_count,
        cavalry_count=army.cavalry_count,
        elephants_count=army.elephants_count,
        total_power=army.total_power,
        morale=85,
        formation=army.formation,
    )


@router.post("/{wallet}/army/equip-advisor", response_model=ArmyOut)
def equip_advisor(
    wallet: str,
    body: EquipAdvisorRequest,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, wallet)
    advisor = store.get_advisor(body.advisor_id)
    if advisor is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy Tướng Cố Vấn")
    if not store.player_can_use_advisor(principal.chain, principal.wallet, body.advisor_id):
        raise HTTPException(status_code=403, detail="Ví chưa sở hữu Tướng Cố Vấn này")

    army = store.equip_advisor(wallet, body.advisor_id)
    return ArmyOut(
        player_wallet=army.player_wallet,
        faction_id=army.faction_id,
        equipped_advisor_id=army.equipped_advisor_id,
        equipped_advisor_name=advisor["name"],
        spearmen_count=army.spearmen_count,
        archers_count=army.archers_count,
        cavalry_count=army.cavalry_count,
        elephants_count=army.elephants_count,
        total_power=army.total_power,
        morale=85,
        formation=army.formation,
    )

