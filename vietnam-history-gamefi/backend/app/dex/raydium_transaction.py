"""Validate a wallet-signed Raydium CPMM transaction against its stored quote.

The frontend builds a legacy transaction with the pinned Raydium SDK.  The
server must check the swap instruction and its supporting account instructions
before it sends that transaction to the RPC node.
"""

from __future__ import annotations

from solders.instruction import AccountMeta, Instruction
from solders.message import Message
from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID, decode_create_account_with_seed
from solders.transaction import VersionedTransaction

from app.blockchain.solana_adapter import SPL_TOKEN_PROGRAM_ID
from app.dex.interface import DexOrder, SOL_MINT, token_registry
from app.dex.raydium_provider import PoolConfig


ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111"
SWAP_BASE_INPUT_DISCRIMINATOR = bytes((143, 190, 90, 218, 196, 30, 51, 222))
TOKEN_ACCOUNT_SIZE = 165


def _ata(wallet: str, mint: str) -> str:
    address, _ = Pubkey.find_program_address(
        [bytes(Pubkey.from_string(wallet)), bytes(Pubkey.from_string(SPL_TOKEN_PROGRAM_ID)),
         bytes(Pubkey.from_string(mint))],
        Pubkey.from_string(ASSOCIATED_TOKEN_PROGRAM_ID),
    )
    return str(address)


