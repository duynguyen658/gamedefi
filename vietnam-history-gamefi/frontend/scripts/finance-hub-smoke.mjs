import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'blockchain/solana/target/deploy');
const payerPath = path.join(target, 'finance_payer-keypair.json');
const borrowerPath = path.join(target, 'finance-smoke-borrower-keypair.json');
const program = new PublicKey('C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6');
const devnetGenesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const connection = new Connection(process.env.FINANCE_SMOKE_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
const u64 = value => { const data = Buffer.alloc(8); data.writeBigUInt64LE(BigInt(value)); return data; };
const i64 = value => { const data = Buffer.alloc(8); data.writeBigInt64LE(BigInt(value)); return data; };
const pda = (...seeds) => PublicKey.findProgramAddressSync(seeds, program)[0];
const treasury = pda(Buffer.from('treasury'));
const saving = owner => pda(Buffer.from('saving'), owner.toBuffer());
const stake = owner => pda(Buffer.from('stake'), owner.toBuffer());
const loan = (owner, nonce) => pda(Buffer.from('loan'), owner.toBuffer(), u64(nonce));
const proposal = (owner, nonce) => pda(Buffer.from('proposal'), owner.toBuffer(), u64(nonce));
const vote = (proposalKey, owner) => pda(Buffer.from('vote'), proposalKey.toBuffer(), owner.toBuffer());
const signer = key => ({ pubkey: key, isSigner: true, isWritable: true });
const account = (key, writable = false) => ({ pubkey: key, isSigner: false, isWritable: writable });

function makeInstruction(name, keys, ...arguments_) {
  const prefix = createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
  return new TransactionInstruction({ programId: program, keys, data: Buffer.concat([prefix, ...arguments_]) });
}
async function send(name, signers, keys, ...arguments_) {
  const tx = new Transaction().add(makeInstruction(name, keys, ...arguments_));
  const signature = await sendAndConfirmTransaction(connection, tx, signers, {
    commitment: 'confirmed', preflightCommitment: 'confirmed', skipPreflight: false,
  });
  console.log(`${name}: ${signature}`);
  return signature;
}
async function read(key) {
  const result = await connection.getAccountInfo(key, 'confirmed');
  if (result) assert.ok(result.owner.equals(program), `Wrong account owner: ${key}`);
  return result;
}
async function waitUntil(unixSeconds) {
  while (Math.floor(Date.now() / 1000) < unixSeconds + 2) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
function keypair(filename) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(filename, 'utf8'))));
}

