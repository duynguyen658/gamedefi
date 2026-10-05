from app.dex.interface import DexExecution, DexOrder
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


def test_history_can_exclude_automatic_quotes_and_other_networks():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    for network, request_id in (("devnet", "quote-only"), ("devnet", "completed"),
                                ("mainnet-beta", "other-network")):
        digest = intent_digest(
            wallet="wallet", network=network, input_symbol="SOL", output_symbol="USDC",
            amount="1000000000", slippage_bps=50,
        )
        repository.save_order(
            network=network, wallet="wallet", key=request_id, digest=digest,
            order=sample_order(request_id=request_id),
        )
    repository.reserve_execution(request_id="completed", wallet="wallet", signature="signature-completed")
    repository.mark_execution("completed", DexExecution("Success", "signature-completed", 0, None, None))
    repository.reserve_execution(request_id="other-network", wallet="wallet", signature="signature-mainnet")
    repository.mark_execution("other-network", DexExecution("Success", "signature-mainnet", 0, None, None))

    history = repository.list_wallet("wallet", network="devnet", executed_only=True)
    assert [item.request_id for item in history] == ["completed"]


def test_quote_cleanup_preserves_signed_history():
    from datetime import timedelta
    from app.dex.persistence import utcnow

    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    for request_id in ("unused-quote", "signed-swap"):
        repository.save_order(
            network="devnet", wallet="wallet", key=request_id, digest=request_id,
            order=sample_order(request_id=request_id),
        )
    repository.reserve_execution(request_id="signed-swap", wallet="wallet", signature="signed-signature")
    assert repository.purge_unused_quotes(older_than=utcnow() + timedelta(seconds=1)) == 1
    assert repository.get_order(network="devnet", wallet="wallet", request_id="unused-quote") is None
    assert repository.get_order(network="devnet", wallet="wallet", request_id="signed-swap") is not None


def test_reconciliation_queue_rotates_wallets_after_a_check():
    repository = DexSwapRepository("sqlite+pysqlite://", create_schema=True)
    for index in range(3):
        wallet = f"wallet-{index}"
        request_id = f"rotation-{index}"
        repository.save_order(
            network="devnet", wallet=wallet, key=request_id, digest=request_id,
            order=sample_order(request_id=request_id),
        )
        repository.reserve_execution(request_id=request_id, wallet=wallet, signature=f"signature-{index}")
    first = repository.wallets_needing_reconciliation(limit=2)
    assert len(first) == 2
    for wallet in first:
        row = repository.pending_wallet(wallet)[0]
        repository.mark_reconciliation_checked(row.request_id)
    assert repository.wallets_needing_reconciliation(limit=1)[0] not in first
