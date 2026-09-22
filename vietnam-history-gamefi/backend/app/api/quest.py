from fastapi import APIRouter

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

