"""Extract wallet deltas and the network fee from a confirmed Solana swap."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.dex.interface import SOL_MINT, token_registry
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


def _parsed_instructions(raw: dict[str, Any]) -> list[dict[str, Any]]:
    outer = (raw.get("transaction") or {}).get("message") or {}
    groups = (raw.get("meta") or {}).get("innerInstructions") or []
    instructions = list(outer.get("instructions") or [])
    for group in groups:
        if isinstance(group, dict):
            instructions.extend(group.get("instructions") or [])
    return [item for item in instructions if isinstance(item, dict)]


def _received_wsol_from_vault(raw: dict[str, Any], wallet: str) -> int | None:
    """Read the Raydium WSOL transfer into an account closed back to this wallet."""
    meta = raw["meta"]
    keys = ((raw.get("transaction") or {}).get("message") or {}).get("accountKeys") or []
    addresses = [key.get("pubkey") if isinstance(key, dict) else key for key in keys]
    vault_sources = set()
    for entry in meta.get("preTokenBalances") or []:
        if (isinstance(entry, dict) and entry.get("mint") == SOL_MINT
                and entry.get("owner") != wallet):
            index = entry.get("accountIndex")
            if isinstance(index, int) and 0 <= index < len(addresses):
                vault_sources.add(addresses[index])
    instructions = _parsed_instructions(raw)
    closed_accounts = set()
    for instruction in instructions:
        parsed = instruction.get("parsed") or {}
        if not isinstance(parsed, dict):
            continue
        info = parsed.get("info") or {}
        if parsed.get("type") == "closeAccount" and info.get("destination") == wallet:
            closed_accounts.add(info.get("account"))
    if not vault_sources or not closed_accounts:
        return None
    received = 0
    for instruction in instructions:
        parsed = instruction.get("parsed") or {}
        if not isinstance(parsed, dict) or parsed.get("type") not in {"transfer", "transferChecked"}:
            continue
        info = parsed.get("info") or {}
        if info.get("source") not in vault_sources or info.get("destination") not in closed_accounts:
            continue
        amount = info.get("amount") or (info.get("tokenAmount") or {}).get("amount")
        if isinstance(amount, str) and amount.isdigit():
            received += int(amount)
    return received if received > 0 else None


def _has_sol_account_rent_changes(raw: dict[str, Any], wallet: str) -> bool:
    for instruction in _parsed_instructions(raw):
        parsed = instruction.get("parsed") or {}
        if not isinstance(parsed, dict):
            continue
        info = parsed.get("info") or {}
        if (parsed.get("type") in {"createAccount", "createAccountWithSeed"}
                and info.get("source") == wallet):
            return True
        if parsed.get("type") == "closeAccount" and info.get("destination") == wallet:
            return True
    return False


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
            exact = _received_wsol_from_vault(raw, swap.wallet)
            if exact is not None:
                return exact
            if _has_sol_account_rent_changes(raw, swap.wallet):
                return None
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
    # These are exact-in swaps. Never label a rent-affected SOL balance delta as output.
    input_amount = swap.in_amount
    output_amount = str(output_delta) if output_delta is not None and output_delta > 0 else None
    return DexSettlement(input_amount, output_amount, fee_lamports)
