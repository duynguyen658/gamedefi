using System.Collections.Generic;
using UnityEngine;
using VnHistoryGameFi.Interfaces;
using VnHistoryGameFi.Network;

namespace VnHistoryGameFi.Core
{
    /// <summary>
    /// Thay thế script/CoreLogic/GameManager.cs gốc. Khác biệt chính:
    ///   - KHÔNG còn `mockFactions`/`mockArmies` hard-code trong code (bản gốc có
    ///     cả faction "Nhà Đinh"/"Lam Sơn" không khớp 5 faction thật của dự án).
    ///   - Faction được load thật từ GET /factions lúc Start(), qua adapter được
    ///     gán trong Inspector (mặc định nên là ApiBlockchainAdapter).
    ///   - `currentPlayer` được set sau khi đăng nhập ví thật thành công (qua
    ///     luồng RequestNonce -> [ký ở tầng ví] -> VerifyWallet), KHÔNG tự tạo
    ///     player giả lúc khởi động như bản cũ.
    ///   - `armyCatalog` vẫn local vì Unity client chưa nối endpoint Army của backend.
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Tooltip("Kéo GameObject có gắn ApiBlockchainAdapter (hoặc MockBlockchainAdapter khi test offline) vào đây.")]
        public MonoBehaviour adapterBehaviour; // gán component implement IBlockchainAdapter

        private IBlockchainAdapter _adapter;

        public PlayerModel currentPlayer;
        public List<FactionModel> factions = new List<FactionModel>();

        // Local-only catalog: Unity chưa đồng bộ endpoint Army, xem ArmyModel.cs.
        public List<ArmyModel> armyCatalog = new List<ArmyModel>
        {
            new ArmyModel("infantry", "Bộ Binh", 100f),
            new ArmyModel("archer", "Cung Thủ", 90f),
            new ArmyModel("cavalry", "Kỵ Binh", 130f),
        };

        public bool FactionsLoaded { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            _adapter = adapterBehaviour as IBlockchainAdapter;
            if (_adapter == null)
            {
                Debug.LogError(
                    "[GameManager] adapterBehaviour không implement IBlockchainAdapter. " +
                    "Gắn ApiBlockchainAdapter (gọi backend thật) hoặc MockBlockchainAdapter (chỉ test offline).");
            }
        }

        private void Start()
        {
            LoadFactionsFromBackend();
        }

        public void LoadFactionsFromBackend()
        {
            if (_adapter == null) return;

            _adapter.GetFactions(
                dtoList =>
                {
                    factions.Clear();
                    foreach (var dto in dtoList)
                    {
                        factions.Add(FactionModel.FromDto(dto));
                    }
                    FactionsLoaded = true;
                    Debug.Log($"[GameManager] Đã load {factions.Count} faction thật từ backend.");
                },
                error =>
                {
                    FactionsLoaded = false;
                    Debug.LogError($"[GameManager] Không load được /factions: {error}\n" +
                                    "Kiểm tra backend đã chạy chưa (uvicorn app.main:app) và ApiConfig.baseUrl đã đúng chưa.");
                });
        }

        /// <summary>
        /// Gọi sau khi luồng đăng nhập ví (RequestNonce -> ký ở ví thật ->
        /// VerifyWallet) đã thành công. Không tạo player giả ở đây.
        /// </summary>
        public void SetCurrentPlayerFromDto(PlayerDto dto)
        {
            currentPlayer = PlayerModel.FromDto(dto);
        }

        public FactionModel GetFactionById(int factionId)
        {
            return factions.Find(f => f.faction_id == factionId);
        }

        public IBlockchainAdapter Adapter => _adapter;
    }
}
