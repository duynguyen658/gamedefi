export type ChainType = 'solana';

export type RarityType = 'common' | 'rare' | 'epic' | 'legendary';

export interface Faction {
  faction_id: number;
  name: string;
  rarity: RarityType;
  image: string;
  description: string;
  historical_era?: string;
  motto?: string;
  attack_bonus?: number;
  defense_bonus?: number;
  movement_bonus?: number;
  special_unit?: string;
  banner_color?: string;
  coat_of_arms?: string;
  starting_advisor_id?: string;
  strengths?: string;
}

export interface Player {
  wallet: string;
  chain: ChainType;
  username: string;
  faction_id: number | null;
  nft_object_id: string | null;
  level: number;
  base_power: number;
  rice?: number;
  gold?: number;
  morale?: number;
  is_guest?: boolean;
  campaign_stars?: number;
  battles_won?: number;
  created_at?: string;
  /** Opaque backend session; a wallet address is never authorization. */
  access_token?: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}

export interface WalletVerifyRequest {
  chain: ChainType;
  wallet: string;
  nonce: string;
  message: string;
  signature: string;
}

export interface FactionRegisterRequest {
  faction_id: number;
  nft_object_id: string;
  tx_digest: string;
}

export type PreGameStep = 
  | 'splash'            // Màn hình mở đầu & đề tự hào khí
  | 'faction_select'   // Chọn triều đại & chiêu mộ tộc hệ (F2P / On-chain)
  | 'lobby'            // Sảnh tiền trạm duyệt binh trước khi xuất quân
  | 'advisor_council'  // Hội Đồng Quân Sư (xem và trang bị tướng cố vấn)
  | 'marketplace'      // Chợ Tướng Cố Vấn (mua, bán, trao đổi P2P trên blockchain)
  | 'defi'             // Trung tâm tài chính và DEX của người chơi
  | 'battle_transition' // Chuyển cảnh tiến vào trận chiến
  | 'campaign_map'      // Bản đồ Chiến Dịch Lịch Sử (chọn mặt trận)
  | 'battle';           // Bàn cờ chiến thuật theo lượt (hex tactical battle)

export interface WalletInfo {
  name: string;
  icon: string;
  chain: ChainType;
  installed: boolean;
  adapterName: string;
}

// ---------------------------------------------------------------------------
// Tướng Cố Vấn (Advisor General) — Cầu nối duy nhất giữa Game & Blockchain
// ---------------------------------------------------------------------------

export interface Advisor {
  id: string;
  name: string;
  faction_id: number;
  faction_name: string;
  rarity: RarityType;
  title: string;
  historical_lore: string;
  image: string;
  passive_name: string;
  passive_effect: string;
  active_skill: string;
  skill_description: string;
  base_tactics: number;
  base_leadership: number;
  base_valor: number;
  passive_modifiers?: Record<string, number>;
}

export interface AdvisorOwnership {
  advisor_id: string;
  advisor_name: string;
  owner_wallet: string | null;
  chain: string | null;
  token_id: string | null;
  is_verified: boolean;
  verified_at: string | null;
}

// ---------------------------------------------------------------------------
// Chợ Tướng & Trao Đổi P2P (Marketplace & Trades)
// ---------------------------------------------------------------------------

export interface MarketplaceListing {
  listing_id: string;
  advisor_id: string;
  advisor_name: string;
  faction_id: number;
  rarity: RarityType;
  seller_wallet: string;
  price: number;
  currency: string;
  chain: ChainType;
  status: 'active' | 'sold' | 'cancelled';
  created_at: number;
}

export interface TradeProposal {
  trade_id: string;
  initiator_wallet: string;
  target_wallet: string;
  offered_advisor_id: string;
  offered_advisor_name: string;
  requested_advisor_id: string;
  requested_advisor_name: string;
  chain: ChainType;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: number;
}

// ---------------------------------------------------------------------------
// Quân Đội & Bảng Xếp Hạng (Army & Leaderboard)
// ---------------------------------------------------------------------------

export interface Army {
  player_wallet: string;
  faction_id: number | null;
  equipped_advisor_id: string | null;
  equipped_advisor_name: string | null;
  spearmen_count: number;
  archers_count: number;
  cavalry_count: number;
  elephants_count: number;
  total_power: number;
  morale: number;
  formation: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  wallet: string;
  faction_name: string;
  campaign_stars: number;
  battles_won: number;
  reputation_score: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  faction_id?: number | null;
  required_battles: number;
  completed: boolean;
  reward_gold: number;
  reward_rice: number;
}

// ---------------------------------------------------------------------------
// Chiến Dịch Lịch Sử (Historic Campaign) — Bản đồ chiến dịch
// ---------------------------------------------------------------------------

export type ChapterStatus = 'active' | 'available' | 'locked';

export interface CampaignChapter {
  chapter_id: number;
  faction_id: number;
  code: string;
  title_vi: string;
  title_en: string;
  era: string;
  status: ChapterStatus;
}

export interface MapLocation {
  location_id: string;
  chapter_id: number;
  name: string;
  sub_label: string;
  flag_glyph: string;
  x: number;
  y: number;
  is_capital?: boolean;
  is_target?: boolean;
  tooltip?: string;
}

export interface PlayerResources {
  rice: number;
  gold: number;
  morale: number;
}

// ---------------------------------------------------------------------------
// Bàn Cờ Chiến Thuật (Tactical Hex Battle)
// ---------------------------------------------------------------------------

export type TerrainType = 'plain' | 'hill' | 'forest' | 'mud' | 'river' | 'stakes' | 'fort';

export type BattleZone = 'ally' | 'enemy' | 'neutral';

export interface HexTile {
  col: number;
  row: number;
  terrain: TerrainType;
  zone: BattleZone;
  label?: string;
  effect?: string;
}

export type UnitSide = 'player' | 'enemy';
export type UnitIcon = 'spear' | 'archer' | 'elephant' | 'cavalry';

export interface BattleUnitStats {
  at: number;   // Quân số (Troop Strength)
  atk: number;  // Tấn công
  def: number;  // Phòng thủ
  asTk: number; // Tốc độ tác chiến (Attack Speed)
  atf: number;  // Hỏa lực tầm xa (Attack Force)
  reg: number;  // Hồi phục (Regeneration)
}

export interface BattleUnit {
  unit_id: string;
  name: string;
  side: UnitSide;
  icon: UnitIcon;
  col: number;
  row: number;
  stats: BattleUnitStats;
}

export type TacticalAction = 'move' | 'attack' | 'formation' | 'fire_arrow';

export type TideState = 'rising' | 'high' | 'ebbing' | 'low';

export interface BattleResultResponse {
  battle_id: string;
  scenario_id: string;
  victory: boolean;
  turns_taken: number;
  player_casualties: number;
  enemy_casualties: number;
  reward_rice: number;
  reward_gold: number;
  reward_xp: number;
  combat_logs: Array<{
    turn: number;
    action: string;
    actor: string;
    damage_dealt: number;
    log_message: string;
  }>;
  message: string;
}

export type DefiModule = 'payments' | 'savings' | 'lending' | 'dex' | 'treasury' | 'dao';
