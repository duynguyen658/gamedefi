import { Connection, PublicKey } from '@solana/web3.js';
import type { GameTokenInfo } from '../types';
import { apiService } from './api';
import { formatBaseUnits } from './dexMath';
import { SOLANA_RPC_URL } from './solana';

export interface GameTokenSnapshot {
  token: GameTokenInfo;
  balance: string | null;
}

export async function loadGameTokenSnapshot(wallet: string, isGuest: boolean): Promise<GameTokenSnapshot> {
  const token = await apiService.getGameToken();
  if (!token.verified) throw new Error('Cấu hình HKDV không khớp mint trên Solana RPC.');
  if (isGuest) return { token, balance: null };

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const accounts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(wallet),
    { mint: new PublicKey(token.mint) },
    'confirmed',
  );
  const raw = accounts.value.reduce((total, account) => {
    const data = account.account.data;
    if (!('parsed' in data)) return total;
    const amount = data.parsed?.info?.tokenAmount?.amount;
    return typeof amount === 'string' ? total + BigInt(amount) : total;
  }, 0n);
  return { token, balance: formatBaseUnits(raw, token.decimals, 6) };
}
