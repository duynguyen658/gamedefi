from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal, normalize_wallet
from app.core.store import store

from app.schemas import QuestOut

router = APIRouter(prefix="/quests", tags=["quest"])

DEFAULT_QUESTS = [
    {
        "id": "quest_bach_dang_1288",
        "title": "Bạch Đằng Trận Địa",
        "description": "Bố trí cọc gỗ bọc sắt và tiêu diệt đoàn thuyền chiến Nguyên Mông khi triều rút.",
        "faction_id": 5,
        "required_battles": 1,
        "completed": False,
        "reward_gold": 2500,
        "reward_rice": 1200,
    },
    {
        "id": "quest_rach_gam_1785",
        "title": "Hỏa Chiến Rạch Gầm",
        "description": "Dùng pháo hỏa hổ và phục binh tiêu diệt 5 vạn quân Xiêm La trên sông Tiền.",
        "faction_id": 7,
        "required_battles": 1,
        "completed": False,
        "reward_gold": 2200,
        "reward_rice": 1000,
    },
    {
        "id": "quest_ngoc_hoi_1789",
        "title": "Thần Tốc Đống Đa",
        "description": "Hành quân thần tốc mùa xuân Kỷ Dậu, đại phá 29 vạn quân Mãn Thanh.",
        "faction_id": 7,
        "required_battles": 1,
        "completed": False,
        "reward_gold": 3000,
        "reward_rice": 1500,
    },
    {
        "id": "quest_nhu_nguyet_1077",
        "title": "Chiến Lũy Như Nguyệt",
        "description": "Giữ vững phòng tuyến sông Cầu trước đại quân Tống, ngâm vang bài thơ Nam Quốc Sơn Hà.",
        "faction_id": 4,
        "required_battles": 1,
        "completed": False,
        "reward_gold": 2000,
        "reward_rice": 1000,
    },
]


@router.get("", response_model=list[QuestOut])
def list_quests(faction_id: int | None = None):
    results = []
    for q in DEFAULT_QUESTS:
        if faction_id is not None and q["faction_id"] != faction_id:
            continue
        results.append(QuestOut(**q))
    return results



def quest_scenario_id(quest_id: str) -> str:
    return quest_id.removeprefix("quest_")


@router.get("/players/{wallet}", response_model=list[QuestOut])
def list_player_quests(
    wallet: str,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, wallet)
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại")
    normalized = normalize_wallet(principal.chain, principal.wallet)
    repository = request.app.state.reward_claims
    network = request.app.state.settings.solana_network
    results: list[QuestOut] = []
    for quest in DEFAULT_QUESTS:
        if quest["faction_id"] is not None and quest["faction_id"] != player.faction_id:
            continue
        completed_battles = repository.count_eligible_battles(
            network=network,
            wallet=normalized,
            scenario_id=quest_scenario_id(quest["id"]),
        )
        claim = repository.get_claim_for_event(
            network=network, wallet=normalized, source_type="quest", source_id=quest["id"]
        )
        results.append(QuestOut(**{
            **quest,
            "completed": completed_battles >= quest["required_battles"],
            "completed_battles": completed_battles,
            "reward_hkdv_base_units": request.app.state.settings.quest_reward_amount_base_units,
            "reward_claim_status": claim.status if claim else None,
        }))
    return results
