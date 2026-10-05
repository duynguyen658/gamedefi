import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from time import monotonic

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import advisor, army, auth, battle, blockchain, dex, faction, leaderboard, marketplace, quest, reward, daily_quest
from app.blockchain.adapter_resolver import AdapterResolver
from app.blockchain.solana_adapter import SolanaAdapterError
from app.core.config import get_settings
from app.core.mainnet import validate_mainnet_configuration
from app.core.readiness import check_mainnet_readiness
from app.core.security import NonceStore, SessionStore
from app.dex.market_price import MarketPriceService
from app.dex.persistence import DexSwapRepository
from app.dex.reconciliation import reconcile_wallet
from app.dex.resolver import create_dex_provider
from app.rewards.persistence import RewardPersistenceError, RewardRepository


def create_app() -> FastAPI:
    settings = get_settings()
    validate_mainnet_configuration(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(reconcile_dex_forever())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Hào Khí Đại Việt — Gameplay-First Strategy Game", lifespan=lifespan)

    @app.exception_handler(SolanaAdapterError)
    async def solana_unavailable(_request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(RewardPersistenceError)
    async def reward_persistence_unavailable(_request, exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    allowed_origins = [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = settings
    app.state.resolver = AdapterResolver(settings)
    app.state.nonce_store = NonceStore(settings.nonce_ttl_seconds)
    app.state.session_store = SessionStore(
        settings.session_ttl_seconds, settings.database_url,
        create_schema=settings.database_auto_create,
    )
    app.state.dex_provider = create_dex_provider(settings)
    app.state.market_price = MarketPriceService()
    app.state.dex_swaps = DexSwapRepository(settings.database_url, create_schema=settings.database_auto_create)
    app.state.reward_claims = RewardRepository(settings.database_url, create_schema=settings.database_auto_create)

    last_quote_cleanup = monotonic() - 3600

    def reconcile_dex_queue() -> None:
        nonlocal last_quote_cleanup
        if monotonic() - last_quote_cleanup >= 3600:
            try:
                app.state.dex_swaps.purge_unused_quotes()
            except Exception:
                logging.getLogger(__name__).exception("DEX quote cleanup failed")
            last_quote_cleanup = monotonic()
        adapter = app.state.resolver.get("solana")
        for wallet in app.state.dex_swaps.wallets_needing_reconciliation(limit=20):
            try:
                reconcile_wallet(app.state.dex_swaps, adapter, wallet)
            except Exception:
                logging.getLogger(__name__).exception("DEX reconciliation failed for wallet %s", wallet)

    async def reconcile_dex_forever() -> None:
        while True:
            try:
                await asyncio.to_thread(reconcile_dex_queue)
            except Exception:
                logging.getLogger(__name__).exception("DEX reconciliation queue failed")
            await asyncio.sleep(30)

    app.include_router(auth.router)
    app.include_router(faction.router)
    app.include_router(advisor.router)
    app.include_router(army.router)
    app.include_router(battle.router)
    app.include_router(quest.router)
    app.include_router(daily_quest.router)
    app.include_router(leaderboard.router)
    app.include_router(marketplace.router)
    app.include_router(blockchain.router)
    app.include_router(reward.router)
    app.include_router(dex.router)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "mode": "gameplay_first", "tagline": "History is the Game. Blockchain is the Marketplace."}

    @app.get("/health/ready")
    def ready():
        report = check_mainnet_readiness(
            settings, app.state.resolver.get("solana"), app.state.dex_swaps, app.state.reward_claims,
        )
        if report["status"] != "ok":
            return JSONResponse(status_code=503, content=report)
        return report

    return app


app = create_app()
