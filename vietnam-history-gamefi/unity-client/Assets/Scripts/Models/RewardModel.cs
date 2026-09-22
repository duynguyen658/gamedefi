using UnityEngine;

/// <summary>
/// Khớp với backend RewardOut (POST /rewards/claim, GET /players/{wallet}/rewards).
/// Đổi "reward_id" (string) thành "id" (int) và bổ sung "chain"/"battle_id" để
/// đúng schema thật — bản gốc script/Models/RewardModel.cs chỉ có 4 field và
/// không khớp response thật của backend.
/// </summary>
[System.Serializable]
public class RewardModel
{
    public int id;
    public string wallet_address;
    public string chain;
    public string battle_id;
    public int amount;
    public string tx_digest;
    public string status; // "pending" | "confirmed" | "failed" — xem backend/app/core/store.py

    public static RewardModel FromDto(VnHistoryGameFi.Network.RewardDto dto)
    {
        return new RewardModel
        {
            id = dto.id,
            wallet_address = dto.wallet,
            chain = dto.chain,
            battle_id = dto.battle_id,
            amount = dto.amount,
            tx_digest = dto.tx_digest,
            status = dto.status,
        };
    }
}
