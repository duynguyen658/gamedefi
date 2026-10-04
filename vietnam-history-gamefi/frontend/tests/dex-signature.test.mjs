import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { signedDexTransactionSignature } from '../src/services/dexSignature.ts';

test('preserves the signature of a signed legacy and versioned swap transaction', () => {
  const wallet = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();
  const transfer = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });

  const legacy = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: blockhash }).add(transfer);
  legacy.sign(wallet);
  assert.equal(signedDexTransactionSignature(legacy.serialize().toString('base64')), bs58.encode(legacy.signature));

  const message = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions: [transfer] }).compileToV0Message();
  const versioned = new VersionedTransaction(message);
  versioned.sign([wallet]);
  assert.equal(signedDexTransactionSignature(Buffer.from(versioned.serialize()).toString('base64')), bs58.encode(versioned.signatures[0]));
});
