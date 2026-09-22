using UnityEngine;

namespace VnHistoryGameFi.Network
{
    /// <summary>
    /// Cấu hình base URL cho FastAPI backend thật.
    /// Mặc định trỏ về "http://127.0.0.1:8000" — trùng khớp với:
    ///   - backend/app/main.py chạy qua `uvicorn app.main:app --reload` (cổng mặc định 8000)
    ///   - frontend/src/services/api.ts (VITE_API_URL fallback y hệt)
    /// Đổi giá trị này trong Inspector khi trỏ tới backend đã deploy thật (staging/prod),
    /// KHÔNG hard-code ở nhiều nơi khác.
    /// </summary>
    [CreateAssetMenu(fileName = "ApiConfig", menuName = "VnHistoryGameFi/Api Config")]
    public class ApiConfig : ScriptableObject
    {
        [Tooltip("Base URL của FastAPI backend, không có dấu / ở cuối.")]
        public string baseUrl = "http://127.0.0.1:8000";

        [Tooltip("Chain mặc định dùng khi test trong Editor: \"solana\".")]
        public string defaultChain = "solana";

        [Tooltip("Timeout (giây) cho mỗi request.")]
        public int timeoutSeconds = 10;
    }
}
