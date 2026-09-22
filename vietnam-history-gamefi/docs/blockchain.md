# Blockchain — Solana

## Đăng nhập

`POST /auth/nonce` → ví ký UTF-8 message bằng Ed25519 → chữ ký base58 →
`POST /auth/wallet` → bearer token dùng cho mọi API ghi. Địa chỉ Solana phân biệt hoa/thường.
Backend không giữ private key, không ký transaction thay người chơi.

## Faction proof

`mint_faction(faction_id: String, metadata_uri: String)` nhận accounts theo thứ tự:

1. `proof`: writable PDA từ `[b"faction", owner public key]`.
2. `owner`: signer, writable, trả rent và gas.
3. `system_program`.

Instruction data: SHA256(`global:mint_faction`) lấy 8 byte đầu, tiếp theo hai string Borsh.
Account data: SHA256(`account:AssetProof`) lấy 8 byte đầu, `owner: Pubkey`,
`kind: String`, `reference_id: String`, `metadata_uri: String`.

Contract chỉ nhận faction `1` đến `8`. `init` PDA chặn mint lần hai;
không có hàm chuyển/đóng proof. Đây là account định danh, không phải token NFT SPL/Metaplex.
Tên, rarity và ảnh hiển thị lấy từ catalog off-chain theo faction ID.

Frontend và backend dùng cùng seed/layout. Frontend đọc program ID từ
`GET /blockchain/solana/config`, xác nhận RPC đúng cluster, ví ký transaction,
chờ `finalized` rồi gọi `POST /players/{wallet}/faction`.
Nếu đã mint nhưng đăng ký API bị lỗi, lần thử lại đọc proof và lịch sử transaction để đăng ký lại.
Backend xác minh transaction thành công cùng proof đúng chủ program/discriminator/wallet/faction.

## Reward, advisor, trading

Reward distributor HKDV đã triển khai trên Devnet. Vault do config PDA sở hữu; chỉ distributor đã cấu hình được payout và mỗi `claim_id` có receipt PDA dùng một lần. Admin có thể pause, rotate distributor, đổi giới hạn và thu hồi số dư chưa phân phối. Chi tiết tại [reward distributor](reward-distributor.md).

`POST /rewards/claim` vẫn trả 409 trong giai đoạn 5 vì kết nối battle/quest với distributor signer thuộc giai đoạn 6. Marketplace/P2P trả 503 cho thao tác ghi, chờ escrow contract.

## Cấu hình / deploy

`backend/.env.example` và `frontend/.env.example` chỉ chứa public configuration.
RPC backend có thể chứa credential riêng nên API config không trả RPC URL ra frontend.
`SOLANA_PROGRAM_ID` phải là public ID của program đã deploy, không phải System Program.

```sh
bash scripts/deploy-solana.sh devnet
```

Anchor/Solana CLI phải cài sẵn. Script không tự faucet, không thay ví người chơi.
Deployment Devnet hiện tại dùng program `8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN`.
Khi upgrade hoặc đổi program, cập nhật `SOLANA_PROGRAM_ID` và restart backend. Proof account ngẫu nhiên của bản prototype cũ không tự trở thành PDA.

## Kiểm thử

```sh
cd backend
python -m pytest -q
# Shell khác, từ repo:
cd frontend
npm test
npm run build
# Khi có Anchor và local validator:
cd blockchain/solana
anchor test --provider.cluster localnet
```

`bash scripts/test-solana-localnet.sh` build program, preload SBF vào local validator và kiểm tra faction cùng reward SPL end-to-end. Unit test không gửi giao dịch public network.


## HKDV SPL game token

Giai đoạn 4 đã tạo mint Devnet `45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm` với 6 decimals và tổng cung cố định 1 tỷ HKDV. Mint authority đã bị vô hiệu hóa và freeze authority không tồn tại. Toàn bộ cung hiện ở treasury ATA `3d3aVnwqsre4AfnvVCMvkLvLZ7YbxY3A6P5Er3wKg1Sp`; xem [thiết kế và vận hành token](game-token.md).
