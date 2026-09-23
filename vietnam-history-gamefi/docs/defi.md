# DeFi product direction

## Trạng thái triển khai

- Giai đoạn 1-6 hoàn thành: giao diện, provider boundary, SQL persistence/reconciliation, HKDV fixed supply, reward distributor và các kiểm soát vận hành.
- Giai đoạn 7 hoàn thành trên Devnet: pool Raydium CPMM `HKDV/SOL` có thanh khoản khởi tạo 100.000 HKDV + 1 SOL.
- Frontend đọc số dư, lấy quote, tạo versioned transaction và yêu cầu Phantom/Solflare ký. Backend không giữ private key, chỉ xác minh/gửi transaction đã ký và đối soát signature.
- Hai chiều SOL → HKDV và HKDV → SOL đã smoke test thành công. Public signature nằm trong deployment record `blockchain/solana/deployments/devnet-raydium-hkdv-sol-pool.json`.
- Khu Giao Thương trong game hiển thị swap, số dư, thông tin pool, phần thưởng HKDV và lịch sử theo bố cục thích ứng desktop/mobile. Giao diện tham khảo cách sắp xếp thông tin của Raydium UI v3; mã giao dịch và thành phần hiển thị được triển khai trong chính frontend của dự án.
- Giai đoạn 8 đã có cổng cấu hình và kiểm tra Mainnet ở [mainnet-release.md](mainnet-release.md). Chưa triển khai tài sản hoặc pool Mainnet; `GET /health/ready` và script release phải đạt trước khi mở giao dịch thật.

### Chạy DEX local

1. Copy `backend/.env.example` thành `backend/.env`, cấu hình PostgreSQL và chạy `database/migrations/001_dex_swaps.sql`.
2. Copy `frontend/.env.example` thành `frontend/.env`.
3. Chạy `uvicorn app.main:app --reload` trong thư mục `backend`.
4. Chạy `npm install` và `npm run dev` trong `frontend`.
5. Chuyển Phantom/Solflare sang Devnet, có Devnet SOL, kết nối ví và mở module DEX. Swap SOL sang HKDV trước nếu ví chưa có HKDV.

Pool Devnet: `6dg1ELPzBmmqs7UDTr8pAZmGNQY9XymEDo6KQx8h4J2r`. Phí trade hiện tại 0,25%; creator fee theo config pool 0,25%. Devnet là môi trường thử nghiệm.


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
