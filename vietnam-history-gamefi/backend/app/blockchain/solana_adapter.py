"""Read and verify Solana faction proof accounts; player wallets submit writes."""
from __future__ import annotations

import base64
import binascii
import json
from pathlib import Path
from typing import Any

import httpx
import base58
from solders.hash import Hash
from solders.instruction import Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from solders.system_program import TransferParams, transfer
from solders.transaction import Transaction

from app.blockchain.borsh_utils import BorshReader, anchor_discriminator
from app.blockchain.interface import (
    BlockchainAdapter,
    NftInfo,
    PreparedRewardSubmission,
    TransactionInfo,
)
from app.core.config import Settings


SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"


class SolanaAdapterError(RuntimeError):
    pass


class SolanaSubmissionError(SolanaAdapterError):
    def __init__(self, message: str, *, signature: str):
        super().__init__(message)
        self.signature = signature


class SolanaAdapter(BlockchainAdapter):
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self.s = settings
        self.http = http or httpx.Client(timeout=20)

    def chain_name(self) -> str:
        return "solana"

    def get_genesis_hash(self) -> str:
        result = self._rpc("getGenesisHash", [])
        if not isinstance(result, str):
            raise SolanaAdapterError("RPC không trả genesis hash hợp lệ")
        return result

    def get_native_balance(self, wallet: str) -> int:
        result = self._rpc("getBalance", [wallet, {"commitment": "confirmed"}])
        try:
            return int(result["value"])
        except (KeyError, TypeError, ValueError) as exc:
            raise SolanaAdapterError("RPC không trả số dư SOL hợp lệ") from exc

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
        return self._get_transaction_encoded(digest, "json")

    def get_dex_transaction(self, digest: str) -> TransactionInfo | None:
        return self._get_transaction_encoded(digest, "jsonParsed")

    def _get_transaction_encoded(self, digest: str, encoding: str) -> TransactionInfo | None:
        result = self._rpc("getTransaction", [digest, {
            "encoding": encoding, "commitment": "finalized", "maxSupportedTransactionVersion": 0,
        }])
        if not result:
            return None
        meta = result.get("meta")
        keys = result.get("transaction", {}).get("message", {}).get("accountKeys", [])
        return TransactionInfo(
            digest=digest,
            status="pending" if meta is None else ("success" if meta.get("err") is None else "failure"),
            sender=(str(keys[0].get("pubkey")) if keys and isinstance(keys[0], dict) else (str(keys[0]) if keys else None)),
            timestamp_ms=(result.get("blockTime") or 0) * 1000 or None,
            events=[], raw=result,
        )

    def get_signature_status(self, digest: str) -> str | None:
        result = self._rpc("getSignatureStatuses", [[digest], {"searchTransactionHistory": True}])
        values = result.get("value") if isinstance(result, dict) else None
        status = values[0] if isinstance(values, list) and values else None
        if not isinstance(status, dict):
            return None
        if status.get("err") is not None:
            return "failed"
        return "success" if status.get("confirmationStatus") in {"confirmed", "finalized"} else "pending"

    def is_blockhash_valid(self, blockhash: str) -> bool:
        result = self._rpc("isBlockhashValid", [blockhash, {"commitment": "confirmed"}])
        if not isinstance(result, dict) or not isinstance(result.get("value"), bool):
            raise SolanaAdapterError("RPC không trả trạng thái blockhash hợp lệ")
        return result["value"]


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

    def _load_sol_reward_signer(self) -> Keypair:
        if not self.s.sol_reward_signer_keypair_base64:
            raise SolanaAdapterError("SOL_REWARD_SIGNER_KEYPAIR_BASE64 chưa được cấu hình")
        try:
            raw = base64.b64decode(self.s.sol_reward_signer_keypair_base64, validate=True)
            keypair = Keypair.from_bytes(raw)
        except (ValueError, TypeError, binascii.Error) as exc:
            raise SolanaAdapterError("SOL_REWARD_SIGNER_KEYPAIR_BASE64 không hợp lệ") from exc
        if str(keypair.pubkey()) != self.s.sol_reward_signer_address:
            raise SolanaAdapterError("Ví ký thưởng SOL không khớp địa chỉ đã cấu hình")
        return keypair

    def prepare_sol_reward(
        self, recipient: str, amount: int, claim_id: bytes
    ) -> PreparedRewardSubmission:
        if self.s.solana_network != "devnet":
            raise SolanaAdapterError("Thưởng SOL hiện chỉ hỗ trợ Devnet")
        if len(claim_id) != 32 or amount <= 0 or amount > self.s.reward_max_lamports:
            raise SolanaAdapterError("Số lượng SOL thưởng hoặc claim ID không hợp lệ")
        try:
            recipient_key = Pubkey.from_string(recipient)
        except ValueError as exc:
            raise SolanaAdapterError("Ví nhận SOL không hợp lệ") from exc
        signer = self._load_sol_reward_signer()
        if self.get_native_balance(str(signer.pubkey())) < amount + 10_000:
            raise SolanaAdapterError("Ví thưởng SOL Devnet không đủ số dư")
        latest = self._rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
        try:
            value = latest["value"]
            blockhash = Hash.from_string(value["blockhash"])
            last_valid_block_height = int(value["lastValidBlockHeight"])
        except (KeyError, TypeError, ValueError) as exc:
            raise SolanaAdapterError("RPC không trả recent blockhash hợp lệ") from exc
        memo = Instruction(
            Pubkey.from_string(MEMO_PROGRAM_ID),
            b"gamefi-sol-reward:" + claim_id.hex().encode("ascii"),
            [],
        )
        payment = transfer(TransferParams(
            from_pubkey=signer.pubkey(), to_pubkey=recipient_key, lamports=amount,
        ))
        transaction = Transaction([signer], Message([payment, memo], signer.pubkey()), blockhash)
        return PreparedRewardSubmission(
            signature=str(transaction.signatures[0]),
            receipt_address=None,
            signed_transaction=base64.b64encode(bytes(transaction)).decode("ascii"),
            last_valid_block_height=last_valid_block_height,
        )

    def submit_reward(self, prepared: PreparedRewardSubmission) -> str:
        try:
            result = self._rpc("sendTransaction", [prepared.signed_transaction, {
                "encoding": "base64",
                "skipPreflight": False,
                "preflightCommitment": "confirmed",
                "maxRetries": 3,
            }])
        except SolanaAdapterError as exc:
            raise SolanaSubmissionError(
                "Không xác định được trạng thái gửi reward; cần đối soát chữ ký",
                signature=prepared.signature,
            ) from exc
        if result != prepared.signature:
            raise SolanaSubmissionError(
                "RPC trả chữ ký reward không khớp giao dịch đã lưu",
                signature=prepared.signature,
            )
        return prepared.signature

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
