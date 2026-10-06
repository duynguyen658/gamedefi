import {
  Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { paymentAmountLamports } from './solPayment';
import { SOLANA_NETWORK, SOLANA_RPC_URL, solanaAdapter } from './solana';

export const FINANCE_PROGRAM_ID = new PublicKey('C4Ys1SQk5PXcPD5GfLP1RL7FdiL54A4mhv49cDf7rYW6');
const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const encoder = new TextEncoder();
const key = (value: string) => new PublicKey(value);
const walletMeta = (value: PublicKey, writable = true) => ({ pubkey: value, isSigner: true, isWritable: writable });
const meta = (value: PublicKey, writable = false) => ({ pubkey: value, isSigner: false, isWritable: writable });
const u64 = (value: bigint) => { const out = Buffer.alloc(8); out.writeBigUInt64LE(value); return out; };
const i64 = (value: number) => { const out = Buffer.alloc(8); out.writeBigInt64LE(BigInt(value)); return out; };
const lamports = (value: string) => paymentAmountLamports(value);
const seed = (value: string) => Buffer.from(encoder.encode(value));
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, FINANCE_PROGRAM_ID)[0];
const treasuryKey = () => pda(seed('treasury'));
const savingKey = (owner: PublicKey) => pda(seed('saving'), owner.toBuffer());
const stakeKey = (owner: PublicKey) => pda(seed('stake'), owner.toBuffer());
const loanKey = (owner: PublicKey, nonce: bigint) => pda(seed('loan'), owner.toBuffer(), u64(nonce));
const proposalKey = (owner: PublicKey, nonce: bigint) => pda(seed('proposal'), owner.toBuffer(), u64(nonce));
const voteKey = (proposal: PublicKey, owner: PublicKey) => pda(seed('vote'), proposal.toBuffer(), owner.toBuffer());

async function discriminator(namespace: 'global' | 'account', name: string): Promise<Buffer> {
  const bytes = encoder.encode(`${namespace}:${name}`);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(hash).subarray(0, 8);
}

function checkPublicWallet(value: string): PublicKey {
  const result = key(value.trim());
  if (!PublicKey.isOnCurve(result)) throw new Error('Địa chỉ ví cá nhân không hợp lệ.');
  return result;
}

function readU64(data: Buffer, offset: number): bigint { return data.readBigUInt64LE(offset); }
function readI64(data: Buffer, offset: number): number { return Number(data.readBigInt64LE(offset)); }
function readKey(data: Buffer, offset: number): string { return new PublicKey(data.subarray(offset, offset + 32)).toBase58(); }
async function checkAccount(data: Buffer, name: string) {
  if (!data.subarray(0, 8).equals(await discriminator('account', name))) {
    throw new Error(`Dữ liệu ${name} trên chuỗi không hợp lệ.`);
  }
}

export interface FinanceSaving { principal: bigint; unlockAt: number }
export interface FinanceLoan {
  address: string; lender: string; borrower: string; nonce: bigint;
  principal: bigint; interest: bigint; termSeconds: number; dueAt: number; status: number;
}
export interface FinanceTreasury { available: bigint; totalStaked: bigint; address: string }
export interface FinanceStake { amount: bigint; lockedUntil: number }
export interface FinanceProposal {
  address: string; proposer: string; recipient: string; nonce: bigint; amount: bigint;
  endsAt: number; quorum: bigint; yesVotes: bigint; noVotes: bigint; executed: boolean;
}
export interface FinanceSnapshot {
  deployed: boolean;
  balance: number;
  saving: FinanceSaving | null;
  treasury: FinanceTreasury | null;
  stake: FinanceStake | null;
  loans: FinanceLoan[];
  proposals: FinanceProposal[];
}

async function connection(): Promise<Connection> {
  if (SOLANA_NETWORK !== 'devnet') throw new Error('Các chương trình tài chính chỉ hỗ trợ Devnet.');
  const rpc = new Connection(SOLANA_RPC_URL, 'confirmed');
  if (await rpc.getGenesisHash() !== DEVNET_GENESIS) throw new Error('RPC hiện không phải Solana Devnet.');
  return rpc;
}

