using System;
using System.Collections.Generic;
using VnHistoryGameFi.Network;

namespace VnHistoryGameFi.Interfaces
{
    /// <summary>
    /// Interface này thay thế bản cũ (mint_faction/submit_reward/verify_ownership/
    /// get_transaction) — bản cũ mô phỏng sai lệch so với kiến trúc thật của dự án.
    ///
    /// RANH GIỚI QUAN TRỌNG (đọc trước khi implement thêm):
    /// Theo README.md gốc + backend/app/api/*.py, backend KHÔNG BAO GIỜ tự ký
    /// giao dịch thay người chơi. Chữ ký ví (wallet signature) luôn phải đến từ
    /// ví thật của người chơi (Phantom / Solflare / ...). Vì vậy:
    ///   - Interface này KHÔNG có method "MintFaction()" hay "SignAndSend()".
    ///     Việc mint NFT xảy ra ở tầng ví, ngoài phạm vi adapter này.
    ///   - VerifyWallet() và RegisterPlayerFaction() nhận `signature`/`tx_digest`
    ///     như một chuỗi ĐÃ CÓ SẴN — nơi gọi (UI layer) chịu trách nhiệm lấy giá
    ///     trị đó từ một plugin ví thật. Project chưa tích hợp bridge tương đương
    ///     @solana/wallet-adapter phía web, nên tự ký trong C# là không an toàn — implementation
    ///     ApiBlockchainAdapter cố tình KHÔNG cung cấp cách tự sinh chữ ký.
    /// </summary>
    public interface IBlockchainAdapter
    {
        // ---- Wallet authentication (POST /auth/nonce, POST /auth/wallet) ----
        void RequestNonce(string chain, string wallet,
            Action<NonceResponseDto> onSuccess, Action<string> onError);

        void VerifyWallet(string chain, string wallet, string nonce, string message, string signature,
            Action<PlayerDto> onSuccess, Action<string> onError);

        // ---- Player / Faction (GET /players/{wallet}, GET /factions, POST /players/{wallet}/faction) ----
        void GetPlayer(string wallet, string chain,
            Action<PlayerDto> onSuccess, Action<string> onError);

        void GetFactions(Action<List<FactionDto>> onSuccess, Action<string> onError);

        /// <summary>
        /// Gọi SAU KHI ví đã mint NFT thành công và có tx_digest + nft_object_id
        /// thật từ chain. Backend sẽ tự xác minh lại qua RPC trước khi lưu —
        /// KHÔNG tin dữ liệu client gửi (xem backend/app/api/faction.py).
        /// </summary>
        void RegisterPlayerFaction(string wallet, int factionId, string nftObjectId, string txDigest,
            Action<PlayerDto> onSuccess, Action<string> onError);

        // ---- Reward (POST /rewards/claim, GET /players/{wallet}/rewards) ----
        void ClaimReward(string wallet, string battleId,
            Action<RewardDto> onSuccess, Action<string> onError);

        void GetPlayerRewards(string wallet,
            Action<List<RewardDto>> onSuccess, Action<string> onError);

        // ---- Transaction status (GET /blockchain/{chain}/transaction/{digest}) ----
        void GetTransaction(string chain, string digest,
            Action<TransactionDto> onSuccess, Action<string> onError);
    }
}
