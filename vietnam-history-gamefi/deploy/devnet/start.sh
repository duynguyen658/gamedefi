#!/bin/sh
set -eu

if [ "${DEVNET_DEPLOYED:-false}" = "true" ]; then
  if [ "${SOLANA_NETWORK:-}" != "devnet" ] || [ -z "${SOLANA_PROGRAM_ID:-}" ] || [ -z "${DATABASE_URL:-}" ]; then
    echo "Devnet backend requires Devnet network, program ID and PostgreSQL URL." >&2
    exit 1
  fi
  if [ ! -f "${REWARD_DISTRIBUTOR_KEYPAIR_PATH:-}" ]; then
    echo "Devnet reward signer secret file is missing." >&2
    exit 1
  fi
  python /srv/gamefi/scripts/apply-migrations.py
fi

exec uvicorn app.hosted:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
