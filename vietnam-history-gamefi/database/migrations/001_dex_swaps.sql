-- Phase 3: durable DEX order lifecycle and idempotency.
CREATE TABLE IF NOT EXISTS dex_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network TEXT NOT NULL,
  wallet TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  input_symbol TEXT NOT NULL,
  output_symbol TEXT NOT NULL,
  in_amount TEXT NOT NULL,
  out_amount TEXT NOT NULL,
  input_decimals INTEGER NOT NULL,
  output_decimals INTEGER NOT NULL,
  provider TEXT NOT NULL,
  router TEXT NOT NULL,
  mode TEXT NOT NULL,
  fee_bps INTEGER NOT NULL DEFAULT 0,
  slippage_bps INTEGER NOT NULL,
  transaction TEXT,
  executable BOOLEAN NOT NULL,
  simulation BOOLEAN NOT NULL,
  expires_at BIGINT,
  last_valid_block_height BIGINT,
  warning TEXT,
  price_impact_bps INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('quoted', 'simulated', 'pending_confirmation', 'confirmed', 'failed', 'expired')),
  signature TEXT UNIQUE,
  code INTEGER,
  total_input_amount TEXT,
  total_output_amount TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT uq_dex_swap_idempotency UNIQUE (network, wallet, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_dex_swaps_wallet_created ON dex_swaps (wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_dex_swaps_reconcile ON dex_swaps (status, updated_at) WHERE status = 'pending_confirmation';

ALTER TABLE dex_swaps ADD COLUMN IF NOT EXISTS price_impact_bps INTEGER NOT NULL DEFAULT 0;
