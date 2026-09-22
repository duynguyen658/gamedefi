from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from solders.signature import Signature
from solders.transaction import VersionedTransaction

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal
from app.dex.interface import DexOrderRequestData, DexProviderError, token_registry
from app.dex.persistence import (
    DexIdempotencyConflict,
    DexOrderUnavailable,
    DexPersistenceError,
    intent_digest,
)
from app.dex.reconciliation import reconcile_wallet
from app.dex.schemas import (
    DexExecuteRequest,
    DexExecutionOut,
    DexOrderOut,
    DexOrderRequest,
    DexReconciliationOut,
    DexSwapHistoryOut,
)

router = APIRouter(prefix="/dex", tags=["dex"])


def persistence_error(exc: DexPersistenceError) -> HTTPException:
    status = 409 if isinstance(exc, (DexIdempotencyConflict, DexOrderUnavailable)) else 503
    return HTTPException(status_code=status, detail=str(exc))


def signed_transaction_signature(value: str, expected_wallet: str) -> str:
    try:
        transaction = VersionedTransaction.from_bytes(base64.b64decode(value, validate=True))
        if not transaction.signatures or transaction.signatures[0] == Signature.default():
            raise ValueError("Giao dịch chưa được ví ký")
        transaction.verify_and_hash_message()
        account_keys = transaction.message.account_keys
        if not account_keys or str(account_keys[0]) != expected_wallet:
            raise ValueError("Ví ký không phải fee payer của giao dịch DEX")
        return str(transaction.signatures[0])
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("signed_transaction không phải Solana versioned transaction hợp lệ") from exc


@router.get("/config")
def dex_config(request: Request):
    settings = request.app.state.settings
    provider = request.app.state.dex_provider
    return {
        "network": settings.solana_network,
        "provider": provider.name,
        "supports_execution": provider.supports_execution,
        "persistence": "sql",
        "tokens": [token.__dict__ for token in token_registry(settings.solana_network).values()],
    }


@router.post("/order", response_model=DexOrderOut)
def create_order(body: DexOrderRequest, request: Request, principal: SessionPrincipal = Depends(require_session)):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể tạo lệnh DEX")
    network = request.app.state.settings.solana_network
    digest = intent_digest(
        wallet=body.wallet, network=network, input_symbol=body.input_symbol,
        output_symbol=body.output_symbol, amount=body.amount, slippage_bps=body.slippage_bps,
    )
    repository = request.app.state.dex_swaps
    try:
        existing = repository.get_idempotent(network=network, wallet=body.wallet, key=body.idempotency_key)
        if existing:
            if existing.intent_hash != digest:
                raise DexIdempotencyConflict("Khóa idempotency đã được dùng cho một lệnh khác")
            return DexOrderOut(**existing.to_order().__dict__)
        tokens = token_registry(network)
        order = request.app.state.dex_provider.get_order(DexOrderRequestData(
            wallet=body.wallet,
            input_token=tokens[body.input_symbol],
            output_token=tokens[body.output_symbol],
            amount=body.amount,
            slippage_bps=body.slippage_bps,
        ))
        saved = repository.save_order(
            network=network, wallet=body.wallet, key=body.idempotency_key, digest=digest, order=order,
        )
        return DexOrderOut(**saved.to_order().__dict__)
    except DexProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except DexPersistenceError as exc:
        raise persistence_error(exc) from exc


@router.post("/execute", response_model=DexExecutionOut)
def execute_order(body: DexExecuteRequest, request: Request, principal: SessionPrincipal = Depends(require_session)):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể thực thi DEX")
    try:
        signature = signed_transaction_signature(body.signed_transaction, body.wallet)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    repository = request.app.state.dex_swaps
    try:
        repository.reserve_execution(request_id=body.request_id, wallet=body.wallet, signature=signature)
        result = request.app.state.dex_provider.execute(body.signed_transaction, body.request_id)
        if result.signature and result.signature != signature:
            repository.mark_submission_uncertain(body.request_id, "DEX provider trả signature không khớp giao dịch đã ký")
            raise HTTPException(status_code=502, detail="DEX provider trả signature không khớp giao dịch đã ký")
        repository.mark_execution(body.request_id, result)
        return DexExecutionOut(**result.__dict__)
    except DexProviderError as exc:
        repository.mark_submission_uncertain(body.request_id, str(exc))
        raise HTTPException(status_code=503, detail=f"{exc}. Lệnh đã được giữ để đối soát; không gửi lại.") from exc
    except DexPersistenceError as exc:
        raise persistence_error(exc) from exc


@router.get("/history", response_model=list[DexSwapHistoryOut])
def dex_history(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    principal: SessionPrincipal = Depends(require_session),
):
    if principal.is_guest:
        return []
    try:
        reconcile_wallet(request.app.state.dex_swaps, request.app.state.resolver.get("solana"), principal.wallet)
        return [DexSwapHistoryOut(**{field: getattr(item, field) for field in DexSwapHistoryOut.model_fields})
                for item in request.app.state.dex_swaps.list_wallet(principal.wallet, limit=limit, offset=offset)]
    except DexPersistenceError as exc:
        raise persistence_error(exc) from exc


@router.post("/reconcile", response_model=DexReconciliationOut)
def reconcile_dex(request: Request, principal: SessionPrincipal = Depends(require_session)):
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không có giao dịch DEX")
    try:
        result = reconcile_wallet(request.app.state.dex_swaps, request.app.state.resolver.get("solana"), principal.wallet)
        return DexReconciliationOut(**result.__dict__)
    except DexPersistenceError as exc:
        raise persistence_error(exc) from exc
