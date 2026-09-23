from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text, UniqueConstraint, Uuid, create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from app.dex.interface import DexExecution, DexOrder


class DexPersistenceError(RuntimeError):
    pass


class DexIdempotencyConflict(DexPersistenceError):
    pass


class DexOrderUnavailable(DexPersistenceError):
    pass


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DexSwapModel(Base):
    __tablename__ = "dex_swaps"
    __table_args__ = (
        UniqueConstraint("network", "wallet", "idempotency_key", name="uq_dex_swap_idempotency"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    network: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    wallet: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    intent_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    request_id: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    input_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    output_symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    in_amount: Mapped[str] = mapped_column(String(40), nullable=False)
    out_amount: Mapped[str] = mapped_column(String(40), nullable=False)
    input_decimals: Mapped[int] = mapped_column(Integer, nullable=False)
    output_decimals: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    router: Mapped[str] = mapped_column(String(80), nullable=False)
    mode: Mapped[str] = mapped_column(String(40), nullable=False)
    fee_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    slippage_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    transaction: Mapped[str | None] = mapped_column(Text)
    executable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    simulation: Mapped[bool] = mapped_column(Boolean, nullable=False)
    expires_at: Mapped[int | None] = mapped_column(BigInteger)
    last_valid_block_height: Mapped[int | None] = mapped_column(BigInteger)
    warning: Mapped[str | None] = mapped_column(Text)
    price_impact_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    signature: Mapped[str | None] = mapped_column(String(128), unique=True)
    code: Mapped[int | None] = mapped_column(Integer)
    total_input_amount: Mapped[str | None] = mapped_column(String(40))
    total_output_amount: Mapped[str | None] = mapped_column(String(40))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


@dataclass(frozen=True)
class DexSwapRecord:
    id: str
    network: str
    wallet: str
    idempotency_key: str
    intent_hash: str
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
    expires_at: int | None
    last_valid_block_height: int | None
    warning: str | None
    price_impact_bps: int
    status: str
    signature: str | None
    code: int | None
    total_input_amount: str | None
    total_output_amount: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    confirmed_at: datetime | None

    def to_order(self) -> DexOrder:
        return DexOrder(**{key: value for key, value in asdict(self).items() if key in DexOrder.__dataclass_fields__})


def intent_digest(*, wallet: str, network: str, input_symbol: str, output_symbol: str, amount: str, slippage_bps: int) -> str:
    canonical = json.dumps({
        "wallet": wallet,
        "network": network,
        "input_symbol": input_symbol,
        "output_symbol": output_symbol,
        "amount": amount,
        "slippage_bps": slippage_bps,
    }, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class DexSwapRepository:
    def __init__(self, database_url: str, *, create_schema: bool = False):
        kwargs = {"pool_pre_ping": True}
        if database_url in {"sqlite+pysqlite://", "sqlite://"}:
            kwargs.update({"connect_args": {"check_same_thread": False}, "poolclass": StaticPool})
        elif database_url.startswith("sqlite"):
            kwargs.update({"connect_args": {"check_same_thread": False}})
        self.engine = create_engine(database_url, **kwargs)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        if create_schema:
            Base.metadata.create_all(self.engine)
            columns = {column["name"] for column in inspect(self.engine).get_columns("dex_swaps")}
            if "price_impact_bps" not in columns:
                with self.engine.begin() as connection:
                    connection.execute(text(
                        "ALTER TABLE dex_swaps ADD COLUMN price_impact_bps INTEGER NOT NULL DEFAULT 0"
                    ))

    @staticmethod
    def _record(row: DexSwapModel) -> DexSwapRecord:
        return DexSwapRecord(**{column.name: getattr(row, column.name) for column in row.__table__.columns})

    def get_idempotent(self, *, network: str, wallet: str, key: str) -> DexSwapRecord | None:
        try:
            with self.sessions() as db:
                row = db.scalar(select(DexSwapModel).where(
                    DexSwapModel.network == network,
                    DexSwapModel.wallet == wallet,
                    DexSwapModel.idempotency_key == key,
                ))
                return self._record(row) if row else None
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể đọc kho giao dịch DEX") from exc

    def save_order(self, *, network: str, wallet: str, key: str, digest: str, order: DexOrder) -> DexSwapRecord:
        existing = self.get_idempotent(network=network, wallet=wallet, key=key)
        if existing:
            if existing.intent_hash != digest:
                raise DexIdempotencyConflict("Khóa idempotency đã được dùng cho một lệnh khác")
            return existing
        row = DexSwapModel(
            id=str(uuid.uuid4()), network=network, wallet=wallet, idempotency_key=key,
            intent_hash=digest, status="simulated" if order.simulation else "quoted", **order.__dict__,
        )
        try:
            with self.sessions.begin() as db:
                db.add(row)
            return self._record(row)
        except IntegrityError as exc:
            existing = self.get_idempotent(network=network, wallet=wallet, key=key)
            if existing and existing.intent_hash == digest:
                return existing
            raise DexIdempotencyConflict("Khóa idempotency hoặc request_id đã được sử dụng") from exc
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể lưu lệnh DEX") from exc

    def reserve_execution(self, *, request_id: str, wallet: str, signature: str) -> DexSwapRecord:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == request_id).with_for_update())
                if not row or row.wallet != wallet or not row.executable or row.status != "quoted":
                    raise DexOrderUnavailable("Lệnh DEX không tồn tại, đã hết hạn hoặc đã được sử dụng")
                expired = row.expires_at is not None and row.expires_at <= int(utcnow().timestamp())
                if expired:
                    row.status = "expired"
                    row.updated_at = utcnow()
                else:
                    row.status = "pending_confirmation"
                    row.signature = signature
                    row.submitted_at = utcnow()
                    row.updated_at = utcnow()
            if expired:
                raise DexOrderUnavailable("Lệnh DEX đã hết hạn")
            return self._record(row)
        except DexOrderUnavailable:
            raise
        except IntegrityError as exc:
            raise DexOrderUnavailable("Chữ ký giao dịch đã được gửi trước đó") from exc
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể khóa lệnh DEX để thực thi") from exc

    def mark_execution(self, request_id: str, result: DexExecution) -> DexSwapRecord:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == request_id).with_for_update())
                if not row:
                    raise DexOrderUnavailable("Không tìm thấy lệnh DEX")
                row.status = "confirmed" if result.status.lower() == "success" else "failed"
                row.signature = result.signature or row.signature
                row.code = result.code
                row.total_input_amount = result.total_input_amount
                row.total_output_amount = result.total_output_amount
                row.error = result.error
                row.updated_at = utcnow()
                if row.status == "confirmed":
                    row.confirmed_at = utcnow()
            return self._record(row)
        except DexOrderUnavailable:
            raise
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể cập nhật kết quả DEX") from exc

    def mark_submission_uncertain(self, request_id: str, error: str) -> None:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == request_id).with_for_update())
                if row and row.status == "pending_confirmation":
                    row.error = error
                    row.updated_at = utcnow()
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể lưu trạng thái đối soát DEX") from exc

    def list_wallet(self, wallet: str, *, limit: int = 20, offset: int = 0) -> list[DexSwapRecord]:
        try:
            with self.sessions() as db:
                rows = db.scalars(select(DexSwapModel).where(DexSwapModel.wallet == wallet)
                    .order_by(DexSwapModel.created_at.desc()).limit(limit).offset(offset)).all()
                return [self._record(row) for row in rows]
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể đọc lịch sử DEX") from exc

    def pending_wallet(self, wallet: str, *, limit: int = 50) -> list[DexSwapRecord]:
        try:
            with self.sessions() as db:
                rows = db.scalars(select(DexSwapModel).where(
                    DexSwapModel.wallet == wallet,
                    DexSwapModel.status == "pending_confirmation",
                    DexSwapModel.signature.is_not(None),
                ).order_by(DexSwapModel.updated_at.asc()).limit(limit)).all()
                return [self._record(row) for row in rows]
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể đọc hàng đợi đối soát DEX") from exc

    def mark_reconciled(self, request_id: str, status: str) -> None:
        if status not in {"confirmed", "failed"}:
            raise ValueError("Trạng thái đối soát không hợp lệ")
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(DexSwapModel).where(DexSwapModel.request_id == request_id).with_for_update())
                if row and row.status == "pending_confirmation":
                    row.status = status
                    row.error = None if status == "confirmed" else (row.error or "Giao dịch thất bại on-chain")
                    row.confirmed_at = utcnow() if status == "confirmed" else None
                    row.updated_at = utcnow()
        except SQLAlchemyError as exc:
            raise DexPersistenceError("Không thể cập nhật đối soát DEX") from exc
