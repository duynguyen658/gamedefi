# Frontend Solana

React + TypeScript + Vite. Dùng Phantom hoặc Solflare để ký message/giao dịch.

```sh
npm ci
# Copy .env.example sang .env
npm run dev
npm run build
npm test
```

Backend mặc định ở `http://127.0.0.1:8000`. Cấu hình RPC bằng
`VITE_SOLANA_RPC_URL`, cluster bằng `VITE_SOLANA_NETWORK` (mặc định devnet).
Program ID lấy từ backend; không giữ private key và không giả lập chữ ký.

`services/solanaProtocol.ts` định nghĩa Borsh và PDA, `services/solana.ts`
kết nối ví, kiểm tra mạng, gửi giao dịch và phục hồi đăng ký proof khi retry.
Ấn tín faction là program account không chuyển nhượng, chưa phải SPL/Metaplex NFT.

Guest chơi không cần ví. Battle UI còn mô phỏng cục bộ; marketplace và reward
chưa có payout/escrow contract. Xem README gốc để biết trạng thái đầy đủ.
