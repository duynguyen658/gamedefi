#!/usr/bin/env python3
"""Apply the idempotent PostgreSQL migrations before starting a deployed backend."""

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = (
    ROOT / "database" / "migrations" / "001_dex_swaps.sql",
    ROOT / "database" / "migrations" / "002_reward_claims.sql",
)


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "")
    if database_url.startswith("postgresql+psycopg://"):
        database_url = "postgresql://" + database_url[len("postgresql+psycopg://"):]
    if not database_url.startswith(("postgresql://", "postgres://")):
        print("DATABASE_URL must point to PostgreSQL before running migrations.")
        return 1

    try:
        with psycopg.connect(database_url, connect_timeout=10) as connection:
            for migration in MIGRATIONS:
                connection.execute(migration.read_text(encoding="utf-8"), prepare=False)
                print(f"Applied {migration.name}")
    except (OSError, psycopg.Error) as exc:
        print(f"Migration failed ({type(exc).__name__}); database details were omitted from logs.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
