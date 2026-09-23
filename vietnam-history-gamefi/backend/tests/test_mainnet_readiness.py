import base64

from solders.keypair import Keypair
from solders.pubkey import Pubkey

from app.core.config import Settings
from app.core.readiness import (
    TOKEN_METADATA_PROGRAM,
    UPGRADEABLE_LOADER,
    _metadata_matches,
    _program_authority,
)


class RpcAccounts:
    def __init__(self, accounts):
        self.accounts = accounts

    def _rpc(self, method, params):
        assert method == "getAccountInfo"
        return {"value": self.accounts.get(params[0])}


def account(owner, data, *, executable=False):
    return {"owner": owner, "executable": executable, "data": [base64.b64encode(data).decode(), "base64"]}


def test_program_upgrade_authority_is_read_from_programdata():
    program = Keypair().pubkey()
    programdata = Keypair().pubkey()
    authority = Keypair().pubkey()
    accounts = {
        str(program): account(UPGRADEABLE_LOADER, (2).to_bytes(4, "little") + bytes(programdata), executable=True),
        str(programdata): account(
            UPGRADEABLE_LOADER,
            (3).to_bytes(4, "little") + (123).to_bytes(8, "little") + b"\x01" + bytes(authority),
        ),
    }
    assert _program_authority(RpcAccounts(accounts), str(program)) == str(authority)
    accounts[str(programdata)] = account(
        UPGRADEABLE_LOADER, (3).to_bytes(4, "little") + (123).to_bytes(8, "little") + b"\x00" + bytes(32),
    )
    try:
        _program_authority(RpcAccounts(accounts), str(program))
    except ValueError as exc:
        assert "không có upgrade authority" in str(exc)
    else:
        raise AssertionError("an immutable program must not pass the expected authority check")


def test_metadata_must_match_mint_name_symbol_uri_and_admin():
    mint = Keypair().pubkey()
    admin = Keypair().pubkey()
    metadata = Pubkey.find_program_address(
        [b"metadata", bytes(TOKEN_METADATA_PROGRAM), bytes(mint)], TOKEN_METADATA_PROGRAM,
    )[0]
    settings = Settings(
        _env_file=None,
        game_token_mint=str(mint),
        mainnet_admin_multisig=str(admin),
        game_token_name="Hao Khi Dai Viet",
        game_token_symbol="HKDV",
        game_token_metadata_uri="https://example.com/hkdv.json",
    )

    def encoded_field(value):
        raw = value.encode()
        return len(raw).to_bytes(4, "little") + raw

    data = (b"\x04" + bytes(admin) + bytes(mint)
            + encoded_field(settings.game_token_name)
            + encoded_field(settings.game_token_symbol)
            + encoded_field(settings.game_token_metadata_uri))
    accounts = {str(metadata): account(str(TOKEN_METADATA_PROGRAM), data)}
    assert _metadata_matches(RpcAccounts(accounts), settings)
    settings.game_token_symbol = "FAKE"
    assert not _metadata_matches(RpcAccounts(accounts), settings)
