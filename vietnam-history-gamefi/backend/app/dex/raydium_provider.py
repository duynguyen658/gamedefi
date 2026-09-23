from __future__ import annotations

import base64
import time
import uuid
from typing import Any

import httpx
from solders.pubkey import Pubkey

from app.blockchain.solana_adapter import SPL_TOKEN_PROGRAM_ID
from app.core.config import Settings
from app.dex.interface import (
    DexExecution,
    DexOrder,
    DexOrderRequestData,
    DexProvider,
    DexProviderError,
    HKDV_MINT,
    SOL_MINT,
)


FEE_DENOMINATOR = 1_000_000


def _u64(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset:offset + 8], "little")


def _pubkey(data: bytes, offset: int) -> str:
    return str(Pubkey.from_bytes(data[offset:offset + 32]))


class RaydiumDexProvider(DexProvider):
    """Quote and submit swaps for one verified Raydium CPMM pool on Devnet."""

    name = "raydium"
    supports_execution = True

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.rpc_url = settings.solana_rpc_url
        self.program_id = settings.raydium_cpmm_program_id
        self.pool_id = settings.raydium_pool_id
        self.config_id = settings.raydium_config_id
        self.wsol_vault = settings.raydium_wsol_vault
        self.hkdv_vault = settings.raydium_hkdv_vault
        self.http = client or httpx.Client(timeout=20.0)

    def required_transaction_accounts(self) -> set[str]:
        return {self.program_id, self.pool_id}

    def _rpc(self, method: str, params: list[Any]) -> Any:
        try:
            response = self.http.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            })
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DexProviderError(f"Không thể kết nối Solana RPC cho Raydium: {method}") from exc
        if not isinstance(body, dict) or body.get("error"):
            raise DexProviderError(f"Solana RPC trả lỗi khi xử lý Raydium: {method}")
        return body.get("result")

    @staticmethod
    def _decode_account(item: dict[str, Any], expected_owner: str) -> bytes:
        if not isinstance(item, dict) or item.get("owner") != expected_owner:
            raise DexProviderError("Account Raydium không thuộc program đã cấu hình")
        try:
            encoded = item["data"][0]
            return base64.b64decode(encoded, validate=True)
        except (KeyError, TypeError, ValueError) as exc:
            raise DexProviderError("Solana RPC trả account Raydium không hợp lệ") from exc

    def _pool_state(self) -> dict[str, int]:
        result = self._rpc("getMultipleAccounts", [[
            self.pool_id, self.config_id, self.wsol_vault, self.hkdv_vault,
        ], {"encoding": "base64", "commitment": "confirmed"}])
        values = (result or {}).get("value") if isinstance(result, dict) else None
        if not isinstance(values, list) or len(values) != 4 or any(value is None for value in values):
            raise DexProviderError("Không đọc được pool HKDV/SOL từ Solana Devnet")

        pool = self._decode_account(values[0], self.program_id)
        config = self._decode_account(values[1], self.program_id)
        wsol = self._decode_account(values[2], SPL_TOKEN_PROGRAM_ID)
        hkdv = self._decode_account(values[3], SPL_TOKEN_PROGRAM_ID)
        if len(pool) < 413 or len(config) < 124 or len(wsol) < 72 or len(hkdv) < 72:
            raise DexProviderError("Kích thước account Raydium không hợp lệ")

        if _pubkey(pool, 8) != self.config_id:
            raise DexProviderError("Pool Raydium không dùng config đã cấu hình")
        pool_vault_a, pool_vault_b = _pubkey(pool, 72), _pubkey(pool, 104)
        pool_mint_a, pool_mint_b = _pubkey(pool, 168), _pubkey(pool, 200)
        if {pool_vault_a, pool_vault_b} != {self.wsol_vault, self.hkdv_vault}:
            raise DexProviderError("Vault Raydium không khớp deployment record")
        if {pool_mint_a, pool_mint_b} != {SOL_MINT, HKDV_MINT}:
            raise DexProviderError("Mint Raydium không phải cặp SOL/HKDV")
        if _pubkey(wsol, 0) != SOL_MINT or _pubkey(hkdv, 0) != HKDV_MINT:
            raise DexProviderError("Mint của vault Raydium không hợp lệ")

        vault_balances = {self.wsol_vault: _u64(wsol, 64), self.hkdv_vault: _u64(hkdv, 64)}
        fees_a = _u64(pool, 341) + _u64(pool, 357) + _u64(pool, 397)
        fees_b = _u64(pool, 349) + _u64(pool, 365) + _u64(pool, 405)
        reserves = {
            pool_mint_a: vault_balances[pool_vault_a] - fees_a,
            pool_mint_b: vault_balances[pool_vault_b] - fees_b,
        }
        if min(reserves.values()) <= 0:
            raise DexProviderError("Pool Raydium không còn đủ thanh khoản")
        return {
            "sol_reserve": reserves[SOL_MINT],
            "hkdv_reserve": reserves[HKDV_MINT],
            "trade_fee_rate": _u64(config, 12),
            "protocol_fee_rate": _u64(config, 20),
            "fund_fee_rate": _u64(config, 28),
            "creator_fee_rate": _u64(config, 108),
            "fee_on": pool[389],
        }

    @staticmethod
    def _ceil_fee(amount: int, rate: int) -> int:
        return (amount * rate + FEE_DENOMINATOR - 1) // FEE_DENOMINATOR

    def get_order(self, request: DexOrderRequestData) -> DexOrder:
        if {request.input_token.symbol, request.output_token.symbol} != {"SOL", "HKDV"}:
            raise DexProviderError("Raydium Devnet chỉ hỗ trợ cặp SOL/HKDV")
        amount = int(request.amount)
        state = self._pool_state()
        input_reserve, output_reserve = (
            (state["sol_reserve"], state["hkdv_reserve"])
            if request.input_token.symbol == "SOL"
            else (state["hkdv_reserve"], state["sol_reserve"])
        )
        trade_fee = self._ceil_fee(amount, state["trade_fee_rate"])
        creator_on_input = state["fee_on"] in (0, 2)
        creator_fee = self._ceil_fee(amount, state["creator_fee_rate"]) if creator_on_input else 0
        net_input = amount - trade_fee - creator_fee
        if net_input <= 0:
            raise DexProviderError("Số lượng quá nhỏ so với phí của pool")
        output_before_creator_fee = net_input * output_reserve // (input_reserve + net_input)
        output = output_before_creator_fee
        if not creator_on_input:
            output -= self._ceil_fee(output_before_creator_fee, state["creator_fee_rate"])
        if output <= 0:
            raise DexProviderError("Số lượng nhận quá nhỏ")
        ideal_output = amount * output_reserve // input_reserve
        price_impact_bps = max(0, (ideal_output - output) * 10_000 // ideal_output)

        return DexOrder(
            request_id=f"raydium_{uuid.uuid4().hex}",
            input_symbol=request.input_token.symbol,
            output_symbol=request.output_token.symbol,
            in_amount=request.amount,
            out_amount=str(output),
            input_decimals=request.input_token.decimals,
            output_decimals=request.output_token.decimals,
            provider=self.name,
            router=self.pool_id,
            mode="exact-in",
            fee_bps=(state["trade_fee_rate"] + state["creator_fee_rate"]) // 100,
            slippage_bps=request.slippage_bps,
            transaction=None,
            executable=True,
            simulation=False,
            expires_at=int(time.time()) + 120,
            warning="Raydium Devnet dùng tài sản thử nghiệm; SOL và HKDV không có giá trị thật.",
            price_impact_bps=price_impact_bps,
        )

    def execute(self, signed_transaction: str, request_id: str) -> DexExecution:
        del request_id
        signature = self._rpc("sendTransaction", [signed_transaction, {
            "encoding": "base64",
            "skipPreflight": False,
            "preflightCommitment": "confirmed",
            "maxRetries": 3,
        }])
        if not isinstance(signature, str) or not signature:
            raise DexProviderError("Solana RPC không trả chữ ký giao dịch Raydium")
        for _ in range(30):
            statuses = self._rpc("getSignatureStatuses", [[signature], {"searchTransactionHistory": True}])
            values = (statuses or {}).get("value") if isinstance(statuses, dict) else None
            status = values[0] if isinstance(values, list) and values else None
            if isinstance(status, dict):
                if status.get("err") is not None:
                    return DexExecution("Failed", signature, 1, None, None, str(status["err"]))
                if status.get("confirmationStatus") in {"confirmed", "finalized"}:
                    return DexExecution("Success", signature, 0, None, None)
            time.sleep(0.4)
        raise DexProviderError("Đã gửi swap nhưng RPC chưa xác nhận; hệ thống sẽ tự đối soát")
