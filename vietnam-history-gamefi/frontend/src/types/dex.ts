import type { DexTokenSymbol } from '../services/dexBalances';

export interface DexOrderRequest {
  wallet: string;
  input_symbol: DexTokenSymbol;
  output_symbol: DexTokenSymbol;
  amount: string;
  slippage_bps: number;
  idempotency_key: string;
}

export interface DexOrder {
  request_id: string;
  input_symbol: DexTokenSymbol;
  output_symbol: DexTokenSymbol;
  in_amount: string;
  out_amount: string;
  input_decimals: number;
  output_decimals: number;
  provider: 'mock' | 'raydium' | 'jupiter';
  router: string;
  mode: string;
  fee_bps: number;
  slippage_bps: number;
  transaction: string | null;
  executable: boolean;
  simulation: boolean;
  expires_at: number | null;
  last_valid_block_height: number | null;
  warning: string | null;
  price_impact_bps: number;
}

export interface DexExecution {
  status: 'Success' | 'Failed';
  signature: string | null;
  code: number;
  total_input_amount: string | null;
  total_output_amount: string | null;
  error: string | null;
}

export interface DexConfig {
  network: string;
  provider: 'mock' | 'raydium' | 'jupiter';
  supports_execution: boolean;
  tokens: { symbol: DexTokenSymbol; mint: string; decimals: number }[];
  pool_id: string | null;
  program_id: string | null;
}


export interface DexSwapHistory {
  request_id: string;
  input_symbol: DexTokenSymbol;
  output_symbol: DexTokenSymbol;
  in_amount: string;
  out_amount: string;
  input_decimals: number;
  output_decimals: number;
  provider: string;
  status: 'quoted' | 'simulated' | 'pending_confirmation' | 'confirmed' | 'failed' | 'expired';
  simulation: boolean;
  signature: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
