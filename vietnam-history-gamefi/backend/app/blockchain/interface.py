"""Interface chung cho mọi blockchain adapter.

Tuân thủ nguyên tắc:
- Domain logic chỉ gọi BlockchainAdapter, không import SDK của chain cụ thể.
- Blockchain chỉ quản lý Quyền sở hữu (Ownership) và Chợ tướng (Marketplace/Trades).
- TUYỆT ĐỐI không đặt logic combat, damage, quest, hay balance vào BlockchainAdapter.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class TransactionInfo:
    digest: str
    status: str  # "success" | "failure" | "pending"
    sender: str | None = None
    timestamp_ms: int | None = None
    events: list[dict] = field(default_factory=list)
    raw: dict = field(default_factory=dict)

    @property
    def succeeded(self) -> bool:
        return self.status == "success"


@dataclass
class NftInfo:
    object_id: str
    owner: str
    faction_id: int
    faction_name: str
    rarity: str
    image: str


@dataclass
class AdvisorNftInfo:
    token_id: str
    owner: str
    advisor_id: str
    advisor_name: str
    faction_id: int
    rarity: str
    metadata_uri: str


class BlockchainAdapter(ABC):
    """Contract mà SolanaAdapter phải implement."""

    @abstractmethod
    def chain_name(self) -> str:
        ...

    @abstractmethod
    def get_transaction(self, digest: str) -> TransactionInfo | None:
        """Xác thực TX đã lên chain; None nếu digest chưa tồn tại."""
        ...

    @abstractmethod
    def verify_ownership(self, wallet: str, object_id: str) -> bool:
        """True nếu object/token thuộc về wallet (owner on-chain)."""
        ...

    @abstractmethod
    def verify_faction_mint(
        self,
        wallet: str,
        object_id: str,
        faction_id: int,
        digest: str,
    ) -> bool:
        """True only when digest invokes mint_faction for this wallet/PDA/faction."""
        ...

    # -------------------------------------------------------- Advisor & Market
    def verify_wallet(self, wallet: str, message: bytes, signature: str) -> bool:
        """Xác thực chữ ký ví."""
        from app.core.security import verify_wallet_signature
        return verify_wallet_signature(self.chain_name(), wallet, message, signature)

    def transfer_advisor(self, from_wallet: str, to_wallet: str, advisor_nft_id: str) -> str:
        raise NotImplementedError("Advisor transfer phải được thực hiện bằng escrow contract on-chain")

    def list_advisor(self, wallet: str, advisor_nft_id: str, price: float) -> str:
        raise NotImplementedError("Advisor listing phải được thực hiện bằng escrow contract on-chain")

    def buy_advisor(self, buyer_wallet: str, listing_id: str, price: float) -> str:
        raise NotImplementedError("Advisor purchase phải được thực hiện bằng escrow contract on-chain")

    def trade_advisor(self, wallet_a: str, wallet_b: str, advisor_a_id: str, advisor_b_id: str) -> str:
        raise NotImplementedError("Advisor trade phải được thực hiện bằng escrow contract on-chain")

    # -------------------------------------------------------- Legacy Faction & Reward
    @abstractmethod
    def mint_faction(self, recipient: str, faction_id: int) -> tuple[str, str]:
        """Tạo faction proof cho wallet. Trả về (tx_digest, nft_object_id)."""
        ...

    @abstractmethod
    def send_reward(self, recipient: str, amount: int, battle_id: int) -> str:
        """Battle Result -> Reward on-chain. Trả về tx digest."""
        ...

    @abstractmethod
    def get_faction_nfts(self, wallet: str) -> list[NftInfo]:
        ...
