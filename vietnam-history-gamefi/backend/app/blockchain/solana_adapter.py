"""Read and verify Solana faction proof accounts; player wallets submit writes."""
from __future__ import annotations

import base64
import binascii
import json
from pathlib import Path
from typing import Any

import httpx
import base58
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID

from app.blockchain.borsh_utils import BorshReader, anchor_discriminator
from app.blockchain.interface import BlockchainAdapter, NftInfo, TransactionInfo
from app.core.config import Settings


class SolanaAdapterError(RuntimeError):
    pass


class SolanaAdapter(BlockchainAdapter):
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.http = http or httpx.Client(timeout=20)

    def chain_name(self) -> str:
        return "solana"

    def _program_id(self) -> Pubkey:
        try:
            program = Pubkey.from_string(self.s.solana_program_id)
        except ValueError as exc:
            raise SolanaAdapterError("Cần cấu hình SOLANA_PROGRAM_ID sau khi deploy") from exc
        if program == SYSTEM_PROGRAM_ID:
            raise SolanaAdapterError("SOLANA_PROGRAM_ID vẫn là placeholder System Program")
        return program

    def _faction_pda(self, wallet: str) -> Pubkey:
        return Pubkey.find_program_address(
            [b"faction", bytes(Pubkey.from_string(wallet))], self._program_id()
        )[0]

    def get_transaction(self, digest: str) -> TransactionInfo | None:
        result = self._rpc("getTransaction", [digest, {
            "encoding": "json", "commitment": "finalized", "maxSupportedTransactionVersion": 0,
        }])
        if not result:
            return None
        meta = result.get("meta")
        keys = result.get("transaction", {}).get("message", {}).get("accountKeys", [])
        return TransactionInfo(
            digest=digest,
            status="pending" if meta is None else ("success" if meta.get("err") is None else "failure"),
            sender=keys[0] if keys else None,
            timestamp_ms=(result.get("blockTime") or 0) * 1000 or None,
            events=[], raw=result,
        )

    def _get_proof(self, address: Pubkey) -> tuple[str, str, str, str] | None:
        result = self._rpc("getAccountInfo", [str(address), {
            "encoding": "base64", "commitment": "finalized",
        }])
        account = (result or {}).get("value")
        if account is None:
            return None
        if account.get("owner") != str(self._program_id()) or account.get("executable"):
            return None
        try:
            raw = base64.b64decode(account["data"][0], validate=True)
            if len(raw) < 44 or raw[:8] != anchor_discriminator("account", "AssetProof"):
                return None
            reader = BorshReader(raw, offset=8)
            owner = str(Pubkey.from_bytes(reader.read_pubkey()))
            kind, reference_id, metadata_uri = (reader.read_string() for _ in range(3))
            return owner, kind, reference_id, metadata_uri
        except (ValueError, IndexError, KeyError, TypeError, binascii.Error):
            return None

    def get_faction_nfts(self, wallet: str) -> list[NftInfo]:
        """Legacy API name: returns a non-transferable faction proof, not an SPL NFT."""
        address = self._faction_pda(wallet)
        proof = self._get_proof(address)
        if proof is None:
            return []
        owner, kind, reference, _metadata = proof
        if owner != wallet or kind != "faction" or reference not in {str(i) for i in range(1, 9)}:
            return []
        path = Path(self.s.factions_file)
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[3] / path
        factions = json.loads(path.read_text(encoding="utf-8"))["factions"]
        faction = next((f for f in factions if f["faction_id"] == int(reference)), None)
        if faction is None:
            return []
        return [NftInfo(str(address), owner, int(reference), faction["name"], faction["rarity"], faction["image"])]

    def verify_ownership(self, wallet: str, object_id: str) -> bool:
        return any(nft.object_id == object_id for nft in self.get_faction_nfts(wallet))

    def verify_faction_mint(self, wallet: str, object_id: str, faction_id: int, digest: str) -> bool:
        try:
            proof = self._faction_pda(wallet)
            if object_id != str(proof):
                return False
            tx = self.get_transaction(digest)
            if tx is None or not tx.succeeded or tx.sender != wallet:
                return False
            message = tx.raw.get("transaction", {}).get("message", {})
            raw_keys = message.get("accountKeys", [])
            keys = [
                str(key.get("pubkey")) if isinstance(key, dict) else str(key)
                for key in raw_keys
            ]
            required_accounts = {wallet, object_id, str(SYSTEM_PROGRAM_ID)}
            program_id = str(self._program_id())
            for instruction in message.get("instructions", []):
                program_index = instruction.get("programIdIndex")
                if not isinstance(program_index, int) or program_index >= len(keys):
                    continue
                if keys[program_index] != program_id:
                    continue
                indexes = instruction.get("accounts", [])
                if not all(isinstance(index, int) and index < len(keys) for index in indexes):
                    continue
                if not required_accounts.issubset({keys[index] for index in indexes}):
                    continue
                raw = base58.b58decode(instruction.get("data", ""))
                if raw[:8] != anchor_discriminator("global", "mint_faction"):
                    continue
                reader = BorshReader(raw, offset=8)
                reference = reader.read_string()
                reader.read_string()  # metadata_uri
                if reader.offset == len(raw) and reference == str(faction_id):
                    return True
            return False
        except (ValueError, IndexError, KeyError, TypeError):
            return False

    def mint_faction(self, recipient: str, faction_id: int) -> tuple[str, str]:
        raise SolanaAdapterError("Ví người chơi phải ký mint_faction; backend không giữ private key")

    def send_reward(self, recipient: str, amount: int, battle_id: int) -> str:
        raise SolanaAdapterError("Chưa có chương trình treasury và claim reward Solana được triển khai")

    def _rpc(self, method: str, params: list) -> Any:
        try:
            response = self.http.post(self.s.solana_rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            })
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise SolanaAdapterError(f"Không thể đọc Solana RPC: {method}") from exc
        if not isinstance(body, dict) or "error" in body:
            raise SolanaAdapterError(f"Solana RPC trả lỗi: {method}")
        return body.get("result")
