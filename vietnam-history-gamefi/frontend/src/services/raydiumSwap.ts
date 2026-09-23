import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import BN from 'bn.js';
import type { DexOrder } from '../types/dex';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './solana';

const POOL_ID = import.meta.env?.VITE_RAYDIUM_POOL_ID?.trim()
  || '6dg1ELPzBmmqs7UDTr8pAZmGNQY9XymEDo6KQx8h4J2r';
const PROGRAM_ID = import.meta.env?.VITE_RAYDIUM_CPMM_PROGRAM_ID?.trim()
  || 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const HKDV_MINT = import.meta.env?.VITE_HKDV_MINT?.trim()
  || '45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

export async function buildRaydiumSwapTransaction(
  order: DexOrder,
  expectedWallet: string,
): Promise<string> {
  if (SOLANA_NETWORK !== 'devnet' || order.provider !== 'raydium') {
    throw new Error('Lệnh này không thuộc Raydium Devnet.');
  }
  if (order.router !== POOL_ID) {
    throw new Error('Báo giá không khớp pool HKDV/SOL.');
  }
  if (new Set([order.input_symbol, order.output_symbol]).size !== 2
      || ![order.input_symbol, order.output_symbol].every((symbol) => symbol === 'SOL' || symbol === 'HKDV')) {
    throw new Error('Raydium Devnet chỉ hỗ trợ cặp SOL/HKDV.');
  }

  const { CurveCalculator, DEV_API_URLS, FeeOn, Raydium, TxVersion } =
    await import('@raydium-io/raydium-sdk-v2');
  const owner = new PublicKey(expectedWallet);
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) {
    throw new Error('RPC frontend không phải Solana Devnet.');
  }
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'confirmed',
    urlConfigs: DEV_API_URLS,
  });
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(POOL_ID);
  if (poolInfo.programId !== PROGRAM_ID || poolInfo.id !== POOL_ID) {
    throw new Error('Program hoặc pool Raydium không khớp cấu hình.');
  }
  if (new Set([poolInfo.mintA.address, poolInfo.mintB.address]).size !== 2
      || ![WSOL_MINT, HKDV_MINT].every((mint) => [poolInfo.mintA.address, poolInfo.mintB.address].includes(mint))) {
    throw new Error('Pool Raydium không chứa đúng mint SOL/HKDV.');
  }

  const inputMint = order.input_symbol === 'SOL' ? WSOL_MINT : HKDV_MINT;
  const baseIn = inputMint === poolInfo.mintA.address;
  const inputAmount = new BN(order.in_amount);
  const creatorFeeOnInput = rpcData.feeOn === FeeOn.BothToken || rpcData.feeOn === FeeOn.OnlyTokenB;
  const swapResult = CurveCalculator.swapBaseInput(
    inputAmount,
    baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
    baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
    rpcData.configInfo!.tradeFeeRate,
    rpcData.configInfo!.creatorFeeRate,
    rpcData.configInfo!.protocolFeeRate,
    rpcData.configInfo!.fundFeeRate,
    creatorFeeOnInput,
  );
  const quotedMinimum = new BN(order.out_amount)
    .mul(new BN(10_000 - order.slippage_bps))
    .div(new BN(10_000));
  if (swapResult.outputAmount.lt(quotedMinimum)) {
    throw new Error('Giá pool đã thay đổi quá slippage; hãy lấy báo giá mới.');
  }
  const transactionSlippageBps = swapResult.outputAmount
    .sub(quotedMinimum)
    .mul(new BN(10_000))
    .div(swapResult.outputAmount)
    .toNumber();

  const built = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    inputAmount,
    swapResult,
    slippage: transactionSlippageBps / 10_000,
    baseIn,
    txVersion: TxVersion.V0,
  });
  if (!(built.transaction instanceof VersionedTransaction)) {
    throw new Error('Raydium không tạo versioned transaction hợp lệ.');
  }
  const staticKeys = built.transaction.message.staticAccountKeys.map((key) => key.toBase58());
  if (!staticKeys.includes(PROGRAM_ID) || !staticKeys.includes(POOL_ID) || staticKeys[0] !== expectedWallet) {
    throw new Error('Giao dịch Raydium không khớp ví hoặc pool đã chọn.');
  }
  return Buffer.from(built.transaction.serialize()).toString('base64');
}
