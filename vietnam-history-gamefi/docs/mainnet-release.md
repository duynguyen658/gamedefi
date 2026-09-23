# Giai đoạn 8 — cổng phát hành Mainnet

DEX Devnet HKDV/SOL đã chạy hai chiều. Mainnet chưa được phát hành: chưa có mint HKDV, program, reward vault, multisig hay pool Mainnet trong deployment record. Không dùng các địa chỉ Devnet ở `backend/.env.example` để cấu hình Mainnet.

## Những gì code đã chuẩn bị

- Mainnet DEX dùng cặp **SOL/HKDV** qua Jupiter Swap V2. Mint HKDV lấy từ `GAME_TOKEN_MINT`; frontend phải đặt cùng mint ở `VITE_HKDV_MINT`. Mainnet không còn hiển thị SOL/USDC như cặp giao dịch của game.
- Backend từ chối khởi động Mainnet nếu còn địa chỉ Devnet, thiếu Jupiter API key, thiếu địa chỉ quyền quản trị/multisig, dùng SQLite, bật tự tạo schema, RPC không phải HTTPS hoặc CORS không phải HTTPS.
- DEX Mainnet mặc định đóng bằng `DEX_MAINNET_ENABLED=false`; có thể đóng lại ngay nếu giám sát phát hiện sự cố.
- Payout Mainnet mặc định đóng bằng `REWARD_MAINNET_ENABLED=false` cho đến khi signer, vault và payout thử được xác minh.
- Mỗi lần tạo và thực thi lệnh Mainnet, backend kiểm tra genesis hash của RPC. Giao dịch Jupiter được gửi đi phải có đúng message của transaction đã lưu cùng lệnh và đúng chữ ký fee payer.
- `GET /health/ready` trả HTTP 503 khi RPC, mint, metadata, program upgrade authority, reward config/vault, signer, database hoặc đối soát đang có vấn đề. `scripts/check-mainnet-readiness.py` kiểm tra thêm đường báo giá Jupiter ở cả hai chiều; chỉ in trạng thái và số liệu công khai.
- Cấu hình mẫu riêng ở `backend/mainnet.env.example` và `frontend/mainnet.env.example`; các giá trị bí mật để trống.

## Thứ tự phát hành

1. Tạo **treasury, admin và upgrade authority** bằng multisig Mainnet. Kiểm tra threshold, người ký và địa chỉ vault PDA trực tiếp trong giao diện multisig. Tạo signer distributor riêng, lưu ngoài Git và thiết lập sao lưu, rotation, giám sát. Các địa chỉ này cần được chủ dự án xác nhận trước khi chuyển quyền on-chain.
2. Chuẩn bị RPC Mainnet riêng, PostgreSQL production, HTTPS origin và Jupiter API key. Chạy `database/migrations/001_dex_swaps.sql` và `002_reward_claims.sql`. Chép mẫu env vào file `.env` được Git bỏ qua. `VITE_SOLANA_RPC_URL` được đóng gói vào trình duyệt, nên chỉ dùng URL an toàn để công khai; không đưa API key riêng vào biến `VITE_*`.
3. Build/deploy `history_game` Mainnet bằng **program keypair mới**, xác nhận program ID và chuyển upgrade authority sang vault multisig. Script `scripts/deploy-solana.sh` hiện chỉ hỗ trợ Devnet/localnet; không được dùng nó cho Mainnet.
4. Tạo SPL mint HKDV Mainnet 6 decimals, tổng cung 1 tỷ. Tạo Token Metadata account on-chain với tên/ký hiệu/URI đã kiểm tra, đặt update authority là admin multisig, chuyển token vào treasury multisig, xác minh supply và metadata, rồi mới vô hiệu hóa mint/freeze authority. Script `scripts/create-game-token.sh` chỉ dành cho Devnet và không tạo metadata on-chain.
5. Khởi tạo reward distributor với admin multisig, distributor signer, vault và hạn mức; nạp ngân sách theo quyết định treasury. Kiểm tra PDA, số dư vault; bật `REWARD_MAINNET_ENABLED=true` để thử một payout nhỏ rồi xác minh receipt và số dư. Mainnet phải dùng quy trình ký/rotation có giám sát trước khi mở thưởng thật.
6. Tạo thanh khoản HKDV/SOL Mainnet bằng treasury, xác minh pool Raydium hoặc nguồn thanh khoản khác và đảm bảo Jupiter trả quote cho cả hai chiều. Chỉ sau đó mới bật UI Mainnet.
7. Chạy `python scripts/check-mainnet-readiness.py` từ thư mục dự án. Kết quả `status: ok` là cổng kỹ thuật; người vận hành vẫn phải xác minh multisig và quyền người ký. Đặt `DEX_MAINNET_ENABLED=true`, khởi động lại backend, thử đăng nhập → battle/quest → claim → swap bằng số lượng nhỏ, đối chiếu Explorer và PostgreSQL.

## Giám sát sau phát hành

- Poll `GET /health/ready` ít nhất mỗi phút. Cảnh báo khi HTTP 503, `reward_vault_funded=false`, `program_upgrade_authority=false`, `stale_dex_swaps>0` hoặc `stale_reward_claims>0`. Ngưỡng vault mặc định 10.000 HKDV, đổi bằng `REWARD_VAULT_ALERT_THRESHOLD_BASE_UNITS`.
- Khi RPC sai mạng hoặc metadata/quyền program đổi bất thường, dừng luồng giao dịch và kiểm tra trên Solana Explorer cùng multisig. Khi giao dịch ở trạng thái không chắc chắn, đối soát signature trước khi tạo lệnh mới; không phát lại giao dịch mù.
- Nếu signer distributor bị lộ, dùng admin multisig pause reward và rotate distributor; nếu frontend lỗi, rollback bản build. Quyền admin và upgrade authority phải luôn được kiểm tra sau mỗi thay đổi.

## Điều kiện còn thiếu

Hiện chưa có địa chỉ multisig, mint/program/pool Mainnet, SOL thật hoặc Jupiter key của production. Vì vậy cổng kiểm tra Mainnet sẽ cố ý báo `unavailable`; không có giao dịch Mainnet nào được gửi ở giai đoạn chuẩn bị này. Chưa có kiểm toán smart contract độc lập. Frontend vẫn có 10 advisory npm (6 moderate, 4 high) từ cây dependency Solana/Raydium; `npm audit fix --force` đề xuất bản `@solana/web3.js@0.0.3` không tương thích, nên chưa áp dụng. Cần xử lý hoặc chấp nhận rủi ro bằng quyết định phát hành có ghi nhận trước khi dùng tiền thật.

Tài liệu tham chiếu: [Solana production readiness](https://solana.com/docs/tools/production-readiness), [Solana program deployment/upgrade authority](https://solana.com/docs/programs/deploying), [Metaplex fungible metadata](https://developers.metaplex.com/guides/javascript/how-to-add-metadata-to-spl-tokens), [Jupiter Swap V2 order/execute](https://developers.jup.ag/docs/swap/order-and-execute), [Squads multisig](https://docs.squads.so/main).
