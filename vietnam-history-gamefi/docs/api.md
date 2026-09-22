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
- `GET /blockchain/solana/transaction/{signature}`: `success`, `failure`, `pending`; 404 nếu chưa tìm thấy.
- `GET /players/{wallet}/army`, `POST /players/{wallet}/army/equip-advisor`: cần session đúng ví.
- `POST /battles`: `{player_wallet, scenario_id, tactical_formation, advisor_id?}` → kết quả off-chain.
- `GET /battles/{battle_id}`, `GET /advisors`, `GET /quests`, `GET /leaderboard`: dữ liệu game.
- `POST /rewards/claim`: `{wallet, battle_id}`; hiện trả 409 cho ví đủ điều kiện vì chưa có payout SOL.
- `GET /players/{wallet}/rewards`: cần session đúng ví.
- `GET /marketplace`: danh sách rỗng cho đến khi có escrow; API ghi marketplace/trades trả 503.
