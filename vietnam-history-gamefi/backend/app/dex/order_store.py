from __future__ import annotations

import threading
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class PendingOrder:
    request_id: str
    wallet: str
    expires_at: float


class PendingOrderStore:
    """Short-lived stage-2 binding. PostgreSQL persistence is added in stage 3."""

    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._orders: dict[str, PendingOrder] = {}
        self._lock = threading.Lock()

    def add(self, request_id: str, wallet: str) -> None:
        with self._lock:
            now = time.time()
            self._orders = {key: order for key, order in self._orders.items() if order.expires_at > now}
            self._orders[request_id] = PendingOrder(request_id, wallet, now + self.ttl_seconds)

    def take(self, request_id: str, wallet: str) -> PendingOrder | None:
        with self._lock:
            order = self._orders.get(request_id)
            if order is None or order.wallet != wallet or order.expires_at <= time.time():
                if order is not None and order.expires_at <= time.time():
                    self._orders.pop(request_id, None)
                return None
            return self._orders.pop(request_id)

    def restore(self, order: PendingOrder) -> None:
        if order.expires_at <= time.time():
            return
        with self._lock:
            self._orders[order.request_id] = order
