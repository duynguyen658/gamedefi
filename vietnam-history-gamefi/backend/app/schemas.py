from pydantic import BaseModel, field_validator

from app.blockchain.adapter_resolver import SUPPORTED_CHAINS
from app.core.security import is_valid_solana_wallet


def _validate_chain(v: str) -> str:
    v = v.lower()
    if v not in SUPPORTED_CHAINS:
        raise ValueError(f"chain phải là một trong {SUPPORTED_CHAINS}")
    return v


def _validate_wallet(v: str) -> str:
    v = v.strip()
    if not is_valid_solana_wallet(v):
        raise ValueError("wallet phải là địa chỉ Solana base58 hợp lệ")
    return v


# ---------------------------------------------------------------------------
# Auth & Player Schemas
# ---------------------------------------------------------------------------

class NonceRequest(BaseModel):
    chain: str = "solana"
    wallet: str

    _check_chain = field_validator("chain")(_validate_chain)
    _check_wallet = field_validator("wallet")(_validate_wallet)


class NonceResponse(BaseModel):
    nonce: str
    message: str


class WalletVerifyRequest(BaseModel):
    chain: str = "solana"
    wallet: str
    nonce: str
    message: str
    signature: str  # base58-encoded raw Ed25519 signature

    _check_chain = field_validator("chain")(_validate_chain)
    _check_wallet = field_validator("wallet")(_validate_wallet)


class GuestLoginRequest(BaseModel):
    username: str | None = None


class PlayerOut(BaseModel):
    wallet: str
    chain: str
    username: str
    faction_id: int | None = None
    nft_object_id: str | None = None
    level: int = 1
    rice: int = 5000
    gold: int = 10000
    morale: int = 85
    is_guest: bool = False


class AuthenticatedPlayerOut(PlayerOut):
    access_token: str


# ---------------------------------------------------------------------------
# Faction Schemas
# ---------------------------------------------------------------------------

class FactionOut(BaseModel):
    faction_id: int
    name: str
    rarity: str
    image: str
    description: str
    historical_era: str | None = None
    motto: str | None = None
    attack_bonus: int = 0
    defense_bonus: int = 0
    movement_bonus: int = 0
    special_unit: str | None = None
    banner_color: str | None = None
    coat_of_arms: str | None = None
    starting_advisor_id: str | None = None
    strengths: str | None = None


class SelectFactionRequest(BaseModel):
    faction_id: int


class FactionRegisterRequest(BaseModel):
    faction_id: int
    nft_object_id: str
    tx_digest: str


# ---------------------------------------------------------------------------
# Advisor General Schemas (The Bridge)
# ---------------------------------------------------------------------------

class AdvisorOut(BaseModel):
    id: str
    name: str
    faction_id: int
    faction_name: str
    rarity: str
    title: str
    historical_lore: str
    image: str
    passive_name: str
    passive_effect: str
    active_skill: str
    skill_description: str
    base_tactics: int
    base_leadership: int
    base_valor: int
    passive_modifiers: dict[str, float] = {}


class AdvisorOwnershipOut(BaseModel):
    advisor_id: str
    advisor_name: str
    owner_wallet: str | None
    chain: str | None
    token_id: str | None
    is_verified: bool
    verified_at: str | None


# ---------------------------------------------------------------------------
# Army Schemas
# ---------------------------------------------------------------------------

class ArmyOut(BaseModel):
    player_wallet: str
    faction_id: int | None = None
    equipped_advisor_id: str | None = None
    equipped_advisor_name: str | None = None
    spearmen_count: int = 100
    archers_count: int = 60
    cavalry_count: int = 30
    elephants_count: int = 5
    total_power: int = 500
    morale: int = 85
    formation: str = "standard"


class EquipAdvisorRequest(BaseModel):
    advisor_id: str


# ---------------------------------------------------------------------------
# Tactical Battle Schemas (Off-chain Game Engine)
# ---------------------------------------------------------------------------

class BattleRequest(BaseModel):
    player_wallet: str
    scenario_id: str = "bach_dang_1288"
    tactical_formation: str = "standard"
    advisor_id: str | None = None


class CombatTurnLog(BaseModel):
    turn: int
    action: str
    actor: str
    damage_dealt: int
    log_message: str


class BattleResultOut(BaseModel):
    battle_id: str
    scenario_id: str
    victory: bool
    turns_taken: int
    player_casualties: int
    enemy_casualties: int
    reward_rice: int
    reward_gold: int
    reward_xp: int
    combat_logs: list[CombatTurnLog]
    message: str


# ---------------------------------------------------------------------------
# Quest & Leaderboard Schemas
# ---------------------------------------------------------------------------

class QuestOut(BaseModel):
    id: str
    title: str
    description: str
    faction_id: int | None = None
    required_battles: int = 1
    completed: bool = False
    completed_battles: int = 0
    reward_gold: int = 1000
    reward_rice: int = 500
    reward_hkdv_base_units: int = 0
    reward_claim_status: str | None = None


class LeaderboardEntryOut(BaseModel):
    rank: int
    username: str
    wallet: str
    faction_name: str
    campaign_stars: int
    battles_won: int
    reputation_score: int


# ---------------------------------------------------------------------------
# Marketplace & Trading Schemas (Optional Blockchain Layer)
# ---------------------------------------------------------------------------

class MarketplaceListingOut(BaseModel):
    listing_id: str
    advisor_id: str
    advisor_name: str
    faction_id: int
    rarity: str
    seller_wallet: str
    price: float
    currency: str
    chain: str
    status: str
    created_at: float


class CreateListingRequest(BaseModel):
    advisor_id: str
    seller_wallet: str
    chain: str
    price: float
    currency: str = "SOL"
    token_id: str

    _check_chain = field_validator("chain")(_validate_chain)


class BuyListingRequest(BaseModel):
    listing_id: str
    buyer_wallet: str
    tx_digest: str


class CancelListingRequest(BaseModel):
    listing_id: str
    seller_wallet: str


class TradeOut(BaseModel):
    trade_id: str
    initiator_wallet: str
    target_wallet: str
    offered_advisor_id: str
    offered_advisor_name: str
    requested_advisor_id: str
    requested_advisor_name: str
    chain: str
    status: str
    created_at: float


class CreateTradeRequest(BaseModel):
    initiator_wallet: str
    target_wallet: str
    offered_advisor_id: str
    requested_advisor_id: str
    chain: str

    _check_chain = field_validator("chain")(_validate_chain)


class TradeActionRequest(BaseModel):
    trade_id: str
    wallet: str
    tx_digest: str | None = None


# ---------------------------------------------------------------------------
# Legacy Reward & Transaction Schemas (Maintained for Backward Compatibility)
# ---------------------------------------------------------------------------

class RewardClaimRequest(BaseModel):
    wallet: str
    battle_id: str


class QuestRewardClaimRequest(BaseModel):
    wallet: str
    quest_id: str


class RewardOut(BaseModel):
    id: str
    claim_id: str
    wallet: str
    chain: str
    network: str
    source_type: str
    source_id: str
    battle_id: str | None = None
    amount: int
    tx_digest: str | None = None
    receipt_address: str | None = None
    status: str
    error: str | None = None
    created_at: str
    updated_at: str
    explorer_url: str | None = None


class TransactionOut(BaseModel):
    digest: str
    status: str
    sender: str | None
    timestamp_ms: int | None
    events: list[dict]
