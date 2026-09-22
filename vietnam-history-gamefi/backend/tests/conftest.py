import sys
from pathlib import Path

import base58
import pytest
from fastapi.testclient import TestClient
from solders.keypair import Keypair

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.main import create_app
from app.core.store import Store, store
from app.dex.persistence import DexSwapRepository
from fake_adapter import FakeAdapter


class StubResolver:
    def __init__(self, adapter):
        self.adapter = adapter

    def get(self, chain):
        from app.blockchain.adapter_resolver import UnsupportedChainError
        if chain != "solana":
            raise UnsupportedChainError("Only Solana is supported")
        return self.adapter


@pytest.fixture(autouse=True)
def reset_store():
    store.__dict__.update(Store().__dict__)


@pytest.fixture()
def adapter():
    return FakeAdapter()


@pytest.fixture()
def client(adapter):
    app = create_app()
    app.state.resolver = StubResolver(adapter)
    app.state.dex_swaps = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    with TestClient(app) as test_client:
        yield test_client


def make_wallet():
    key = Keypair()
    return key, str(key.pubkey())


def sign_message(key, message: str) -> str:
    return base58.b58encode(bytes(key.sign_message(message.encode("utf-8")))).decode()


def login(client, kp=None):
    key, wallet = make_wallet() if kp is None else (kp, str(kp.pubkey()))
    challenge = client.post("/auth/nonce", json={"chain": "solana", "wallet": wallet}).json()
    response = client.post("/auth/wallet", json={
        "chain": "solana", "wallet": wallet, **challenge,
        "signature": sign_message(key, challenge["message"]),
    })
    assert response.status_code == 200, response.text
    return wallet, response.json()


login_solana = login
