import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './solana';

export type DexTokenSymbol = 'SOL' | 'USDC';

export interface DexToken {
  symbol: DexTokenSymbol;
  name: string;
  decimals: number;
  mint: string | null;
}

export interface DexBalances {
  SOL: string;
  USDC: string;
}

const USDC_MINT_BY_NETWORK: Record<string, string> = {
  devnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export function dexTokens(network = SOLANA_NETWORK): DexToken[] {
  const configuredUsdcMint = import.meta.env?.VITE_USDC_MINT?.trim();
  const usdcMint = configuredUsdcMint || USDC_MINT_BY_NETWORK[network] || null;
  return [
    { symbol: 'SOL', name: 'Solana', decimals: 9, mint: null },
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, mint: usdcMint },
  ];
}

export { formatBaseUnits, maximumSpendable, validateSwapAmount } from './dexMath';
import { formatBaseUnits } from './dexMath';

export async function loadDexBalances(walletAddress: string): Promise<DexBalances> {
  const owner = new PublicKey(walletAddress);
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const usdc = dexTokens().find((token) => token.symbol === 'USDC');

  const [lamports, tokenAccounts] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    usdc?.mint
      ? connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(usdc.mint) }, 'confirmed')
      : Promise.resolve({ value: [] }),
  ]);

  const rawUsdc = tokenAccounts.value.reduce((total, account) => {
    const parsed = account.account.data;
    if (!('parsed' in parsed)) return total;
    const rawAmount = parsed.parsed?.info?.tokenAmount?.amount;
    return typeof rawAmount === 'string' ? total + BigInt(rawAmount) : total;
  }, 0n);

  return {
    SOL: formatBaseUnits(BigInt(lamports), Math.log10(LAMPORTS_PER_SOL), 6),
    USDC: formatBaseUnits(rawUsdc, usdc?.decimals || 6, 2),
  };
}
