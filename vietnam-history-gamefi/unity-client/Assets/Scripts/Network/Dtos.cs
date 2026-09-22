using System;
using System.Collections.Generic;

// -----------------------------------------------------------------------------
// DTO (Data Transfer Object) — map 1:1 với backend/app/schemas.py (FastAPI).
// Unity's JsonUtility yêu cầu field public, [Serializable], không dùng property
// getter/setter và không dùng kiểu nullable ("int?") — nên các trường optional
// dùng convention: giá trị mặc định (0, "", null cho class/array) đại diện cho
// "không có". Khi đọc PlayerDto.faction_id, coi 0 là "chưa chọn faction" vì
// factions thật đánh số từ 1 (xem assets/nft/factions.json).
// -----------------------------------------------------------------------------

namespace VnHistoryGameFi.Network
{
    // ---- POST /auth/nonce ----
    [Serializable]
    public class NonceRequestDto
    {
        public string chain;   // "solana"
        public string wallet;
    }

    [Serializable]
    public class NonceResponseDto
    {
        public string nonce;
        public string message;
    }

    // ---- POST /auth/wallet ----
    [Serializable]
    public class WalletVerifyRequestDto
    {
        public string chain;
        public string wallet;
        public string nonce;
        public string message;
        // QUAN TRỌNG: signature này PHẢI do ví thật ký (Phantom / Solflare...),
        // không được tự sinh trong Unity. Xem ghi chú trong ApiBlockchainAdapter.
        public string signature;
    }

    // ---- Player (dùng chung cho nhiều response) ----
    [Serializable]
    public class PlayerDto
    {
        public string wallet;
        public string chain;
        public string username;
        public int faction_id;       // 0 = null/chưa có (JsonUtility không có nullable)
        public string nft_object_id; // null/"" = chưa có
        public string access_token;  // chỉ có trong response đăng nhập
    }

    // ---- GET /factions ----
    [Serializable]
    public class FactionDto
    {
        public int faction_id;
        public string name;
        public string rarity;
        public string image;
        public string description;
    }

    [Serializable]
    public class FactionListWrapper
    {
        // JsonUtility không parse trực tiếp JSON array ở root, nên ApiClient sẽ
        // bọc mảng trả về từ "/factions" vào { "items": [...] } trước khi parse.
        public List<FactionDto> items;
    }

    // ---- POST /players/{wallet}/faction ----
    [Serializable]
    public class FactionRegisterRequestDto
    {
        public int faction_id;
        public string nft_object_id;
        public string tx_digest;
    }

    // ---- POST /rewards/claim ----
    [Serializable]
    public class RewardClaimRequestDto
    {
        public string wallet;
        public string battle_id;
    }

    [Serializable]
    public class RewardDto
    {
        public int id;
        public string wallet;
        public string chain;
        public string battle_id;
        public int amount;
        public string tx_digest;
        public string status; // "pending" | "confirmed" | "failed"
    }

    [Serializable]
    public class RewardListWrapper
    {
        public List<RewardDto> items;
    }

    // ---- GET /blockchain/{chain}/transaction/{digest} ----
    [Serializable]
    public class TransactionDto
    {
        public string digest;
        public string status;
        public string sender;
        public long timestamp_ms;
        // events: list[dict] phía backend — JsonUtility không parse Dictionary
        // linh hoạt, nên field này để nguyên dạng JSON thô, tự parse thêm nếu cần.
        public string events_raw;
    }
}
