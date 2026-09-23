"""Battle Engine: Tính toán trận đánh chiến thuật 100% off-chain.

Tuân thủ nghiêm ngặt nguyên tắc cốt lõi:
- Không bao giờ gọi RPC blockchain trong battle calculation.
- Tính toán tương tác giữa Quân Đội (Army), Địa Hình (Terrain), Tướng Cố Vấn (Advisor)
  và Kịch Bản Lịch Sử (Historical Scenario).
"""
from __future__ import annotations

import random
import uuid
from typing import Any

from app.core.store import BattleRecord, store
from app.schemas import CombatTurnLog


SCENARIOS: dict[str, dict[str, Any]] = {
    "bach_dang_1288": {
        "name": "Đại Chiến Bạch Đằng 1288",
        "era": "Nhà Trần",
        "enemy_name": "Thủy Quân Nguyên Mông (Ô Mã Nhi & Phàn Tiếp)",
        "enemy_power": 650,
        "terrain": "river_stakes",
        "description": "Dụ địch vào trận địa cọc ngầm trên sông Bạch Đằng khi triều rút.",
        "reward_rice": 800,
        "reward_gold": 1500,
        "reward_xp": 180,
    },
    "rach_gam_1785": {
        "name": "Chiến Thắng Rạch Gầm – Xoài Mút 1785",
        "era": "Tây Sơn",
        "enemy_name": "Liên Quân Xiêm La (Chiêu Tăng & Chiêu Sương)",
        "enemy_power": 600,
        "terrain": "river_ambush",
        "description": "Bố trí phục binh hỏa lực hai bên bờ sông, khép chặt gọng kìm tiêu diệt địch.",
        "reward_rice": 700,
        "reward_gold": 1400,
        "reward_xp": 160,
    },
    "ngoc_hoi_1789": {
        "name": "Đại Phá Quân Thanh – Ngọc Hồi Đống Đa 1789",
        "era": "Tây Sơn",
        "enemy_name": "Quân Mãn Thanh (Tôn Sĩ Nghị & Sầm Nghi Đống)",
        "enemy_power": 750,
        "terrain": "fort_plain",
        "description": "Thần tốc hành quân mùa xuân Kỷ Dậu, dùng rơm bện tẩm ướt và hỏa hổ công đồn.",
        "reward_rice": 1000,
        "reward_gold": 2000,
        "reward_xp": 250,
    },
    "nhu_nguyet_1077": {
        "name": "Phòng Tuyến Như Nguyệt 1077",
        "era": "Nhà Lý",
        "enemy_name": "Đại Quân Tống (Quách Quỳ & Triệu Tiết)",
        "enemy_power": 700,
        "terrain": "river_fort",
        "description": "Dựa vào chiến lũy sông Cầu và bài thơ thần Nam Quốc Sơn Hà đè bẹp ý chí giặc.",
        "reward_rice": 750,
        "reward_gold": 1600,
        "reward_xp": 200,
    },
}


