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
    tagline: 'Khóa SOL Devnet theo kỳ hạn, lãi suất 0%.',
    principle: 'Thời điểm mở khóa được ghi trên chuỗi trước khi gửi.',
  },
  {
    id: 'lending',
    title: 'Lending',
    tagline: 'Cho vay SOL Devnet ngang hàng theo thời hạn và lãi cố định.',
    principle: 'Khoản vay không thế chấp; người cho vay chịu rủi ro không được hoàn trả.',
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
    principle: 'Quyền bỏ phiếu và kết quả phải đọc được từ giao dịch on-chain.',
  },
];
