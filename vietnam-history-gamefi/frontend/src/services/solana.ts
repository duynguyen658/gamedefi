import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
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
  signTransaction(transaction: Transaction): Promise<Transaction>;
  disconnect?(): Promise<void>;
}

function provider(): WalletProvider {
  const win = window as unknown as { phantom?: { solana?: WalletProvider }; solana?: WalletProvider; solflare?: WalletProvider };
  const wallet = win.phantom?.solana || win.solana || win.solflare;
  if (!wallet) throw new Error('Hãy cài Phantom hoặc Solflare để kết nối Solana.');
  return wallet;
}

export const solanaAdapter = {
  isAvailable: () => {
    if (typeof window === 'undefined') return false;
    try { provider(); return true; } catch { return false; }
  },
  connect: async (): Promise<string> => (await provider().connect()).publicKey.toBase58(),
  signMessage: async (message: string): Promise<string> => {
    const signed = await provider().signMessage(new TextEncoder().encode(message), 'utf8');
    return bs58.encode(signed.signature);
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
      devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
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
