"""Fail closed when a Mainnet deployment still contains Devnet identities."""

from pathlib import Path
from urllib.parse import urlparse

from solders.pubkey import Pubkey

from app.core.config import Settings


DEVNET_ADDRESSES = {
    "8qUBTgX99v5EhxbAaxuqS94rgfRhnLrTgW66Gh9BvLKN",
    "45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm",
    "HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK",
    "3d3aVnwqsre4AfnvVCMvkLvLZ7YbxY3A6P5Er3wKg1Sp",
    "3MHpXEzsFkeJeYdPMmnL8LMCY3r3Ew3wm753fZacTCuw",
    "oV3Y4Z6DvPvBWGvbgLvfjxHoyVbWZkr1KHmNMHLDA7T",
    "9ngszc2V6RBRxgtagHCsn6s369aZoKWHb8uXShZAhoS7",
    "6RigAPgKTdEwxmRqaoMiJj6GYnkipTSwRRc9Wkw79rTv",
}
MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"


def mainnet_configuration_errors(settings: Settings) -> list[str]:
    if settings.solana_network != "mainnet-beta":
        return []

    errors: list[str] = []
    addresses = {
        "SOLANA_PROGRAM_ID": settings.solana_program_id,
        "GAME_TOKEN_MINT": settings.game_token_mint,
        "GAME_TOKEN_TREASURY_OWNER": settings.game_token_treasury_owner,
        "GAME_TOKEN_TREASURY_ACCOUNT": settings.game_token_treasury_account,
        "REWARD_DISTRIBUTOR_CONFIG": settings.reward_distributor_config,
        "REWARD_DISTRIBUTOR_ADMIN": settings.reward_distributor_admin,
        "REWARD_DISTRIBUTOR_VAULT": settings.reward_distributor_vault,
        "REWARD_DISTRIBUTOR_AUTHORITY": settings.reward_distributor_authority,
        "MAINNET_TREASURY_MULTISIG": settings.mainnet_treasury_multisig,
        "MAINNET_ADMIN_MULTISIG": settings.mainnet_admin_multisig,
        "MAINNET_UPGRADE_AUTHORITY": settings.mainnet_upgrade_authority,
    }
    for name, value in addresses.items():
        if not value or value in DEVNET_ADDRESSES:
            errors.append(f"{name} phải là địa chỉ Mainnet riêng")
            continue
        try:
            Pubkey.from_string(value)
        except ValueError:
            errors.append(f"{name} không phải địa chỉ Solana hợp lệ")

    if settings.game_token_treasury_owner != settings.mainnet_treasury_multisig:
        errors.append("GAME_TOKEN_TREASURY_OWNER phải khớp MAINNET_TREASURY_MULTISIG")
    if settings.reward_distributor_admin != settings.mainnet_admin_multisig:
        errors.append("REWARD_DISTRIBUTOR_ADMIN phải khớp MAINNET_ADMIN_MULTISIG")
    if not settings.jupiter_api_key.strip():
        errors.append("JUPITER_API_KEY còn trống")
    if settings.jupiter_base_url.rstrip("/") != "https://api.jup.ag/swap/v2":
        errors.append("JUPITER_BASE_URL phải là API Jupiter chính thức")
    rpc = urlparse(settings.solana_rpc_url)
    if rpc.scheme != "https" or not rpc.hostname or "devnet" in rpc.hostname or "testnet" in rpc.hostname:
        errors.append("SOLANA_RPC_URL phải là HTTPS Mainnet RPC")
    if not settings.database_url.startswith("postgresql+psycopg://") or settings.database_auto_create:
        errors.append("Mainnet cần PostgreSQL và DATABASE_AUTO_CREATE=false")
    if not settings.reward_distributor_keypair_path or "devnet" in Path(settings.reward_distributor_keypair_path).name.lower():
        errors.append("REWARD_DISTRIBUTOR_KEYPAIR_PATH phải là signer Mainnet riêng")
    if settings.reward_distributor_authority in {
        settings.mainnet_treasury_multisig, settings.mainnet_admin_multisig, settings.mainnet_upgrade_authority,
    }:
        errors.append("REWARD_DISTRIBUTOR_AUTHORITY phải tách khỏi các multisig quản trị")
    origins = [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()]
    if not origins or any(urlparse(origin).scheme != "https" for origin in origins):
        errors.append("CORS_ALLOW_ORIGINS phải chỉ chứa HTTPS origin production")
    return errors


def validate_mainnet_configuration(settings: Settings) -> None:
    errors = mainnet_configuration_errors(settings)
    if errors:
        raise ValueError("Cấu hình Mainnet chưa an toàn: " + "; ".join(errors))
