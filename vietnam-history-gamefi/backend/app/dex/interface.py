from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


SOL_MINT = "So11111111111111111111111111111111111111112"
MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


class DexProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class DexToken:
    symbol: str
    name: str
    mint: str
    decimals: int


@dataclass(frozen=True)
class DexOrderRequestData:
    wallet: str
    input_token: DexToken
    output_token: DexToken
    amount: str
    slippage_bps: int


@dataclass(frozen=True)
class DexOrder:
    request_id: str
    input_symbol: str
    output_symbol: str
    in_amount: str
    out_amount: str
    input_decimals: int
    output_decimals: int
    provider: str
    router: str
    mode: str
    fee_bps: int
    slippage_bps: int
    transaction: str | None
    executable: bool
    simulation: bool
    expires_at: int | None = None
    last_valid_block_height: int | None = None
    warning: str | None = None


@dataclass(frozen=True)
class DexExecution:
    status: str
    signature: str | None
    code: int
    total_input_amount: str | None
    total_output_amount: str | None
    error: str | None = None


def token_registry(network: str) -> dict[str, DexToken]:
    usdc_mint = MAINNET_USDC_MINT if network == "mainnet-beta" else DEVNET_USDC_MINT
    return {
        "SOL": DexToken("SOL", "Solana", SOL_MINT, 9),
        "USDC": DexToken("USDC", "USD Coin", usdc_mint, 6),
    }


class DexProvider(ABC):
    name: str
    supports_execution: bool

    @abstractmethod
    def get_order(self, request: DexOrderRequestData) -> DexOrder:
        raise NotImplementedError

    @abstractmethod
    def execute(self, signed_transaction: str, request_id: str) -> DexExecution:
        raise NotImplementedError
