# Triển khai ứng dụng Devnet

Program, HKDV mint và pool Raydium đã ở Solana Devnet. Quy trình này triển khai **ứng dụng** (frontend + API + PostgreSQL) và không tự nâng cấp program hay tạo giao dịch on-chain.

## Bản xem thử trên Render

`render.yaml` ở gốc repository định nghĩa một web service tại Singapore và một PostgreSQL cùng vùng. Web service build `deploy/devnet/backend.Dockerfile`: frontend gọi API cùng origin qua `/api`, backend chạy đúng một worker vì player/session/battle hiện còn trong RAM. GitHub Actions chạy test, build và thử image; Render chỉ tự deploy khi các check của commit đạt.

1. Kết nối repository `duynguyen658/gamedefi` với tài khoản Render và tạo Blueprint từ `render.yaml` trên nhánh `main`. Kiểm tra bản xem trước tài nguyên trước khi xác nhận. Blueprint chọn gói **free** để không tự phát sinh phí compute.
2. Trong web service, upload **secret file** tên `devnet-reward-distributor-keypair.json` chứa signer Devnet hiện có. Render đặt file ở `/etc/secrets/devnet-reward-distributor-keypair.json`; không dán nội dung vào GitHub, Blueprint, chat hay `VITE_*`. Kiểm tra public key của file khớp `REWARD_DISTRIBUTOR_AUTHORITY` trước khi upload.
3. Redeploy web service. Khi `DEVNET_DEPLOYED=true`, startup kiểm tra cấu hình, chạy hai migration idempotent rồi mở frontend/API. Health check `/api/health/ready` chỉ trả OK nếu PostgreSQL, Devnet RPC, program và signer đều đúng.
4. Lấy URL HTTPS do Render cấp và chạy từ thư mục dự án:

   ```sh
   python scripts/smoke-devnet-deployment.py --site-url https://YOUR-SERVICE.onrender.com --api-url https://YOUR-SERVICE.onrender.com/api
   ```

   Script chỉ đọc: kiểm tra frontend, readiness, program ID, HKDV mint/treasury, reward distributor và pool DEX. Sau đó thử đăng nhập ví Devnet, claim nhỏ và swap nhỏ bằng ví thử nghiệm; đối chiếu signature trên Solana Explorer và hai bảng PostgreSQL.

## Giới hạn cần biết

- PostgreSQL free của Render hết hạn sau **30 ngày**, không có backup. Đây là môi trường xem thử, không phải nơi giữ dữ liệu Devnet lâu dài. Nâng cấp database hoặc chọn hosting có backup trước khi cần lưu lịch sử liên tục.
- Free web service có thể ngủ khi không có truy cập; cold start làm phiên hoặc báo giá chậm. Player/session/battle còn trong RAM nên redeploy làm mất phần trạng thái đó; DEX intents và reward claims vẫn ở PostgreSQL. Giữ một instance cho đến khi chuyển toàn bộ state sang lưu trữ bền vững.
- Frontend dùng public Devnet RPC; không đưa URL có API key vào build arg `VITE_SOLANA_RPC_URL`. Backend có thể dùng RPC riêng qua secret runtime `SOLANA_RPC_URL` nếu cần.
- Mỗi lần sửa schema phải cập nhật migration trước khi deploy. Nếu release lỗi, quay lại bản build trước trong Render; các migration hiện tại chỉ thêm bảng/cột và chạy lặp lại được.
- Deploy Mainnet là quy trình riêng trong [`mainnet-release.md`](mainnet-release.md), không chạy từ Blueprint này.
