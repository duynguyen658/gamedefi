using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace VnHistoryGameFi.Network
{
    /// <summary>
    /// Client HTTP thật, gọi thẳng FastAPI backend qua UnityWebRequest.
    /// Đây là phần THAY THẾ trực tiếp cho MockBlockchainAdapter cũ (chỉ Debug.Log
    /// và trả ID giả ngẫu nhiên). Mọi request/response ở đây đi qua network thật,
    /// nên game phải chạy kèm backend thật (xem README.md của thư mục này).
    ///
    /// Dùng pattern callback (Action) thay vì async/await để tương thích rộng với
    /// các phiên bản Unity không hỗ trợ await trên UnityWebRequestAsyncOperation
    /// (chỉ ổn định từ khoảng Unity 2023.1). Mọi gọi API phải chạy trong
    /// MonoBehaviour có StartCoroutine (ví dụ ApiBlockchainAdapter kế thừa
    /// MonoBehaviour).
    /// </summary>
    public class ApiClient
    {
        private readonly ApiConfig _config;
        private readonly MonoBehaviour _coroutineHost;
        private string _accessToken;

        public ApiClient(ApiConfig config, MonoBehaviour coroutineHost)
        {
            _config = config;
            _coroutineHost = coroutineHost;
        }

        public void SetAccessToken(string accessToken)
        {
            _accessToken = accessToken;
        }

        private void ApplyAuthorization(UnityWebRequest request)
        {
            if (!string.IsNullOrEmpty(_accessToken))
            {
                request.SetRequestHeader("Authorization", "Bearer " + _accessToken);
            }
        }

        public void Get<TResponse>(string path, Action<TResponse> onSuccess, Action<string> onError)
        {
            _coroutineHost.StartCoroutine(SendRequest<TResponse>(path, "GET", null, onSuccess, onError));
        }

        public void Post<TResponse>(string path, object bodyObject, Action<TResponse> onSuccess, Action<string> onError)
        {
            string json = JsonUtility.ToJson(bodyObject);
            _coroutineHost.StartCoroutine(SendRequest<TResponse>(path, "POST", json, onSuccess, onError));
        }

        /// <summary>
        /// GET /factions trả về một JSON array thẳng ở root ([...]), không phải
        /// object — JsonUtility không parse được dạng này trực tiếp. Bọc lại
        /// thành {"items": [...]} trước khi parse bằng FactionListWrapper.
        /// </summary>
        public void GetFactionList(Action<FactionListWrapper> onSuccess, Action<string> onError)
        {
            _coroutineHost.StartCoroutine(SendRawArrayRequest("/factions", onSuccess, onError));
        }

        public void GetRewardList(string wallet, Action<RewardListWrapper> onSuccess, Action<string> onError)
        {
            _coroutineHost.StartCoroutine(SendRawArrayRequest($"/players/{wallet}/rewards", onSuccess, onError));
        }

        private IEnumerator SendRequest<TResponse>(
            string path, string method, string jsonBody,
            Action<TResponse> onSuccess, Action<string> onError)
        {
            string url = _config.baseUrl.TrimEnd('/') + path;
            using UnityWebRequest req = new UnityWebRequest(url, method);

            if (jsonBody != null)
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
                req.uploadHandler = new UploadHandlerRaw(bodyRaw);
                req.SetRequestHeader("Content-Type", "application/json");
            }
            req.downloadHandler = new DownloadHandlerBuffer();
            req.timeout = _config.timeoutSeconds;
            ApplyAuthorization(req);

            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                string detail = ExtractErrorDetail(req.downloadHandler?.text);
                onError?.Invoke($"[{method} {path}] HTTP {req.responseCode}: {detail ?? req.error}");
                yield break;
            }

            try
            {
                TResponse parsed = JsonUtility.FromJson<TResponse>(req.downloadHandler.text);
                onSuccess?.Invoke(parsed);
            }
            catch (Exception ex)
            {
                onError?.Invoke($"[{method} {path}] Parse JSON lỗi: {ex.Message}");
            }
        }

        private IEnumerator SendRawArrayRequest<TWrapper>(
            string path, Action<TWrapper> onSuccess, Action<string> onError)
        {
            string url = _config.baseUrl.TrimEnd('/') + path;
            using UnityWebRequest req = UnityWebRequest.Get(url);
            req.timeout = _config.timeoutSeconds;
            ApplyAuthorization(req);

            yield return req.SendWebRequest();

            if (req.result != UnityWebRequest.Result.Success)
            {
                string detail = ExtractErrorDetail(req.downloadHandler?.text);
                onError?.Invoke($"[GET {path}] HTTP {req.responseCode}: {detail ?? req.error}");
                yield break;
            }

            try
            {
                string wrapped = "{\"items\":" + req.downloadHandler.text + "}";
                TWrapper parsed = JsonUtility.FromJson<TWrapper>(wrapped);
                onSuccess?.Invoke(parsed);
            }
            catch (Exception ex)
            {
                onError?.Invoke($"[GET {path}] Parse JSON array lỗi: {ex.Message}");
            }
        }

        private static string ExtractErrorDetail(string body)
        {
            // FastAPI trả lỗi dạng {"detail": "..."}; cố lấy ra cho dễ đọc,
            // không parse JSON đầy đủ để tránh phụ thuộc thêm thư viện.
            if (string.IsNullOrEmpty(body)) return null;
            int idx = body.IndexOf("\"detail\"", StringComparison.Ordinal);
            return idx >= 0 ? body : null;
        }
    }
}
