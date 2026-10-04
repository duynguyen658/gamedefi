import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';

export function signedDexTransactionSignature(transactionBase64: string): string {
  const bytes = Buffer.from(transactionBase64, 'base64');
  try {
    const legacy = Transaction.from(bytes);
    if (legacy.signature && legacy.signature.some((byte) => byte !== 0)) {
      return bs58.encode(legacy.signature);
    }
  } catch {
    // Versioned transactions use a different wire format.
  }
  const versioned = VersionedTransaction.deserialize(bytes);
  const signature = versioned.signatures[0];
  if (!signature || !signature.some((byte) => byte !== 0)) {
    throw new Error('Giao dịch chưa có chữ ký.');
  }
  return bs58.encode(signature);
}
