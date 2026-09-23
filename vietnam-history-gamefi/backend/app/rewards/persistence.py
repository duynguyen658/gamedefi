from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    create_engine,
    func,
    select,
)
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class RewardPersistenceError(RuntimeError):
    pass


class RewardConflict(RewardPersistenceError):
    pass


class RewardClaimUnavailable(RewardPersistenceError):
    pass


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def reward_claim_id(network: str, wallet: str, source_type: str, source_id: str) -> str:
    canonical = f"{network}:{wallet}:{source_type}:{source_id}".encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


class RewardEventModel(Base):
    __tablename__ = "reward_events"
    __table_args__ = (
        UniqueConstraint("network", "wallet", "source_type", "source_id", name="uq_reward_event_source"),
        CheckConstraint("source_type IN ('battle', 'quest')", name="ck_reward_event_source_type"),
        Index("ix_reward_events_wallet_qualifier", "network", "wallet", "source_type", "qualifier"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    network: Mapped[str] = mapped_column(String(32), nullable=False)
    wallet: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    qualifier: Mapped[str | None] = mapped_column(String(160))
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)
    event_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class RewardClaimModel(Base):
    __tablename__ = "reward_claims"
    __table_args__ = (
        UniqueConstraint("network", "wallet", "source_type", "source_id", name="uq_reward_claim_source"),
        CheckConstraint("source_type IN ('battle', 'quest')", name="ck_reward_claim_source_type"),
        CheckConstraint(
            "status IN ('reserved', 'preparing', 'submitted', 'submission_unknown', 'confirmed', 'failed')",
            name="ck_reward_claim_status",
        ),
        CheckConstraint("amount > 0", name="ck_reward_claim_amount"),
        Index("ix_reward_claims_wallet_created", "network", "wallet", "created_at"),
        Index("ix_reward_claims_status_updated", "status", "updated_at"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True)
    claim_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    network: Mapped[str] = mapped_column(String(32), nullable=False)
    wallet: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="reserved")
    tx_signature: Mapped[str | None] = mapped_column(String(128), unique=True)
    receipt_address: Mapped[str | None] = mapped_column(String(64), unique=True)
    signed_transaction: Mapped[str | None] = mapped_column(Text)
    last_valid_block_height: Mapped[int | None] = mapped_column(BigInteger)
    attempts: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


@dataclass(frozen=True)
class RewardEventRecord:
    id: str
    network: str
    wallet: str
    source_type: str
    source_id: str
    qualifier: str | None
    eligible: bool
    event_metadata: dict[str, Any]
    created_at: datetime


@dataclass(frozen=True)
class RewardClaimRecord:
    id: str
    claim_id: str
    network: str
    wallet: str
    source_type: str
    source_id: str
    amount: int
    status: str
    tx_signature: str | None
    receipt_address: str | None
    signed_transaction: str | None
    last_valid_block_height: int | None
    attempts: int
    error: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    confirmed_at: datetime | None


class RewardRepository:
    def __init__(self, database_url: str, *, create_schema: bool = False):
        kwargs: dict[str, Any] = {"pool_pre_ping": True}
        if database_url in {"sqlite+pysqlite://", "sqlite://"}:
            kwargs.update({"connect_args": {"check_same_thread": False}, "poolclass": StaticPool})
        elif database_url.startswith("sqlite"):
            kwargs.update({"connect_args": {"check_same_thread": False}})
        self.engine = create_engine(database_url, **kwargs)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        if create_schema:
            Base.metadata.create_all(self.engine)

    @staticmethod
    def _event(row: RewardEventModel) -> RewardEventRecord:
        return RewardEventRecord(
            id=row.id,
            network=row.network,
            wallet=row.wallet,
            source_type=row.source_type,
            source_id=row.source_id,
            qualifier=row.qualifier,
            eligible=row.eligible,
            event_metadata=row.event_metadata,
            created_at=row.created_at,
        )

    @staticmethod
    def _claim(row: RewardClaimModel) -> RewardClaimRecord:
        return RewardClaimRecord(**{column.name: getattr(row, column.name) for column in row.__table__.columns})

    def get_event(self, *, network: str, wallet: str, source_type: str, source_id: str) -> RewardEventRecord | None:
        try:
            with self.sessions() as db:
                row = db.scalar(select(RewardEventModel).where(
                    RewardEventModel.network == network,
                    RewardEventModel.wallet == wallet,
                    RewardEventModel.source_type == source_type,
                    RewardEventModel.source_id == source_id,
                ))
                return self._event(row) if row else None
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc sự kiện phần thưởng") from exc

    def record_event(
        self,
        *,
        network: str,
        wallet: str,
        source_type: str,
        source_id: str,
        qualifier: str | None,
        eligible: bool,
        metadata: dict[str, Any] | None = None,
    ) -> RewardEventRecord:
        existing = self.get_event(network=network, wallet=wallet, source_type=source_type, source_id=source_id)
        if existing:
            if existing.wallet != wallet or existing.qualifier != qualifier or existing.eligible != eligible:
                raise RewardConflict("Sự kiện phần thưởng đã tồn tại với dữ liệu khác")
            return existing
        row = RewardEventModel(
            id=str(uuid.uuid4()),
            network=network,
            wallet=wallet,
            source_type=source_type,
            source_id=source_id,
            qualifier=qualifier,
            eligible=eligible,
            event_metadata=metadata or {},
        )
        try:
            with self.sessions.begin() as db:
                db.add(row)
            return self._event(row)
        except IntegrityError as exc:
            existing = self.get_event(network=network, wallet=wallet, source_type=source_type, source_id=source_id)
            if existing and existing.wallet == wallet and existing.qualifier == qualifier and existing.eligible == eligible:
                return existing
            raise RewardConflict("Sự kiện phần thưởng đã được ghi nhận") from exc
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể lưu sự kiện phần thưởng") from exc

    def count_eligible_battles(self, *, network: str, wallet: str, scenario_id: str) -> int:
        try:
            with self.sessions() as db:
                value = db.scalar(select(func.count()).select_from(RewardEventModel).where(
                    RewardEventModel.network == network,
                    RewardEventModel.wallet == wallet,
                    RewardEventModel.source_type == "battle",
                    RewardEventModel.qualifier == scenario_id,
                    RewardEventModel.eligible.is_(True),
                ))
                return int(value or 0)
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc tiến độ nhiệm vụ") from exc

    def get_claim_for_event(
        self, *, network: str, wallet: str, source_type: str, source_id: str
    ) -> RewardClaimRecord | None:
        try:
            with self.sessions() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.network == network,
                    RewardClaimModel.wallet == wallet,
                    RewardClaimModel.source_type == source_type,
                    RewardClaimModel.source_id == source_id,
                ))
                return self._claim(row) if row else None
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc claim phần thưởng") from exc

    def get_claim(self, claim_id: str) -> RewardClaimRecord | None:
        try:
            with self.sessions() as db:
                row = db.scalar(select(RewardClaimModel).where(RewardClaimModel.claim_id == claim_id))
                return self._claim(row) if row else None
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc claim phần thưởng") from exc

    def get_by_signature(self, signature: str) -> RewardClaimRecord | None:
        try:
            with self.sessions() as db:
                row = db.scalar(select(RewardClaimModel).where(RewardClaimModel.tx_signature == signature))
                return self._claim(row) if row else None
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc chữ ký phần thưởng") from exc

    def reserve_claim(self, *, event: RewardEventRecord, amount: int) -> tuple[RewardClaimRecord, bool]:
        if not event.eligible:
            raise RewardClaimUnavailable("Sự kiện không đủ điều kiện nhận HKDV")
        if amount <= 0:
            raise ValueError("Reward amount must be positive")
        claim_id = reward_claim_id(event.network, event.wallet, event.source_type, event.source_id)
        existing = self.get_claim_for_event(
            network=event.network, wallet=event.wallet, source_type=event.source_type, source_id=event.source_id
        )
        if existing:
            if existing.claim_id != claim_id or existing.wallet != event.wallet or existing.amount != amount:
                raise RewardConflict("Claim đã tồn tại với dữ liệu khác")
            return existing, False
        row = RewardClaimModel(
            id=str(uuid.uuid4()),
            claim_id=claim_id,
            network=event.network,
            wallet=event.wallet,
            source_type=event.source_type,
            source_id=event.source_id,
            amount=amount,
            status="reserved",
        )
        try:
            with self.sessions.begin() as db:
                db.add(row)
            return self._claim(row), True
        except IntegrityError as exc:
            existing = self.get_claim_for_event(
                network=event.network, wallet=event.wallet, source_type=event.source_type, source_id=event.source_id
            )
            if existing and existing.claim_id == claim_id and existing.wallet == event.wallet and existing.amount == amount:
                return existing, False
            raise RewardConflict("Claim đã được tạo bởi yêu cầu khác") from exc
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể giữ chỗ claim phần thưởng") from exc

    def acquire_submission(self, claim_id: str) -> tuple[RewardClaimRecord, bool]:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.claim_id == claim_id
                ).with_for_update())
                if not row:
                    raise RewardClaimUnavailable("Không tìm thấy claim phần thưởng")
                stale_preparation = (
                    row.status == "preparing"
                    and row.updated_at <= utcnow() - timedelta(minutes=2)
                )
                acquired = row.status in {"reserved", "failed"} or stale_preparation
                if acquired:
                    row.status = "preparing"
                    row.attempts += 1
                    row.error = None
                    row.updated_at = utcnow()
            return self._claim(row), acquired
        except RewardClaimUnavailable:
            raise
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể khóa claim để gửi on-chain") from exc

    def mark_prepared(
        self,
        claim_id: str,
        *,
        signature: str,
        receipt_address: str,
        signed_transaction: str,
        last_valid_block_height: int,
    ) -> RewardClaimRecord:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.claim_id == claim_id
                ).with_for_update())
                if not row or row.status != "preparing":
                    raise RewardClaimUnavailable("Claim không ở trạng thái chuẩn bị")
                row.status = "submitted"
                row.tx_signature = signature
                row.receipt_address = receipt_address
                row.signed_transaction = signed_transaction
                row.last_valid_block_height = last_valid_block_height
                row.submitted_at = utcnow()
                row.updated_at = utcnow()
            return self._claim(row)
        except RewardClaimUnavailable:
            raise
        except IntegrityError as exc:
            raise RewardConflict("Chữ ký hoặc receipt đã thuộc claim khác") from exc
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể lưu giao dịch phần thưởng đã ký") from exc

    def mark_submission_sent(self, claim_id: str) -> RewardClaimRecord:
        return self._update_pending(claim_id, status="submitted", error=None)

    def mark_submission_uncertain(self, claim_id: str, error: str) -> RewardClaimRecord:
        return self._update_pending(claim_id, status="submission_unknown", error=error)

    def mark_failed(self, claim_id: str, error: str) -> RewardClaimRecord:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.claim_id == claim_id
                ).with_for_update())
                if not row:
                    raise RewardClaimUnavailable("Không tìm thấy claim phần thưởng")
                if row.status != "confirmed":
                    row.status = "failed"
                    row.error = error
                    row.updated_at = utcnow()
            return self._claim(row)
        except RewardClaimUnavailable:
            raise
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể lưu claim thất bại") from exc

    def _update_pending(self, claim_id: str, *, status: str, error: str | None) -> RewardClaimRecord:
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.claim_id == claim_id
                ).with_for_update())
                if not row:
                    raise RewardClaimUnavailable("Không tìm thấy claim phần thưởng")
                if row.status != "confirmed":
                    row.status = status
                    row.error = error
                    row.updated_at = utcnow()
            return self._claim(row)
        except RewardClaimUnavailable:
            raise
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể cập nhật claim phần thưởng") from exc

    def mark_reconciled(self, claim_id: str, status: str, error: str | None = None) -> RewardClaimRecord:
        if status not in {"confirmed", "failed"}:
            raise ValueError("Trạng thái đối soát reward không hợp lệ")
        try:
            with self.sessions.begin() as db:
                row = db.scalar(select(RewardClaimModel).where(
                    RewardClaimModel.claim_id == claim_id
                ).with_for_update())
                if not row:
                    raise RewardClaimUnavailable("Không tìm thấy claim phần thưởng")
                if row.status != "confirmed":
                    row.status = status
                    row.error = error
                    row.confirmed_at = utcnow() if status == "confirmed" else None
                    row.updated_at = utcnow()
            return self._claim(row)
        except RewardClaimUnavailable:
            raise
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể cập nhật đối soát reward") from exc

    def list_wallet(self, *, network: str, wallet: str, limit: int = 20) -> list[RewardClaimRecord]:
        try:
            with self.sessions() as db:
                rows = db.scalars(select(RewardClaimModel).where(
                    RewardClaimModel.network == network,
                    RewardClaimModel.wallet == wallet,
                ).order_by(RewardClaimModel.created_at.desc()).limit(limit)).all()
                return [self._claim(row) for row in rows]
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc lịch sử phần thưởng") from exc

    def pending_wallet(self, *, network: str, wallet: str, limit: int = 50) -> list[RewardClaimRecord]:
        try:
            with self.sessions() as db:
                rows = db.scalars(select(RewardClaimModel).where(
                    RewardClaimModel.network == network,
                    RewardClaimModel.wallet == wallet,
                    RewardClaimModel.status.in_(("submitted", "submission_unknown")),
                    RewardClaimModel.tx_signature.is_not(None),
                ).order_by(RewardClaimModel.updated_at.asc()).limit(limit)).all()
                return [self._claim(row) for row in rows]
        except SQLAlchemyError as exc:
            raise RewardPersistenceError("Không thể đọc hàng đợi đối soát reward") from exc
