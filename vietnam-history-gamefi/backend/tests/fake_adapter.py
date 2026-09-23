from __future__ import annotations

from app.blockchain.interface import BlockchainAdapter, NftInfo, PreparedRewardSubmission, TransactionInfo


class FakeAdapter(BlockchainAdapter):
    def __init__(self, chain: str = "solana") -> None:
        self._chain = chain
        self.txs: dict[str, TransactionInfo] = {}
        self.ownership: dict[str, str] = {}
        self.nfts: dict[str, list[NftInfo]] = {}
        self._seq = 0
        self.reward_receipts: dict[str, dict] = {}
        self.prepared_rewards: dict[str, tuple[str, int, str]] = {}

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

    def prepare_reward(
        self, recipient: str, amount: int, claim_id: bytes
    ) -> PreparedRewardSubmission:
        self._seq += 1
        signature = f"{self._chain}-reward{self._seq}"
        claim_hex = claim_id.hex()
        receipt = f"receipt-{claim_hex[:40]}"
        self.prepared_rewards[signature] = (recipient, amount, claim_hex)
        return PreparedRewardSubmission(
            signature=signature,
            receipt_address=receipt,
            signed_transaction=f"signed-{signature}",
            last_valid_block_height=999_999_999,
        )

    def submit_reward(self, prepared: PreparedRewardSubmission) -> str:
        recipient, amount, claim_hex = self.prepared_rewards[prepared.signature]
        self.txs[prepared.signature] = TransactionInfo(
            digest=prepared.signature,
            status="success",
            sender="6RigAPgKTdEwxmRqaoMiJj6GYnkipTSwRRc9Wkw79rTv",
            timestamp_ms=1_700_000_000_001,
            events=[{"recipient": recipient, "amount": amount, "claim_id": claim_hex}],
        )
        self.reward_receipts[claim_hex] = {
            "address": prepared.receipt_address,
            "claim_id": claim_hex,
            "recipient": recipient,
            "amount": amount,
            "slot": 1,
            "bump": 255,
        }
        return prepared.signature

    def get_reward_receipt(self, claim_id: bytes) -> dict | None:
        return self.reward_receipts.get(claim_id.hex())

    def get_transaction(self, digest: str) -> TransactionInfo | None:
        return self.txs.get(digest)


    def get_token_mint_info(self, mint: str) -> dict:
        return {
            "mint": mint,
            "program_id": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            "supply": "1000000000000000",
            "decimals": 6,
            "is_initialized": True,
            "mint_authority": None,
            "freeze_authority": None,
        }


    def get_token_account_info(self, address: str) -> dict:
        is_reward_vault = address == "9ngszc2V6RBRxgtagHCsn6s369aZoKWHb8uXShZAhoS7"
        return {
            "address": address,
            "mint": "45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm",
            "owner": (
                "3MHpXEzsFkeJeYdPMmnL8LMCY3r3Ew3wm753fZacTCuw"
                if is_reward_vault
                else "HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK"
            ),
            "amount": "1000000000000" if is_reward_vault else "999000000000000",
            "decimals": 6,
            "state": "initialized",
        }

    def get_reward_distributor_info(self, address: str) -> dict:
        return {
            "address": address,
            "admin": "oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T",
            "distributor": "6RigAPgKTdEwxmRqaoMiJj6GYnkipTSwRRc9Wkw79rTv",
            "mint": "45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm",
            "vault": "9ngszc2V6RBRxgtagHCsn6s369aZoKWHb8uXShZAhoS7",
            "bump": 254,
            "paused": False,
            "max_reward_amount": "1000000000",
            "total_distributed": "0",
            "claims_count": 0,
        }

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
