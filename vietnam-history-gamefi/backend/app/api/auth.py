from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.security import LOGIN_MESSAGE_TEMPLATE, NonceStore, SessionStore, verify_wallet_signature
from app.core.store import store
from app.schemas import (
    GuestLoginRequest,
    NonceRequest,
    NonceResponse,
    AuthenticatedPlayerOut,
    WalletVerifyRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_nonce_store(request: Request) -> NonceStore:
    return request.app.state.nonce_store


def get_session_store(request: Request) -> SessionStore:
    return request.app.state.session_store


def _authenticated_player(player, access_token: str) -> AuthenticatedPlayerOut:
    return AuthenticatedPlayerOut(
        wallet=player.wallet,
        chain=player.chain,
        username=player.username,
        faction_id=player.faction_id,
        nft_object_id=player.nft_object_id,
        level=player.level,
        rice=player.rice,
        gold=player.gold,
        morale=player.morale,
        is_guest=player.is_guest,
        access_token=access_token,
    )


@router.post("/nonce", response_model=NonceResponse)
def create_nonce(body: NonceRequest, nonces: NonceStore = Depends(get_nonce_store)):
    nonce, message = nonces.create(body.chain, body.wallet)
    return NonceResponse(nonce=nonce, message=message)


@router.post("/wallet", response_model=AuthenticatedPlayerOut)
def verify_wallet(
    body: WalletVerifyRequest,
    nonces: NonceStore = Depends(get_nonce_store),
    sessions: SessionStore = Depends(get_session_store),
):
    if body.message != LOGIN_MESSAGE_TEMPLATE.format(nonce=body.nonce):
        raise HTTPException(status_code=400, detail="Message không khớp wallet challenge")
    if not nonces.is_valid(body.chain, body.wallet, body.nonce):
        raise HTTPException(status_code=400, detail="Nonce không hợp lệ hoặc hết hạn")
    if not verify_wallet_signature(body.chain, body.wallet, body.message.encode("utf-8"), body.signature):
        raise HTTPException(status_code=401, detail="Chữ ký ví không hợp lệ")
    # Consume only after signature verification. A bad signature must not be
    # able to burn a legitimate challenge issued to this wallet.
    if not nonces.consume(body.chain, body.wallet, body.nonce):
        raise HTTPException(status_code=400, detail="Nonce đã được sử dụng")
    player = store.get_or_create_player(body.chain, body.wallet)
    return _authenticated_player(player, sessions.create(player.chain, player.wallet))


@router.post("/guest", response_model=AuthenticatedPlayerOut)
def guest_login(body: GuestLoginRequest | None = None, sessions: SessionStore = Depends(get_session_store)):
    """Đăng nhập trải nghiệm Free-to-Play không cần kết nối ví (Section 13 & 14)."""
    uname = body.username if body else None
    player = store.create_guest_player(uname)
    return _authenticated_player(player, sessions.create(player.chain, player.wallet, is_guest=True))
