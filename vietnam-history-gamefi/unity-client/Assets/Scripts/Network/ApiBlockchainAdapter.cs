using System;
using System.Collections.Generic;
using UnityEngine;
using VnHistoryGameFi.Interfaces;

namespace VnHistoryGameFi.Network
{
    /// <summary>
    /// Implementation THẬT của IBlockchainAdapter — gọi trực tiếp FastAPI backend
    /// (mặc định http://127.0.0.1:8000, cấu hình qua ApiConfig).
    ///
    /// Đây là phần thay thế cho script/API_Network/MockBlockchainAdapter.cs cũ:
    /// mọi request đi qua network thật, backend thật sẽ tự gọi RPC Solana
    /// thật để xác minh (xem backend/app/blockchain/solana_adapter.py) — Unity ở đây không giả lập gì cả.
    ///
    /// Gắn component này vào một GameObject trong scene (nó là MonoBehaviour vì
    /// cần StartCoroutine cho UnityWebRequest), rồi kéo ApiConfig asset vào field
    /// `config` trong Inspector.
    /// </summary>
    public class ApiBlockchainAdapter : MonoBehaviour, IBlockchainAdapter
    {
        [Tooltip("Kéo ApiConfig asset (Assets > Create > VnHistoryGameFi > Api Config) vào đây.")]
        public ApiConfig config;

        private ApiClient _client;

        private void Awake()
        {
            if (config == null)
            {
                Debug.LogError("[ApiBlockchainAdapter] Chưa gán ApiConfig — không thể gọi backend thật.");
                return;
            }
            _client = new ApiClient(config, this);
        }

        public void RequestNonce(string chain, string wallet,
            Action<NonceResponseDto> onSuccess, Action<string> onError)
        {
            var body = new NonceRequestDto { chain = chain, wallet = wallet };
            _client.Post<NonceResponseDto>("/auth/nonce", body, onSuccess, onError);
        }

        public void VerifyWallet(string chain, string wallet, string nonce, string message, string signature,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            _client.SetAccessToken(null);
            if (string.IsNullOrEmpty(signature))
            {
                // Cố tình chặn ở đây thay vì gửi signature rỗng lên backend rồi
                // nhận lỗi 401 mơ hồ: chữ ký PHẢI đến từ ví thật. Xem
                // IBlockchainAdapter.cs để biết vì sao Unity không tự ký được.
                onError?.Invoke(
                    "Thiếu chữ ký ví thật. ApiBlockchainAdapter không tự sinh " +
                    "signature — cần tích hợp một wallet SDK/plugin thật (Solana)" +
                    " để lấy signature trước khi gọi VerifyWallet().");
                return;
            }

            var body = new WalletVerifyRequestDto
            {
                chain = chain,
                wallet = wallet,
                nonce = nonce,
                message = message,
                signature = signature,
            };
            _client.Post<PlayerDto>("/auth/wallet", body,
                player =>
                {
                    _client.SetAccessToken(player.access_token);
                    onSuccess?.Invoke(player);
                },
                onError);
        }

        public void GetPlayer(string wallet, string chain,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            string path = string.IsNullOrEmpty(chain)
                ? $"/players/{wallet}"
                : $"/players/{wallet}?chain={chain}";
            _client.Get<PlayerDto>(path, onSuccess, onError);
        }

        public void GetFactions(Action<List<FactionDto>> onSuccess, Action<string> onError)
        {
            _client.GetFactionList(
                wrapper => onSuccess?.Invoke(wrapper.items),
                onError);
        }

        public void RegisterPlayerFaction(string wallet, int factionId, string nftObjectId, string txDigest,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            var body = new FactionRegisterRequestDto
            {
                faction_id = factionId,
                nft_object_id = nftObjectId,
                tx_digest = txDigest,
            };
            _client.Post<PlayerDto>($"/players/{wallet}/faction", body, onSuccess, onError);
        }

        public void ClaimReward(string wallet, string battleId,
            Action<RewardDto> onSuccess, Action<string> onError)
        {
            var body = new RewardClaimRequestDto { wallet = wallet, battle_id = battleId };
            _client.Post<RewardDto>("/rewards/claim", body, onSuccess, onError);
        }

        public void GetPlayerRewards(string wallet,
            Action<List<RewardDto>> onSuccess, Action<string> onError)
        {
            _client.GetRewardList(wallet,
                wrapper => onSuccess?.Invoke(wrapper.items),
                onError);
        }

        public void GetTransaction(string chain, string digest,
            Action<TransactionDto> onSuccess, Action<string> onError)
        {
            _client.Get<TransactionDto>($"/blockchain/{chain}/transaction/{digest}", onSuccess, onError);
        }
    }
}
