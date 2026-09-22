# DeFi product direction

Hướng thiết kế: **tài chính phi tập trung minh bạch, an toàn, dễ tiếp cận**.

Game chiến thuật / Faction NFT là lớp nhận diện. Sáu module dưới đây là lớp sản phẩm tài chính. UI hiện tại (`frontend` → Kinh tế on-chain) mô phỏng luồng người dùng; chưa phải smart contract production.

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
