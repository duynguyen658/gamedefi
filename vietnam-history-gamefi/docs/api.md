# API — Solana

Mọi API ghi cần `Authorization: Bearer <access_token>`, trừ endpoint đăng nhập.
Chain duy nhất là `solana`; địa chỉ base58 phân biệt hoa/thường.

- `POST /auth/nonce`: `{wallet, chain: "solana"}` → `{nonce, message}`.
- `POST /auth/wallet`: `{wallet, chain, nonce, message, signature}` → player và `access_token`.
- `POST /auth/guest`: `{username?}` → guest và `access_token`.
- `GET /factions`: catalog 8 faction.
- `POST /players/{wallet}/faction/select`: `{faction_id}`, chỉ guest.
- `POST /players/{wallet}/faction`: `{faction_id, nft_object_id, tx_digest}`, ví đã xác thực;
  `nft_object_id` là địa chỉ PDA faction proof, `tx_digest` là transaction signature Solana.
- `GET /blockchain/solana/config`: `{chain, network, program_id}`; không lộ RPC credentials.
- `GET /blockchain/solana/game-token`: thông số HKDV và kết quả xác minh live mint/treasury trên Devnet (`45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm`).
- `GET /blockchain/solana/reward-distributor`: config, vault, số dư và kết quả xác minh live reward distributor trên Devnet.
- `GET /blockchain/solana/transaction/{signature}`: `success`, `failure`, `pending`; 404 nếu chưa tìm thấy.
- `GET /players/{wallet}/army`, `POST /players/{wallet}/army/equip-advisor`: cần session đúng ví.
- `POST /battles`: `{player_wallet, scenario_id, tactical_formation, advisor_id?}` → kết quả off-chain.
- `GET /battles/{battle_id}`, `GET /advisors`, `GET /quests`, `GET /leaderboard`: dữ liệu game.
- `POST /rewards/claim`: `{wallet, battle_id}`; giai đoạn 5 vẫn trả 409 cho ví đủ điều kiện vì battle/quest integration và distributor signing thuộc giai đoạn 6.
- `GET /players/{wallet}/rewards`: cần session đúng ví.
- `GET /marketplace`: danh sách rỗng cho đến khi có escrow; API ghi marketplace/trades trả 503.


## DEX

- `GET /dex/config`: trả network, token registry, provider và public Raydium pool/program ID.
- `POST /dex/order`: Devnet đọc reserve on-chain và tính quote CPMM HKDV/SOL; `idempotency_key` bảo đảm retry cùng payload trả lại order đã lưu.
- `POST /dex/execute`: khóa order theo ví/chữ ký, xác minh transaction chứa đúng Raydium program và pool, rồi gửi Solana RPC. Mainnet chuyển signed transaction tới Jupiter.
- `GET /dex/history`: lịch sử của ví trong session và tự đối soát giao dịch đang chờ.
- `POST /dex/reconcile`: chạy đối soát chủ động.

Production dùng `DATABASE_URL=postgresql+psycopg://...` và chạy `database/migrations/001_dex_swaps.sql`. Backend không lưu signed transaction hoặc private key; chỉ lưu quote, trạng thái và public signature.
