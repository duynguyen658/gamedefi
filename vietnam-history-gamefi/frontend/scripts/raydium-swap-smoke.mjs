#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  CurveCalculator,
  DEV_API_URLS,
  FeeOn,
  Raydium,
  TxVersion,
} from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

const POOLS = {
  USDC: { pool: 'FeRts7d5DfXKXq1hGMkeiGEHayDdjsmSyJ41rHVcKo8t', mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' },
  USDT: { pool: 'Bw9gaeKqQy5aTpi1BiSdV2p21REATtVXDdhjPUFjgq6N', mint: '9jWfcfEZToquBQmkoEViNSCt72veXwcvRGFQERXRjEk1' },
};
const PROGRAM_ID = 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const DEVNET_SWAP_COMPUTE_BUDGET = { units: 600_000, microLamports: 1_000 };

function argumentsMap() {
  const result = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const current = process.argv[index];
    if (!current.startsWith('--')) continue;
    const next = process.argv[index + 1];
    if (!next || next.startsWith('--')) result.set(current, true);
    else {
      result.set(current, next);
      index += 1;
    }
  }
  return result;
}

async function main() {
  const args = argumentsMap();
  const rpc = String(args.get('--rpc') || 'https://api.devnet.solana.com');
  const direction = String(args.get('--direction') || 'sol-to-token');
  const symbol = String(args.get('--token') || 'USDC').toUpperCase();
  const pair = POOLS[symbol];
  if (!pair || !['sol-to-token', 'token-to-sol'].includes(direction)) throw new Error('Use --token USDC|USDT and --direction sol-to-token|token-to-sol');
  const inputAmount = new BN(String(args.get('--amount') || '1000000'));
  const slippageBps = Number(args.get('--slippage-bps') || 100);
  const txVersion = args.has('--v0') ? TxVersion.V0 : TxVersion.LEGACY;
  const submit = args.has('--submit-devnet');
  let owner;
  if (submit) {
    const keypairValue = args.get('--keypair');
    if (typeof keypairValue !== 'string') throw new Error('--keypair is required with --submit-devnet');
    const bytes = JSON.parse(fs.readFileSync(path.resolve(keypairValue), 'utf8'));
    if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error('Invalid keypair');
    owner = Keypair.fromSecretKey(Uint8Array.from(bytes));
  } else {
    const address = args.get('--owner');
    if (typeof address !== 'string') throw new Error('--owner is required for inspection');
    owner = new PublicKey(address);
  }
  const ownerAddress = owner instanceof Keypair ? owner.publicKey : owner;
  const connection = new Connection(rpc, 'confirmed');
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) throw new Error('RPC is not Solana Devnet');

  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: 'devnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'finalized',
    urlConfigs: DEV_API_URLS,
  });
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(pair.pool);
  if (poolInfo.programId !== PROGRAM_ID || new Set([poolInfo.mintA.address, poolInfo.mintB.address]).size !== 2
      || ![WSOL_MINT, pair.mint].every((mint) => [poolInfo.mintA.address, poolInfo.mintB.address].includes(mint))) {
    throw new Error('Unexpected Raydium pool or mint');
  }
  const inputMint = direction === 'sol-to-token' ? WSOL_MINT : pair.mint;
  const baseIn = inputMint === poolInfo.mintA.address;
  const creatorFeeOnInput = rpcData.feeOn === FeeOn.BothToken || rpcData.feeOn === FeeOn.OnlyTokenB;
  const swapResult = CurveCalculator.swapBaseInput(
    inputAmount,
    baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
    baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
    rpcData.configInfo.tradeFeeRate,
    rpcData.configInfo.creatorFeeRate,
    rpcData.configInfo.protocolFeeRate,
    rpcData.configInfo.fundFeeRate,
    creatorFeeOnInput,
  );
  const quotedOutputAmount = swapResult.outputAmount.toString();
  const built = await raydium.cpmm.swap({
    poolInfo,
    poolKeys,
    inputAmount,
    swapResult,
    slippage: slippageBps / 10_000,
    baseIn,
    txVersion,
    computeBudgetConfig: DEVNET_SWAP_COMPUTE_BUDGET,
  });
  if (!(built.transaction instanceof VersionedTransaction) && !(built.transaction instanceof Transaction)) {
    throw new Error('Expected a Solana transaction');
  }
  if (built.transaction instanceof Transaction) {
    built.transaction.feePayer ??= ownerAddress;
    built.transaction.recentBlockhash ??= (await connection.getLatestBlockhash('finalized')).blockhash;
  }
  const keys = built.transaction instanceof VersionedTransaction
    ? built.transaction.message.staticAccountKeys.map((key) => key.toBase58())
    : built.transaction.compileMessage().accountKeys.map((key) => key.toBase58());
  if (keys[0] !== ownerAddress.toBase58() || !keys.includes(pair.pool) || !keys.includes(PROGRAM_ID)) {
    throw new Error('Built transaction does not target the expected owner and pool');
  }
  const metadata = {
    owner: ownerAddress.toBase58(),
    token: symbol,
    pool: pair.pool,
    direction,
    input_amount: inputAmount.toString(),
    quoted_output_amount: quotedOutputAmount,
    minimum_output_amount: swapResult.outputAmount.toString(),
    trade_fee: swapResult.tradeFee.toString(),
    creator_fee: swapResult.creatorFee.toString(),
    base_reserve: rpcData.baseReserve.toString(),
    quote_reserve: rpcData.quoteReserve.toString(),
    fee_on: Number(rpcData.feeOn),
    trade_fee_rate: rpcData.configInfo.tradeFeeRate.toString(),
    creator_fee_rate: rpcData.configInfo.creatorFeeRate.toString(),
    transaction_version: txVersion,
    serialized_bytes: built.transaction instanceof VersionedTransaction
      ? built.transaction.serialize().length
      : built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length,
    recent_blockhash: built.transaction instanceof VersionedTransaction
      ? built.transaction.message.recentBlockhash : built.transaction.recentBlockhash,
    required_signatures: built.transaction instanceof VersionedTransaction
      ? built.transaction.message.header.numRequiredSignatures : built.transaction.compileMessage().header.numRequiredSignatures,
    present_signatures: built.transaction instanceof VersionedTransaction
      ? built.transaction.signatures.filter((signature) => Buffer.from(signature).toString('hex') !== '0'.repeat(128)).length
      : built.transaction.signatures.filter((entry) => entry.signature !== null).length,
  };
  if (!submit) {
    const unsignedOutput = args.get('--output-unsigned');
    if (typeof unsignedOutput === 'string') {
      const bytes = built.transaction instanceof VersionedTransaction
        ? Buffer.from(built.transaction.serialize())
        : built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
      fs.writeFileSync(path.resolve(unsignedOutput), Buffer.from(bytes).toString('base64'), 'utf8');
      metadata.unsigned_transaction_file = path.resolve(unsignedOutput);
    }
    if (args.has('--simulate')) {
      const simulation = built.transaction instanceof VersionedTransaction
        ? await connection.simulateTransaction(built.transaction, { sigVerify: false, commitment: 'confirmed' })
        : await connection.simulateTransaction(built.transaction);
      metadata.simulation = {
        err: simulation.value.err,
        logs: simulation.value.logs,
        units_consumed: simulation.value.unitsConsumed,
      };
      metadata.blockhash_after_simulation = built.transaction instanceof VersionedTransaction
        ? built.transaction.message.recentBlockhash : built.transaction.recentBlockhash;
    }
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }
  const { txId } = await built.execute({ sendAndConfirm: true });
  console.log(JSON.stringify({ ...metadata, signature: txId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
