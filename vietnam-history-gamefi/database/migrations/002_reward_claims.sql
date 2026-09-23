-- Phase 6: durable gameplay reward eligibility, payout lifecycle, and reconciliation.
CREATE TABLE IF NOT EXISTS reward_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network TEXT NOT NULL,
  wallet TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('battle', 'quest')),
  source_id TEXT NOT NULL,
  qualifier TEXT,
  eligible BOOLEAN NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reward_event_source UNIQUE (network, wallet, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id TEXT NOT NULL UNIQUE CHECK (length(claim_id) = 64),
  network TEXT NOT NULL,
  wallet TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('battle', 'quest')),
  source_id TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (
    status IN ('reserved', 'preparing', 'submitted', 'submission_unknown', 'confirmed', 'failed')
  ),
  tx_signature TEXT UNIQUE,
  receipt_address TEXT UNIQUE,
  signed_transaction TEXT,
  last_valid_block_height BIGINT,
  attempts BIGINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  CONSTRAINT uq_reward_claim_source UNIQUE (network, wallet, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS ix_reward_events_eligible_battles
  ON reward_events (network, wallet, qualifier)
  WHERE eligible = true AND source_type = 'battle';

CREATE INDEX IF NOT EXISTS ix_reward_claims_wallet_created
  ON reward_claims (network, wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_reward_claims_reconcile
  ON reward_claims (network, wallet, updated_at)
  WHERE status IN ('submitted', 'submission_unknown');
