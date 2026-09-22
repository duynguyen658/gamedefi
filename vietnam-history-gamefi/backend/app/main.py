from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.blockchain.solana_adapter import SolanaAdapterError

from app.api import advisor, army, auth, battle, blockchain, dex, faction, leaderboard, marketplace, quest, reward
from app.blockchain.adapter_resolver import AdapterResolver
from app.core.config import get_settings
from app.core.security import NonceStore, SessionStore
from app.dex.order_store import PendingOrderStore
from app.dex.resolver import create_dex_provider


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Hào Khí Đại Việt — Gameplay-First Strategy Game")

    @app.exception_handler(SolanaAdapterError)
    async def solana_unavailable(_request, exc):
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
    app.state.session_store = SessionStore(settings.session_ttl_seconds)
    app.state.dex_provider = create_dex_provider(settings)
    app.state.dex_orders = PendingOrderStore(settings.dex_order_ttl_seconds)

    # Core Game Domain routers (100% off-chain)
    app.include_router(auth.router)
    app.include_router(faction.router)
    app.include_router(advisor.router)
    app.include_router(army.router)
    app.include_router(battle.router)
    app.include_router(quest.router)
    app.include_router(leaderboard.router)

    # Optional Marketplace & Blockchain routers
    app.include_router(marketplace.router)
    app.include_router(blockchain.router)
    app.include_router(reward.router)
    app.include_router(dex.router)

    @app.get("/health")
    def health() -> dict:
        return {
            "status": "ok",
            "mode": "gameplay_first",
            "tagline": "History is the Game. Blockchain is the Marketplace.",
        }

    return app


app = create_app()
