from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
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
    DexSubmissionRejected,
    SOL_MINT,
    token_registry,
)


FEE_DENOMINATOR = 1_000_000


@dataclass(frozen=True)
class PoolConfig:
    pool_id: str
    config_id: str
    wsol_vault: str
    token_vault: str
    token_mint: str


def _u64(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset:offset + 8], "little")


def _pubkey(data: bytes, offset: int) -> str:
    return str(Pubkey.from_bytes(data[offset:offset + 32]))


class RaydiumDexProvider(DexProvider):
    """Quote and submit swaps for allowlisted Raydium CPMM pools on Devnet."""

    name = "raydium"
    supports_execution = True

    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.rpc_url = settings.solana_rpc_url
        self.program_id = settings.raydium_cpmm_program_id
        tokens = token_registry("devnet")
        self.pools = {
            "USDC": PoolConfig(settings.raydium_usdc_pool_id, settings.raydium_usdc_config_id,
                               settings.raydium_usdc_wsol_vault, settings.raydium_usdc_token_vault,
                               tokens["USDC"].mint),
            "USDT": PoolConfig(settings.raydium_usdt_pool_id, settings.raydium_usdt_config_id,
                               settings.raydium_usdt_wsol_vault, settings.raydium_usdt_token_vault,
                               tokens["USDT"].mint),
        }
        self.http = client or httpx.Client(timeout=20.0)

    def required_transaction_accounts(self, router: str) -> tuple[str, str]:
        if router not in {pool.pool_id for pool in self.pools.values()}:
            raise DexProviderError("Pool không thuộc danh sách DEX Devnet")
        return self.program_id, router

    def _rpc(self, method: str, params: list[Any]) -> Any:
        try:
            response = self.http.post(self.rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": method, "params": params,
            })
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DexProviderError(f"Không thể kết nối Solana RPC cho Raydium: {method}") from exc
        if not isinstance(body, dict):
            raise DexProviderError(f"Solana RPC trả dữ liệu không hợp lệ: {method}")
        if body.get("error"):
            error = body["error"]
            code = error.get("code") if isinstance(error, dict) else None
            message = error.get("message") if isinstance(error, dict) else str(error)
            detail = str(message or "Lỗi không xác định")[:240]
            rpc_error = f"Solana RPC {method} (mã {code}): {detail}" if code is not None else f"Solana RPC {method}: {detail}"
            # A simulation/validation error is a definite rejection. Transport and
            # other RPC errors may happen after the transaction reached the node.
            if method == "sendTransaction" and (
                code in {-32002, -32602, -32003}
                or "simulation failed" in detail.lower()
                or "signature verification" in detail.lower()
            ):
                simulation = error.get("data", {}).get("err") if isinstance(error, dict) and isinstance(error.get("data"), dict) else None
                if simulation is not None:
                    rpc_error += f" · {str(simulation)[:160]}"
                raise DexSubmissionRejected(rpc_error)
            raise DexProviderError(rpc_error)
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

    def _pool_state(self, pool_config: PoolConfig) -> dict[str, int]:
        result = self._rpc("getMultipleAccounts", [[
            pool_config.pool_id, pool_config.config_id, pool_config.wsol_vault, pool_config.token_vault,
        ], {"encoding": "base64", "commitment": "confirmed"}])
        values = (result or {}).get("value") if isinstance(result, dict) else None
        if not isinstance(values, list) or len(values) != 4 or any(value is None for value in values):
            raise DexProviderError("Không đọc được pool SOL trên Solana Devnet")

        pool = self._decode_account(values[0], self.program_id)
        config = self._decode_account(values[1], self.program_id)
        wsol = self._decode_account(values[2], SPL_TOKEN_PROGRAM_ID)
        token = self._decode_account(values[3], SPL_TOKEN_PROGRAM_ID)
        if len(pool) < 413 or len(config) < 124 or len(wsol) < 72 or len(token) < 72:
            raise DexProviderError("Kích thước account Raydium không hợp lệ")

        if _pubkey(pool, 8) != pool_config.config_id:
            raise DexProviderError("Pool Raydium không dùng config đã cấu hình")
        pool_vault_a, pool_vault_b = _pubkey(pool, 72), _pubkey(pool, 104)
        pool_mint_a, pool_mint_b = _pubkey(pool, 168), _pubkey(pool, 200)
        if {pool_vault_a, pool_vault_b} != {pool_config.wsol_vault, pool_config.token_vault}:
            raise DexProviderError("Vault Raydium không khớp deployment record")
        if {pool_mint_a, pool_mint_b} != {SOL_MINT, pool_config.token_mint}:
            raise DexProviderError("Mint Raydium không khớp cặp SOL đã chọn")
        if _pubkey(wsol, 0) != SOL_MINT or _pubkey(token, 0) != pool_config.token_mint:
            raise DexProviderError("Mint của vault Raydium không hợp lệ")

        vault_balances = {pool_config.wsol_vault: _u64(wsol, 64), pool_config.token_vault: _u64(token, 64)}
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
            "token_reserve": reserves[pool_config.token_mint],
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
        pair = {request.input_token.symbol, request.output_token.symbol}
        target = next((symbol for symbol in self.pools if pair == {"SOL", symbol}), None)
        if target is None:
            raise DexProviderError("Raydium Devnet chỉ hỗ trợ SOL/USDC và SOL/USDT thử")
        pool_config = self.pools[target]
        amount = int(request.amount)
        state = self._pool_state(pool_config)
        input_reserve, output_reserve = (
            (state["sol_reserve"], state["token_reserve"])
            if request.input_token.symbol == "SOL"
            else (state["token_reserve"], state["sol_reserve"])
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
        if output * (10_000 - request.slippage_bps) // 10_000 <= 0:
            raise DexProviderError("Số lượng nhận tối thiểu quá nhỏ để swap an toàn")
        # Price impact describes the curve only; pool fees are shown separately.
        ideal_output = net_input * output_reserve // input_reserve
        if not creator_on_input:
            ideal_output -= self._ceil_fee(ideal_output, state["creator_fee_rate"])
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
            router=pool_config.pool_id,
            mode="exact-in",
            fee_bps=(state["trade_fee_rate"] + state["creator_fee_rate"]) // 100,
            slippage_bps=request.slippage_bps,
            transaction=None,
            executable=True,
            simulation=False,
            expires_at=int(time.time()) + 120,
            warning=f"{target} này là token thử trên Devnet; tỷ giá không phản ánh thị trường Mainnet.",
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
