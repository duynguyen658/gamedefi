from decimal import Decimal

from app.core.config import Settings
from app.dex.interface import DexProvider, DexProviderError
from app.dex.jupiter_provider import JupiterDexProvider
from app.dex.mock_provider import MockDexProvider


def create_dex_provider(settings: Settings) -> DexProvider:
    if settings.solana_network == "mainnet-beta":
        return JupiterDexProvider(settings.jupiter_api_key, settings.jupiter_base_url)
    if settings.solana_network in {"devnet", "localnet", "testnet"}:
        return MockDexProvider(Decimal(str(settings.dex_mock_sol_usdc_rate)))
    raise DexProviderError(f"Mạng {settings.solana_network} chưa được DEX hỗ trợ")
