import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import { encodeMintFaction, factionAddress, readFactionProof } from './solanaProtocol';

export const SOLANA_NETWORK = import.meta.env?.VITE_SOLANA_NETWORK || 'devnet';
export const SOLANA_RPC_URL = import.meta.env?.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

interface WalletProvider {
  publicKey?: PublicKey;
  connect(): Promise<{ publicKey: PublicKey }>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  disconnect?(): Promise<void>;
}

export type SolanaWalletKind = 'phantom' | 'solflare';
const WALLET_SELECTION_KEY = 'gamefi_solana_wallet_provider';

function selectedWallet(): SolanaWalletKind | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(WALLET_SELECTION_KEY);
  return value === 'phantom' || value === 'solflare' ? value : null;
}

function provider(): WalletProvider {
  const win = window as unknown as { phantom?: { solana?: WalletProvider }; solana?: WalletProvider; solflare?: WalletProvider };
  const selected = selectedWallet();
  const wallet = selected === 'phantom' ? (win.phantom?.solana || win.solana)
    : selected === 'solflare' ? win.solflare
      : win.phantom?.solana || win.solana || win.solflare;
  if (!wallet) throw new Error(selected
    ? `Không tìm thấy ${selected === 'phantom' ? 'Phantom' : 'Solflare'} trong trình duyệt này.`
    : 'Hãy cài Phantom hoặc Solflare để kết nối Solana.');
  return wallet;
}

export const solanaAdapter = {
  selectWallet: (kind: SolanaWalletKind) => window.localStorage.setItem(WALLET_SELECTION_KEY, kind),
  isAvailable: () => {
    if (typeof window === 'undefined') return false;
    try { provider(); return true; } catch { return false; }
  },
  connect: async (): Promise<string> => (await provider().connect()).publicKey.toBase58(),
  signMessage: async (message: string): Promise<string> => {
    const signed = await provider().signMessage(new TextEncoder().encode(message), 'utf8');
    return bs58.encode(signed.signature);
  },
  signDexTransaction: async (transactionBase64: string, expectedWallet: string): Promise<string> => {
    const wallet = provider();
    const owner = wallet.publicKey ?? (await wallet.connect()).publicKey;
    if (owner.toBase58() !== expectedWallet) throw new Error('Ví đã đổi tài khoản. Hãy đăng nhập lại.');
    let transaction: Transaction | VersionedTransaction;
    try {
      const bytes = Buffer.from(transactionBase64, 'base64');
      try {
        transaction = Transaction.from(bytes);
      } catch {
        transaction = VersionedTransaction.deserialize(bytes);
      }
    } catch {
      throw new Error('DEX trả transaction không hợp lệ.');
    }
    const feePayer = transaction instanceof Transaction
      ? transaction.feePayer : transaction.message.staticAccountKeys[0];
    if (!feePayer?.equals(owner)) throw new Error('Ví ký không phải fee payer của giao dịch DEX.');
    let signed: Transaction | VersionedTransaction;
    try {
      signed = await wallet.signTransaction(transaction);
    } catch (reason) {
      const walletError = reason as { code?: unknown; message?: unknown } | null;
      const message = typeof walletError?.message === 'string' ? walletError.message : String(reason);
      const code = typeof walletError?.code === 'number' || typeof walletError?.code === 'string'
        ? ` (mã ${walletError.code})` : '';
      if (/unexpected error/i.test(message)) {
        const name = selectedWallet() === 'solflare'
          || (window as unknown as { solflare?: WalletProvider }).solflare === wallet ? 'Solflare' : 'Phantom';
        throw new Error(`${name} từ chối ký giao dịch${code}: ${message}.`);
      }
      throw reason;
    }
    return Buffer.from(signed.serialize()).toString('base64');
  },
  mintFactionNft: async (factionId: number, expectedWallet: string): Promise<{ tx_digest: string; nft_object_id: string }> => {
    const wallet = provider();
    const owner = (await wallet.connect()).publicKey;
    if (owner.toBase58() !== expectedWallet) throw new Error('Ví đã đổi tài khoản. Hãy đăng nhập lại.');
    const response = await fetch(`${API_URL}/blockchain/solana/config`);
    if (!response.ok) throw new Error('Không đọc được cấu hình Solana từ backend.');
    const config = await response.json();
    if (config.network !== SOLANA_NETWORK) throw new Error('Frontend và backend đang dùng khác mạng Solana.');
    if (!config.program_id) throw new Error('Cần deploy program và cấu hình SOLANA_PROGRAM_ID trước khi mint.');
    const program = new PublicKey(config.program_id);
    if (program.equals(SystemProgram.programId)) throw new Error('Program ID vẫn là placeholder; cần deploy program thật.');
    const connection = new Connection(SOLANA_RPC_URL, 'finalized');
    const genesis: Record<string, string> = {
      devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
      testnet: '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
      'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    };
    if (!(SOLANA_NETWORK in genesis) && SOLANA_NETWORK !== 'localnet') throw new Error('Mạng Solana không hợp lệ.');
    if (genesis[SOLANA_NETWORK] && await connection.getGenesisHash() !== genesis[SOLANA_NETWORK]) {
      throw new Error('RPC không khớp mạng Solana đã cấu hình.');
    }
    const programAccount = await connection.getAccountInfo(program);
    if (!programAccount?.executable) throw new Error('Không tìm thấy program đã deploy trên RPC này.');
    const proof = factionAddress(owner, program);
    const existing = await connection.getAccountInfo(proof);
    if (existing) {
      const reference = await readFactionProof(existing.data, owner);
      if (!existing.owner.equals(program) || reference !== factionId) {
        throw new Error('Ví đã có ấn tín faction khác hoặc account không hợp lệ.');
      }
      // Recover registration after a confirmed mint followed by a network/API failure.
      const history = await connection.getSignaturesForAddress(proof, { limit: 20 });
      const confirmed = history.find(tx => !tx.err && tx.confirmationStatus === 'finalized');
      if (!confirmed) throw new Error('Ấn tín đã tồn tại; hãy thử lại sau khi RPC đồng bộ lịch sử.');
      return { tx_digest: confirmed.signature, nft_object_id: proof.toBase58() };
    }
    const blockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({ feePayer: owner, ...blockhash }).add(new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: proof, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(await encodeMintFaction(factionId)),
    }));
    const signed = await wallet.signTransaction(transaction);
    const digest = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    const confirmation = await connection.confirmTransaction({ signature: digest, ...blockhash }, 'finalized');
    if (confirmation.value.err) throw new Error(`Giao dịch Solana thất bại: ${digest}`);
    return { tx_digest: digest, nft_object_id: proof.toBase58() };
  },
};
