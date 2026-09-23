#!/usr/bin/env python3
"""Read-only release gate. Exits nonzero until every Mainnet check passes."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.blockchain.solana_adapter import SolanaAdapter  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.mainnet import mainnet_configuration_errors  # noqa: E402
from app.core.readiness import check_mainnet_readiness  # noqa: E402
from app.dex.interface import SOL_MINT  # noqa: E402
from app.dex.jupiter_provider import JupiterDexProvider  # noqa: E402
from app.dex.persistence import DexSwapRepository  # noqa: E402
from app.rewards.persistence import RewardRepository  # noqa: E402


def main() -> int:
    env_file = ROOT / "backend" / ".env"
    if not env_file.is_file():
        print(json.dumps({"status": "unavailable", "error": "backend/.env chưa tồn tại"}))
        return 1
    settings = Settings(_env_file=env_file)
    if settings.solana_network != "mainnet-beta":
        print(json.dumps({"status": "unavailable", "error": "SOLANA_NETWORK chưa là mainnet-beta"}))
        return 1
    errors = mainnet_configuration_errors(settings)
    if errors:
        print(json.dumps({"status": "unavailable", "configuration_errors": errors}, indent=2))
        return 1

    report = check_mainnet_readiness(
        settings,
        SolanaAdapter(settings),
        DexSwapRepository(settings.database_url),
        RewardRepository(settings.database_url),
    )
    routes = {}
    try:
        jupiter = JupiterDexProvider(settings.jupiter_api_key, settings.jupiter_base_url)
        for name, input_mint, output_mint, amount in (
            ("sol_to_hkdv", SOL_MINT, settings.game_token_mint, "10000000"),
            ("hkdv_to_sol", settings.game_token_mint, SOL_MINT, "100000000"),
        ):
            payload = jupiter._request("GET", "/order", params={
                "inputMint": input_mint, "outputMint": output_mint, "amount": amount,
            })
            routes[name] = str(payload.get("outAmount", "0")).isdigit() and int(payload.get("outAmount", 0)) > 0
    except Exception:
        routes.setdefault("sol_to_hkdv", False)
        routes.setdefault("hkdv_to_sol", False)
    report["checks"].update({f"jupiter_{name}": available for name, available in routes.items()})
    report["status"] = "ok" if all(report["checks"].values()) else "unavailable"
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
