using UnityEngine;

/// <summary>
/// Khớp với backend FactionOut (faction_id/name/rarity/image/description lấy
/// thật từ GET /factions, nguồn dữ liệu gốc là assets/nft/factions.json).
/// attack_bonus/defense_bonus/movement_bonus là chỉ số cân bằng chiến đấu
/// CỤC BỘ phía client — backend không cung cấp (không có domain Battle),
/// nên giữ nguyên như bản thiết kế gốc trong script/Models/FactionModel.cs,
/// chỉ đổi "id" (string) thành "faction_id" (int) để khớp kiểu dữ liệu thật.
/// </summary>
[System.Serializable]
public class FactionModel
{
    // ---- Từ backend (FactionDto) ----
    public int faction_id;
    public string name;
    public string rarity;
    public string image;
    public string description;

    // ---- Local-only: cân bằng chiến đấu, backend chưa định nghĩa ----
    public float attack_bonus;
    public float defense_bonus;
    public float movement_bonus;

    public FactionModel(int factionId, string name, float atk = 1f, float def = 1f, float move = 1f)
    {
        this.faction_id = factionId;
        this.name = name;
        this.attack_bonus = atk;
        this.defense_bonus = def;
        this.movement_bonus = move;
    }

    public static FactionModel FromDto(VnHistoryGameFi.Network.FactionDto dto)
    {
        // Chỉ số cân bằng mặc định (1.0) khi backend không trả — nơi gọi có thể
        // override bằng bảng cấu hình riêng nếu cần cân bằng chi tiết hơn.
        var model = new FactionModel(dto.faction_id, dto.name)
        {
            rarity = dto.rarity,
            image = dto.image,
            description = dto.description,
        };
        return model;
    }
}
