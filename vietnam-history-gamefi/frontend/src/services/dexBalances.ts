import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './solana';

export type DexTokenSymbol = 'SOL' | 'HKDV' | 'USDC';

export interface DexToken {
  symbol: DexTokenSymbol;
  name: string;
  decimals: number;
  mint: string | null;
}

export interface DexBalances {
  SOL: string;
  HKDV: string;
  USDC: string;
}

const DEVNET_HKDV_MINT = '45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm';
const HKDV_MINT = import.meta.env?.VITE_HKDV_MINT?.trim()
  || (SOLANA_NETWORK === 'devnet' ? DEVNET_HKDV_MINT : '');
const USDC_MINT = import.meta.env?.VITE_USDC_MINT?.trim()
  || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export function dexTokens(network = SOLANA_NETWORK): DexToken[] {
  return network === 'mainnet-beta' || network === 'devnet'
    ? [
        { symbol: 'SOL', name: 'Solana', decimals: 9, mint: null },
        { symbol: 'HKDV', name: 'Hào Khí Đại Việt', decimals: 6, mint: HKDV_MINT },
      ]
    : [
        { symbol: 'SOL', name: 'Solana', decimals: 9, mint: null },
        { symbol: 'USDC', name: 'USD Coin', decimals: 6, mint: USDC_MINT },
      ];
}

export { formatBaseUnits, maximumSpendable, validateSwapAmount } from './dexMath';
import { formatBaseUnits } from './dexMath';

export async function loadDexBalances(walletAddress: string): Promise<DexBalances> {
  const owner = new PublicKey(walletAddress);
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const expectedGenesis: Record<string, string> = {
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  };
  if (expectedGenesis[SOLANA_NETWORK] && await connection.getGenesisHash() !== expectedGenesis[SOLANA_NETWORK]) {
    throw new Error('RPC frontend không khớp mạng Solana đã chọn.');
  }
  const token = dexTokens().find((item) => item.symbol !== 'SOL');
  if (SOLANA_NETWORK === 'mainnet-beta' && (!token?.mint || token.mint === DEVNET_HKDV_MINT)) {
    throw new Error('Cần cấu hình mint HKDV Mainnet riêng trước khi mở DEX.');
  }
  const [lamports, tokenAccounts] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    token?.mint
      ? connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(token.mint) }, 'confirmed')
      : Promise.resolve({ value: [] }),
  ]);
  const rawToken = tokenAccounts.value.reduce((total, account) => {
    const parsed = account.account.data;
    if (!('parsed' in parsed)) return total;
    const rawAmount = parsed.parsed?.info?.tokenAmount?.amount;
    return typeof rawAmount === 'string' ? total + BigInt(rawAmount) : total;
  }, 0n);
  return {
    SOL: formatBaseUnits(BigInt(lamports), Math.log10(LAMPORTS_PER_SOL), 6),
    HKDV: token?.symbol === 'HKDV' ? formatBaseUnits(rawToken, token.decimals, 6) : '0',
    USDC: token?.symbol === 'USDC' ? formatBaseUnits(rawToken, token.decimals, 2) : '0',
  };
}
