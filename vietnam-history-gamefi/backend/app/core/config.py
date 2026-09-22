from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "vn-history-gamefi-backend"

    # --- Solana ---
    solana_network: str = "devnet"
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_program_id: str = ""
    solana_gas_budget_lamports: int = 5_000_000
    reward_amount_lamports: int = 5_000_000

    nonce_ttl_seconds: int = 300
    session_ttl_seconds: int = 3_600
    # Comma-separated browser origins.  Keep this explicit because every
    # browser client sends bearer credentials for write operations.
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    factions_file: str = "assets/nft/factions.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
