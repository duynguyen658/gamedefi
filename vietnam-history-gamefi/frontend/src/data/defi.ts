import { DefiModule } from '../types';

export const DEFI_MODULES: Array<{
  id: DefiModule;
  title: string;
  tagline: string;
  principle: string;
}> = [
  {
    id: 'payments',
    title: 'Thanh toán',
    tagline: 'Chuyển khoản on-chain, phí rõ, xác nhận công khai.',
    principle: 'Mỗi giao dịch có mã chứng từ trên chain, không hộp đen.',
  },
  {
    id: 'savings',
    title: 'Tiết kiệm',
    tagline: 'Két công khai: lãi suất, kỳ hạn và rủi ro đọc được trước khi gửi.',
    principle: 'APY và điều kiện rút hiển thị trước, không lãi ẩn.',
  },
  {
    id: 'lending',
    title: 'Lending',
    tagline: 'Vay–cho vay có tài sản thế chấp và ngưỡng thanh lý minh bạch.',
    principle: 'Hệ số sức khỏe và LTV luôn nhìn thấy, không lãi kép bất ngờ.',
  },
  {
    id: 'dex',
    title: 'DEX',
    tagline: 'Đổi token theo giá pool, slippage và tuyến đường rõ ràng.',
    principle: 'Giá, phí, impact hiển thị trước khi ký.',
  },
  {
    id: 'treasury',
    title: 'Treasury',
    tagline: 'Ngân khố giao thức: số dư, dòng tiền, bằng chứng on-chain.',
    principle: 'Mọi khoản chi đều gắn proposal hoặc tx digest.',
  },
  {
    id: 'dao',
    title: 'DAO tooling',
    tagline: 'Đề xuất, bỏ phiếu, quorum — quyền quản trị dễ tiếp cận.',
    principle: 'Một người một phiếu theo cổ phần đã khóa, kết quả không sửa sau.',
  },
];

export const PAYMENT_HISTORY = [
  { id: 'tx-1', type: 'Gửi', counterparty: '7YkP…c4e2', amount: '12.50 SOL', status: 'Đã xác nhận', time: '2 phút trước' },
  { id: 'tx-2', type: 'Nhận', counterparty: 'Chiến lợi phẩm', amount: '4.00 SOL', status: 'Đã xác nhận', time: '1 giờ trước' },
  { id: 'tx-3', type: 'Gửi', counterparty: 'Két tiết kiệm', amount: '20.00 SOL', status: 'Đang xác minh', time: 'Vừa xong' },
];

export const SAVINGS_VAULTS = [
  { id: 'vault-rice', name: 'Két Lúa (ổn định)', apy: '4.2%', lock: 'Rút bất kỳ lúc', tvl: '128,400 SOL', risk: 'Thấp' },
  { id: 'vault-gold', name: 'Két Vàng (kỳ hạn)', apy: '8.1%', lock: '30 ngày', tvl: '64,200 SOL', risk: 'Trung bình' },
  { id: 'vault-campaign', name: 'Két Chiến Dịch', apy: '11.5%', lock: 'Theo mùa giải', tvl: '21,080 SOL', risk: 'Cao hơn' },
];

export const LENDING_MARKETS = [
  { asset: 'SOL', supplyApy: '3.4%', borrowApy: '7.8%', ltv: '70%', liquidity: '210k' },
  { asset: 'USDC', supplyApy: '5.1%', borrowApy: '9.2%', ltv: '80%', liquidity: '95k' },
  { asset: 'GOLD', supplyApy: '2.0%', borrowApy: '12.4%', ltv: '50%', liquidity: '18k' },
];

export const DEX_PAIRS = [
  { pair: 'SOL / USDC', price: '1.84', fee: '0.30%', tvl: '42,100' },
  { pair: 'GOLD / SOL', price: '0.12', fee: '0.50%', tvl: '8,640' },
  { pair: 'RICE / USDC', price: '0.41', fee: '0.30%', tvl: '6,220' },
];

export const TREASURY_FLOWS = [
  { label: 'Phí DEX', amount: '+1,240 SOL', proof: '9fKa…aa12' },
  { label: 'Lãi két tiết kiệm', amount: '+420 SOL', proof: '2bQx…77Kx' },
  { label: 'Thưởng chiến dịch', amount: '−880 SOL', proof: 'c1Ts…44de' },
  { label: 'Chi đề xuất DAO #14', amount: '−200 SOL', proof: '71Vz…9Aab' },
];

export const DAO_PROPOSALS = [
  { id: 14, title: 'Nạp 200 SOL vào két thưởng Bạch Đằng', status: 'Đã thông qua', forPct: 72, quorum: 40 },
  { id: 15, title: 'Giảm phí DEX cặp GOLD/SOL xuống 0.30%', status: 'Đang bỏ phiếu', forPct: 54, quorum: 40 },
  { id: 16, title: 'Mở thị trường cho vay RICE với LTV 40%', status: 'Nháp cộng đồng', forPct: 0, quorum: 40 },
];
