# DeFi — SOL Devnet

## DEX đang hoạt động

- SOL là tài sản gốc. Giao diện chỉ cung cấp cặp SOL/USDC thử và SOL/USDT thử trên Raydium CPMM Devnet.
- Backend lấy reserve trực tiếp từ pool, xác minh mint, config và vault; frontend dựng giao dịch legacy và mô phỏng trên Devnet trước khi Phantom/Solflare ký; backend xác minh chữ ký, đúng pool, số lượng bán, mức nhận tối thiểu, tài khoản token của ví và các lệnh phụ trước khi gửi RPC.
- Lịch sử giao dịch hiển thị các lệnh đã gửi qua DEX này, có tải thêm; số token nhận trong danh sách là **lượng dự kiến theo báo giá**. Giao dịch khác thực hiện trực tiếp từ ví ngoài DEX này không nằm trong lịch sử ứng dụng.
- USDC/USDT ở đây là token thử trên Devnet. Tỷ giá không phản ánh Mainnet và chúng không chuyển được sang Mainnet.
- Pool USDC thử: `FeRts7d5DfXKXq1hGMkeiGEHayDdjsmSyJ41rHVcKo8t`; mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Pool USDT thử: `Bw9gaeKqQy5aTpi1BiSdV2p21REATtVXDdhjPUFjgq6N`; mint `9jWfcfEZToquBQmkoEViNSCt72veXwcvRGFQERXRjEk1`.

## Thưởng SOL thử

- Trận thắng đủ điều kiện: 100.000 lamports. Nhiệm vụ đủ điều kiện: 200.000 lamports.
- Backend ghi sự kiện và claim duy nhất trong PostgreSQL, ký giao dịch chuyển SOL có memo chứa claim ID, lưu giao dịch đã ký trước khi gửi và đối soát chính xác người nhận/số lượng/memo sau khi xác nhận.
- Đặt `SOL_REWARD_SIGNER_KEYPAIR_BASE64` trực tiếp trong Render Secret Environment, không gửi khóa qua chat và không commit vào Git. Giá trị là base64 của 64 byte keypair Solana. `SOL_REWARD_SIGNER_ADDRESS` phải khớp public key. Nạp SOL Devnet vào địa chỉ đó và kiểm tra `GET /blockchain/solana/reward-wallet` trả `active: true`.
- Claim lịch sử của token cũ được giữ để đối soát; một sự kiện đã nhận thưởng trước đây không được trả SOL lần thứ hai.

## Chạy local

1. Áp dụng migration trong `database/migrations/` cho PostgreSQL. Copy `backend/.env.example` thành `backend/.env` và `frontend/.env.example` thành `frontend/.env`.
2. Chạy `uvicorn app.main:app --reload` trong `backend`, rồi chạy `npm run dev` trong `frontend`.
3. Chuyển Phantom/Solflare sang Solana Devnet, nạp SOL thử, kết nối ví và mở DEX. Chọn token thử để nhận rồi lấy báo giá.
4. Có thể dựng và mô phỏng giao dịch chưa ký bằng `node scripts/raydium-swap-smoke.mjs --owner <public-address> --token USDC --simulate` trong `frontend`. Dùng `--output-unsigned <path>` nếu cần đối chiếu giao dịch chưa ký với bộ xác minh backend.

Hướng thiết kế: **tài chính phi tập trung minh bạch, an toàn, dễ tiếp cận**.

Game chiến thuật / Faction NFT là lớp nhận diện. Sáu module dưới đây là lớp sản phẩm tài chính. DEX đã có provider boundary; các module DeFi còn lại vẫn là định hướng sản phẩm và chưa phải smart contract production.

## Ba nguyên tắc

| Nguyên tắc | Ý nghĩa vận hành |
| --- | --- |
| Minh bạch | Phí, APY, LTV, health factor, số dư treasury, kết quả phiếu DAO hiện **trước** khi ký. Mọi thay đổi quỹ gắn tx digest hoặc proposal. |
| An toàn | Không custody: người dùng ký trên ví. Backend xác minh ownership/tx như flow NFT hiện có. Lending phải có ngưỡng thanh lý công bố. |
| Dễ tiếp cận | Tiếng Việt, sáu lối vào rõ, số liệu ngắn, không giả lập thành công nếu chain từ chối. |

## Sáu module

1. **Thanh toán** — gửi/nhận, lịch sử, phí mạng, chứng từ on-chain.
2. **Tiết kiệm** — két với APY, kỳ hạn, mức rủi ro, TVL công khai.
3. **Lending** — cung cấp / vay, LTV, health factor, thanh lý khi HF &lt; 1.
4. **DEX** — giá pool, phí, slippage, impact trước khi swap.
5. **Treasury dashboard** — số dư ngân khố, dòng tiền, proof từng khoản chi.
6. **DAO tooling** — đề xuất, quorum, bỏ phiếu ký ví, kết quả không sửa sau.

## Ranh giới kỹ thuật

Giữ `BlockchainAdapter` (Solana). Domain DeFi không import SDK chain trực tiếp. Gameplay combat vẫn off-chain; tiền và quyền quản trị on-chain.

Thứ tự triển khai đề xuất: thanh toán → treasury (đọc) → tiết kiệm → DEX → lending → DAO.
