import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';

const output = path.resolve('node_modules/.cache/sol-payment-test.cjs');
await mkdir(path.dirname(output), { recursive: true });
await build({
  entryPoints: ['src/services/solPayment.ts'],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  define: {
    'import.meta.env': JSON.stringify({ VITE_SOLANA_NETWORK: 'devnet', VITE_SOLANA_RPC_URL: 'https://api.devnet.solana.com' }),
  },
  logLevel: 'silent',
});
const payment = await import(pathToFileURL(output).href);
await rm(output);

test('payment amount and recipient validation use exact lamports', () => {
  const owner = Keypair.generate().publicKey.toBase58();
  const recipient = Keypair.generate().publicKey.toBase58();
  assert.equal(payment.paymentAmountLamports('0.000000001'), 1n);
  assert.equal(payment.paymentAmountLamports('1.25'), 1_250_000_000n);
  assert.throws(() => payment.paymentAmountLamports('1.0000000001'));
  assert.equal(payment.paymentRecipient(owner, recipient).toBase58(), recipient);
  assert.throws(() => payment.paymentRecipient(owner, owner), /khác ví gửi/);
  assert.throws(() => payment.paymentRecipient(owner, 'not-a-wallet'), /không hợp lệ/);
});

test('wallet signature is accepted only for the exact reviewed payment message', () => {
  const owner = Keypair.generate();
  const recipient = Keypair.generate();
  const other = Keypair.generate();
  const unsigned = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
  }).add(SystemProgram.transfer({
    fromPubkey: owner.publicKey, toPubkey: recipient.publicKey, lamports: 42_000n,
  }));
  const unsignedBase64 = unsigned.serialize({ requireAllSignatures: false }).toString('base64');
  const prepared = { sender: owner.publicKey.toBase58(), transactionBase64: unsignedBase64 };
  const signed = Transaction.from(Buffer.from(unsignedBase64, 'base64'));
  signed.sign(owner);
  assert.ok(payment.signedSolPaymentSignature(prepared, signed.serialize().toString('base64')));

  const changed = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: '11111111111111111111111111111111',
  }).add(SystemProgram.transfer({
    fromPubkey: owner.publicKey, toPubkey: other.publicKey, lamports: 42_000n,
  }));
  changed.sign(owner);
  assert.throws(() => payment.signedSolPaymentSignature(prepared, changed.serialize().toString('base64')), /thay đổi nội dung/);
});