def validate_raydium_transaction(
    transaction: VersionedTransaction,
    *,
    wallet: str,
    quote: DexOrder,
    program_id: str,
    pool: PoolConfig,
) -> None:
    """Fail closed if a signed transaction changes the quote or adds transfers."""
    message = transaction.message
    if not isinstance(message, Message):
        raise ValueError("DEX Devnet chỉ chấp nhận giao dịch Raydium legacy")
    keys = [str(key) for key in message.account_keys]

    def accounts(instruction) -> list[str]:
        return [keys[index] for index in instruction.accounts]

    swaps = [instruction for instruction in message.instructions
             if keys[instruction.program_id_index] == program_id]
    if len(swaps) != 1:
        raise ValueError("Giao dịch phải chứa đúng một lệnh swap Raydium")
    swap = swaps[0]
    swap_accounts = accounts(swap)
    if len(swap_accounts) != 13 or len(swap.data) != 24 or bytes(swap.data[:8]) != SWAP_BASE_INPUT_DISCRIMINATOR:
        raise ValueError("Lệnh swap Raydium không đúng định dạng báo giá")

    token_symbol = quote.output_symbol if quote.input_symbol == "SOL" else quote.input_symbol
    if {quote.input_symbol, quote.output_symbol} != {"SOL", token_symbol} or token_symbol not in {"USDC", "USDT"}:
        raise ValueError("Cặp token của lệnh Raydium không được hỗ trợ")
    token_mint = token_registry("devnet")[token_symbol].mint
    if quote.router != pool.pool_id or pool.token_mint != token_mint:
        raise ValueError("Pool của giao dịch không khớp báo giá")
    selling_sol = quote.input_symbol == "SOL"
    expected_input_mint = SOL_MINT if selling_sol else token_mint
    expected_output_mint = token_mint if selling_sol else SOL_MINT
    expected_input_vault = pool.wsol_vault if selling_sol else pool.token_vault
    expected_output_vault = pool.token_vault if selling_sol else pool.wsol_vault
    expected_accounts = {
        0: wallet,
        2: pool.config_id,
        3: pool.pool_id,
        6: expected_input_vault,
        7: expected_output_vault,
        8: SPL_TOKEN_PROGRAM_ID,
        9: SPL_TOKEN_PROGRAM_ID,
        10: expected_input_mint,
        11: expected_output_mint,
    }
    if any(swap_accounts[index] != expected for index, expected in expected_accounts.items()):
        raise ValueError("Ví, mint, vault hoặc pool trong giao dịch khác báo giá")
    token_account = swap_accounts[5 if selling_sol else 4]
    if token_account != _ata(wallet, token_mint):
        raise ValueError("Tài khoản token trong giao dịch không thuộc ví đã báo giá")

    input_amount = int.from_bytes(swap.data[8:16], "little")
    minimum_output = int.from_bytes(swap.data[16:24], "little")
    quoted_minimum = max(1, int(quote.out_amount) * (10_000 - quote.slippage_bps) // 10_000)
    if input_amount != int(quote.in_amount) or minimum_output < quoted_minimum:
        raise ValueError("Số lượng bán hoặc mức nhận tối thiểu khác báo giá")

    wsol_account = swap_accounts[4 if selling_sol else 5]
    if wsol_account in {wallet, token_account, expected_input_vault, expected_output_vault}:
        raise ValueError("Tài khoản WSOL tạm không hợp lệ")
    swap_position = message.instructions.index(swap)
    saw_create = saw_initialize = saw_close = False
    compute_limit = 200_000
    compute_price = 0
    for position, instruction in enumerate(message.instructions):
        program = keys[instruction.program_id_index]
        if program == program_id:
            continue
        ix_accounts = accounts(instruction)
        data = bytes(instruction.data)
        if program == str(SYSTEM_PROGRAM_ID):
            if saw_create or position >= swap_position or not data.startswith(b"\x03\x00\x00\x00"):
                raise ValueError("Giao dịch chứa lệnh chuyển SOL ngoài swap")
            metadata = [AccountMeta(Pubkey.from_string(account), False, True) for account in ix_accounts]
            try:
                created = decode_create_account_with_seed(Instruction(SYSTEM_PROGRAM_ID, data, metadata))
            except Exception as exc:
                raise ValueError("Lệnh tạo tài khoản WSOL không hợp lệ") from exc
            if (str(created["from_pubkey"]) != wallet or str(created["to_pubkey"]) != wsol_account
                    or str(created["base"]) != wallet or str(created["owner"]) != SPL_TOKEN_PROGRAM_ID
                    or created["space"] != TOKEN_ACCOUNT_SIZE
                    or created["lamports"] < (input_amount if selling_sol else 0)):
                raise ValueError("Tài khoản WSOL tạm không khớp lệnh swap")
            saw_create = True
        elif program == SPL_TOKEN_PROGRAM_ID:
            if data == b"\x01" and position < swap_position and not saw_initialize:
                if len(ix_accounts) < 3 or ix_accounts[:3] != [wsol_account, SOL_MINT, wallet]:
                    raise ValueError("Tài khoản WSOL tạm không thuộc ví giao dịch")
                saw_initialize = True
            elif data == b"\x09" and position > swap_position and not saw_close:
                if len(ix_accounts) < 3 or ix_accounts[:3] != [wsol_account, wallet, wallet]:
                    raise ValueError("WSOL phải được hoàn trả về ví giao dịch")
                saw_close = True
            else:
                raise ValueError("Giao dịch chứa lệnh token ngoài swap")
        elif program == ASSOCIATED_TOKEN_PROGRAM_ID:
            if (position >= swap_position or data not in {b"", b"\x01"} or len(ix_accounts) < 4
                    or ix_accounts[:4] != [wallet, token_account, wallet, token_mint]):
                raise ValueError("Lệnh tạo tài khoản token không khớp ví giao dịch")
        elif program == COMPUTE_BUDGET_PROGRAM_ID:
            if position >= swap_position or not data:
                raise ValueError("Lệnh phí mạng không hợp lệ")
            if data[0] == 2 and len(data) == 5:
                compute_limit = int.from_bytes(data[1:], "little")
                if not 1 <= compute_limit <= 1_400_000:
                    raise ValueError("Giới hạn phí mạng không hợp lệ")
            elif data[0] == 3 and len(data) == 9:
                compute_price = int.from_bytes(data[1:], "little")
            else:
                raise ValueError("Lệnh phí mạng không được hỗ trợ")
        else:
            raise ValueError("Giao dịch chứa chương trình ngoài swap")
    if not (saw_create and saw_initialize and saw_close):
        raise ValueError("Giao dịch thiếu bước tạo hoặc hoàn trả WSOL")
    if compute_limit * compute_price > 20_000 * 1_000_000:
        raise ValueError("Phí ưu tiên giao dịch vượt giới hạn DEX Devnet")
