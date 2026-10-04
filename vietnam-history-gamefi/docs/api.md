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
- `GET /blockchain/solana/reward-wallet`: địa chỉ ví phân phối SOL Devnet, số dư và trạng thái cấu hình; không trả khóa bí mật.
- `GET /blockchain/solana/transaction/{signature}`: `success`, `failure`, `pending`; 404 nếu chưa tìm thấy.
- `GET /players/{wallet}/army`, `POST /players/{wallet}/army/equip-advisor`: cần session đúng ví.
- `POST /battles`: `{player_wallet, scenario_id, tactical_formation, advisor_id?}` → kết quả off-chain.
- `GET /battles/{battle_id}`, `GET /advisors`, `GET /quests`, `GET /leaderboard`: dữ liệu game.
- `POST /rewards/claim`: `{wallet, battle_id}` → thưởng SOL Devnet cho trận thắng đủ điều kiện. `POST /rewards/quests/claim`: `{wallet, quest_id}` → thưởng SOL Devnet cho nhiệm vụ đã hoàn thành.
- `GET /players/{wallet}/rewards`: cần session đúng ví.
- `GET /marketplace`: danh sách rỗng cho đến khi có escrow; API ghi marketplace/trades trả 503.


## DEX

- `GET /dex/config`: trả network, token registry, provider và public Raydium pool/program IDs.
- `POST /dex/order`: Devnet đọc reserve on-chain và tính quote CPMM SOL/USDC hoặc SOL/USDT thử; `idempotency_key` bảo đảm retry cùng payload trả lại order đã lưu.
- `POST /dex/execute`: khóa order theo ví/chữ ký; trên Devnet còn xác minh đúng một lệnh Raydium, mint/vault, số lượng bán, mức nhận tối thiểu, tài khoản token của ví và các bước tạo/đóng WSOL trước khi gửi Solana RPC. Mainnet chuyển signed transaction tới Jupiter khi được bật.
- `GET /dex/history`: lịch sử của ví trong session và tự đối soát giao dịch đang chờ. Hỗ trợ `limit`, `offset` và `executed_only=true` để chỉ lấy lệnh đã gửi (đang chờ, thành công hoặc thất bại).
- `POST /dex/reconcile`: chạy đối soát chủ động.

Production dùng `DATABASE_URL=postgresql+psycopg://...` và áp dụng lần lượt các migration `001`, `002`, `003` trong `database/migrations/`. DEX không lưu private key của người chơi; chỉ lưu quote, trạng thái và public signature. Reward SOL lưu giao dịch đã ký để retry/đối soát an toàn; secret ví phân phối nằm ngoài Git.
