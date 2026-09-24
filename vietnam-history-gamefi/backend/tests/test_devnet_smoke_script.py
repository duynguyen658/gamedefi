import importlib.util
import io
import json
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "smoke-devnet-deployment.py"
spec = importlib.util.spec_from_file_location("smoke_devnet_deployment", SCRIPT)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class Response(io.BytesIO):
    status = 200


def test_devnet_smoke_checks_the_expected_program_token_pool_and_readiness(monkeypatch):
    api = "https://api.example.test"
    site = "https://game.example.test"
    payloads = {
        site + "/": b'<html><div id="root"></div></html>',
        api + "/health/ready": {
            "status": "ok", "network": "devnet",
            "checks": {"rpc_devnet": True, "program": True, "reward_signer": True, "database": True},
        },
        api + "/blockchain/solana/config": {"network": "devnet", "program_id": smoke.PROGRAM_ID},
        api + "/blockchain/solana/game-token": {"mint": smoke.HKDV_MINT, "verified": True},
        api + "/blockchain/solana/reward-distributor": {"verified": True, "active": True},
        api + "/dex/config": {
            "network": "devnet", "provider": "raydium", "pool_id": smoke.RAYDIUM_POOL,
            "supports_execution": True, "persistence": "sql",
        },
    }

    def fake_urlopen(url, timeout):
        assert timeout == 20
        value = payloads[url]
        return Response(value if isinstance(value, bytes) else json.dumps(value).encode())

    monkeypatch.setattr(smoke, "urlopen", fake_urlopen)
    smoke.validate(api, site)

    payloads[api + "/dex/config"]["pool_id"] = "wrong-pool"
    with pytest.raises(ValueError, match="expected Devnet pool"):
        smoke.validate(api, site)