async function decodeSaving(data: Buffer): Promise<FinanceSaving> {
  await checkAccount(data, 'Saving');
  return { principal: readU64(data, 40), unlockAt: readI64(data, 48) };
}
async function decodeTreasury(data: Buffer): Promise<FinanceTreasury> {
  await checkAccount(data, 'Treasury');
  return { address: treasuryKey().toBase58(), available: readU64(data, 8), totalStaked: readU64(data, 16) };
}
async function decodeStake(data: Buffer): Promise<FinanceStake> {
  await checkAccount(data, 'Stake');
  return { amount: readU64(data, 40), lockedUntil: readI64(data, 48) };
}
async function decodeLoan(address: PublicKey, data: Buffer): Promise<FinanceLoan> {
  await checkAccount(data, 'Loan');
  return {
    address: address.toBase58(), lender: readKey(data, 8), borrower: readKey(data, 40),
    nonce: readU64(data, 72), principal: readU64(data, 80), interest: readU64(data, 88),
    termSeconds: readI64(data, 96), dueAt: readI64(data, 104),
    status: data[112],
  };
}
async function decodeProposal(address: PublicKey, data: Buffer): Promise<FinanceProposal> {
  await checkAccount(data, 'Proposal');
  return {
    address: address.toBase58(), proposer: readKey(data, 8), recipient: readKey(data, 40),
    nonce: readU64(data, 72), amount: readU64(data, 80), endsAt: readI64(data, 88),
    quorum: readU64(data, 96), yesVotes: readU64(data, 104), noVotes: readU64(data, 112),
    executed: data[120] !== 0,
  };
}

export async function loadFinanceSnapshot(wallet: string): Promise<FinanceSnapshot> {
  const owner = checkPublicWallet(wallet);
  const rpc = await connection();
  const [program, balance] = await Promise.all([
    rpc.getAccountInfo(FINANCE_PROGRAM_ID, 'confirmed'), rpc.getBalance(owner, 'confirmed'),
  ]);
  if (!program?.executable) {
    return { deployed: false, balance, saving: null, treasury: null, stake: null, loans: [], proposals: [] };
  }
  const [saving, treasury, stake, lending, borrowing, proposals] = await Promise.all([
    rpc.getAccountInfo(savingKey(owner), 'confirmed'),
    rpc.getAccountInfo(treasuryKey(), 'confirmed'),
    rpc.getAccountInfo(stakeKey(owner), 'confirmed'),
    rpc.getProgramAccounts(FINANCE_PROGRAM_ID, { filters: [{ dataSize: 114 }, { memcmp: { offset: 8, bytes: wallet } }] }),
    rpc.getProgramAccounts(FINANCE_PROGRAM_ID, { filters: [{ dataSize: 114 }, { memcmp: { offset: 40, bytes: wallet } }] }),
    rpc.getProgramAccounts(FINANCE_PROGRAM_ID, { filters: [{ dataSize: 122 }] }),
  ]);
  const loans = await Promise.all([...new Map([...lending, ...borrowing].map((item) => [item.pubkey.toBase58(), item])).values()]
    .map((item) => decodeLoan(item.pubkey, item.account.data)));
  const proposalList = await Promise.all(proposals.map((item) => decodeProposal(item.pubkey, item.account.data)));
  return {
    deployed: true, balance,
    saving: saving ? await decodeSaving(saving.data) : null,
    treasury: treasury ? await decodeTreasury(treasury.data) : null,
    stake: stake ? await decodeStake(stake.data) : null,
    loans: loans.sort((a, b) => Number(b.nonce - a.nonce)),
    proposals: proposalList.sort((a, b) => Number(b.nonce - a.nonce)),
  };
}

export type FinanceAction =
  | { kind: 'open_saving'; amount: string; termSeconds: number }
  | { kind: 'withdraw_saving' }
  | { kind: 'create_loan'; borrower: string; amount: string; interest: string; termSeconds: number }
  | { kind: 'cancel_loan' | 'draw_loan' | 'repay_loan' | 'claim_repayment'; loan: FinanceLoan }
  | { kind: 'initialize_treasury' }
  | { kind: 'deposit_treasury' | 'stake_sol' | 'unstake_sol'; amount: string }
  | { kind: 'create_proposal'; recipient: string; amount: string; votingSeconds: number }
  | { kind: 'cast_vote'; proposal: FinanceProposal; approve: boolean }
  | { kind: 'execute_proposal'; proposal: FinanceProposal };