class BattleEngine:
    @staticmethod
    def resolve_battle(
        player_wallet: str,
        scenario_id: str = "bach_dang_1288",
        tactical_formation: str = "standard",
        advisor_id: str | None = None,
        battle_id: str | None = None,
    ) -> BattleRecord:
        scenario = SCENARIOS.get(scenario_id, SCENARIOS["bach_dang_1288"])
        army = store.get_army(player_wallet)
        
        # Lấy tướng cố vấn (ưu tiên tham số truyền vào, nếu không thì lấy tướng đang trang bị)
        active_advisor_id = advisor_id or army.equipped_advisor_id
        advisor = store.get_advisor(active_advisor_id) if active_advisor_id else None
        
        logs: list[CombatTurnLog] = []
        turn = 1

        # Turn 1: Dàn trận và Thăm dò
        adv_name = advisor["name"] if advisor else "Chỉ huy vắng mặt"
        logs.append(
            CombatTurnLog(
                turn=turn,
                action="deployment",
                actor="Quân Ta",
                damage_dealt=0,
                log_message=f"Bắt đầu trận đánh {scenario['name']}. Đội hình: {tactical_formation}. Tướng cố vấn: {adv_name}.",
            )
        )

        # Tính toán sức mạnh và hiệu ứng Tướng Cố Vấn
        base_player_power = army.total_power
        tactical_multiplier = 1.0

        if tactical_formation == "defensive":
            tactical_multiplier += 0.15
        elif tactical_formation == "aggressive":
            tactical_multiplier += 0.20

        # Áp dụng buff của Tướng Cố Vấn
        advisor_bonus_text = ""
        if advisor:
            if advisor["id"] == "tran_hung_dao" and "river" in scenario["terrain"]:
                tactical_multiplier += 0.30
                advisor_bonus_text = "Trần Hưng Đạo kích hoạt [Vạn Kiếp Thần Trận]: +30% sức mạnh thủy chiến & cọc ngầm!"
            elif advisor["id"] == "quang_trung":
                tactical_multiplier += 0.35
                advisor_bonus_text = "Quang Trung kích hoạt [Thần Tốc Bách Thắng]: +35% sát thương hỏa công sấm sét!"
            elif advisor["id"] == "ngo_quyen" and "stakes" in scenario["terrain"]:
                tactical_multiplier += 0.40
                advisor_bonus_text = "Ngô Quyền kích hoạt [Bạch Đằng Phục Binh]: +40% sát thương bẫy cọc khi triều rút!"
            elif advisor["id"] == "ly_thuong_kiet":
                tactical_multiplier += 0.25
                advisor_bonus_text = "Lý Thường Kiệt ngâm thơ thần [Nam Quốc Sơn Hà]: Sĩ khí bùng nổ, +25% công thủ toàn diện!"
            elif advisor["id"] == "le_loi":
                tactical_multiplier += 0.25
                advisor_bonus_text = "Lê Lợi vung kiếm [Thuận Thiên]: Nghĩa quân Lam Sơn phục hồi sinh lực, +25% sát thương!"
            elif advisor["id"] == "hai_ba_trung":
                tactical_multiplier += 0.25
                advisor_bonus_text = "Hai Bà Trưng kích hoạt [Mê Linh Hùng Khí]: Đội voi chiến xung phong đè bẹp tiền tuyến địch!"
            elif advisor["id"] == "cao_lo":
                tactical_multiplier += 0.25
                advisor_bonus_text = "Cao Lỗ kích hoạt [Nỏ Thần Cổ Loa]: Mưa tên liên cơ bắn phá trận địa địch từ xa!"
            else:
                tactical_multiplier += 0.15
                advisor_bonus_text = f"Tướng cố vấn {advisor['name']} mưu lược xuất sắc hỗ trợ toàn quân."

        # Turn 2: Đợt tấn công mở màn
        turn = 2
        p_dmg1 = int(base_player_power * 0.4 * tactical_multiplier + random.randint(10, 40))
        logs.append(
            CombatTurnLog(
                turn=turn,
                action="skirmish",
                actor="Xạ thủ & Tiên phong",
                damage_dealt=p_dmg1,
                log_message=f"Quân ta nổ súng và bắn mưa tên xối xả vào hàng ngũ {scenario['enemy_name']}, gây {p_dmg1} sát thương.",
            )
        )

        # Turn 3: Tướng Cố Vấn ra chiêu / Biến chuyển chiến trường
        turn = 3
        logs.append(
            CombatTurnLog(
                turn=turn,
                action="advisor_skill",
                actor=adv_name,
                damage_dealt=int(p_dmg1 * 0.6),
                log_message=advisor_bonus_text or "Đội hình vững vàng kiểm soát hoàn toàn thế trận.",
            )
        )

        # Turn 4: Địch phản công
        turn = 4
        enemy_base_atk = int(scenario["enemy_power"] * 0.35)
        enemy_dmg = max(10, int(enemy_base_atk - (base_player_power * 0.15) + random.randint(5, 25)))
        logs.append(
            CombatTurnLog(
                turn=turn,
                action="enemy_counter",
                actor=scenario["enemy_name"],
                damage_dealt=enemy_dmg,
                log_message=f"{scenario['enemy_name']} dốc toàn lực phản kích dữ dội, gây {enemy_dmg} tổn thất cho quân ta.",
            )
        )

        # Turn 5: Tổng tấn công quyết định
        turn = 5
        final_dmg = int(base_player_power * 0.7 * tactical_multiplier + random.randint(20, 60))
        total_player_dmg = p_dmg1 + int(p_dmg1 * 0.6) + final_dmg
        total_enemy_dmg = enemy_dmg + random.randint(10, 30)

        victory = (base_player_power * tactical_multiplier) >= (scenario["enemy_power"] * 0.85)

        if victory:
            logs.append(
                CombatTurnLog(
                    turn=turn,
                    action="decisive_strike",
                    actor="Toàn Quân Ta",
                    damage_dealt=final_dmg,
                    log_message=f"Đại phá hoàn toàn {scenario['enemy_name']}! Chiến trường toàn thắng vang dội non sông.",
                )
            )
        else:
            logs.append(
                CombatTurnLog(
                    turn=turn,
                    action="tactical_retreat",
                    actor="Toàn Quân Ta",
                    damage_dealt=final_dmg,
                    log_message="Lực lượng địch quá mạnh, quân ta tạm lui về bảo toàn binh lực.",
                )
            )

        player_casualties = min(army.spearmen_count + army.archers_count, int(total_enemy_dmg * 0.15))
        enemy_casualties = min(scenario["enemy_power"], int(total_player_dmg * 0.35))

        record = BattleRecord(
            battle_id=(battle_id if victory and battle_id else f"battle-{uuid.uuid4().hex[:10]}"),
            player_wallet=player_wallet,
            scenario_id=scenario_id,
            advisor_id=active_advisor_id,
            victory=victory,
            turns_taken=5,
            player_casualties=player_casualties,
            enemy_casualties=enemy_casualties,
            reward_rice=scenario["reward_rice"] if victory else int(scenario["reward_rice"] * 0.3),
            reward_gold=scenario["reward_gold"] if victory else int(scenario["reward_gold"] * 0.3),
            reward_xp=scenario["reward_xp"] if victory else int(scenario["reward_xp"] * 0.3),
            combat_logs=[log.model_dump() for log in logs],
        )

        return store.add_battle_record(record)

