import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { formatBaseUnits, uiAmountToBaseUnits } from './dexMath';
import { SOLANA_NETWORK, SOLANA_RPC_URL, solanaAdapter } from './solana';

const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';

export interface PreparedSolPayment {
  sender: string;
  recipient: string;
  amountLamports: bigint;
  feeLamports: number;
  balanceLamports: number;
  blockhash: string;
  lastValidBlockHeight: number;
  transactionBase64: string;
}

export interface SolPaymentResult {
  signature: string;
  status: 'confirmed' | 'pending' | 'failed';
  message?: string;
}

export function paymentAmountLamports(amount: string): bigint {
  const lamports = BigInt(uiAmountToBaseUnits(amount, 9));
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Số SOL vượt giới hạn giao dịch của ví.');
  }
  return lamports;
}

export function paymentRecipient(sender: string, recipient: string): PublicKey {
  let destination: PublicKey;
  try {
    destination = new PublicKey(recipient.trim());
  } catch {
    throw new Error('Địa chỉ ví nhận không hợp lệ.');
  }
  if (!PublicKey.isOnCurve(destination)) {
    throw new Error('Chỉ hỗ trợ chuyển SOL đến địa chỉ ví cá nhân.');
  }
  if (destination.toBase58() === sender) {
    throw new Error('Ví nhận phải khác ví gửi.');
  }
  return destination;
}

async function devnetConnection(): Promise<Connection> {
  if (SOLANA_NETWORK !== 'devnet') throw new Error('Thanh toán hiện chỉ hỗ trợ Solana Devnet.');
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  if (await connection.getGenesisHash() !== DEVNET_GENESIS) {
    throw new Error('RPC thanh toán không khớp Solana Devnet.');
  }
  return connection;
}

export async function paymentBalance(wallet: string): Promise<number> {
  const connection = await devnetConnection();
  return connection.getBalance(new PublicKey(wallet), 'confirmed');
}

export async function prepareSolPayment(
  sender: string,
  recipient: string,
  amount: string,
): Promise<PreparedSolPayment> {
  const source = new PublicKey(sender);
  const destination = paymentRecipient(sender, recipient);
  const amountLamports = paymentAmountLamports(amount);
  const connection = await devnetConnection();
  const [destinationAccount, balanceLamports, latestBlockhash] = await Promise.all([
    connection.getAccountInfo(destination, 'confirmed'),
    connection.getBalance(source, 'confirmed'),
    connection.getLatestBlockhash('finalized'),
  ]);
  if (destinationAccount && !destinationAccount.owner.equals(SystemProgram.programId)) {
    throw new Error('Địa chỉ nhận là tài khoản chương trình, không phải ví SOL cá nhân.');
  }
  const transaction = new Transaction({
    feePayer: source,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(SystemProgram.transfer({ fromPubkey: source, toPubkey: destination, lamports: amountLamports }));
  const estimatedFee = await connection.getFeeForMessage(transaction.compileMessage(), 'confirmed');
  if (estimatedFee.value === null) {
    throw new Error('RPC chưa ước tính được phí mạng. Hãy thử lại.');
  }
  if (amountLamports + BigInt(estimatedFee.value) > BigInt(balanceLamports)) {
    throw new Error(`Số dư SOL không đủ cho ${amount} SOL và phí mạng ${formatBaseUnits(BigInt(estimatedFee.value), 9, 9)} SOL.`);
  }
  return {
    sender,
    recipient: destination.toBase58(),
    amountLamports,
    feeLamports: estimatedFee.value,
    balanceLamports,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    transactionBase64: Buffer.from(transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })).toString('base64'),
  };
}

export function signedSolPaymentSignature(prepared: PreparedSolPayment, signedBase64: string): string {
  const unsigned = Transaction.from(Buffer.from(prepared.transactionBase64, 'base64'));
  const signed = Transaction.from(Buffer.from(signedBase64, 'base64'));
  if (!signed.serializeMessage().equals(unsigned.serializeMessage())) {
    throw new Error('Ví đã thay đổi nội dung thanh toán. Giao dịch chưa được gửi.');
  }
  const ownerSignature = signed.signatures.find((item) => item.publicKey.toBase58() === prepared.sender)?.signature;
  if (!ownerSignature) throw new Error('Ví chưa ký giao dịch thanh toán.');
  return bs58.encode(ownerSignature);
}

export async function sendSolPayment(prepared: PreparedSolPayment): Promise<SolPaymentResult> {
  const connection = await devnetConnection();
  if (await connection.getBlockHeight('confirmed') + 5 >= prepared.lastValidBlockHeight) {
    throw new Error('Giao dịch đã cũ. Hãy kiểm tra lại trước khi ký.');
  }
  const signedBase64 = await solanaAdapter.signPaymentTransaction(
    prepared.transactionBase64, prepared.sender,
  );
  const signature = signedSolPaymentSignature(prepared, signedBase64);
  const signed = Transaction.from(Buffer.from(signedBase64, 'base64'));
  if (await connection.getBlockHeight('confirmed') + 5 >= prepared.lastValidBlockHeight) {
    throw new Error('Blockhash hết hạn sau khi ký. Giao dịch chưa được gửi; hãy kiểm tra lại.');
  }

  try {
    const submittedSignature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });
    if (submittedSignature !== signature) throw new Error('RPC trả chữ ký khác giao dịch đã ký.');
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (/simulation failed|signature verification|insufficient funds|invalid transaction/i.test(message)) {
      throw new Error(`RPC từ chối thanh toán: ${message}`);
    }
    return { signature, status: 'pending', message: 'Chưa xác định RPC đã nhận giao dịch. Kiểm tra Explorer trước khi gửi lại.' };
  }

  try {
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: prepared.blockhash,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
    }, 'confirmed');
    if (confirmation.value.err) {
      return { signature, status: 'failed', message: `Giao dịch không thành công: ${JSON.stringify(confirmation.value.err)}` };
    }
    return { signature, status: 'confirmed' };
  } catch {
    return { signature, status: 'pending', message: 'Đã gửi giao dịch; đang chờ xác nhận trên Devnet.' };
  }
}
