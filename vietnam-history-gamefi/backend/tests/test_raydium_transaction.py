import base64

import pytest
from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import create_account_with_seed, transfer, TransferParams
from solders.transaction import VersionedTransaction

from app.api.dex import signed_transaction_signature
from app.blockchain.solana_adapter import SPL_TOKEN_PROGRAM_ID
from app.core.config import Settings
from app.dex.interface import DexOrder, SOL_MINT, token_registry
from app.dex.raydium_provider import RaydiumDexProvider
from app.dex.raydium_transaction import SWAP_BASE_INPUT_DISCRIMINATOR, _ata, validate_raydium_transaction
from conftest import login


def make_swap(*, amount=1_000_000_000, minimum=99_500_000, output_mint=None,
              output_account=None, extra_instruction=None, token_symbol="USDC", reverse=False):
    owner = Keypair()
    wallet = str(owner.pubkey())
    settings = Settings(database_url="sqlite+pysqlite:///:memory:")
    provider = RaydiumDexProvider(settings)
    pool = provider.pools[token_symbol]
    token_mint = token_registry("devnet")[token_symbol].mint
    wsol = Pubkey.create_with_seed(owner.pubkey(), "dex-test-wsol", Pubkey.from_string(SPL_TOKEN_PROGRAM_ID))
    token_account = output_account or _ata(wallet, token_mint)

    def meta(address, signer=False):
        return AccountMeta(Pubkey.from_string(str(address)), signer, True)

    input_account = token_account if reverse else wsol
    received_account = wsol if reverse else token_account
    instructions = [
        create_account_with_seed({
            "from_pubkey": owner.pubkey(), "to_pubkey": wsol, "base": owner.pubkey(),
            "seed": "dex-test-wsol", "lamports": 2_039_280 if reverse else 1_002_039_280, "space": 165,
            "owner": Pubkey.from_string(SPL_TOKEN_PROGRAM_ID),
        }),
        Instruction(Pubkey.from_string(SPL_TOKEN_PROGRAM_ID), b"\x01", [
            meta(wsol), meta(SOL_MINT), meta(wallet, True),
            meta("SysvarRent111111111111111111111111111111111"),
        ]),
        Instruction(Pubkey.from_string(settings.raydium_cpmm_program_id),
                    SWAP_BASE_INPUT_DISCRIMINATOR + amount.to_bytes(8, "little") + minimum.to_bytes(8, "little"), [
            meta(wallet, True), meta(Keypair().pubkey()), meta(pool.config_id), meta(pool.pool_id),
            meta(input_account), meta(received_account),
            meta(pool.token_vault if reverse else pool.wsol_vault),
            meta(pool.wsol_vault if reverse else pool.token_vault),
            meta(SPL_TOKEN_PROGRAM_ID), meta(SPL_TOKEN_PROGRAM_ID),
            meta(token_mint if reverse else SOL_MINT),
            meta(output_mint or (SOL_MINT if reverse else token_mint)), meta(Keypair().pubkey()),
        ]),
        Instruction(Pubkey.from_string(SPL_TOKEN_PROGRAM_ID), b"\x09", [
            meta(wsol), meta(wallet), meta(wallet, True),
        ]),
    ]
    if extra_instruction:
        instructions.insert(2, extra_instruction(owner))
    transaction = VersionedTransaction(Message.new_with_blockhash(instructions, owner.pubkey(), Hash.default()), [owner])
    quote = DexOrder(
        request_id="raydium_quote", input_symbol=token_symbol if reverse else "SOL",
        output_symbol="SOL" if reverse else token_symbol,
        in_amount="1000000000", out_amount="100000000", input_decimals=6 if reverse else 9,
        output_decimals=9 if reverse else 6, provider="raydium", router=pool.pool_id, mode="exact-in",
        fee_bps=25, slippage_bps=50, transaction=None, executable=True, simulation=False,
    )
    return transaction, wallet, quote, provider, pool, owner


def validate(**overrides):
    transaction, wallet, quote, provider, pool, _ = make_swap(**overrides)
    encoded = base64.b64encode(bytes(transaction)).decode()
    assert signed_transaction_signature(encoded, wallet, (provider.program_id, pool.pool_id))
    validate_raydium_transaction(transaction, wallet=wallet, quote=quote, program_id=provider.program_id, pool=pool)


@pytest.mark.parametrize("overrides", [{}, {"token_symbol": "USDT"}, {"reverse": True}])
def test_signed_raydium_transaction_matches_quote(overrides):
    validate(**overrides)


@pytest.mark.parametrize("overrides, message", [
    ({"amount": 2_000_000_000}, "Số lượng bán"),
    ({"minimum": 1}, "Số lượng bán"),
    ({"output_mint": str(Keypair().pubkey())}, "mint"),
    ({"output_account": str(Keypair().pubkey())}, "Tài khoản token"),
    ({"extra_instruction": lambda owner: transfer(TransferParams(
        from_pubkey=owner.pubkey(), to_pubkey=Keypair().pubkey(), lamports=1,
    ))}, "chuyển SOL"),
])
def test_signed_raydium_transaction_rejects_changed_quote_or_extra_transfer(overrides, message):
    with pytest.raises(ValueError, match=message):
        validate(**overrides)


def test_execute_api_rejects_changed_raydium_amount_before_submission(client):
    transaction, wallet, quote, provider, _, owner = make_swap(amount=2_000_000_000)
    _, player = login(client, owner)
    provider.get_order = lambda _request: quote
    provider.execute = lambda *_args: pytest.fail("unsafe transaction reached RPC submission")
    client.app.state.dex_provider = provider
    headers = {"Authorization": f"Bearer {player['access_token']}"}
    order = client.post("/dex/order", headers=headers, json={
        "wallet": wallet, "input_symbol": "SOL", "output_symbol": "USDC",
        "amount": quote.in_amount, "slippage_bps": 50, "idempotency_key": "raydium-amount-guard",
    })
    assert order.status_code == 200
    response = client.post("/dex/execute", headers=headers, json={
        "wallet": wallet, "request_id": quote.request_id,
        "signed_transaction": base64.b64encode(bytes(transaction)).decode(),
    })
    assert response.status_code == 422
    assert "Số lượng bán" in response.json()["detail"]
