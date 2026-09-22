"""Resolve the only supported blockchain: Solana."""
from app.core.config import Settings
from app.blockchain.solana_adapter import SolanaAdapter

SUPPORTED_CHAINS = ("solana",)


class UnsupportedChainError(ValueError):
    pass


class AdapterResolver:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._adapter = None

    def get(self, chain: str) -> SolanaAdapter:
        if chain.lower() != "solana":
            raise UnsupportedChainError("Chỉ hỗ trợ Solana")
        if self._adapter is None:
            self._adapter = SolanaAdapter(self._settings)
        return self._adapter
