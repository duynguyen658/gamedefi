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

## Blockchain đang có gì?

- Contract `blockchain/solana/programs/history_game` lưu `AssetProof`.
- `mint_faction` tạo PDA theo `["faction", wallet]`, mỗi ví một ấn tín không chuyển nhượng.
- Ấn tín là account của program, **chưa phải NFT chuẩn SPL/Metaplex** hiển thị trong mục NFT của ví.
- Frontend đọc program ID từ backend, kiểm tra mạng RPC, ví ký giao dịch và chờ xác nhận.
- Backend kiểm tra PDA, chủ program, discriminator, chủ ví và faction trước khi lưu.
- Các tên API cũ `nft_object_id`, `get_faction_nfts` được giữ để tương thích; giá trị là địa chỉ proof account.
- Program hiện chỉ mở instruction `mint_faction`. Reward, advisor và marketplace chưa có
  instruction on-chain cho đến khi authority, treasury và escrow được triển khai an toàn.

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

## Giới hạn hiện tại

- Program `8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN` đã deploy trên Devnet; ví development hiện là upgrade authority.
- Backend còn dùng RAM; restart mất player, session, battle và reward references.
- Database SQL là schema cho database mới; chưa nối vào backend, không tự chạy trên dữ liệu hiện hữu.
- Battle engine/API đã có, nhưng bàn cờ frontend còn mô phỏng cục bộ, chưa gọi API battle để lưu kết quả.
- Reward SOL chưa có treasury/claim program: API trả 409 rõ ràng, không giả lập đã chuyển tiền.
- Marketplace/P2P chặn thao tác ghi bằng 503; danh sách ban đầu trống, không seed ownership giả.
- DeFi là dữ liệu minh họa, chưa có giao dịch thực.
- Unity là client thử nghiệm, cần bridge tới ví Solana; không phải client chính.

Chi tiết: [Blockchain](docs/blockchain.md), [API](docs/api.md), [Kiến trúc](docs/architecture.md).
