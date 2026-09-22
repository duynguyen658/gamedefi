"""Initialize and fund the HKDV reward distributor on Solana Devnet.

The script is idempotent and never writes private key material into the repository.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.blockchain.borsh_utils import BorshReader, BorshWriter, anchor_discriminator

DEVNET_RPC = "https://api.devnet.solana.com"
DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
PROGRAM_ID = Pubkey.from_string("8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN")
MINT = Pubkey.from_string("45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm")
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
SYSTEM_PROGRAM_ID = Pubkey.default()
TREASURY_ACCOUNT = Pubkey.from_string("3d3aVnwqsre4AfnvVCMvkLvLZ7YbxY3A6P5Er3wKg1Sp")
TOKEN_DECIMALS = 6
MAX_REWARD_AMOUNT = 1_000 * 10**TOKEN_DECIMALS
VAULT_ALLOCATION = 1_000_000 * 10**TOKEN_DECIMALS


class DevnetClient:
    def __init__(self, url: str) -> None:
        self.url = url
        self.http = httpx.Client(timeout=30)

    def rpc(self, method: str, params: list) -> dict | str:
        response = self.http.post(
            self.url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        response.raise_for_status()
        body = response.json()
        if "error" in body:
            raise RuntimeError(f"Solana RPC {method} failed: {body['error']}")
        return body["result"]

    def account(self, address: Pubkey) -> dict | None:
        result = self.rpc(
            "getAccountInfo",
            [str(address), {"encoding": "base64", "commitment": "confirmed"}],
        )
        return result["value"]

    def token_amount(self, address: Pubkey) -> int:
        result = self.rpc(
            "getTokenAccountBalance",
            [str(address), {"commitment": "confirmed"}],
        )
        return int(result["value"]["amount"])

    def send(self, instruction: Instruction, payer: Keypair, signers: list[Keypair]) -> str:
        latest = self.rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
        blockhash = Hash.from_string(latest["value"]["blockhash"])
        unique_signers: list[Keypair] = []
        seen: set[Pubkey] = set()
        for signer in [payer, *signers]:
            if signer.pubkey() not in seen:
                seen.add(signer.pubkey())
                unique_signers.append(signer)
        tx = Transaction.new_signed_with_payer(
            [instruction], payer.pubkey(), unique_signers, blockhash
        )
        signature = self.rpc(
            "sendTransaction",
            [
                base64.b64encode(bytes(tx)).decode(),
                {
                    "encoding": "base64",
                    "preflightCommitment": "confirmed",
                    "maxRetries": 5,
                },
            ],
        )
        self.wait_confirmed(str(signature))
        return str(signature)

    def wait_confirmed(self, signature: str) -> None:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            result = self.rpc("getSignatureStatuses", [[signature]])
            status = result["value"][0]
            if status and status.get("confirmationStatus") in {"confirmed", "finalized"}:
                if status.get("err") is not None:
                    raise RuntimeError(f"Transaction failed: {status['err']}")
                return
            time.sleep(0.5)
        raise TimeoutError(f"Timed out waiting for {signature}")


def load_keypair(path: Path) -> Keypair:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        keypair = Keypair.from_bytes(bytes(raw))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read Solana keypair: {path}") from exc
    return keypair


def decode_config(account: dict) -> dict:
    if account.get("owner") != str(PROGRAM_ID):
        raise RuntimeError("Reward config is not owned by the history_game program")
    raw = base64.b64decode(account["data"][0])
    if raw[:8] != anchor_discriminator("account", "RewardConfig"):
        raise RuntimeError("Reward config discriminator is invalid")
    reader = BorshReader(raw, 8)
    return {
        "admin": str(Pubkey.from_bytes(reader.read_pubkey())),
        "distributor": str(Pubkey.from_bytes(reader.read_pubkey())),
        "mint": str(Pubkey.from_bytes(reader.read_pubkey())),
        "vault": str(Pubkey.from_bytes(reader.read_pubkey())),
        "bump": reader.read_u8(),
        "paused": bool(reader.read_u8()),
        "max_reward_amount": reader.read_u64(),
        "total_distributed": reader.read_u64(),
        "claims_count": reader.read_u64(),
    }


def display_tokens(base_units: int) -> str:
    whole, fraction = divmod(base_units, 10**TOKEN_DECIMALS)
    return str(whole) if fraction == 0 else f"{whole}.{fraction:06d}".rstrip("0")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("network", nargs="?", default="devnet")
    args = parser.parse_args()
    if args.network != "devnet":
        raise SystemExit("Stage 5 initialization is restricted to devnet")

    key_dir = Path(os.environ.get(
        "GAME_TOKEN_KEY_DIR", "~/.config/solana/gamefi-hkdv"
    )).expanduser()
    admin_path = Path(os.environ.get(
        "SOLANA_KEYPAIR", "~/.config/solana/id.json"
    )).expanduser()
    distributor_path = key_dir / "devnet-reward-distributor-keypair.json"
    treasury_path = key_dir / "devnet-treasury-keypair.json"
    for path in (admin_path, distributor_path, treasury_path):
        if not path.is_file():
            raise RuntimeError(f"Required keypair does not exist: {path}")

    admin = load_keypair(admin_path)
    distributor = load_keypair(distributor_path)
    treasury = load_keypair(treasury_path)
    if str(treasury.pubkey()) != "HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK":
        raise RuntimeError("Treasury keypair does not match the phase-4 deployment")

    client = DevnetClient(DEVNET_RPC)
    if client.rpc("getGenesisHash", []) != DEVNET_GENESIS:
        raise RuntimeError("RPC endpoint is not Solana Devnet")
    program_account = client.account(PROGRAM_ID)
    if not program_account or not program_account.get("executable"):
        raise RuntimeError("history_game program is not deployed or executable")
    mint_account = client.account(MINT)
    if not mint_account or mint_account.get("owner") != str(TOKEN_PROGRAM_ID):
        raise RuntimeError("HKDV mint is not owned by the original SPL Token Program")

    config, config_bump = Pubkey.find_program_address([b"reward-config"], PROGRAM_ID)
    vault, _ = Pubkey.find_program_address(
        [bytes(config), bytes(TOKEN_PROGRAM_ID), bytes(MINT)],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    record_path = ROOT / "blockchain/solana/deployments/devnet-reward-distributor.json"
    previous: dict = {}
    if record_path.exists():
        previous = json.loads(record_path.read_text(encoding="utf-8"))
    funding_recorded = bool(previous.get("fund_signatures"))
    initialize_signature: str | None = None
    account = client.account(config)
    if account is None:
        data = (
            anchor_discriminator("global", "initialize_reward_distributor")
            + BorshWriter()
            .pubkey(bytes(distributor.pubkey()))
            .u64(MAX_REWARD_AMOUNT)
            .bytes()
        )
        instruction = Instruction(PROGRAM_ID, data, [
            AccountMeta(config, False, True),
            AccountMeta(MINT, False, False),
            AccountMeta(vault, False, True),
            AccountMeta(admin.pubkey(), True, True),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
            AccountMeta(ASSOCIATED_TOKEN_PROGRAM_ID, False, False),
            AccountMeta(SYSTEM_PROGRAM_ID, False, False),
        ])
        initialize_signature = client.send(instruction, admin, [admin])
        account = client.account(config)

    config_data = decode_config(account)
    expected = {
        "admin": str(admin.pubkey()),
        "distributor": str(distributor.pubkey()),
        "mint": str(MINT),
        "vault": str(vault),
        "bump": config_bump,
        "paused": False,
        "max_reward_amount": MAX_REWARD_AMOUNT,
    }
    for key, value in expected.items():
        if config_data[key] != value:
            raise RuntimeError(
                f"Reward config mismatch for {key}: {config_data[key]!r} != {value!r}"
            )

    vault_account = client.account(vault)
    if not vault_account or vault_account.get("owner") != str(TOKEN_PROGRAM_ID):
        raise RuntimeError("Reward vault ATA was not created correctly")
    current_balance = client.token_amount(vault)
    fund_signatures: list[str] = []
    may_complete_initial_funding = (
        not funding_recorded
        and config_data["claims_count"] == 0
        and config_data["total_distributed"] == 0
    )
    if current_balance < VAULT_ALLOCATION and may_complete_initial_funding:
        amount = VAULT_ALLOCATION - current_balance
        if client.token_amount(TREASURY_ACCOUNT) < amount:
            raise RuntimeError("Treasury does not contain enough HKDV to fund reward vault")
        data = (
            anchor_discriminator("global", "fund_reward_vault")
            + BorshWriter().u64(amount).bytes()
        )
        instruction = Instruction(PROGRAM_ID, data, [
            AccountMeta(config, False, False),
            AccountMeta(MINT, False, False),
            AccountMeta(vault, False, True),
            AccountMeta(TREASURY_ACCOUNT, False, True),
            AccountMeta(treasury.pubkey(), True, False),
            AccountMeta(TOKEN_PROGRAM_ID, False, False),
        ])
        fund_signatures.append(client.send(instruction, admin, [treasury]))

    vault_balance = client.token_amount(vault)
    if fund_signatures and vault_balance < VAULT_ALLOCATION:
        raise RuntimeError("Reward vault funding did not reach the configured allocation")

    if initialize_signature is None:
        initialize_signature = previous.get("initialize_signature")
    all_fund_signatures = list(previous.get("fund_signatures", []))
    all_fund_signatures.extend(fund_signatures)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "schema_version": 1,
        "network": "devnet",
        "status": "active",
        "program_id": str(PROGRAM_ID),
        "config": str(config),
        "config_bump": config_bump,
        "mint": str(MINT),
        "vault": str(vault),
        "admin": str(admin.pubkey()),
        "distributor": str(distributor.pubkey()),
        "paused": config_data["paused"],
        "max_reward_per_claim": display_tokens(MAX_REWARD_AMOUNT),
        "max_reward_per_claim_base_units": str(MAX_REWARD_AMOUNT),
        "vault_allocation": display_tokens(VAULT_ALLOCATION),
        "vault_allocation_base_units": str(VAULT_ALLOCATION),
        "vault_balance": display_tokens(vault_balance),
        "vault_balance_base_units": str(vault_balance),
        "total_distributed_base_units": str(config_data["total_distributed"]),
        "claims_count": config_data["claims_count"],
        "initialize_signature": initialize_signature,
        "fund_signatures": all_fund_signatures,
        "initial_funding_complete": bool(all_fund_signatures),
        "deployed_at": previous.get("deployed_at", now),
        "verified_at": now,
        "config_explorer_url": f"https://explorer.solana.com/address/{config}?cluster=devnet",
        "vault_explorer_url": f"https://explorer.solana.com/address/{vault}?cluster=devnet",
    }
    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"Config: {config}")
    print(f"Vault: {vault}")
    print(f"Distributor: {distributor.pubkey()}")
    print(f"Vault balance: {display_tokens(vault_balance)} HKDV")
    print(f"Deployment: {record_path}")


if __name__ == "__main__":
    main()
