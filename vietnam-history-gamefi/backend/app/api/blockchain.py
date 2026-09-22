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
