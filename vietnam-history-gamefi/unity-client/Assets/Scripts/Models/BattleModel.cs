using UnityEngine;

/// <summary>
/// Model local của Unity. Backend đã có POST/GET /battles, nhưng Unity engine
/// hiện chưa gửi model này lên backend; vì vậy battle_id local không được dùng
/// để claim reward.
/// </summary>
[System.Serializable]
public class BattleModel
{
    public string battle_id;
    public string attacker_wallet;
    public string defender_wallet;
    public float attacker_score;
    public float defender_score;
    public string winner_wallet;
}
