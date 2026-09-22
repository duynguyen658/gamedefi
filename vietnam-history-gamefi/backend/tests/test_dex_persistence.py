from app.dex.interface import DexOrder
from app.dex.persistence import DexOrderUnavailable, DexSwapRepository, intent_digest


def sample_order(*, request_id: str = "persistent-request", expires_at: int | None = None) -> DexOrder:
    return DexOrder(
        request_id=request_id,
        input_symbol="SOL",
        output_symbol="USDC",
        in_amount="1000000000",
        out_amount="100000000",
        input_decimals=9,
        output_decimals=6,
        provider="test",
        router="test",
        mode="test",
        fee_bps=0,
        slippage_bps=50,
        transaction="unsigned",
        executable=True,
        simulation=False,
        expires_at=expires_at,
    )


def test_swap_survives_repository_restart(tmp_path):
    url = f"sqlite+pysqlite:///{(tmp_path / 'dex.sqlite3').as_posix()}"
    first = DexSwapRepository(url, create_schema=True)
    digest = intent_digest(
        wallet="wallet", network="devnet", input_symbol="SOL", output_symbol="USDC",
        amount="1000000000", slippage_bps=50,
    )
    first.save_order(
        network="devnet", wallet="wallet", key="persistent-key", digest=digest, order=sample_order(),
    )

    reopened = DexSwapRepository(url)
    saved = reopened.get_idempotent(network="devnet", wallet="wallet", key="persistent-key")
    assert saved is not None
    assert saved.request_id == "persistent-request"
    assert saved.status == "quoted"


def test_expired_order_is_persisted_as_expired():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    digest = intent_digest(
        wallet="wallet", network="devnet", input_symbol="SOL", output_symbol="USDC", amount="1", slippage_bps=50,
    )
    repository.save_order(
        network="devnet", wallet="wallet", key="expired-key", digest=digest,
        order=sample_order(request_id="expired-request", expires_at=1),
    )
    try:
        repository.reserve_execution(request_id="expired-request", wallet="wallet", signature="signature")
        raise AssertionError("expired order was accepted")
    except DexOrderUnavailable:
        pass
    assert repository.list_wallet("wallet")[0].status == "expired"
