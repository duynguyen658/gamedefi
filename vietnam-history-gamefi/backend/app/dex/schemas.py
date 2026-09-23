from __future__ import annotations

import base64
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.security import is_valid_solana_wallet


class DexOrderRequest(BaseModel):
    wallet: str
    input_symbol: Literal["SOL", "HKDV", "USDC"]
    output_symbol: Literal["SOL", "HKDV", "USDC"]
    amount: str = Field(pattern=r"^[1-9][0-9]{0,29}$")
    slippage_bps: int = Field(default=50, ge=1, le=500)
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")

    @field_validator("wallet")
    @classmethod
    def valid_wallet(cls, value: str) -> str:
        value = value.strip()
        if not is_valid_solana_wallet(value):
            raise ValueError("wallet phải là địa chỉ Solana base58 hợp lệ")
        return value

    @model_validator(mode="after")
    def distinct_tokens(self):
        if self.input_symbol == self.output_symbol:
            raise ValueError("Token bán và nhận phải khác nhau")
        return self


class DexOrderOut(BaseModel):
    request_id: str
    input_symbol: str
    output_symbol: str
    in_amount: str
    out_amount: str
    input_decimals: int
    output_decimals: int
    provider: str
    router: str
    mode: str
    fee_bps: int
    slippage_bps: int
    transaction: str | None
    executable: bool
    simulation: bool
    expires_at: int | None = None
    last_valid_block_height: int | None = None
    warning: str | None = None
    price_impact_bps: int = Field(default=0, ge=0)


class DexExecuteRequest(BaseModel):
    wallet: str
    request_id: str = Field(min_length=1, max_length=160)
    signed_transaction: str = Field(min_length=32, max_length=4096)

    @field_validator("wallet")
    @classmethod
    def valid_wallet(cls, value: str) -> str:
        value = value.strip()
        if not is_valid_solana_wallet(value):
            raise ValueError("wallet phải là địa chỉ Solana base58 hợp lệ")
        return value

    @field_validator("signed_transaction")
    @classmethod
    def valid_transaction(cls, value: str) -> str:
        try:
            decoded = base64.b64decode(value, validate=True)
        except ValueError as exc:
            raise ValueError("signed_transaction phải là base64 hợp lệ") from exc
        if not 64 <= len(decoded) <= 2048:
            raise ValueError("Kích thước signed_transaction không hợp lệ")
        return value


class DexExecutionOut(BaseModel):
    status: str
    signature: str | None
    code: int
    total_input_amount: str | None
    total_output_amount: str | None
    error: str | None = None


class DexSwapHistoryOut(BaseModel):
    request_id: str
    input_symbol: str
    output_symbol: str
    in_amount: str
    out_amount: str
    input_decimals: int
    output_decimals: int
    provider: str
    status: str
    simulation: bool
    signature: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class DexReconciliationOut(BaseModel):
    checked: int
    confirmed: int
    failed: int
    pending: int
