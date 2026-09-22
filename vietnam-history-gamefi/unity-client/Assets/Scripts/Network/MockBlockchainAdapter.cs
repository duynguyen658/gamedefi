using System;
using System.Collections.Generic;
using UnityEngine;
using VnHistoryGameFi.Interfaces;

namespace VnHistoryGameFi.Network
{
    /// <summary>
    /// CHỈ DÙNG ĐỂ TEST OFFLINE TRONG EDITOR, khi không có backend chạy sẵn.
    /// KHÔNG dùng trong build thật hay demo — mọi dữ liệu ở đây là giả, không
    /// đi qua network, không xác minh gì trên chain thật.
    ///
    /// Đây là bản cập nhật của script/API_Network/MockBlockchainAdapter.cs gốc,
    /// implement lại theo interface mới (IBlockchainAdapter) để tương thích với
    /// GameManager/BattleEngine hiện tại. Mặc định GameManager dùng
    /// ApiBlockchainAdapter (gọi backend thật) — chỉ chuyển sang class này khi
    /// chủ động test UI mà không cần bật `uvicorn`.
    /// </summary>
    public class MockBlockchainAdapter : MonoBehaviour, IBlockchainAdapter
    {
        public void RequestNonce(string chain, string wallet,
            Action<NonceResponseDto> onSuccess, Action<string> onError)
        {
            string mockNonce = Guid.NewGuid().ToString("N").Substring(0, 12);
            Log($"RequestNonce({chain}, {wallet}) -> {mockNonce}");
            onSuccess?.Invoke(new NonceResponseDto
            {
                nonce = mockNonce,
                message = $"[MOCK] Dang nhap Vietnam History GameFi\nNonce: {mockNonce}",
            });
        }

        public void VerifyWallet(string chain, string wallet, string nonce, string message, string signature,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            Log($"VerifyWallet({chain}, {wallet}) — MOCK, không xác minh chữ ký thật.");
            onSuccess?.Invoke(new PlayerDto
            {
                wallet = wallet,
                chain = chain,
                username = $"MockPlayer_{wallet.Substring(0, Math.Min(6, wallet.Length))}",
                faction_id = 0,
                nft_object_id = null,
            });
        }

        public void GetPlayer(string wallet, string chain,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            onSuccess?.Invoke(new PlayerDto { wallet = wallet, chain = chain ?? "solana", username = "MockPlayer" });
        }

        public void GetFactions(Action<List<FactionDto>> onSuccess, Action<string> onError)
        {
            // Khớp đúng 5 faction thật trong assets/nft/factions.json — kể cả ở
            // chế độ mock cũng không nên bịa thêm faction không tồn tại (bản cũ
            // GameManager.cs có "Nhà Đinh"/"Lam Sơn" không khớp thiết kế thật).
            onSuccess?.Invoke(new List<FactionDto>
            {
                new FactionDto { faction_id = 1, name = "Nhà Lý", rarity = "common" },
                new FactionDto { faction_id = 2, name = "Nhà Trần", rarity = "rare" },
                new FactionDto { faction_id = 3, name = "Nhà Lê", rarity = "rare" },
                new FactionDto { faction_id = 4, name = "Tây Sơn", rarity = "epic" },
                new FactionDto { faction_id = 5, name = "Nhà Nguyễn", rarity = "legendary" },
            });
        }

        public void RegisterPlayerFaction(string wallet, int factionId, string nftObjectId, string txDigest,
            Action<PlayerDto> onSuccess, Action<string> onError)
        {
            Log($"RegisterPlayerFaction({wallet}, faction={factionId}) — MOCK, không verify on-chain.");
            onSuccess?.Invoke(new PlayerDto { wallet = wallet, faction_id = factionId, nft_object_id = nftObjectId });
        }

        public void ClaimReward(string wallet, string battleId,
            Action<RewardDto> onSuccess, Action<string> onError)
        {
            string mockTx = "mock_tx_" + UnityEngine.Random.Range(100000, 999999);
            Log($"ClaimReward({wallet}, battle={battleId}) -> {mockTx}");
            onSuccess?.Invoke(new RewardDto
            {
                wallet = wallet, battle_id = battleId, amount = 5_000_000,
                tx_digest = mockTx, status = "pending",
            });
        }

        public void GetPlayerRewards(string wallet,
            Action<List<RewardDto>> onSuccess, Action<string> onError)
        {
            onSuccess?.Invoke(new List<RewardDto>());
        }

        public void GetTransaction(string chain, string digest,
            Action<TransactionDto> onSuccess, Action<string> onError)
        {
            onSuccess?.Invoke(new TransactionDto { digest = digest, status = "confirmed" });
        }

        private static void Log(string msg) => Debug.Log($"[MockBlockchainAdapter] {msg}");
    }
}
