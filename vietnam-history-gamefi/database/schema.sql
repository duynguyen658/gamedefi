-- Vietnam History GameFi (Hào Khí Đại Việt)
-- Database schema: Gameplay-First Architecture with Optional Advisor Ownership & Marketplace

CREATE TYPE blockchain_chain AS ENUM ('solana');
CREATE TYPE blockchain_transaction_status AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE marketplace_listing_status AS ENUM ('active', 'sold', 'cancelled');
CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

-- 1. Players (supports both Guest/F2P players and Wallet-connected players)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT,
  chain blockchain_chain,
  username TEXT NOT NULL,
  faction_id INTEGER,
  level INTEGER NOT NULL DEFAULT 1,
  experience INTEGER NOT NULL DEFAULT 0,
  rice INTEGER NOT NULL DEFAULT 5000,
  gold INTEGER NOT NULL DEFAULT 10000,
  morale INTEGER NOT NULL DEFAULT 85,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain, wallet_address)
);

-- 2. Factions (Gameplay identity, background, and stats)
CREATE TABLE factions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  historical_era TEXT NOT NULL,
  description TEXT NOT NULL,
  attack_bonus INTEGER NOT NULL DEFAULT 0,
  defense_bonus INTEGER NOT NULL DEFAULT 0,
  movement_bonus INTEGER NOT NULL DEFAULT 0,
  special_unit TEXT NOT NULL,
  banner_color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Advisor Generals Catalog (Off-chain gameplay configuration)
CREATE TABLE advisors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  faction_id INTEGER REFERENCES factions(id),
  rarity TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  game_config_id TEXT NOT NULL,
  passive_name TEXT NOT NULL,
  active_skill TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Advisor On-Chain Ownership (Proof of ownership bridge)
CREATE TABLE advisor_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id TEXT NOT NULL REFERENCES advisors(id),
  player_id UUID REFERENCES players(id),
  chain blockchain_chain NOT NULL,
  token_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  transaction_hash TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain, token_id)
);

-- 5. Armies (Player's tactical army composition and equipped advisors)
CREATE TABLE armies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id),
  faction_id INTEGER REFERENCES factions(id),
  equipped_advisor_id TEXT REFERENCES advisors(id),
  spearmen_count INTEGER NOT NULL DEFAULT 100,
  archers_count INTEGER NOT NULL DEFAULT 60,
  cavalry_count INTEGER NOT NULL DEFAULT 30,
  elephants_count INTEGER NOT NULL DEFAULT 5,
  total_power INTEGER NOT NULL DEFAULT 500,
  formation TEXT NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Battles (Off-chain tactical battle records)
CREATE TABLE battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id),
  scenario_name TEXT NOT NULL,
  location_id TEXT NOT NULL,
  advisor_id TEXT REFERENCES advisors(id),
  victory BOOLEAN NOT NULL,
  turns_taken INTEGER NOT NULL,
  player_casualties INTEGER NOT NULL DEFAULT 0,
  enemy_casualties INTEGER NOT NULL DEFAULT 0,
  combat_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  reward_rice INTEGER NOT NULL DEFAULT 0,
  reward_gold INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Quests (Historical campaign scenarios and player milestones)
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  faction_id INTEGER REFERENCES factions(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  required_battles INTEGER NOT NULL DEFAULT 1,
  reward_gold INTEGER NOT NULL DEFAULT 1000,
  reward_rice INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Leaderboard (Off-chain competitive rankings)
CREATE TABLE leaderboard (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  username TEXT NOT NULL,
  faction_id INTEGER,
  campaign_stars INTEGER NOT NULL DEFAULT 0,
  battles_won INTEGER NOT NULL DEFAULT 0,
  total_battles INTEGER NOT NULL DEFAULT 0,
  reputation_score INTEGER NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Marketplace Listings (Optional blockchain trading layer)
CREATE TABLE marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id TEXT NOT NULL REFERENCES advisors(id),
  seller_wallet TEXT NOT NULL,
  price NUMERIC(18, 6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SOL',
  chain blockchain_chain NOT NULL,
  status marketplace_listing_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Peer-to-Peer Trades
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_wallet TEXT NOT NULL,
  target_wallet TEXT NOT NULL,
  offered_advisor_id TEXT NOT NULL REFERENCES advisors(id),
  requested_advisor_id TEXT NOT NULL REFERENCES advisors(id),
  chain blockchain_chain NOT NULL,
  status trade_status NOT NULL DEFAULT 'pending',
  transaction_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. On-Chain Transactions Proof Reference
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain blockchain_chain NOT NULL,
  digest TEXT NOT NULL,
  action_type TEXT NOT NULL, -- 'mint_advisor', 'list_advisor', 'buy_advisor', 'trade_advisor'
  sender_wallet TEXT NOT NULL,
  recipient_wallet TEXT,
  status blockchain_transaction_status NOT NULL DEFAULT 'pending',
  raw_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chain, digest)
);

-- 12. DEX swap lifecycle (see migrations/001_dex_swaps.sql)
-- Phase 3: durable DEX order lifecycle and idempotency.
CREATE TABLE dex_swaps (
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

CREATE INDEX ix_dex_swaps_wallet_created ON dex_swaps (wallet, created_at DESC);
CREATE INDEX ix_dex_swaps_reconcile ON dex_swaps (status, updated_at) WHERE status = 'pending_confirmation';
