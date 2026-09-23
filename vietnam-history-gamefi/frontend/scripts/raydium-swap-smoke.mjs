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
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';

const POOL_ID = '6dg1ELPzBmmqs7UDTr8pAZmGNQY9XymEDo6KQx8h4J2r';
const PROGRAM_ID = 'DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const HKDV_MINT = '45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm';
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

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
  const direction = String(args.get('--direction') || 'sol-to-hkdv');
  const inputAmount = new BN(String(args.get('--amount') || '1000000'));
  const slippageBps = Number(args.get('--slippage-bps') || 100);
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
    blockhashCommitment: 'confirmed',
    urlConfigs: DEV_API_URLS,
  });
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(POOL_ID);
  if (poolInfo.programId !== PROGRAM_ID) throw new Error('Unexpected Raydium program');
  const inputMint = direction === 'sol-to-hkdv' ? WSOL_MINT : HKDV_MINT;
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
    txVersion: TxVersion.V0,
  });
  if (!(built.transaction instanceof VersionedTransaction)) throw new Error('Expected a versioned transaction');
  const keys = built.transaction.message.staticAccountKeys.map((key) => key.toBase58());
  if (keys[0] !== ownerAddress.toBase58() || !keys.includes(POOL_ID) || !keys.includes(PROGRAM_ID)) {
    throw new Error('Built transaction does not target the expected owner and pool');
  }
  const metadata = {
    owner: ownerAddress.toBase58(),
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
    serialized_bytes: built.transaction.serialize().length,
    required_signatures: built.transaction.message.header.numRequiredSignatures,
    present_signatures: built.transaction.signatures.filter((signature) => {
      const base58 = Buffer.from(signature).toString('hex');
      return base58 !== '0'.repeat(128);
    }).length,
  };
  if (!submit) {
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
