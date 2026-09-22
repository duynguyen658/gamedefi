from __future__ import annotations

from typing import Any

import httpx

from app.dex.interface import DexExecution, DexOrder, DexOrderRequestData, DexProvider, DexProviderError


class JupiterDexProvider(DexProvider):
    name = "jupiter"
    supports_execution = True

    def __init__(self, api_key: str, base_url: str, client: httpx.Client | None = None):
        self.api_key = api_key
        self.supports_execution = bool(api_key)
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=12.0)

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.api_key:
            raise DexProviderError("Thiếu JUPITER_API_KEY cho DEX Mainnet")
        headers = {"x-api-key": self.api_key, **kwargs.pop("headers", {})}
        try:
            response = self.client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DexProviderError("Jupiter hiện không trả lời hợp lệ") from exc
        if not isinstance(payload, dict):
            raise DexProviderError("Jupiter trả dữ liệu không hợp lệ")
        return payload

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    def get_order(self, request: DexOrderRequestData) -> DexOrder:
        payload = self._request(
            "GET",
            "/order",
            params={
                "inputMint": request.input_token.mint,
                "outputMint": request.output_token.mint,
                "amount": request.amount,
                "taker": request.wallet,
                "slippageBps": str(request.slippage_bps),
            },
        )
        request_id = payload.get("requestId")
        out_amount = payload.get("outAmount")
        if not isinstance(request_id, str) or not request_id or not str(out_amount).isdigit():
            raise DexProviderError("Jupiter không trả requestId hoặc outAmount hợp lệ")
        transaction = payload.get("transaction")
        if transaction is not None and not isinstance(transaction, str):
            raise DexProviderError("Jupiter trả transaction không hợp lệ")
        executable = bool(transaction)
        return DexOrder(
            request_id=request_id,
            input_symbol=request.input_token.symbol,
            output_symbol=request.output_token.symbol,
            in_amount=str(payload.get("inAmount") or request.amount),
            out_amount=str(out_amount),
            input_decimals=request.input_token.decimals,
            output_decimals=request.output_token.decimals,
            provider=self.name,
            router=str(payload.get("router") or "jupiter"),
            mode=str(payload.get("mode") or "manual"),
            fee_bps=self._optional_int(payload.get("feeBps")) or 0,
            slippage_bps=request.slippage_bps,
            transaction=transaction or None,
            executable=executable,
            simulation=False,
            expires_at=self._optional_int(payload.get("expireAt")),
            last_valid_block_height=self._optional_int(payload.get("lastValidBlockHeight")),
            warning=str(payload.get("errorMessage")) if payload.get("errorMessage") else None,
        )

    def execute(self, signed_transaction: str, request_id: str) -> DexExecution:
        payload = self._request(
            "POST",
            "/execute",
            headers={"Content-Type": "application/json"},
            json={"signedTransaction": signed_transaction, "requestId": request_id},
        )
        status = str(payload.get("status") or "Failed")
        return DexExecution(
            status=status,
            signature=str(payload["signature"]) if payload.get("signature") else None,
            code=self._optional_int(payload.get("code")) or 0,
            total_input_amount=str(payload["totalInputAmount"]) if payload.get("totalInputAmount") else None,
            total_output_amount=str(payload["totalOutputAmount"]) if payload.get("totalOutputAmount") else None,
            error=str(payload["error"]) if payload.get("error") else None,
        )
