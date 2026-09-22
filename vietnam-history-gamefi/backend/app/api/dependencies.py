"""Authentication dependencies shared by state-changing API routes."""
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

from app.core.security import SessionPrincipal, normalize_wallet


def require_session(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> SessionPrincipal:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Thiếu phiên đăng nhập")
    token = authorization.removeprefix("Bearer ").strip()
    principal = request.app.state.session_store.get(token)
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn")
    return principal


def require_wallet(principal: SessionPrincipal, wallet: str) -> None:
    if normalize_wallet(principal.chain, wallet) != principal.wallet:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ví trong request không thuộc phiên đăng nhập")
