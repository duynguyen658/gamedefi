import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBaseUnits, maximumSpendable, validateSwapAmount } from '../src/services/dexMath.ts';

test('formats on-chain base units without floating point rounding', () => {
  assert.equal(formatBaseUnits(12_345_678_900n, 9, 6), '12.345678');
  assert.equal(formatBaseUnits(4_200_000n, 6, 2), '4.2');
  assert.equal(formatBaseUnits(0n, 6, 2), '0');
});

test('validates amount precision and available balance', () => {
  assert.equal(validateSwapAmount('', '5', 9), 'Nhập số lượng muốn đổi.');
  assert.equal(validateSwapAmount('0', '5', 9), 'Số lượng phải lớn hơn 0.');
  assert.equal(validateSwapAmount('6', '5', 9), 'Số dư không đủ.');
  assert.equal(validateSwapAmount('1.1234567', '5', 6), 'Tối đa 6 chữ số thập phân.');
  assert.equal(validateSwapAmount('1.25', '5', 9), null);
});

test('keeps a SOL reserve for transaction fees when using max', () => {
  assert.equal(maximumSpendable('5', 'SOL'), '4.99');
  assert.equal(maximumSpendable('5', 'USDC'), '5');
  assert.equal(maximumSpendable('0.005', 'SOL'), '0');
});
