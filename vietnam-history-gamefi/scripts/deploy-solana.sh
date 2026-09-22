#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER="${1:-devnet}"
case "$CLUSTER" in
  devnet|localnet) ;;
  *) echo "Usage: bash scripts/deploy-solana.sh [devnet|localnet]" >&2; exit 1 ;;
esac
cd "$ROOT/blockchain/solana"
command -v anchor >/dev/null
command -v solana-keygen >/dev/null
mkdir -p target/deploy
if [[ ! -f target/deploy/history_game-keypair.json ]]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile target/deploy/history_game-keypair.json >/dev/null
fi
anchor keys sync
anchor build
anchor deploy --provider.cluster "$CLUSTER"
echo "Set SOLANA_PROGRAM_ID in backend/.env to this public program ID:"
solana-keygen pubkey target/deploy/history_game-keypair.json
