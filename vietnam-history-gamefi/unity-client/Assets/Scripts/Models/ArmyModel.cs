using UnityEngine;

/// <summary>
/// Catalog local phục vụ BattleEngine Unity. Backend đã có endpoint army,
/// nhưng Unity client hiện chưa đồng bộ các con số trong model này với API đó.
/// </summary>
[System.Serializable]
public class ArmyModel
{
    public string army_id;
    public string army_name;

    public float base_power;

    public string weak_against;
    public string strong_against;

    public ArmyModel(string id, string name, float power)
    {
        this.army_id = id;
        this.army_name = name;
        this.base_power = power;
    }
}