async function main() {
  if (!existsSync(payerPath)) throw new Error('Missing local Devnet payer keypair.');
  assert.equal(await connection.getGenesisHash(), devnetGenesis, 'Smoke test must run on Devnet.');
  assert.ok((await connection.getAccountInfo(program, 'confirmed'))?.executable, 'Program is not deployed.');
  const payer = keypair(payerPath);
  if (!existsSync(borrowerPath)) {
    const next = Keypair.generate();
    writeFileSync(borrowerPath, JSON.stringify([...next.secretKey]), { flag: 'wx' });
  }
  const borrower = keypair(borrowerPath);
  if (await connection.getBalance(payer.publicKey) < 200_000_000) {
    throw new Error('Smoke test needs at least 0.2 SOL Devnet on the payer after deploy.');
  }
  if (await connection.getBalance(borrower.publicKey) < 50_000_000) {
    await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({
      fromPubkey: payer.publicKey, toPubkey: borrower.publicKey, lamports: 80_000_000,
    })), [payer], { commitment: 'confirmed' });
  }
  const system = SystemProgram.programId;
  const savingAddress = saving(payer.publicKey);
  const stakeAddress = stake(payer.publicKey);
  if (!(await read(treasury))) {
    await send('initialize_treasury', [payer], [account(treasury, true), signer(payer.publicKey), account(system)]);
  }
  const treasuryBefore = (await read(treasury)).data.readBigUInt64LE(8);
  await send('deposit_treasury', [payer],
    [account(treasury, true), signer(payer.publicKey), account(system)], u64(10_000_000));
  assert.equal((await read(treasury)).data.readBigUInt64LE(8), treasuryBefore + 10_000_000n);

  assert.equal(await read(savingAddress), null, 'Saving already exists; use a fresh test wallet or finish withdrawal.');
  await send('open_saving', [payer],
    [account(savingAddress, true), signer(payer.publicKey), account(system)], u64(5_000_000), i64(60));
  const savingData = (await read(savingAddress)).data;
  assert.equal(savingData.readBigUInt64LE(40), 5_000_000n);
  const savingUnlock = Number(savingData.readBigInt64LE(48));

  const cancelledNonce = BigInt(Date.now());
  const cancelledLoan = loan(payer.publicKey, cancelledNonce);
  await send('create_loan', [payer],
    [account(cancelledLoan, true), signer(payer.publicKey), account(borrower.publicKey), account(system)],
    u64(cancelledNonce), u64(20_000_000), u64(1_000_000), i64(60));
  assert.equal((await read(cancelledLoan)).data[112], 0);
  await send('cancel_loan', [payer], [account(cancelledLoan, true), signer(payer.publicKey)]);
  assert.equal(await read(cancelledLoan), null);

  const loanNonce = cancelledNonce + 1n;
  const loanAddress = loan(payer.publicKey, loanNonce);
  await send('create_loan', [payer],
    [account(loanAddress, true), signer(payer.publicKey), account(borrower.publicKey), account(system)],
    u64(loanNonce), u64(20_000_000), u64(1_000_000), i64(60));
  await send('draw_loan', [borrower], [account(loanAddress, true), signer(borrower.publicKey)]);
  assert.equal((await read(loanAddress)).data[112], 1);
  await send('repay_loan', [borrower], [account(loanAddress, true), signer(borrower.publicKey), account(system)]);
  assert.equal((await read(loanAddress)).data[112], 2);
  await send('claim_repayment', [payer], [account(loanAddress, true), signer(payer.publicKey)]);
  assert.equal(await read(loanAddress), null);

  await send('stake_sol', [payer],
    [account(treasury, true), account(stakeAddress, true), signer(payer.publicKey), account(system)], u64(10_000_000));
  assert.equal((await read(stakeAddress)).data.readBigUInt64LE(40), 10_000_000n);
  const proposalNonce = BigInt(Date.now());
  const proposalAddress = proposal(payer.publicKey, proposalNonce);
  const recipient = borrower.publicKey;
  await send('create_proposal', [payer],
    [account(treasury), account(stakeAddress), account(proposalAddress, true),
      signer(payer.publicKey), account(recipient), account(system)],
    u64(proposalNonce), u64(5_000_000), i64(60));
  const proposalData = (await read(proposalAddress)).data;
  assert.equal(proposalData.readBigUInt64LE(80), 5_000_000n);
  const proposalEnd = Number(proposalData.readBigInt64LE(88));
  const voteAddress = vote(proposalAddress, payer.publicKey);
  await send('cast_vote', [payer],
    [account(proposalAddress, true), account(stakeAddress, true), account(voteAddress, true),
      signer(payer.publicKey), account(system)], Buffer.from([1]));
  assert.equal((await read(proposalAddress)).data.readBigUInt64LE(104), 10_000_000n);
  assert.ok(await read(voteAddress));

  await waitUntil(Math.max(savingUnlock, proposalEnd));
  await send('withdraw_saving', [payer], [account(savingAddress, true), signer(payer.publicKey)]);
  assert.equal(await read(savingAddress), null);
  const beforeExecution = await connection.getBalance(recipient, 'confirmed');
  await send('execute_proposal', [payer],
    [account(treasury, true), account(proposalAddress, true), account(recipient, true)]);
  assert.equal((await read(proposalAddress)).data[120], 1);
  assert.equal(await connection.getBalance(recipient, 'confirmed'), beforeExecution + 5_000_000);
  await send('unstake_sol', [payer],
    [account(treasury, true), account(stakeAddress, true), signer(payer.publicKey)], u64(10_000_000));
  assert.equal((await read(stakeAddress)).data.readBigUInt64LE(40), 0n);
  console.log('Finance hub Devnet smoke passed.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
