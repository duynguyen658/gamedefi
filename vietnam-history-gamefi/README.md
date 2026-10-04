# Hào Khí Đại Việt — Solana

Game chiến thuật lịch sử Việt Nam: React/TypeScript, FastAPI và Solana Anchor.
Dự án chỉ hỗ trợ Solana; mặc định phát triển trên Devnet. Có 8 faction trong
`assets/nft/factions.json`. Combat và tiến trình người chơi nằm ngoài blockchain.

## Chạy cục bộ

Backend (Python 3.10+):

```sh
cd backend
python -m pip install -r requirements.txt
# Copy .env.example thành .env
# Với PostgreSQL: psql "$DATABASE_URL" -f ../database/migrations/001_dex_swaps.sql
psql "$DATABASE_URL" -f ../database/migrations/002_reward_claims.sql
psql "$DATABASE_URL" -f ../database/migrations/003_sol_reward_asset.sql
psql "$DATABASE_URL" -f ../database/migrations/004_archive_reward_assets.sql
python -m pytest -q
uvicorn app.main:app --reload
```

Frontend:

```sh
cd frontend
npm ci
# Copy .env.example thành .env
npm run dev
npm run build
npm test
```

Ví trình duyệt: Phantom hoặc Solflare. Người chơi ký challenge Ed25519 để đăng nhập;
backend trả bearer token. Không có ví hoặc từ chối ký sẽ báo lỗi, không tạo ví giả.
Phiên đăng nhập cũ không đúng chain được loại bỏ khi tải lại trang.

## Quản lý secret

`.env.example` chỉ chứa địa chỉ blockchain công khai và placeholder trống; file này an toàn để commit.
API key, private key, seed phrase và mật khẩu thật chỉ được đặt trong `.env` cục bộ đã bị Git bỏ qua.
Chạy `python scripts/check-secrets.py` trước khi commit; GitHub Actions cũng chạy kiểm tra này trên mỗi push và pull request.

## Blockchain đang có gì?

- Contract `blockchain/solana/programs/history_game` lưu `AssetProof`.
- `mint_faction` tạo PDA theo `["faction", wallet]`, mỗi ví một ấn tín không chuyển nhượng.
- Ấn tín là account của program, **chưa phải NFT chuẩn SPL/Metaplex** hiển thị trong mục NFT của ví.
- Frontend đọc program ID từ backend, kiểm tra mạng RPC, ví ký giao dịch và chờ xác nhận.
- Backend kiểm tra PDA, chủ program, discriminator, chủ ví và faction trước khi lưu.
- Các tên API cũ `nft_object_id`, `get_faction_nfts` được giữ để tương thích; giá trị là địa chỉ proof account.
- Program mở `mint_faction` cho ấn tín faction. Phần thưởng SOL Devnet được backend gửi từ ví phân phối riêng.
- Advisor và marketplace chưa có instruction on-chain cho đến khi escrow được triển khai an toàn.

## Deploy

Cần Rust, Solana CLI và Anchor 0.30.1 (Windows nên dùng WSL).
Chạy từ repo bằng Bash khi đã có ví deploy và SOL Devnet:

```sh
bash scripts/deploy-solana.sh devnet
```

Script tạo program keypair nếu chưa có, đồng bộ ID **trước** build/deploy.
Đặt public program ID vào `backend/.env` (`SOLANA_PROGRAM_ID`), khởi động lại backend.
Đặt `SOLANA_NETWORK` và `VITE_SOLANA_NETWORK` giống nhau; hai RPC phải cùng cluster.
Không commit keypair trong `target/`. Không có deployment được tự thực hiện khi chạy test.

## Trạng thái hiện tại

- SOL Devnet là tài sản dùng cho phần thưởng chiến dịch và DEX. Trận thắng thưởng 0,0001 SOL thử; nhiệm vụ thưởng 0,0002 SOL thử. Ví phân phối cần được cấu hình bằng secret trên Render và nạp SOL Devnet.
- Để bật phát thưởng trên Render, đặt `SOL_REWARD_SIGNER_KEYPAIR_BASE64` bằng base64 của keypair 64 byte và `SOL_REWARD_SIGNER_ADDRESS` bằng public key tương ứng trong phần Environment của dịch vụ backend. Nạp SOL **Devnet** vào đúng địa chỉ đó, triển khai lại rồi kiểm tra `/api/health/ready` có `checks.reward_signer: true`. Giữ keypair trong Render secret; không đưa vào Git hay gửi trong chat.
- DEX cho phép SOL ↔ USDC thử và SOL ↔ USDT thử qua hai pool Raydium Devnet đã kiểm tra mint/vault on-chain. Giá trên Devnet không đại diện cho thị trường Mainnet. Ví người chơi tự ký, backend xác minh đúng program/pool của từng báo giá rồi gửi RPC.
- Swap intent, trạng thái và chữ ký được lưu trong PostgreSQL để chống gửi trùng và đối soát. Lịch sử token cũ được giữ trong cơ sở dữ liệu; token cũ không còn nằm trong luồng sản phẩm hiện tại.
- Mainnet chưa được bật cho người dùng. Nhánh Jupiter trong mã cần API key và kiểm thử riêng trước khi bật.
- Player, session và battle detail vẫn dùng RAM; reward eligibility và claim được lưu bền vững trong PostgreSQL.
- Marketplace/P2P chặn thao tác ghi bằng 503 cho đến khi có escrow.

Chi tiết: [DeFi](docs/defi.md), [Blockchain](docs/blockchain.md), [API](docs/api.md), [Kiến trúc](docs/architecture.md).
