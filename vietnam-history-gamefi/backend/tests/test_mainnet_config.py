import pytest
from fastapi import HTTPException
from solders.keypair import Keypair

from app.api.dex import require_trading_enabled
from app.api.reward import submit_event_reward
from app.core.config import Settings
from app.core.mainnet import mainnet_configuration_errors, validate_mainnet_configuration
from app.dex.interface import DexProviderError, token_registry


def test_mainnet_defaults_fail_closed():
    settings = Settings(_env_file=None, solana_network="mainnet-beta")
    errors = mainnet_configuration_errors(settings)
    assert any("GAME_TOKEN_MINT" in error for error in errors)
    assert any("JUPITER_API_KEY" in error for error in errors)
    assert any("MAINNET_UPGRADE_AUTHORITY" in error for error in errors)
    with pytest.raises(ValueError, match="Mainnet chưa an toàn"):
        validate_mainnet_configuration(settings)
    with pytest.raises(DexProviderError, match="mint HKDV Mainnet"):
        token_registry("mainnet-beta")


def test_mainnet_requires_separate_valid_identities_and_hkdv_pair():
    addresses = [str(Keypair().pubkey()) for _ in range(9)]
    settings = Settings(
        _env_file=None,
        solana_network="mainnet-beta",
        solana_rpc_url="https://rpc.example.com",
        solana_program_id=addresses[0],
        game_token_mint=addresses[1],
        game_token_treasury_owner=addresses[2],
        game_token_treasury_account=addresses[3],
        reward_distributor_config=addresses[4],
        reward_distributor_admin=addresses[5],
        reward_distributor_vault=addresses[6],
        reward_distributor_authority=addresses[7],
        mainnet_treasury_multisig=addresses[2],
        mainnet_admin_multisig=addresses[5],
        mainnet_upgrade_authority=addresses[8],
        reward_distributor_keypair_path="/secure/mainnet-distributor.json",
        jupiter_api_key="test-key",
        database_url="postgresql+psycopg://user:password@db.example.com/gamefi",
        database_auto_create=False,
        cors_allow_origins="https://game.example.com",
    )
    validate_mainnet_configuration(settings)
    tokens = token_registry("mainnet-beta", settings.game_token_mint)
    assert set(tokens) == {"SOL", "HKDV"}
    assert tokens["HKDV"].mint == settings.game_token_mint


def test_mainnet_dex_stays_closed_until_explicitly_enabled():
    class Request:
        class app:
            class state:
                settings = Settings(_env_file=None, solana_network="mainnet-beta")

    with pytest.raises(HTTPException) as exc:
        require_trading_enabled(Request())
    assert exc.value.status_code == 503
    Request.app.state.settings.dex_mainnet_enabled = True
    require_trading_enabled(Request())


def test_mainnet_reward_cannot_submit_before_release_switch():
    class Request:
        class app:
            class state:
                settings = Settings(_env_file=None, solana_network="mainnet-beta")

    with pytest.raises(HTTPException) as exc:
        submit_event_reward(request=Request(), event=None, amount=1)
    assert exc.value.status_code == 503
