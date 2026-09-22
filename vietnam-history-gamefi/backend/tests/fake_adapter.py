from __future__ import annotations

from app.blockchain.interface import BlockchainAdapter, NftInfo, TransactionInfo


class FakeAdapter(BlockchainAdapter):
    def __init__(self, chain: str = "solana") -> None:
        self._chain = chain
        self.txs: dict[str, TransactionInfo] = {}
        self.ownership: dict[str, str] = {}
        self.nfts: dict[str, list[NftInfo]] = {}
        self._seq = 0

    def _norm(self, wallet: str) -> str:
        return wallet

    def chain_name(self) -> str:
        return self._chain

    def mint_faction(self, recipient: str, faction_id: int) -> tuple[str, str]:
        self._seq += 1
        digest = f"{self._chain}-fakedigest{self._seq}"
        object_id = f"{self._chain}-fakenft{self._seq}"
        norm = self._norm(recipient)
        self.ownership[object_id] = norm
        self.nfts.setdefault(norm, []).append(
            NftInfo(object_id, norm, faction_id, f"Faction {faction_id}", "rare", "img.png")
        )
        self.txs[digest] = TransactionInfo(
            digest=digest,
            status="success",
            sender=recipient,
            timestamp_ms=1_700_000_000_000,
            events=[{"eventType": "FactionMinted", "faction_id": faction_id, "object_id": object_id}],
        )
        return digest, object_id

    def send_reward(self, recipient: str, amount: int, battle_id: int) -> str:
        self._seq += 1
        digest = f"{self._chain}-fakedigest{self._seq}"
        self.txs[digest] = TransactionInfo(
            digest=digest,
            status="success",
            sender="admin",
            timestamp_ms=1_700_000_000_001,
            events=[{"recipient": recipient, "amount": amount, "battle_id": battle_id}],
        )
        return digest

    def get_transaction(self, digest: str) -> TransactionInfo | None:
        return self.txs.get(digest)

    def verify_ownership(self, wallet: str, object_id: str) -> bool:
        return self.ownership.get(object_id) == self._norm(wallet)

    def verify_faction_mint(self, wallet: str, object_id: str, faction_id: int, digest: str) -> bool:
        tx = self.get_transaction(digest)
        return bool(
            tx
            and tx.succeeded
            and tx.sender == wallet
            and any(
                event.get("eventType") == "FactionMinted"
                and event.get("faction_id") == faction_id
                and event.get("object_id") == object_id
                for event in tx.events
            )
        )

    def get_faction_nfts(self, wallet: str) -> list[NftInfo]:
        return self.nfts.get(self._norm(wallet), [])
