#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-devnet}"
if [[ "$NETWORK" != "devnet" ]]; then
  echo "This stage-4 script only creates the development token on devnet." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOLANA_BIN="${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}"
export PATH="$SOLANA_BIN:$HOME/.cargo/bin:$PATH"

for command_name in solana solana-keygen spl-token python3; do
  command -v "$command_name" >/dev/null || { echo "Missing command: $command_name" >&2; exit 3; }
done

TOKEN_NAME="Hao Khi Dai Viet"
TOKEN_SYMBOL="HKDV"
TOKEN_DECIMALS=6
TOKEN_SUPPLY=1000000000
TOKEN_SUPPLY_BASE_UNITS=1000000000000000
TOKEN_PROGRAM="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
METADATA_URI="https://raw.githubusercontent.com/duynguyen658/gamedefi/main/vietnam-history-gamefi/assets/token/hkdv.json"
KEY_DIR="${GAME_TOKEN_KEY_DIR:-$HOME/.config/solana/gamefi-hkdv}"
MINT_KEY="$KEY_DIR/devnet-mint-keypair.json"
TREASURY_KEY="$KEY_DIR/devnet-treasury-keypair.json"
DEPLOYMENT="$ROOT/blockchain/solana/deployments/devnet-game-token.json"
FEE_PAYER_KEY="${SOLANA_KEYPAIR:-$HOME/.config/solana/id.json}"

mkdir -p "$KEY_DIR" "$(dirname "$DEPLOYMENT")"
chmod 700 "$KEY_DIR"

if [[ ! -f "$MINT_KEY" ]]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$MINT_KEY" >/dev/null
fi
if [[ ! -f "$TREASURY_KEY" ]]; then
  solana-keygen new --no-bip39-passphrase --silent --outfile "$TREASURY_KEY" >/dev/null
fi
chmod 600 "$MINT_KEY" "$TREASURY_KEY"

MINT="$(solana-keygen pubkey "$MINT_KEY")"
TREASURY="$(solana-keygen pubkey "$TREASURY_KEY")"
FEE_PAYER="$(solana-keygen pubkey "$FEE_PAYER_KEY")"

GENESIS="$(solana genesis-hash --url devnet)"
if [[ "$GENESIS" != "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ]]; then
  echo "RPC is not Solana devnet (genesis: $GENESIS)." >&2
  exit 4
fi

if ! solana account "$MINT" --url devnet --output json >/dev/null 2>&1; then
  spl-token --url devnet --fee-payer "$FEE_PAYER_KEY" create-token --decimals "$TOKEN_DECIMALS" --mint-authority "$FEE_PAYER" "$MINT_KEY"
fi

TREASURY_ATA="$(spl-token --url devnet address --token "$MINT" --owner "$TREASURY" --verbose | awk '/Associated token address:/ {print $4}')"
if ! solana account "$TREASURY_ATA" --url devnet --output json >/dev/null 2>&1; then
  spl-token --url devnet --fee-payer "$FEE_PAYER_KEY" create-account "$MINT" --owner "$TREASURY"
fi

CURRENT_SUPPLY="$(spl-token --url devnet supply "$MINT" | tr -d '[:space:]')"
if [[ "$CURRENT_SUPPLY" == "0" ]]; then
  spl-token --url devnet --fee-payer "$FEE_PAYER_KEY" mint "$MINT" "$TOKEN_SUPPLY" "$TREASURY_ATA" --mint-authority "$FEE_PAYER_KEY"
elif [[ "$CURRENT_SUPPLY" != "$TOKEN_SUPPLY" ]]; then
  echo "Unexpected supply $CURRENT_SUPPLY for $MINT; refusing to mint or change authority." >&2
  exit 5
fi

DISPLAY_JSON="$(spl-token --url devnet display "$MINT" --output json)"
MINT_AUTHORITY="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("mintAuthority") or "")' <<<"$DISPLAY_JSON")"
if [[ -n "$MINT_AUTHORITY" ]]; then
  if [[ "$MINT_AUTHORITY" != "$FEE_PAYER" ]]; then
    echo "Unexpected mint authority $MINT_AUTHORITY; refusing to modify it." >&2
    exit 6
  fi
  spl-token --url devnet --fee-payer "$FEE_PAYER_KEY" authorize "$MINT" mint --disable --authority "$FEE_PAYER_KEY"
fi

DISPLAY_JSON="$(spl-token --url devnet display "$MINT" --output json)"
SUPPLY_AFTER="$(spl-token --url devnet supply "$MINT" | tr -d '[:space:]')"
BALANCE_AFTER="$(spl-token --url devnet balance --address "$TREASURY_ATA" | tr -d '[:space:]')"
export MINT TREASURY TREASURY_ATA FEE_PAYER DISPLAY_JSON SUPPLY_AFTER BALANCE_AFTER
export TOKEN_NAME TOKEN_SYMBOL TOKEN_DECIMALS TOKEN_SUPPLY TOKEN_SUPPLY_BASE_UNITS TOKEN_PROGRAM METADATA_URI NETWORK DEPLOYMENT
python3 - <<'PY'
import json
import os
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path

display = json.loads(os.environ["DISPLAY_JSON"])
if display.get("mintAuthority") is not None:
    raise SystemExit("Mint authority was not disabled")
if display.get("freezeAuthority") is not None:
    raise SystemExit("Freeze authority is unexpectedly enabled")
if os.environ["SUPPLY_AFTER"] != os.environ["TOKEN_SUPPLY"]:
    raise SystemExit("On-chain supply does not match the fixed supply")
if Decimal(os.environ["BALANCE_AFTER"]) > Decimal(os.environ["TOKEN_SUPPLY"]):
    raise SystemExit("Treasury balance cannot exceed the fixed token supply")

path = Path(os.environ["DEPLOYMENT"])
previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
now = datetime.now(timezone.utc).isoformat()

payload = {
    "schema_version": 1,
    "network": os.environ["NETWORK"],
    "status": "active",
    "name": os.environ["TOKEN_NAME"],
    "symbol": os.environ["TOKEN_SYMBOL"],
    "mint": os.environ["MINT"],
    "decimals": int(os.environ["TOKEN_DECIMALS"]),
    "total_supply": os.environ["TOKEN_SUPPLY"],
    "total_supply_base_units": os.environ["TOKEN_SUPPLY_BASE_UNITS"],
    "token_program": os.environ["TOKEN_PROGRAM"],
    "mint_authority": None,
    "freeze_authority": None,
    "treasury_owner": os.environ["TREASURY"],
    "treasury_token_account": os.environ["TREASURY_ATA"],
    "treasury_balance": os.environ["BALANCE_AFTER"],
    "fee_payer": os.environ["FEE_PAYER"],
    "metadata_uri": os.environ["METADATA_URI"],
    "on_chain_metadata": False,
    "deployed_at": previous.get("deployed_at", now),
    "verified_at": now,
    "explorer_url": f"https://explorer.solana.com/address/{os.environ['MINT']}?cluster=devnet",
}
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

echo "Mint: $MINT"
echo "Treasury owner: $TREASURY"
echo "Treasury ATA: $TREASURY_ATA"
echo "Supply: $SUPPLY_AFTER $TOKEN_SYMBOL"
echo "Deployment: $DEPLOYMENT"
