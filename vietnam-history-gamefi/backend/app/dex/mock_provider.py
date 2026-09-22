from __future__ import annotations

import time
import uuid
from decimal import Decimal, ROUND_DOWN

from app.dex.interface import DexExecution, DexOrder, DexOrderRequestData, DexProvider, DexProviderError


class MockDexProvider(DexProvider):
    """Devnet quote provider. It never creates or submits a transaction."""

    name = "mock"
    supports_execution = False

    def __init__(self, sol_usdc_rate: Decimal):
        if sol_usdc_rate <= 0:
            raise ValueError("DEX mock rate must be positive")
        self.sol_usdc_rate = sol_usdc_rate

    def get_order(self, request: DexOrderRequestData) -> DexOrder:
        input_ui = Decimal(request.amount) / (Decimal(10) ** request.input_token.decimals)
        if request.input_token.symbol == "SOL" and request.output_token.symbol == "USDC":
            output_ui = input_ui * self.sol_usdc_rate
        elif request.input_token.symbol == "USDC" and request.output_token.symbol == "SOL":
            output_ui = input_ui / self.sol_usdc_rate
        else:
            raise DexProviderError("Cặp token không được mock provider hỗ trợ")
        out_amount = int(
            (output_ui * (Decimal(10) ** request.output_token.decimals)).to_integral_value(rounding=ROUND_DOWN)
        )
        return DexOrder(
            request_id=f"mock_{uuid.uuid4().hex}",
            input_symbol=request.input_token.symbol,
            output_symbol=request.output_token.symbol,
            in_amount=request.amount,
            out_amount=str(out_amount),
            input_decimals=request.input_token.decimals,
            output_decimals=request.output_token.decimals,
            provider=self.name,
            router="devnet-simulator",
            mode="simulation",
            fee_bps=0,
            slippage_bps=request.slippage_bps,
            transaction=None,
            executable=False,
            simulation=True,
            expires_at=int(time.time()) + 30,
            warning="Báo giá Devnet chỉ dùng kiểm thử giao diện; không thể ký hoặc thực thi.",
        )

    def execute(self, signed_transaction: str, request_id: str) -> DexExecution:
        raise DexProviderError("Mock provider không thực thi giao dịch")
