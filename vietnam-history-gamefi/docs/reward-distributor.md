# HKDV Reward Distributor — Devnet

Giai đoạn 5 triển khai reward vault do program `history_game` quản lý. Contract chỉ chuyển HKDV đã được nạp sẵn; contract không có mint authority và không thể làm tăng tổng cung.

## Deployment

| Thuộc tính | Giá trị |
|---|---|
| Network | Solana Devnet |
| Program | `8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN` |
| Reward config PDA | `3MHpXEzsFkeJeYdPMmnL8LMCY3r3Ew3wm753fZacTCuw` |
| Reward vault ATA | `9ngszc2V6RBRxgtagHCsn6s369aZoKWHb8uXShZAhoS7` |
| HKDV mint | `45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm` |
| Admin | `oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T` |
| Distributor | `6RigAPgKTdEwxmRqaoMiJj6GYnkipTSwRRc9Wkw79rTv` |
| Vault allocation | 1.000.000 HKDV |
| Giới hạn mỗi claim | 1.000 HKDV |

Xem [reward config trên Explorer](https://explorer.solana.com/address/3MHpXEzsFkeJeYdPMmnL8LMCY3r3Ew3wm753fZacTCuw?cluster=devnet) và [reward vault](https://explorer.solana.com/address/9ngszc2V6RBRxgtagHCsn6s369aZoKWHb8uXShZAhoS7?cluster=devnet). Deployment record công khai nằm tại `blockchain/solana/deployments/devnet-reward-distributor.json`.

## Instruction và quyền hạn

- `initialize_reward_distributor`: tạo config PDA và vault ATA; chỉ chạy một lần vì PDA dùng seed cố định `reward-config`.
- `fund_reward_vault`: nhận HKDV từ token account của bất kỳ funder nào có chữ ký.
- `distribute_reward`: chỉ distributor đã cấu hình được gọi; tạo ATA người nhận khi cần và chuyển HKDV từ vault.
- `update_reward_distributor`: admin đổi distributor, giới hạn claim hoặc trạng thái pause.
- `withdraw_reward_tokens`: chỉ admin chuyển phần HKDV chưa phân phối sang một token account cùng mint.

Mỗi payout dùng receipt PDA từ `[b"reward", claim_id]`. `init` receipt khiến cùng một claim ID không thể trả lần hai, kể cả backend gửi lại giao dịch. Amount phải lớn hơn 0, không vượt giới hạn và không vượt số dư vault. Mỗi lần chuyển dùng `transfer_checked` với decimals của mint; config PDA ký CPI với Token Program.

Admin, distributor và treasury là ba vai trò riêng. Keypair Devnet của distributor nằm ngoài Git tại `~/.config/solana/gamefi-hkdv/devnet-reward-distributor-keypair.json`. Mainnet phải chuyển admin và treasury sang multisig, còn distributor nên dùng signer service có rotation và giám sát.

## Phạm vi giai đoạn 5

Contract, vault, giới hạn, pause, rotation, withdrawal và chống replay đã hoạt động trên Devnet. `POST /rewards/claim` chưa ký giao dịch bằng distributor trong giai đoạn này; API vẫn từ chối payout rõ ràng. Giai đoạn 6 sẽ ánh xạ battle/quest hợp lệ thành `claim_id`, lưu trạng thái bền vững và gửi `distribute_reward`.

Backend đọc config và vault trực tiếp qua `GET /blockchain/solana/reward-distributor`. Trường `verified` chỉ đúng khi program owner, admin, distributor, mint, vault, giới hạn và token account đều khớp cấu hình. Trường `active` cho biết cấu hình đã xác minh và distributor không bị pause.

## Vận hành và kiểm thử

```sh
# Build và chạy local-validator integration tests
bash scripts/test-solana-localnet.sh

# Sau khi deploy/upgrade program trên Devnet
python3 scripts/initialize-reward-distributor.py devnet
```

Script khởi tạo có tính idempotent: không tạo lại config và chỉ hoàn tất lần cấp vốn ban đầu nếu chưa có funding record. Script không tự bù số dư sau payout hoặc admin withdrawal; việc tái cấp vốn phải là thao tác treasury riêng có chủ đích. Script không ghi private key vào repository.

## Giai đoạn 6: payout từ gameplay

- Mỗi chiến thắng đủ điều kiện được backend ghi vào `reward_events`; client không được tự khai báo chiến thắng hay số HKDV.
- `claim_id = sha256(network:wallet:source_type:source_id)` được dùng giống nhau trong PostgreSQL và receipt PDA on-chain.
- Backend ký bằng distributor key riêng ở `REWARD_DISTRIBUTOR_KEYPAIR_PATH`; keypair nằm ngoài Git và không được gửi xuống frontend.
- Giao dịch đã ký được lưu trước khi broadcast. Trạng thái `submitted`/`submission_unknown` được đối soát bằng transaction và nội dung receipt.
- Battle thưởng 5 HKDV, quest hoàn thành thưởng 10 HKDV trên Devnet. Cả hai đều nằm dưới giới hạn 1.000 HKDV mỗi claim của contract.
- ID của chiến thắng nhận thưởng được cố định theo ví, kịch bản và ngày UTC; gọi lại API trong cùng ngày không thể tạo thêm payout, còn trận thua không làm mất lượt thắng.
- Chạy migration `database/migrations/002_reward_claims.sql` trước khi bật payout trên PostgreSQL.

### Xác minh Devnet giai đoạn 6

- Cấp phí distributor: `3GBMwsnq3MKhw81ABuNaKBAeuWp3vJqQgbvWdLWE5KqXQMHBKieGAcXgt9iVNZUfuGEpAj3jyzy1hAyonh4a6qvD` (0,2 Devnet SOL).
- Payout theo công thức claim cuối: `22ozFj2cRxRjZyfn3wCYgisgEwmGXEMw6q14HMErwVnghar4rJMyUcLaMxkL1UHfGjwwiRJkxAtfCi78jDnHqmdK`.
- Receipt: `DSrMMpw8yF7CaLae7CgetczwqAWihJ7d2LWNWNqD4Kpu`.
- Sau kiểm tra: 2 claims, tổng 10 HKDV; vault còn 999.990 HKDV và distributor không bị pause.
- Bản ghi máy đọc: `blockchain/solana/deployments/devnet-phase6-reward-payout.json`.
