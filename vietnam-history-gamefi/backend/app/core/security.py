"""Solana wallet authentication: raw Ed25519 messages and base58 signatures."""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass

import base58
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

LOGIN_MESSAGE_TEMPLATE = "vn-history-gamefi Solana wallet login: {nonce}"
SUPPORTED_CHAINS = ("solana",)


def normalize_wallet(chain: str, wallet: str) -> str:
    """Solana base58 addresses are case-sensitive; never lowercase them."""
    return wallet


def is_valid_solana_wallet(wallet: str) -> bool:
    try:
        return len(base58.b58decode(wallet)) == 32
    except (ValueError, TypeError):
        return False


def verify_solana_message(wallet: str, message: bytes, signature_b58: str) -> bool:
    try:
        public_key = base58.b58decode(wallet)
        signature = base58.b58decode(signature_b58)
        if len(public_key) != 32 or len(signature) != 64:
            return False
        VerifyKey(public_key).verify(message, signature)
        return True
    except (BadSignatureError, ValueError, TypeError):
        return False


def verify_wallet_signature(chain: str, wallet: str, message: bytes, signature: str) -> bool:
    return chain == "solana" and verify_solana_message(wallet, message, signature)


class NonceStore:
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        # Key by nonce so concurrent login prompts for the same wallet do not
        # invalidate each other. The wallet remains part of the stored binding.
        self._nonces: dict[str, tuple[str, str, float]] = {}
        self._lock = threading.Lock()

    def _entry_unlocked(self, chain: str, wallet: str, nonce: str) -> tuple[str, str, float] | None:
        entry = self._nonces.get(nonce)
        if entry is None:
            return None
        stored_chain, stored_wallet, expires_at = entry
        if time.time() >= expires_at:
            self._nonces.pop(nonce, None)
            return None
        if stored_chain != chain or stored_wallet != normalize_wallet(chain, wallet):
            return None
        return entry

    def create(self, chain: str, wallet: str) -> tuple[str, str]:
        nonce = secrets.token_hex(16)
        with self._lock:
            now = time.time()
            self._nonces = {
                key: entry for key, entry in self._nonces.items() if entry[2] > now
            }
            self._nonces[nonce] = (chain, normalize_wallet(chain, wallet), now + self.ttl)
        return nonce, LOGIN_MESSAGE_TEMPLATE.format(nonce=nonce)

    def is_valid(self, chain: str, wallet: str, nonce: str) -> bool:
        with self._lock:
            return self._entry_unlocked(chain, wallet, nonce) is not None

    def consume(self, chain: str, wallet: str, nonce: str) -> bool:
        with self._lock:
            if self._entry_unlocked(chain, wallet, nonce) is None:
                return False
            return self._nonces.pop(nonce, None) is not None


@dataclass(frozen=True)
class SessionPrincipal:
    """Authenticated identity kept server-side and addressed by a bearer token."""

    chain: str
    wallet: str
    is_guest: bool


class SessionStore:
    """Short-lived opaque sessions.

    The API deliberately does not trust a wallet copied into a URL or JSON
    payload.  An opaque token is preferable here to a self-signed JWT because
    it can be revoked simply by dropping it from this in-memory MVP store.
    """

    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self._sessions: dict[str, tuple[SessionPrincipal, float]] = {}

    def create(self, chain: str, wallet: str, is_guest: bool = False) -> str:
        token = secrets.token_urlsafe(32)
        principal = SessionPrincipal(
            chain=chain,
            wallet=normalize_wallet(chain, wallet),
            is_guest=is_guest,
        )
        self._sessions[token] = (principal, time.time() + self.ttl)
        return token

    def get(self, token: str) -> SessionPrincipal | None:
        entry = self._sessions.get(token)
        if entry is None:
            return None
        principal, expires_at = entry
        if time.time() >= expires_at:
            self._sessions.pop(token, None)
            return None
        return principal
