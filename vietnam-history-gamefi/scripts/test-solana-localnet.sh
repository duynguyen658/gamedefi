#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLANA_DIR="$ROOT/blockchain/solana"
PROGRAM_ID="$(solana-keygen pubkey "$SOLANA_DIR/target/deploy/history_game-keypair.json")"
PROGRAM_SO="$SOLANA_DIR/target/deploy/history_game.so"

if [[ "${1:-}" != "--skip-build" ]]; then
  (cd "$SOLANA_DIR" && RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-solana}" anchor build)
fi

if [[ ! -f "$PROGRAM_SO" ]]; then
  echo "Missing SBF artifact: $PROGRAM_SO" >&2
  exit 2
fi

LEDGER="$(mktemp -d -t gamefi-solana-test.XXXXXX)"
VALIDATOR_PID=""
cleanup() {
  if [[ -n "$VALIDATOR_PID" ]]; then
    kill "$VALIDATOR_PID" >/dev/null 2>&1 || true
    wait "$VALIDATOR_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$LEDGER"
}
trap cleanup EXIT

solana-test-validator \
  --reset \
  --quiet \
  --ledger "$LEDGER" \
  --bpf-program "$PROGRAM_ID" "$PROGRAM_SO" \
  >"$LEDGER/validator.log" 2>&1 &
VALIDATOR_PID=$!

for _ in $(seq 1 30); do
  if solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; then
  cat "$LEDGER/validator.log" >&2
  exit 3
fi

python3 "$ROOT/scripts/test_solana_program.py"
python3 "$ROOT/scripts/test_reward_distributor.py"
