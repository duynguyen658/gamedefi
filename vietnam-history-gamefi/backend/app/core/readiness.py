"""Read-only Mainnet checks for deployment and operational monitoring."""

import base64
from datetime import datetime, timedelta, timezone

from solders.pubkey import Pubkey
from sqlalchemy import func, select, text

from app.blockchain.solana_adapter import SolanaAdapter
from app.core.config import Settings
from app.core.mainnet import MAINNET_GENESIS
from app.dex.persistence import DexSwapModel, DexSwapRepository
from app.rewards.persistence import RewardClaimModel, RewardRepository


UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111"
TOKEN_METADATA_PROGRAM = Pubkey.from_string("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")


def _account(adapter: SolanaAdapter, address: str) -> tuple[dict, bytes]:
    response = adapter._rpc("getAccountInfo", [address, {"encoding": "base64", "commitment": "finalized"}])
    account = response.get("value") if isinstance(response, dict) else None
    if not isinstance(account, dict):
        raise ValueError(f"Account {address} chưa tồn tại")
    raw = base64.b64decode(account["data"][0], validate=True)
    return account, raw


def _program_authority(adapter: SolanaAdapter, program_id: str) -> str:
    program, raw = _account(adapter, program_id)
    if program.get("owner") != UPGRADEABLE_LOADER or not program.get("executable"):
        raise ValueError("Program không thuộc upgradeable loader hoặc chưa executable")
    if len(raw) != 36 or int.from_bytes(raw[:4], "little") != 2:
        raise ValueError("Program account không có layout hợp lệ")
    programdata, data = _account(adapter, str(Pubkey.from_bytes(raw[4:36])))
    if programdata.get("owner") != UPGRADEABLE_LOADER or len(data) < 45:
        raise ValueError("ProgramData không hợp lệ")
    if int.from_bytes(data[:4], "little") != 3 or data[12] != 1:
        raise ValueError("ProgramData không có upgrade authority")
    return str(Pubkey.from_bytes(data[13:45]))


def _metadata_matches(adapter: SolanaAdapter, settings: Settings) -> bool:
    mint_key = Pubkey.from_string(settings.game_token_mint)
    metadata = Pubkey.find_program_address(
        [b"metadata", bytes(TOKEN_METADATA_PROGRAM), bytes(mint_key)], TOKEN_METADATA_PROGRAM,
    )[0]
    account, raw = _account(adapter, str(metadata))
    if account.get("owner") != str(TOKEN_METADATA_PROGRAM) or len(raw) < 77 or raw[33:65] != bytes(mint_key):
        return False
    if str(Pubkey.from_bytes(raw[1:33])) != settings.mainnet_admin_multisig:
        return False
    offset = 65
    fields = []
    for _ in range(3):
        if len(raw) < offset + 4:
            return False
        length = int.from_bytes(raw[offset:offset + 4], "little")
        offset += 4
        if length > 512 or len(raw) < offset + length:
            return False
        fields.append(raw[offset:offset + length].decode("utf-8").rstrip("\x00"))
        offset += length
    return fields == [settings.game_token_name, settings.game_token_symbol, settings.game_token_metadata_uri]


def check_mainnet_readiness(
    settings: Settings,
    adapter: SolanaAdapter,
    dex_swaps: DexSwapRepository,
    reward_claims: RewardRepository,
) -> dict:
    if settings.solana_network != "mainnet-beta":
        return {"status": "ok", "network": settings.solana_network, "checks": {}}

    checks: dict[str, bool] = {}
    metrics: dict[str, int] = {}
    try:
        checks["rpc_mainnet"] = adapter.get_genesis_hash() == MAINNET_GENESIS
    except Exception:
        checks["rpc_mainnet"] = False
    if not checks["rpc_mainnet"]:
        return {"status": "unavailable", "network": settings.solana_network, "checks": checks, "metrics": metrics}

    try:
        mint = adapter.get_token_mint_info(settings.game_token_mint)
        treasury = adapter.get_token_account_info(settings.game_token_treasury_account)
        supply = int(settings.game_token_total_supply) * 10 ** settings.game_token_decimals
        checks["token"] = (
            mint["program_id"] == settings.game_token_program
            and mint["decimals"] == settings.game_token_decimals
            and int(mint["supply"]) == supply
            and mint["mint_authority"] is None
            and mint["freeze_authority"] is None
            and mint["is_initialized"]
            and treasury["mint"] == settings.game_token_mint
            and treasury["owner"] == settings.mainnet_treasury_multisig
            and 0 <= int(treasury["amount"]) <= supply
        )
    except Exception:
        checks["token"] = False

    try:
        checks["token_metadata"] = _metadata_matches(adapter, settings)
    except Exception:
        checks["token_metadata"] = False

    try:
        checks["program_upgrade_authority"] = (
            _program_authority(adapter, settings.solana_program_id) == settings.mainnet_upgrade_authority
        )
    except Exception:
        checks["program_upgrade_authority"] = False

    try:
        config = adapter.get_reward_distributor_info(settings.reward_distributor_config)
        vault = adapter.get_token_account_info(settings.reward_distributor_vault)
        metrics["reward_vault_base_units"] = int(vault["amount"])
        checks["reward_distributor"] = (
            config["admin"] == settings.mainnet_admin_multisig
            and config["distributor"] == settings.reward_distributor_authority
            and config["mint"] == settings.game_token_mint
            and config["vault"] == settings.reward_distributor_vault
            and config["max_reward_amount"] == str(settings.reward_max_amount_base_units)
            and not config["paused"]
            and vault["mint"] == settings.game_token_mint
            and vault["owner"] == settings.reward_distributor_config
            and vault["decimals"] == settings.game_token_decimals
            and vault["state"] == "initialized"
        )
        checks["reward_vault_funded"] = (
            metrics["reward_vault_base_units"] >= settings.reward_vault_alert_threshold_base_units
        )
    except Exception:
        checks["reward_distributor"] = False
        checks["reward_vault_funded"] = False

    try:
        checks["reward_signer"] = (
            str(adapter._load_reward_distributor_keypair().pubkey()) == settings.reward_distributor_authority
        )
    except Exception:
        checks["reward_signer"] = False

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    try:
        with dex_swaps.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            metrics["stale_dex_swaps"] = connection.scalar(select(func.count()).select_from(DexSwapModel).where(
                DexSwapModel.network == "mainnet-beta",
                DexSwapModel.status == "pending_confirmation",
                DexSwapModel.updated_at < cutoff,
            )) or 0
        with reward_claims.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            metrics["stale_reward_claims"] = connection.scalar(select(func.count()).select_from(RewardClaimModel).where(
                RewardClaimModel.network == "mainnet-beta",
                RewardClaimModel.status.in_(("submitted", "submission_unknown")),
                RewardClaimModel.updated_at < cutoff,
            )) or 0
        checks["database"] = True
        checks["no_stale_submissions"] = metrics["stale_dex_swaps"] == 0 and metrics["stale_reward_claims"] == 0
    except Exception:
        checks["database"] = False
        checks["no_stale_submissions"] = False

    return {
        "status": "ok" if all(checks.values()) else "unavailable",
        "network": settings.solana_network,
        "checks": checks,
        "metrics": metrics,
    }
