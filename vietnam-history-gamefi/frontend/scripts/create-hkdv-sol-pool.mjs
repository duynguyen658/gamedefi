#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  DEVNET_PROGRAM_ID,
  DEV_API_URLS,
  Raydium,
  TxVersion,
  getCpmmPdaAmmConfigId,
} from '@raydium-io/raydium-sdk-v2';
import { Connection, Keypair } from '@solana/web3.js';
import BN from 'bn.js';

const HKDV_MINT = '45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function args() {
  const values = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value.startsWith('--')) {
      const next = process.argv[index + 1];
      if (!next || next.startsWith('--')) values.set(value, true);
      else {
        values.set(value, next);
        index += 1;
      }
    }
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

function publicAddress(value) {
  if (value && typeof value === 'object' && 'address' in value) return String(value.address);
  return String(value);
}

async function main() {
  const values = args();
  if (!values.has('--submit-devnet')) {
    throw new Error('--submit-devnet is required because pool creation changes Devnet state');
  }
  const keypairPath = path.resolve(required(values, '--keypair'));
  const recordPath = path.resolve(required(values, '--record'));
  const rpcUrl = String(values.get('--rpc') || 'https://api.devnet.solana.com');
  const hkdvAmount = new BN(String(values.get('--hkdv-base-units') || '100000000000'));
  const solAmount = new BN(String(values.get('--sol-lamports') || '1000000000'));
  if (hkdvAmount.lte(new BN(0)) || solAmount.lte(new BN(0))) throw new Error('Liquidity amounts must be positive');
  if (fs.existsSync(recordPath)) throw new Error(`Deployment record already exists: ${recordPath}`);

  const rawKeypair = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  if (!Array.isArray(rawKeypair) || rawKeypair.length !== 64) throw new Error('Invalid treasury keypair');
  const owner = Keypair.fromSecretKey(Uint8Array.from(rawKeypair));
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') {
    throw new Error('RPC is not Solana Devnet');
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
  const feeConfigs = await raydium.api.getCpmmConfigs();
  if (!feeConfigs.length) throw new Error('Raydium returned no CPMM fee configs');
  for (const config of feeConfigs) {
    config.id = getCpmmPdaAmmConfigId(
      DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
      config.index,
    ).publicKey.toBase58();
  }
  const feeConfig = feeConfigs[0];
  const mintA = { address: HKDV_MINT, decimals: 6, programId: TOKEN_PROGRAM };
  const mintB = { address: WSOL_MINT, decimals: 9, programId: TOKEN_PROGRAM };
  const built = await raydium.cpmm.createPool({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount: hkdvAmount,
    mintBAmount: solAmount,
    startTime: new BN(0),
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  });
  const { txId } = await built.execute({ sendAndConfirm: true });
  const address = built.extInfo.address;
  const actualMintA = publicAddress(address.mintA);
  const actualMintB = publicAddress(address.mintB);
  const deployment = {
    phase: 7,
    network: 'devnet',
    provider: 'raydium-cpmm',
    owner: owner.publicKey.toBase58(),
    program_id: address.programId.toBase58(),
    pool_id: address.poolId.toBase58(),
    config_id: address.configId.toBase58(),
    authority: address.authority.toBase58(),
    lp_mint: address.lpMint.toBase58(),
    mint_a: actualMintA,
    mint_b: actualMintB,
    vault_a: address.vaultA.toBase58(),
    vault_b: address.vaultB.toBase58(),
    hkdv_mint: HKDV_MINT,
    wsol_mint: WSOL_MINT,
    hkdv_vault: actualMintA === HKDV_MINT ? address.vaultA.toBase58() : address.vaultB.toBase58(),
    wsol_vault: actualMintA === WSOL_MINT ? address.vaultA.toBase58() : address.vaultB.toBase58(),
    initial_hkdv_base_units: hkdvAmount.toString(),
    initial_sol_lamports: solAmount.toString(),
    trade_fee_rate_millionths: Number(feeConfig.tradeFeeRate),
    protocol_fee_rate_millionths: Number(feeConfig.protocolFeeRate),
    fund_fee_rate_millionths: Number(feeConfig.fundFeeRate),
    creator_fee_rate_millionths: Number(feeConfig.creatorFeeRate || 0),
    signature: txId,
    created_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(deployment, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});