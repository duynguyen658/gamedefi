# Unity Client (thử nghiệm)

Đây là client Unity gọi trực tiếp backend thật (FastAPI), thay cho bản
`script/` cũ (chỉ mô phỏng bằng `Debug.Log`, hoàn toàn tách biệt khỏi hệ thống).
Client web chính thức của dự án vẫn là `frontend/` (React) — thư mục này là
một client thay thế/bổ sung, **không phải bản thay thế frontend chính**.

## Trạng thái thật (đọc trước khi coi đây là "đã xong")

| Phần | Trạng thái |
|---|---|
| Gọi `GET /factions`, `GET /players/{wallet}`, `GET /players/{wallet}/rewards`, `GET /blockchain/{chain}/transaction/{digest}` | **Thật.** Qua `UnityWebRequest`, có xử lý lỗi HTTP/parse. |
| Gọi `POST /auth/nonce`, `POST /auth/wallet`, `POST /players/{wallet}/faction`, `POST /rewards/claim` | **Thật về mặt network** (gửi đúng request thật lên backend thật). |
| **Ký chữ ký ví** (điều kiện để `POST /auth/wallet` thành công) | **CHƯA có, và chưa thể có nếu chỉ dùng Unity C# thuần.** Xem mục dưới. |
| Battle / Army / Quest / Leaderboard | Backend đã có API, nhưng Unity client này chưa nối các màn chơi vào các API đó nên vẫn mô phỏng cục bộ. |
| Reward claim sau khi thắng trận local | **Chưa dùng được.** Backend chỉ nhận battle do backend tạo và trả 409 vì treasury/payout SOL chưa được triển khai. |

## Vì sao không tự ký được chữ ký ví trong Unity

Luồng đăng nhập yêu cầu: `POST /auth/nonce` → **ký message bằng private key của
ví người chơi** → `POST /auth/wallet` (backend xác minh chữ ký qua
`verify_wallet_signature`, xem `backend/app/core/security.py`).

Bước ký chữ ký **phải** xảy ra trong ví thật (Phantom, Solflare, v.v.), vì:

- Project chưa tích hợp SDK hoặc bridge ví Solana cho Unity tương đương
  `@solana/wallet-adapter-*` phía web.
- Tự sinh chữ ký trong C# bắt buộc phải có private key nằm trong client —
  **không bao giờ nên làm vậy** với ví thật của người chơi.

`ApiBlockchainAdapter.VerifyWallet()` vì vậy **chủ động từ chối** gọi API nếu
`signature` rỗng, thay vì giả một chữ ký để trông như "chạy được". Hai hướng
khả thi để hoàn thiện phần này (không nằm trong phạm vi đã làm ở đây):

1. **Build WebGL** thay vì build native, rồi dùng `.jslib` bridge gọi ví
   trình duyệt qua provider Phantom/Solflare (`window.solana`),
   hoặc
2. Tích hợp SDK ví mobile qua deep link (WalletConnect-style) cho build
   Android/iOS.

## Cách mở project

1. Cài Unity Hub, thêm project này qua **Add project from disk**, trỏ vào
   thư mục `unity-client/`. Unity sẽ hỏi cài bản `2022.3.50f1` nếu chưa có
   (khai trong `ProjectSettings/ProjectVersion.txt`) — có thể chọn bản LTS
   2022.3.x mới nhất tương đương, không bắt buộc đúng tuyệt đối patch version.
2. Unity sẽ tự sinh lại các file `.meta` còn thiếu khi import lần đầu — bình
   thường, không cần lo.
3. Chạy backend thật trước: `cd backend && uvicorn app.main:app --reload`
   (mặc định `http://127.0.0.1:8000`).
4. Trong Unity: `Assets > Create > VnHistoryGameFi > Api Config`, để
   `baseUrl` mặc định là `http://127.0.0.1:8000` (khớp bước 3), kéo asset này
   vào field `config` của `ApiBlockchainAdapter` trên GameObject trong scene.
5. Gán `GameObject` chứa `ApiBlockchainAdapter` vào field `adapterBehaviour`
   của `GameManager`.

## Test nhanh không cần ví thật

Dùng `MockBlockchainAdapter` thay `ApiBlockchainAdapter` trong field
`adapterBehaviour` của `GameManager` để test UI/luồng cục bộ mà không cần bật
backend hay có ví — nhưng **không dùng để demo** vì mọi dữ liệu đều giả
(xem cảnh báo trong chính file `MockBlockchainAdapter.cs`).

## Việc chưa làm (ngoài phạm vi lần này)

- Không có scene (`.unity`) hay UI (Canvas/Prefab) nào được tạo — chỉ có lớp
  logic (`Assets/Scripts/`). Cần tự dựng UI trong Unity Editor.
- Không compile-test được trong môi trường tạo ra các file này (không có
  Unity Editor/trình biên dịch C# sẵn) — cần tự mở bằng Unity Editor để xác
  nhận build sạch trước khi coi là hoàn thiện.
- Chưa nối Battle/Army/Quest/Leaderboard của Unity vào các API backend đã có.
