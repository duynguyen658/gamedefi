from concurrent.futures import ThreadPoolExecutor

from app.core.security import NonceStore, normalize_wallet, verify_wallet_signature
from conftest import make_wallet, sign_message


def test_solana_signature():
    key, wallet = make_wallet()
    message = "vn-history-gamefi Solana wallet login: nonce"
    signature = sign_message(key, message)
    assert verify_wallet_signature("solana", wallet, message.encode(), signature)
    assert not verify_wallet_signature("solana", wallet, b"different", signature)
    assert not verify_wallet_signature("ethereum", wallet, message.encode(), signature)


def test_wrong_wallet_and_malformed_signature():
    key, wallet = make_wallet()
    _, other = make_wallet()
    assert not verify_wallet_signature("solana", other, b"hello", sign_message(key, "hello"))
    for value in ("", "bad-signature!", "111"):
        assert not verify_wallet_signature("solana", wallet, b"hello", value)


def test_wallet_case_is_preserved():
    assert normalize_wallet("solana", "AbCdEf") == "AbCdEf"


def test_nonce_is_consumed_atomically_once():
    store = NonceStore(ttl_seconds=60)
    nonce, _message = store.create("solana", "wallet")
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _index: store.consume("solana", "wallet", nonce), range(8)))
    assert results.count(True) == 1