function title(action: FinanceAction): string {
  const titles: Record<FinanceAction['kind'], string> = {
    open_saving: 'Khóa SOL trong két', withdraw_saving: 'Rút SOL từ két',
    create_loan: 'Tạo khoản cho vay', cancel_loan: 'Hủy khoản vay chưa rút',
    draw_loan: 'Nhận tiền vay', repay_loan: 'Trả khoản vay',
    claim_repayment: 'Nhận tiền hoàn trả', initialize_treasury: 'Tạo ngân khố DAO',
    deposit_treasury: 'Nạp ngân khố', stake_sol: 'Khóa SOL để bỏ phiếu',
    unstake_sol: 'Rút SOL đã khóa', create_proposal: 'Tạo đề xuất chi',
    cast_vote: 'Bỏ phiếu DAO', execute_proposal: 'Thực hiện đề xuất',
  };
  return titles[action.kind];
}

async function instruction(name: FinanceAction['kind'], keys: TransactionInstruction['keys'], ...args: Buffer[]) {
  return new TransactionInstruction({
    programId: FINANCE_PROGRAM_ID, keys,
    data: Buffer.concat([await discriminator('global', name), ...args]),
  });
}

function term(seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 365 * 24 * 3600) {
    throw new Error('Kỳ hạn phải từ 60 giây đến 365 ngày.');
  }
  return i64(seconds);
}

async function actionInstructions(action: FinanceAction, owner: PublicKey): Promise<TransactionInstruction[]> {
  const treasury = treasuryKey();
  const system = SystemProgram.programId;
  switch (action.kind) {
    case 'open_saving':
      return [await instruction(action.kind, [meta(savingKey(owner), true), walletMeta(owner), meta(system)],
        u64(lamports(action.amount)), term(action.termSeconds))];
    case 'withdraw_saving':
      return [await instruction(action.kind, [meta(savingKey(owner), true), walletMeta(owner)])];
    case 'create_loan': {
      const borrower = checkPublicWallet(action.borrower);
      if (borrower.equals(owner)) throw new Error('Ví vay phải khác ví cho vay.');
      const principal = lamports(action.amount);
      const interest = lamports(action.interest);
      if (interest * 4n > principal) throw new Error('Lãi cố định tối đa 25% khoản vay.');
      const nonce = BigInt(Date.now());
      return [await instruction(action.kind, [meta(loanKey(owner, nonce), true), walletMeta(owner),
        meta(borrower), meta(system)], u64(nonce), u64(principal), u64(interest), term(action.termSeconds))];
    }
    case 'cancel_loan':
    case 'draw_loan':
    case 'repay_loan':
    case 'claim_repayment': {
      const loan = action.loan;
      if (action.kind === 'repay_loan') {
        return [await instruction(action.kind, [meta(key(loan.address), true), walletMeta(owner), meta(system)])];
      }
      return [await instruction(action.kind, [meta(key(loan.address), true), walletMeta(owner)])];
    }
    case 'initialize_treasury':
      return [await instruction(action.kind, [meta(treasury, true), walletMeta(owner), meta(system)])];
    case 'deposit_treasury':
      return [await instruction(action.kind, [meta(treasury, true), walletMeta(owner), meta(system)], u64(lamports(action.amount)))];
    case 'stake_sol':
      return [await instruction(action.kind, [meta(treasury, true), meta(stakeKey(owner), true),
        walletMeta(owner), meta(system)], u64(lamports(action.amount)))];
    case 'unstake_sol':
      return [await instruction(action.kind, [meta(treasury, true), meta(stakeKey(owner), true),
        walletMeta(owner)], u64(lamports(action.amount)))];
    case 'create_proposal': {
      const recipient = checkPublicWallet(action.recipient);
      const nonce = BigInt(Date.now());
      return [await instruction(action.kind, [meta(treasury), meta(stakeKey(owner)),
        meta(proposalKey(owner, nonce), true), walletMeta(owner), meta(recipient), meta(system)],
      u64(nonce), u64(lamports(action.amount)), term(action.votingSeconds))];
    }
    case 'cast_vote':
      return [await instruction(action.kind, [meta(key(action.proposal.address), true),
        meta(stakeKey(owner), true), meta(voteKey(key(action.proposal.address), owner), true),
        walletMeta(owner), meta(system)], Buffer.from([action.approve ? 1 : 0]))];
    case 'execute_proposal':
      return [await instruction(action.kind, [meta(treasury, true),
        meta(key(action.proposal.address), true), meta(key(action.proposal.recipient), true)])];
  }
}

