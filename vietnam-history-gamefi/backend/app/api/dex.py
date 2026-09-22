from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal
from app.dex.interface import DexProviderError, token_registry
from app.dex.schemas import DexExecuteRequest, DexExecutionOut, DexOrderOut, DexOrderRequest
from app.dex.interface import DexOrderRequestData

router = APIRouter(prefix="/dex", tags=["dex"])


@router.get("/config")
def dex_config(request: Request):
    settings = request.app.state.settings
    provider = request.app.state.dex_provider
    return {
        "network": settings.solana_network,
        "provider": provider.name,
        "supports_execution": provider.supports_execution,
        "tokens": [token.__dict__ for token in token_registry(settings.solana_network).values()],
    }


@router.post("/order", response_model=DexOrderOut)
def create_order(
    body: DexOrderRequest,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể tạo lệnh DEX")
    tokens = token_registry(request.app.state.settings.solana_network)
    try:
        order = request.app.state.dex_provider.get_order(
            DexOrderRequestData(
                wallet=body.wallet,
                input_token=tokens[body.input_symbol],
                output_token=tokens[body.output_symbol],
                amount=body.amount,
                slippage_bps=body.slippage_bps,
            )
        )
    except DexProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if order.executable:
        request.app.state.dex_orders.add(order.request_id, body.wallet)
    return DexOrderOut(**order.__dict__)


@router.post("/execute", response_model=DexExecutionOut)
def execute_order(
    body: DexExecuteRequest,
    request: Request,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, body.wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể thực thi DEX")
    pending = request.app.state.dex_orders.take(body.request_id, body.wallet)
    if pending is None:
        raise HTTPException(status_code=409, detail="Lệnh DEX không tồn tại, đã hết hạn hoặc đã được sử dụng")
    try:
        result = request.app.state.dex_provider.execute(body.signed_transaction, body.request_id)
    except DexProviderError as exc:
        request.app.state.dex_orders.restore(pending)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return DexExecutionOut(**result.__dict__)
