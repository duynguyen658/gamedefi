import base64

from solders.keypair import Keypair

from app.core.config import Settings
from app.core.readiness import DEVNET_GENESIS, UPGRADEABLE_LOADER, check_devnet_readiness
from app.dex.persistence import DexSwapRepository
from app.rewards.persistence import RewardRepository


class DevnetAdapter:
    def __init__(self, program_id, signer):
        self.program_id = program_id
        self.signer = signer
        self.genesis = DEVNET_GENESIS

    def get_genesis_hash(self):
        return self.genesis

    def _rpc(self, method, params):
        assert method == "getAccountInfo"
        if params[0] != self.program_id:
            return {"value": None}
        return {"value": {
            "owner": UPGRADEABLE_LOADER,
            "executable": True,
            "data": [base64.b64encode(b"program").decode(), "base64"],
        }}

    def _load_reward_distributor_keypair(self):
        if self.signer is None:
            raise FileNotFoundError("signer missing")
        return self.signer


def test_devnet_ready_requires_rpc_program_signer_and_migrated_tables(tmp_path):
    program = str(Keypair().pubkey())
    signer = Keypair()
    settings = Settings(
        _env_file=None,
        solana_network="devnet",
        solana_program_id=program,
        reward_distributor_authority=str(signer.pubkey()),
    )
    database_url = f"sqlite+pysqlite:///{tmp_path / 'ready.db'}"
    swaps = DexSwapRepository(database_url, create_schema=True)
    claims = RewardRepository(database_url, create_schema=True)
    adapter = DevnetAdapter(program, signer)

    ready = check_devnet_readiness(settings, adapter, swaps, claims)
    assert ready["status"] == "ok"
    assert all(ready["checks"].values())

    adapter.genesis = "wrong cluster"
    assert check_devnet_readiness(settings, adapter, swaps, claims)["checks"]["rpc_devnet"] is False
    adapter.genesis = DEVNET_GENESIS
    adapter.signer = None
    assert check_devnet_readiness(settings, adapter, swaps, claims)["checks"]["reward_signer"] is False


def test_devnet_ready_rejects_unmigrated_database(tmp_path):
    program = str(Keypair().pubkey())
    signer = Keypair()
    settings = Settings(
        _env_file=None,
        solana_network="devnet",
        solana_program_id=program,
        reward_distributor_authority=str(signer.pubkey()),
    )
    database_url = f"sqlite+pysqlite:///{tmp_path / 'empty.db'}"
    swaps = DexSwapRepository(database_url, create_schema=False)
    claims = RewardRepository(database_url, create_schema=False)

    report = check_devnet_readiness(settings, DevnetAdapter(program, signer), swaps, claims)
    assert report["status"] == "unavailable"
    assert report["checks"]["database"] is False


def test_managed_postgres_url_uses_installed_driver():
    settings = Settings(_env_file=None, database_url="postgresql://user:password@db/gamefi")
    assert settings.database_url == "postgresql+psycopg://user:password@db/gamefi"
