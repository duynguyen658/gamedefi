from fastapi import APIRouter, HTTPException, Request

from app.blockchain.adapter_resolver import UnsupportedChainError
from app.blockchain.solana_adapter import SolanaAdapterError
from app.schemas import TransactionOut
from app.core.config import get_settings
from app.core.mainnet import MAINNET_GENESIS
from app.rewards.reconciliation import reconcile_claim

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


@router.get("/solana/config")
def solana_config():
    settings = get_settings()
    return {"chain": "solana", "network": settings.solana_network,
            "program_id": settings.solana_program_id}


@router.get("/solana/game-token")
def solana_game_token(request: Request):
    settings = request.app.state.settings
    adapter = request.app.state.resolver.get("solana")
    on_chain = adapter.get_token_mint_info(settings.game_token_mint)
    treasury_on_chain = adapter.get_token_account_info(settings.game_token_treasury_account)
    expected_supply = str(int(settings.game_token_total_supply) * (10 ** settings.game_token_decimals))
    cluster_verified = settings.solana_network == "devnet" or (
        settings.solana_network == "mainnet-beta" and adapter.get_genesis_hash() == MAINNET_GENESIS
    )
    verified = (
        cluster_verified
        and on_chain["program_id"] == settings.game_token_program
        and on_chain["decimals"] == settings.game_token_decimals
        and on_chain["supply"] == expected_supply
        and on_chain["mint_authority"] is None
        and on_chain["freeze_authority"] is None
        and on_chain["is_initialized"]
        and treasury_on_chain["mint"] == settings.game_token_mint
        and treasury_on_chain["owner"] == settings.game_token_treasury_owner
        and 0 <= int(treasury_on_chain["amount"]) <= int(expected_supply)
        and treasury_on_chain["decimals"] == settings.game_token_decimals
        and treasury_on_chain["state"] == "initialized"
    )
    return {
        "network": settings.solana_network,
        "name": settings.game_token_name,
        "symbol": settings.game_token_symbol,
        "mint": settings.game_token_mint,
        "decimals": settings.game_token_decimals,
        "total_supply": settings.game_token_total_supply,
        "token_program": settings.game_token_program,
        "treasury_owner": settings.game_token_treasury_owner,
        "treasury_token_account": settings.game_token_treasury_account,
        "metadata_uri": settings.game_token_metadata_uri,
        "explorer_url": f"https://explorer.solana.com/address/{settings.game_token_mint}?cluster={settings.solana_network}",
        "verified": verified,
        "on_chain": on_chain,
        "treasury_on_chain": treasury_on_chain,
    }


@router.get("/solana/reward-distributor")
def solana_reward_distributor(request: Request):
    settings = request.app.state.settings
    adapter = request.app.state.resolver.get("solana")
    on_chain = adapter.get_reward_distributor_info(settings.reward_distributor_config)
    vault_on_chain = adapter.get_token_account_info(settings.reward_distributor_vault)
    cluster_verified = settings.solana_network == "devnet" or (
        settings.solana_network == "mainnet-beta" and adapter.get_genesis_hash() == MAINNET_GENESIS
    )
    verified = (
        cluster_verified
        and on_chain["address"] == settings.reward_distributor_config
        and on_chain["admin"] == settings.reward_distributor_admin
        and on_chain["distributor"] == settings.reward_distributor_authority
        and on_chain["mint"] == settings.game_token_mint
        and on_chain["vault"] == settings.reward_distributor_vault
        and on_chain["max_reward_amount"] == str(settings.reward_max_amount_base_units)
        and vault_on_chain["mint"] == settings.game_token_mint
        and vault_on_chain["owner"] == settings.reward_distributor_config
        and vault_on_chain["decimals"] == settings.game_token_decimals
        and vault_on_chain["state"] == "initialized"
    )
    return {
        "network": settings.solana_network,
        "program_id": settings.solana_program_id,
        "config": settings.reward_distributor_config,
        "vault": settings.reward_distributor_vault,
        "mint": settings.game_token_mint,
        "distributor": settings.reward_distributor_authority,
        "allocation_base_units": str(settings.reward_vault_allocation_base_units),
        "verified": verified,
        "active": verified and not on_chain["paused"],
        "on_chain": on_chain,
        "vault_on_chain": vault_on_chain,
        "config_explorer_url": (
            f"https://explorer.solana.com/address/{settings.reward_distributor_config}"
            f"?cluster={settings.solana_network}"
        ),
        "vault_explorer_url": (
            f"https://explorer.solana.com/address/{settings.reward_distributor_vault}"
            f"?cluster={settings.solana_network}"
        ),
    }


@router.get("/{chain}/transaction/{digest}", response_model=TransactionOut)
def get_transaction(chain: str, digest: str, request: Request):
    try:
        adapter = request.app.state.resolver.get(chain)
    except UnsupportedChainError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    tx = adapter.get_transaction(digest)
    if tx is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy transaction")
    claim = request.app.state.reward_claims.get_by_signature(digest)
    if claim:
        try:
            reconcile_claim(
                request.app.state.reward_claims,
                adapter,
                claim,
                request.app.state.settings.reward_distributor_authority,
            )
        except SolanaAdapterError:
            pass
    return TransactionOut(
        digest=tx.digest,
        status=tx.status,
        sender=tx.sender,
        timestamp_ms=tx.timestamp_ms,
        events=tx.events,
    )