export interface PreparedFinanceAction {
  label: string; wallet: string; transactionBase64: string;
  blockhash: string; lastValidBlockHeight: number; feeLamports: number;
}

export async function prepareFinanceAction(action: FinanceAction, wallet: string): Promise<PreparedFinanceAction> {
  const owner = checkPublicWallet(wallet);
  const rpc = await connection();
  const program = await rpc.getAccountInfo(FINANCE_PROGRAM_ID, 'confirmed');
  if (!program?.executable) throw new Error('Chương trình tài chính chưa được triển khai trên Devnet.');
  const [instructions, blockhash] = await Promise.all([
    actionInstructions(action, owner), rpc.getLatestBlockhash('finalized'),
  ]);
  const transaction = new Transaction({ feePayer: owner, recentBlockhash: blockhash.blockhash }).add(...instructions);
  const [fee, balance] = await Promise.all([
    rpc.getFeeForMessage(transaction.compileMessage(), 'confirmed'),
    rpc.getBalance(owner, 'confirmed'),
  ]);
  if (fee.value === null || balance <= fee.value) throw new Error('Số dư SOL không đủ phí mạng.');
  const simulation = await rpc.simulateTransaction(transaction);
  if (simulation.value.err) {
    const detail = simulation.value.logs?.slice(-4).join(' · ') || JSON.stringify(simulation.value.err);
    throw new Error(`Giao dịch chưa hợp lệ trên Devnet: ${detail}`);
  }
  return {
    label: title(action), wallet, blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight, feeLamports: fee.value,
    transactionBase64: Buffer.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64'),
  };
}

export interface FinanceSendResult { signature: string; status: 'confirmed' | 'pending' }

export async function sendFinanceAction(prepared: PreparedFinanceAction): Promise<FinanceSendResult> {
  const rpc = await connection();
  const signedBase64 = await solanaAdapter.signFinanceTransaction(prepared.transactionBase64, prepared.wallet);
  const unsigned = Transaction.from(Buffer.from(prepared.transactionBase64, 'base64'));
  const signed = Transaction.from(Buffer.from(signedBase64, 'base64'));
  if (!unsigned.serializeMessage().equals(signed.serializeMessage())) {
    throw new Error('Ví đã thay đổi nội dung giao dịch; chưa gửi.');
  }
  const signature = signed.signatures.find((item) => item.publicKey.toBase58() === prepared.wallet)?.signature;
  if (!signature) throw new Error('Ví chưa ký giao dịch.');
  if (await rpc.getBlockHeight('confirmed') + 5 >= prepared.lastValidBlockHeight) {
    throw new Error('Giao dịch đã hết hạn; hãy kiểm tra lại.');
  }
  const expectedSignature = bs58.encode(signature);
  let tx: string;
  try {
    tx = await rpc.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  } catch (reason) {
    const status = await rpc.getSignatureStatus(expectedSignature).catch(() => null);
    if (status?.value && !status.value.err) return { signature: expectedSignature, status: 'pending' };
    const message = reason instanceof Error ? reason.message : String(reason);
    if (/simulation failed|signature verification|insufficient funds|invalid transaction/i.test(message)) {
      throw new Error(`RPC từ chối giao dịch: ${message}`);
    }
    return { signature: expectedSignature, status: 'pending' };
  }
  if (tx !== expectedSignature) throw new Error('RPC trả chữ ký không khớp giao dịch đã ký.');
  try {
    const result = await rpc.confirmTransaction({
      signature: tx, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight,
    }, 'confirmed');
    if (result.value.err) throw new Error(`Giao dịch thất bại: ${JSON.stringify(result.value.err)}. Mã: ${tx}`);
    return { signature: tx, status: 'confirmed' };
  } catch (reason) {
    if (reason instanceof Error && reason.message.startsWith('Giao dịch thất bại:')) throw reason;
    return { signature: tx, status: 'pending' };
  }
}
