import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { SOLANA_NETWORK, SOLANA_RPC_URL } from './solana';

export type DexTokenSymbol = 'SOL' | 'USDC' | 'USDT';

export interface DexToken {
  symbol: DexTokenSymbol;
  name: string;
  decimals: number;
  mint: string | null;
}

export interface DexBalances {
  SOL: string;
  USDC: string;
  USDT: string;
}

const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEVNET_USDT_MINT = '9jWfcfEZToquBQmkoEViNSCt72veXwcvRGFQERXRjEk1';

export function dexTokens(network = SOLANA_NETWORK): DexToken[] {
  return network === 'mainnet-beta'
    ? [
        { symbol: 'SOL', name: 'Solana', decimals: 9, mint: null },
        { symbol: 'USDC', name: 'USD Coin', decimals: 6, mint: MAINNET_USDC_MINT },
      ]
    : [
        { symbol: 'SOL', name: 'Solana', decimals: 9, mint: null },
        { symbol: 'USDC', name: 'USDC thử (Devnet)', decimals: 6, mint: DEVNET_USDC_MINT },
        { symbol: 'USDT', name: 'USDT thử (Devnet)', decimals: 6, mint: DEVNET_USDT_MINT },
      ];
}

export { formatBaseUnits, maximumSpendable, validateSwapAmount } from './dexMath';
import { formatBaseUnits } from './dexMath';

export async function estimateDexReserveLamports(): Promise<number> {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const tokenAccountRent = await connection.getMinimumBalanceForRentExemption(165);
  // Allow for a destination token account and a temporary wrapped-SOL account.
  // The actual transaction is simulated before it is sent to the wallet.
  return tokenAccountRent * 2 + 1_020_000;
}

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
  const tokens = dexTokens().filter((item) => item.mint);
  const [lamports, ...tokenAccounts] = await Promise.all([
    connection.getBalance(owner, 'confirmed'),
    ...tokens.map((token) => connection.getParsedTokenAccountsByOwner(
      owner, { mint: new PublicKey(token.mint!) }, 'confirmed',
    )),
  ]);
  const balances: DexBalances = {
    SOL: formatBaseUnits(BigInt(lamports), Math.log10(LAMPORTS_PER_SOL), 6),
    USDC: '0',
    USDT: '0',
  };
  tokens.forEach((token, index) => {
    const raw = tokenAccounts[index].value.reduce((total, account) => {
      const parsed = account.account.data;
      if (!('parsed' in parsed)) return total;
      const amount = parsed.parsed?.info?.tokenAmount?.amount;
      return typeof amount === 'string' ? total + BigInt(amount) : total;
    }, 0n);
    balances[token.symbol] = formatBaseUnits(raw, token.decimals, 6);
  });
  return balances;
}
