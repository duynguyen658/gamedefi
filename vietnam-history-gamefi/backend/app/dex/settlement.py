"""Extract wallet deltas and the network fee from a confirmed Solana swap."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.dex.interface import token_registry
from app.dex.persistence import DexSwapRecord


@dataclass(frozen=True)
class DexSettlement:
    input_amount: str | None
    output_amount: str | None
    network_fee_lamports: int | None


def _token_amounts(entries: Any, wallet: str, mint: str) -> int:
    if not isinstance(entries, list):
        return 0
    total = 0
    for entry in entries:
        if not isinstance(entry, dict) or entry.get("owner") != wallet or entry.get("mint") != mint:
            continue
        raw = (entry.get("uiTokenAmount") or {}).get("amount")
        if isinstance(raw, str) and raw.isdigit():
            total += int(raw)
    return total


def _wallet_lamports(raw: dict[str, Any], wallet: str) -> tuple[int, int] | None:
    message = (raw.get("transaction") or {}).get("message") or {}
    keys = message.get("accountKeys") or []
    addresses = [key.get("pubkey") if isinstance(key, dict) else key for key in keys]
    try:
        index = addresses.index(wallet)
        meta = raw["meta"]
        return int(meta["preBalances"][index]), int(meta["postBalances"][index])
    except (ValueError, KeyError, IndexError, TypeError):
        return None


def extract_settlement(swap: DexSwapRecord, raw: Any) -> DexSettlement | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("meta"), dict):
        return None
    meta = raw["meta"]
    if meta.get("err") is not None:
        return None
    fee = meta.get("fee")
    fee_lamports = fee if isinstance(fee, int) and fee >= 0 else None
    tokens = token_registry(swap.network)

    def delta(symbol: str) -> int | None:
        if symbol == "SOL":
            balances = _wallet_lamports(raw, swap.wallet)
            if balances is None or fee_lamports is None:
                return None
            return balances[1] - balances[0] + fee_lamports
        mint = tokens.get(symbol)
        if mint is None:
            return None
        return (_token_amounts(meta.get("postTokenBalances"), swap.wallet, mint.mint)
                - _token_amounts(meta.get("preTokenBalances"), swap.wallet, mint.mint))

    output_delta = delta(swap.output_symbol)
    # These are exact-in swaps. The wallet's SOL delta may include temporary account rent.
    input_amount = swap.in_amount
    output_amount = str(output_delta) if output_delta is not None and output_delta > 0 else None
    return DexSettlement(input_amount, output_amount, fee_lamports)
