from fastapi import APIRouter, HTTPException, Request

from app.blockchain.adapter_resolver import UnsupportedChainError
from app.core.store import store
from app.schemas import TransactionOut
from app.core.config import get_settings

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


@router.get("/solana/config")
def solana_config():
    settings = get_settings()
    return {"chain": "solana", "network": settings.solana_network,
            "program_id": settings.solana_program_id}


@router.get("/solana/game-token")
def solana_game_token(request: Request):
    settings = request.app.state.settings
    adapter = request.app.state.resolver.get("solana")
    on_chain = adapter.get_token_mint_info(settings.game_token_mint)
    treasury_on_chain = adapter.get_token_account_info(settings.game_token_treasury_account)
    expected_supply = str(int(settings.game_token_total_supply) * (10 ** settings.game_token_decimals))
    verified = (
        settings.solana_network == "devnet"
        and on_chain["program_id"] == settings.game_token_program
        and on_chain["decimals"] == settings.game_token_decimals
        and on_chain["supply"] == expected_supply
        and on_chain["mint_authority"] is None
        and on_chain["freeze_authority"] is None
        and on_chain["is_initialized"]
        and treasury_on_chain["mint"] == settings.game_token_mint
        and treasury_on_chain["owner"] == settings.game_token_treasury_owner
        and treasury_on_chain["amount"] == expected_supply
        and treasury_on_chain["decimals"] == settings.game_token_decimals
        and treasury_on_chain["state"] == "initialized"
    )
    return {
        "network": settings.solana_network,
        "name": settings.game_token_name,
        "symbol": settings.game_token_symbol,
        "mint": settings.game_token_mint,
        "decimals": settings.game_token_decimals,
        "total_supply": settings.game_token_total_supply,
        "token_program": settings.game_token_program,
        "treasury_owner": settings.game_token_treasury_owner,
        "treasury_token_account": settings.game_token_treasury_account,
        "metadata_uri": settings.game_token_metadata_uri,
        "explorer_url": f"https://explorer.solana.com/address/{settings.game_token_mint}?cluster={settings.solana_network}",
        "verified": verified,
        "on_chain": on_chain,
        "treasury_on_chain": treasury_on_chain,
    }


@router.get("/{chain}/transaction/{digest}", response_model=TransactionOut)
def get_transaction(chain: str, digest: str, request: Request):
    try:
        adapter = request.app.state.resolver.get(chain)
    except UnsupportedChainError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    tx = adapter.get_transaction(digest)
    if tx is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy transaction")
    store.mark_reward_status(chain, digest, tx.status)
    return TransactionOut(
        digest=tx.digest,
        status=tx.status,
        sender=tx.sender,
        timestamp_ms=tx.timestamp_ms,
        events=tx.events,
    )
