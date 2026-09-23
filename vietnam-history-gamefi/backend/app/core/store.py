"""Store in-memory cho Game Domain và Marketplace layer.

Dữ liệu Game Domain (Player, Faction, Army, Advisor, Battle, Quest, Leaderboard)
chạy 100% off-chain, không phụ thuộc vào blockchain hay PostgreSQL.
Lớp Blockchain (Advisor Ownership, Marketplace Listings, Trades) lưu trữ
bằng chứng giao dịch và quyền sở hữu để xác minh với SolanaAdapter.
"""
from __future__ import annotations

import json
from pathlib import Path
import time
import uuid
from dataclasses import dataclass, field

from app.core.security import normalize_wallet


@dataclass
class Player:
    wallet: str
    chain: str
    username: str
    faction_id: int | None = None
    nft_object_id: str | None = None
    level: int = 1
    experience: int = 0
    rice: int = 5000
    gold: int = 10000
    morale: int = 85
    is_guest: bool = False
    campaign_stars: int = 0
    battles_won: int = 0
    total_battles: int = 0
    created_at: float = field(default_factory=time.time)


@dataclass
class Army:
    player_wallet: str
    faction_id: int | None = None
    equipped_advisor_id: str | None = None
    spearmen_count: int = 100
    archers_count: int = 60
    cavalry_count: int = 30
    elephants_count: int = 5
    formation: str = "standard"
    total_power: int = 500


@dataclass
class BattleRecord:
    battle_id: str
    player_wallet: str
    scenario_id: str
    advisor_id: str | None
    victory: bool
    turns_taken: int
    player_casualties: int
    enemy_casualties: int
    reward_rice: int
    reward_gold: int
    reward_xp: int
    combat_logs: list[dict]
    created_at: float = field(default_factory=time.time)


@dataclass
class MarketplaceListing:
    listing_id: str
    advisor_id: str
    seller_wallet: str
    price: float
    currency: str
    chain: str
    token_id: str
    status: str = "active"  # "active" | "sold" | "cancelled"
    created_at: float = field(default_factory=time.time)


@dataclass
class TradeRecord:
    trade_id: str
    initiator_wallet: str
    target_wallet: str
    offered_advisor_id: str
    requested_advisor_id: str
    chain: str
    status: str = "pending"  # "pending" | "accepted" | "rejected" | "cancelled"
    tx_digest: str | None = None
    created_at: float = field(default_factory=time.time)


@dataclass
class AdvisorOwnership:
    advisor_id: str
    owner_wallet: str
    chain: str
    token_id: str
    verified_at: float = field(default_factory=time.time)


