# HKDV Game Token — Devnet

Giai đoạn 4 phát hành một SPL Token chuẩn cho nền kinh tế game. Token này chưa được đưa vào DEX và chưa dùng để trả thưởng cho đến khi `reward_distributor` của giai đoạn 5 hoàn thành.

## Thông số đã triển khai

| Thuộc tính | Giá trị |
|---|---|
| Tên | Hào Khí Đại Việt (`Hao Khi Dai Viet` trong metadata) |
| Ký hiệu | `HKDV` |
| Network | Solana Devnet |
| Mint | `45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm` |
| Token Program | SPL Token Program gốc (`Tokenkeg...`) |
| Decimals | 6 |
| Tổng cung | 1.000.000.000 HKDV |
| Mint authority | `None` — đã vô hiệu hóa vĩnh viễn |
| Freeze authority | `None` |
| Treasury owner | `HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK` |
| Treasury ATA | `3d3aVnwqsre4AfnvVCMvkLvLZ7YbxY3A6P5Er3wKg1Sp` |

Mint account, supply và treasury balance được backend xác minh trực tiếp bằng `jsonParsed` Solana RPC tại `GET /blockchain/solana/game-token`. Trạng thái triển khai có thể kiểm tra tại [Solana Explorer](https://explorer.solana.com/address/45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm?cluster=devnet).

## Mô hình cung và authority

Toàn bộ 1 tỷ HKDV được pre-mint vào treasury Devnet rồi mint authority bị vô hiệu hóa. Giai đoạn 5 sẽ chuyển phần thưởng đã phân bổ từ treasury sang reward vault do program quản lý; contract không cần quyền in token mới. Cách này giữ tổng cung ở mức cố định và làm tokenomics dễ đối soát.

Treasury dùng keypair riêng với deployment wallet. Hai keypair phát sinh từ script nằm ngoài Git repository tại `~/.config/solana/gamefi-hkdv/`, có quyền file `600` và phải được sao lưu an toàn. Không đưa keypair hoặc seed phrase vào `.env`, source code hay GitHub. Ở giai đoạn 8, treasury Devnet không được tái sử dụng làm treasury Mainnet; Mainnet phải dùng multisig.

## Metadata

Ứng dụng dùng registry [hkdv.json](../assets/token/hkdv.json) và biểu tượng [hkdv.svg](../assets/token/hkdv.svg). Mint SPL chuẩn này không có Metaplex metadata account, nên một số ví có thể chỉ hiện địa chỉ mint. Việc chọn SPL Token Program gốc ưu tiên tương thích cho reward contract và các tích hợp Solana. Mainnet metadata phải được tạo trước khi khóa mint authority.

## Tái kiểm tra deployment

Script có tính idempotent: nếu mint và treasury ATA đã tồn tại với đúng supply, script chỉ xác minh và cập nhật deployment record.

```sh
bash scripts/create-game-token.sh devnet
```

Deployment record công khai ở `blockchain/solana/deployments/devnet-game-token.json`; private key không nằm trong record này.
