# Finance hub trên Solana Devnet

Các mục Thanh toán, Tiết kiệm, Lending, Treasury và DAO dùng cùng giao diện với DEX.

- **Thanh toán:** chuyển SOL trực tiếp từ ví người dùng sang ví người nhận bằng System Program. Frontend kiểm tra số dư, phí và nội dung giao dịch đã ký.
- **Tiết kiệm:** SOL nằm trong PDA của chương trình đến hết kỳ hạn. Lãi suất cố định **0%**. Rút trả lại gốc và tiền thuê account.
- **Lending:** người cho vay khóa SOL cho một ví vay cụ thể. Người vay có thể nhận tiền, rồi trả gốc và lãi cố định. Đây là khoản vay **không thế chấp**; hợp đồng không bảo đảm hoàn trả khi người vay vỡ nợ. Người cho vay có thể hủy trước khi tiền được nhận.
- **Treasury:** PDA `treasury` giữ SOL do người dùng nạp. Không có khóa quản trị riêng có thể rút tiền trực tiếp.
- **DAO:** người dùng khóa SOL vào PDA của mình để có quyền biểu quyết. Mỗi ví chỉ có một phiếu cho mỗi đề xuất; trọng số bằng lượng SOL khóa tại lúc bỏ phiếu. SOL đã bỏ phiếu bị khóa đến khi đề xuất kết thúc. Đề xuất chi cần quá bán phiếu đồng ý và lượng phiếu đồng ý tối thiểu 20% tổng SOL khóa khi tạo đề xuất.

Chương trình ở `blockchain/solana/programs/finance_hub`, ID công khai `C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6`. Keypair của ID nằm cục bộ tại `blockchain/solana/target/deploy/finance_hub-keypair.json`, bị Git bỏ qua. Phải giữ bản sao an toàn của keypair này để triển khai đúng ID; không gửi hoặc commit khóa bí mật.

## Kiểm tra

```bash
cd blockchain/solana
cargo test -p finance_hub --offline
cd ../../frontend
npm test
npm run build
```

CI build tệp `finance_hub.so` bằng công cụ Solana 1.18.17 và xuất artifact `finance-hub-sbf`. Bài kiểm tra Rust trên Windows chỉ biên dịch cho host; chưa xác nhận bytecode SBF hoặc chạy giao dịch Devnet.

## Triển khai

Máy triển khai cần Solana CLI và công cụ SBF tương thích Anchor 0.30.1. [Solana hướng dẫn build và deploy chương trình](https://solana.com/docs/programs/deploying); [Anchor 0.30.1 đề xuất Solana 1.18.17](https://www.anchor-lang.com/docs/updates/release-notes/0-30-1).

1. Tải artifact `finance_hub.so` của đúng commit CI, hoặc chạy `cargo build-sbf --manifest-path programs/finance_hub/Cargo.toml`.
2. Kiểm tra public key của `finance_hub-keypair.json` đúng ID ở trên. Không tạo keypair mới khi triển khai.
3. Nạp SOL Devnet thử vào ví payer, dùng `solana rent <số byte của .so>` để ước tính tiền thuê account, cộng thêm phí giao dịch.
4. Chạy `solana --url devnet --keypair <payer.json> program deploy <finance_hub.so> --program-id <finance_hub-keypair.json>`.
5. Kiểm tra `solana --url devnet program show C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6` và mở giao diện để khởi tạo Treasury bằng ví người dùng.
6. Thử lần lượt mở/rút két 1 phút, tạo/hủy khoản vay, nhận/trả/nhận khoản vay, nạp Treasury, khóa SOL, tạo/bỏ phiếu/thực hiện đề xuất chi trên Devnet.

Sau khi triển khai, `cd frontend && node scripts/finance-hub-smoke.mjs` chạy
giao dịch Devnet thật cho các luồng trên bằng ví thử cục bộ. Ví payer cần còn
ít nhất 0,2 SOL Devnet; script chờ hết kỳ hạn 1 phút và ghi chữ ký từng giao
dịch để đối chiếu trên Explorer. Chỉ chạy script này trên Devnet thử.

Script cũng có chế độ validator cục bộ, chỉ khi đặt đồng thời
`FINANCE_SMOKE_LOCAL=1` và
`FINANCE_SMOKE_RPC_URL=http://127.0.0.1:8899`. Chế độ này dùng để thử quyền
ký, kỳ hạn và chống giao dịch lặp trước khi chi SOL Devnet.

Trên workspace Windows đã chuẩn bị Solana CLI và hai keypair cục bộ, có thể chạy
`powershell -File scripts/deploy-finance-hub.ps1 -EstimateOnly` để kiểm tra chi phí
sau khi đặt `finance_hub.so` trong `blockchain/solana/target/deploy`. Khi đủ
SOL Devnet, bỏ `-EstimateOnly` để triển khai. Script xác minh cả hai public key
trước khi gửi bất kỳ giao dịch nào.

Không chuyển Mainnet trước khi kiểm toán bảo mật chương trình và kiểm thử toàn bộ luồng trên Devnet. Frontend tự kiểm tra `executable` của chương trình; khi chưa triển khai, các thao tác của bốn mục này bị khóa và thông báo đúng trạng thái.