class Store:
    def __init__(self) -> None:
        self.players: dict[str, Player] = {}
        self.armies: dict[str, Army] = {}
        self.battles: dict[str, BattleRecord] = {}
        self.listings: dict[str, MarketplaceListing] = {}
        self.trades: dict[str, TradeRecord] = {}
        self.advisor_ownerships: dict[str, AdvisorOwnership] = {}
        self._advisors_cache: list[dict] | None = None

    @staticmethod
    def _key(chain: str, wallet: str) -> str:
        return f"{chain}:{normalize_wallet(chain, wallet)}"

    # ---------------------------------------------------------------- Player
    def get_or_create_player(self, chain: str, wallet: str) -> Player:
        key = self._key(chain, wallet)
        if key not in self.players:
            self.players[key] = Player(
                wallet=normalize_wallet(chain, wallet),
                chain=chain,
                username=f"player-{key[-6:]}",
            )
        return self.players[key]

    def create_guest_player(self, username: str | None = None) -> Player:
        guest_id = str(uuid.uuid4())[:8]
        uname = username or f"TuongQuan_{guest_id}"
        wallet = f"guest_{guest_id}"
        chain = "solana"  # default chain designation for guest session
        key = f"guest:{wallet}"
        player = Player(
            wallet=wallet,
            chain=chain,
            username=uname,
            is_guest=True,
        )
        self.players[key] = player
        self.players[self._key(chain, wallet)] = player
        return player

    def get_player(self, chain: str, wallet: str) -> Player | None:
        if wallet.startswith("guest_"):
            return self.players.get(f"guest:{wallet}") or self.players.get(self._key(chain, wallet))
        return self.players.get(self._key(chain, wallet))

    def find_player_any_chain(self, wallet: str) -> Player | None:
        if wallet.startswith("guest_"):
            return self.players.get(f"guest:{wallet}")
        for chain in ("solana",):
            player = self.get_player(chain, wallet)
            if player is not None:
                return player
        return None

    # ---------------------------------------------------------------- Army
    def get_army(self, wallet: str) -> Army:
        player = self.find_player_any_chain(wallet)
        chain = player.chain if player else "solana"
        norm = normalize_wallet(chain, wallet)
        if norm not in self.armies:
            faction_id = player.faction_id if player else None
            # Default starting advisor based on faction if available
            starting_advisor = None
            if faction_id:
                starting_advisor = self.get_starting_advisor_for_faction(faction_id)
            self.armies[norm] = Army(
                player_wallet=wallet,
                faction_id=faction_id,
                equipped_advisor_id=starting_advisor,
            )
        return self.armies[norm]

    def equip_advisor(self, wallet: str, advisor_id: str) -> Army:
        army = self.get_army(wallet)
        army.equipped_advisor_id = advisor_id
        # Calculate boosted total power with advisor
        advisor = self.get_advisor(advisor_id)
        tactics_boost = advisor.get("base_tactics", 80) if advisor else 80
        army.total_power = 500 + int(tactics_boost * 2.5)
        return army

    # ---------------------------------------------------------------- Advisors
    def get_advisors(self) -> list[dict]:
        if self._advisors_cache is None:
            path = Path(__file__).resolve().parents[3] / "assets" / "game" / "advisors.json"
            if path.exists():
                with path.open(encoding="utf-8") as fh:
                    data = json.load(fh)
                    self._advisors_cache = data.get("advisors", [])
            else:
                self._advisors_cache = []
        return self._advisors_cache

    def get_advisor(self, advisor_id: str) -> dict | None:
        for adv in self.get_advisors():
            if adv.get("id") == advisor_id:
                return adv
        return None

    def get_starting_advisor_for_faction(self, faction_id: int) -> str | None:
        mapping = {
            1: "cao_lo",
            2: "hai_ba_trung",
            3: "ngo_quyen",
            4: "ly_thuong_kiet",
            5: "tran_hung_dao",
            6: "le_loi",
            7: "quang_trung",
            8: "nguyen_tri_phuong",
        }
        return mapping.get(faction_id)

    # ---------------------------------------------------------------- Battle
    def add_battle_record(self, record: BattleRecord) -> BattleRecord:
        existing = self.battles.get(record.battle_id)
        if existing is not None:
            return existing
        self.battles[record.battle_id] = record
        # Update player progression & stats
        player = self.find_player_any_chain(record.player_wallet)
        if player:
            player.total_battles += 1
            if record.victory:
                player.battles_won += 1
                player.campaign_stars += 3
                player.experience += record.reward_xp
                player.rice += record.reward_rice
                player.gold += record.reward_gold
                # Level up check
                if player.experience >= player.level * 200:
                    player.level += 1
        return record

    def get_battle(self, battle_id: str) -> BattleRecord | None:
        return self.battles.get(battle_id)

    # ---------------------------------------------------------------- Leaderboard
    def get_leaderboard(self) -> list[dict]:
        entries = []
        # Combine registered players with historical rankings
        unique_players = {id(player): player for player in self.players.values()}.values()
        sorted_players = sorted(
            unique_players,
            key=lambda p: (p.battles_won * 100 + p.campaign_stars * 20 + p.level * 10),
            reverse=True,
        )
        rank = 1
        for p in sorted_players:
            # Map faction name
            f_name = "Chưa gia nhập"
            factions_path = Path(__file__).resolve().parents[3] / "assets" / "nft" / "factions.json"
            if factions_path.exists() and p.faction_id:
                with factions_path.open(encoding="utf-8") as fh:
                    f_data = json.load(fh)
                    for f in f_data.get("factions", []):
                        if f["faction_id"] == p.faction_id:
                            f_name = f["name"]
                            break
            entries.append(
                {
                    "rank": rank,
                    "username": p.username,
                    "wallet": p.wallet,
                    "faction_name": f_name,
                    "campaign_stars": p.campaign_stars,
                    "battles_won": p.battles_won,
                    "reputation_score": 100 + (p.battles_won * 25),
                }
            )
            rank += 1
        return entries[:50]

    # ---------------------------------------------------------------- Marketplace
    def get_active_listings(self, chain: str | None = None, faction_id: int | None = None) -> list[MarketplaceListing]:
        result = []
        for listing in self.listings.values():
            if listing.status != "active":
                continue
            if chain and listing.chain.lower() != chain.lower():
                continue
            if faction_id:
                adv = self.get_advisor(listing.advisor_id)
                if not adv or adv.get("faction_id") != faction_id:
                    continue
            result.append(listing)
        return result

    def get_listing(self, listing_id: str) -> MarketplaceListing | None:
        return self.listings.get(listing_id)

    def create_listing(
        self,
        advisor_id: str,
        seller_wallet: str,
        price: float,
        currency: str,
        chain: str,
        token_id: str,
    ) -> MarketplaceListing:
        listing_id = f"list-{uuid.uuid4().hex[:10]}"
        listing = MarketplaceListing(
            listing_id=listing_id,
            advisor_id=advisor_id,
            seller_wallet=normalize_wallet(chain, seller_wallet),
            price=price,
            currency=currency,
            chain=chain,
            token_id=token_id,
            status="active",
        )
        self.listings[listing_id] = listing
        return listing

    def cancel_listing(self, listing_id: str, seller_wallet: str) -> bool:
        listing = self.listings.get(listing_id)
        if not listing or listing.status != "active":
            return False
        if normalize_wallet(listing.chain, listing.seller_wallet) != normalize_wallet(listing.chain, seller_wallet):
            return False
        listing.status = "cancelled"
        return True

    def buy_listing(self, listing_id: str, buyer_wallet: str) -> bool:
        listing = self.listings.get(listing_id)
        if not listing or listing.status != "active":
            return False
        listing.status = "sold"
        # Transfer ownership
        own_key = f"{listing.chain}:{listing.token_id}"
        self.advisor_ownerships[own_key] = AdvisorOwnership(
            advisor_id=listing.advisor_id,
            owner_wallet=normalize_wallet(listing.chain, buyer_wallet),
            chain=listing.chain,
            token_id=listing.token_id,
        )
        return True

    # ---------------------------------------------------------------- P2P Trades
    def create_trade(
        self,
        initiator_wallet: str,
        target_wallet: str,
        offered_advisor_id: str,
        requested_advisor_id: str,
        chain: str,
    ) -> TradeRecord:
        trade_id = f"trade-{uuid.uuid4().hex[:10]}"
        trade = TradeRecord(
            trade_id=trade_id,
            initiator_wallet=normalize_wallet(chain, initiator_wallet),
            target_wallet=normalize_wallet(chain, target_wallet),
            offered_advisor_id=offered_advisor_id,
            requested_advisor_id=requested_advisor_id,
            chain=chain,
            status="pending",
        )
        self.trades[trade_id] = trade
        return trade

    def get_trade(self, trade_id: str) -> TradeRecord | None:
        return self.trades.get(trade_id)

    def accept_trade(self, trade_id: str, target_wallet: str, tx_digest: str | None = None) -> bool:
        trade = self.trades.get(trade_id)
        if not trade or trade.status != "pending":
            return False
        if normalize_wallet(trade.chain, trade.target_wallet) != normalize_wallet(trade.chain, target_wallet):
            return False
        trade.status = "accepted"
        trade.tx_digest = tx_digest
        return True

    def reject_trade(self, trade_id: str, wallet: str) -> bool:
        trade = self.trades.get(trade_id)
        if not trade or trade.status != "pending":
            return False
        norm = normalize_wallet(trade.chain, wallet)
        if norm not in (trade.initiator_wallet, trade.target_wallet):
            return False
        trade.status = "rejected"
        return True

    # ---------------------------------------------------------------- Ownership Proof
    def get_advisor_ownership(self, advisor_id: str) -> AdvisorOwnership | None:
        for own in self.advisor_ownerships.values():
            if own.advisor_id == advisor_id:
                return own
        return None

    def player_can_use_advisor(self, chain: str, wallet: str, advisor_id: str) -> bool:
        """A player may equip their faction starter or an advisor NFT they own."""
        player = self.get_player(chain, wallet)
        if player and player.faction_id and self.get_starting_advisor_for_faction(player.faction_id) == advisor_id:
            return True
        ownership = self.get_advisor_ownership(advisor_id)
        return bool(
            ownership
            and ownership.chain == chain
            and normalize_wallet(chain, ownership.owner_wallet) == normalize_wallet(chain, wallet)
        )



store = Store()
