-- Preserve the blockhash of submitted swaps and rotate reconciliation fairly.
ALTER TABLE dex_swaps ADD COLUMN IF NOT EXISTS recent_blockhash VARCHAR(64);
ALTER TABLE dex_swaps ADD COLUMN IF NOT EXISTS reconciliation_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_dex_swaps_reconcile_checked
  ON dex_swaps (status, reconciliation_checked_at)
  WHERE signature IS NOT NULL AND status IN ('pending_confirmation', 'confirmed');
