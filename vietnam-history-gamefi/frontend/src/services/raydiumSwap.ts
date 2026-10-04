import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import BN from 'bn.js';
import { CurveCalculator, DEV_API_URLS, FeeOn, Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import type { DexConfig, DexOrder } from '../types/dex';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './solana';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

export interface PreparedRaydiumSwap {
  transaction: string;
  networkFeeLamports: number;
  lastValidBlockHeight: number;
}

export async function isSwapBlockhashValid(lastValidBlockHeight: number | null): Promise<boolean> {
  if (lastValidBlockHeight === null) return true;
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  return await connection.getBlockHeight('confirmed') + 5 < lastValidBlockHeight;
}

export async function buildRaydiumSwapTransaction(
  order: DexOrder,
  expectedWallet: string,
  config: DexConfig,
): Promise<PreparedRaydiumSwap> {
  if (SOLANA_NETWORK !== 'devnet' || order.provider !== 'raydium') {
    throw new Error('Lệnh này không thuộc Raydium Devnet.');
  }
  const otherSymbol = order.input_symbol === 'SOL' ? order.output_symbol : order.input_symbol;
  const pool = config.pools[otherSymbol];
  const tokenMint = config.tokens.find((token) => token.symbol === otherSymbol)?.mint;
  if (config.network !== 'devnet' || config.provider !== 'raydium'
      || !config.program_id || !pool || !tokenMint
      || ![order.input_symbol, order.output_symbol].includes('SOL') || order.router !== pool) {
    throw new Error('Báo giá không khớp cặp SOL/USDC hoặc SOL/USDT thử.');
  }

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
    // A finalized blockhash is more likely to be known to Phantom's own RPC.
    blockhashCommitment: 'finalized',
    urlConfigs: DEV_API_URLS,
  });
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(pool);
  if (poolInfo.programId !== config.program_id || poolInfo.id !== pool) {
    throw new Error('Program hoặc pool Raydium không khớp cấu hình.');
  }
  if (new Set([poolInfo.mintA.address, poolInfo.mintB.address]).size !== 2
      || ![WSOL_MINT, tokenMint].every((mint) => [poolInfo.mintA.address, poolInfo.mintB.address].includes(mint))) {
    throw new Error('Pool Raydium không chứa đúng mint SOL/token đã chọn.');
  }

  const inputMint = order.input_symbol === 'SOL' ? WSOL_MINT : tokenMint;
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
    txVersion: TxVersion.LEGACY,
  });
  if (!(built.transaction instanceof Transaction)) {
    throw new Error('Raydium không tạo giao dịch legacy hợp lệ.');
  }
  built.transaction.feePayer = owner;
  const latestBlockhash = await connection.getLatestBlockhash('finalized');
  built.transaction.recentBlockhash = latestBlockhash.blockhash;
  const staticKeys = built.transaction.compileMessage().accountKeys.map((key) => key.toBase58());
  if (!staticKeys.includes(config.program_id) || !staticKeys.includes(pool) || staticKeys[0] !== expectedWallet) {
    throw new Error('Giao dịch Raydium không khớp ví hoặc pool đã chọn.');
  }
  // Phantom may report only "Unexpected error" for a transaction that cannot run.
  // Simulate against the same Devnet RPC used to build it before opening the wallet.
  const simulation = await connection.simulateTransaction(built.transaction);
  if (simulation.value.err) {
    const programError = simulation.value.logs?.filter((line) =>
      line.startsWith('Program log: Error:') || line.includes('failed:')).pop();
    const detail = programError || JSON.stringify(simulation.value.err);
    throw new Error(`Giao dịch không qua mô phỏng Devnet: ${detail}. Hãy lấy báo giá mới và kiểm tra số dư SOL để trả phí.`);
  }
  const networkFeeLamports = await connection.getFeeForMessage(built.transaction.compileMessage(), 'confirmed');
  if (networkFeeLamports.value === null) {
    throw new Error('RPC chưa ước tính được phí mạng. Hãy thử lại sau.');
  }
  return {
    transaction: Buffer.from(built.transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
    })).toString('base64'),
    networkFeeLamports: networkFeeLamports.value,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  };
}
