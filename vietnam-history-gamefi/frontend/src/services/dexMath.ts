type DexTokenSymbol = 'SOL' | 'USDC';

export function formatBaseUnits(rawAmount: bigint, decimals: number, visibleDecimals = 6): string {
  const digits = rawAmount.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals) || '0';
  const fraction = digits.slice(-decimals).slice(0, visibleDecimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function validateSwapAmount(value: string, balance: string, decimals: number): string | null {
  const amount = value.trim();
  if (!amount) return 'Nhập số lượng muốn đổi.';
  if (!/^(?:\d+|\d*\.\d+)$/.test(amount)) return 'Số lượng không hợp lệ.';
  if ((amount.split('.')[1]?.length || 0) > decimals) return `Tối đa ${decimals} chữ số thập phân.`;
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 'Số lượng phải lớn hơn 0.';
  if (numericAmount > Number(balance)) return 'Số dư không đủ.';
  return null;
}

export function maximumSpendable(balance: string, symbol: DexTokenSymbol): string {
  const available = Number(balance);
  if (!Number.isFinite(available) || available <= 0) return '';
  const reserve = symbol === 'SOL' ? 0.01 : 0;
  return Math.max(0, available - reserve).toFixed(symbol === 'SOL' ? 6 : 2).replace(/\.?0+$/, '');
}
