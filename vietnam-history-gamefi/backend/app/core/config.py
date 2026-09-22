from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "vn-history-gamefi-backend"

    # SQLAlchemy URL. Production should use postgresql+psycopg.
    database_url: str = "sqlite+pysqlite:///./gamefi-dev.db"
    database_auto_create: bool = True

    # --- Solana ---
    solana_network: str = "devnet"
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_program_id: str = ""
    solana_gas_budget_lamports: int = 5_000_000
    reward_amount_lamports: int = 5_000_000

    # --- Fixed-supply HKDV game token (Solana Devnet, phase 4) ---
    game_token_name: str = "Hao Khi Dai Viet"
    game_token_symbol: str = "HKDV"
    game_token_mint: str = "45kZL6u62pbEmLiiZuUeuPWcotqZb8DLMmaPD5tNs1qm"
    game_token_decimals: int = 6
    game_token_total_supply: str = "1000000000"
    game_token_program: str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    game_token_treasury_owner: str = "HUQHQv86C6sqqEWMpq8VcUs6kmQo78EsDV9cgEC9GaLK"
    game_token_treasury_account: str = "3d3aVnwqsre4AfnvVCMvkLvLZ7YbxY3A6P5Er3wKg1Sp"
    game_token_metadata_uri: str = "https://raw.githubusercontent.com/duynguyen658/gamedefi/main/vietnam-history-gamefi/assets/token/hkdv.json"

    # --- DEX ---
    # The Jupiter key remains backend-only. Non-mainnet environments use the
    # explicitly labelled, non-executable mock provider.
    jupiter_api_key: str = ""
    jupiter_base_url: str = "https://api.jup.ag/swap/v2"
    dex_mock_sol_usdc_rate: float = 100.0

    nonce_ttl_seconds: int = 300
    session_ttl_seconds: int = 3_600
    # Comma-separated browser origins.  Keep this explicit because every
    # browser client sends bearer credentials for write operations.
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    factions_file: str = "assets/nft/factions.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
