from conftest import login, login_solana, make_wallet, sign_message


def auth_headers(player: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {player['access_token']}"}


def register_faction(client, adapter, wallet: str, player: dict, faction_id: int = 5) -> None:
    digest, object_id = adapter.mint_faction(wallet, faction_id)
    response = client.post(
        f"/players/{wallet}/faction",
        headers=auth_headers(player),
        json={"faction_id": faction_id, "nft_object_id": object_id, "tx_digest": digest},
    )
    assert response.status_code == 200, response.text


def win_battle(client, wallet: str, player: dict) -> str:
    response = client.post(
        "/battles",
        headers=auth_headers(player),
        json={
            "player_wallet": wallet,
            "scenario_id": "bach_dang_1288",
            "tactical_formation": "defensive",
            "advisor_id": "tran_hung_dao",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["victory"] is True
    return response.json()["battle_id"]


def test_nonce_then_verify_creates_player_with_session(client):
    wallet, player = login(client)
    assert player["wallet"] == wallet
    assert player["chain"] == "solana"
    assert player["access_token"]
    assert client.get(f"/players/{wallet}").status_code == 200


def test_verify_rejects_bad_signature(client):
    signing_key, wallet = make_wallet()
    nonce_resp = client.post("/auth/nonce", json={"chain": "solana", "wallet": wallet}).json()
    response = client.post(
        "/auth/wallet",
        json={
            "chain": "solana",
            "wallet": wallet,
            "nonce": nonce_resp["nonce"],
            "message": nonce_resp["message"],
            "signature": sign_message(signing_key, "message khác hoàn toàn"),
        },
    )
    assert response.status_code == 401
    response = client.post(
        "/auth/wallet",
        json={
            "chain": "solana",
            "wallet": wallet,
            "nonce": nonce_resp["nonce"],
            "message": nonce_resp["message"],
            "signature": sign_message(signing_key, nonce_resp["message"]),
        },
    )
    assert response.status_code == 200


def test_verify_rejects_reused_nonce(client):
    signing_key, wallet = make_wallet()
    nonce_resp = client.post("/auth/nonce", json={"chain": "solana", "wallet": wallet}).json()
    body = {
        "chain": "solana",
        "wallet": wallet,
        "nonce": nonce_resp["nonce"],
        "message": nonce_resp["message"],
        "signature": sign_message(signing_key, nonce_resp["message"]),
    }
    assert client.post("/auth/wallet", json=body).status_code == 200
    assert client.post("/auth/wallet", json=body).status_code == 400


def test_nonce_rejects_unsupported_chain(client):
    assert client.post("/auth/nonce", json={"chain": "bitcoin", "wallet": "abc"}).status_code == 422
    assert client.post("/auth/nonce", json={"chain": "ethereum", "wallet": "0xabc"}).status_code == 422


def test_nonce_rejects_invalid_solana_wallet(client):
    assert client.post("/auth/nonce", json={"chain": "solana", "wallet": "not-a-wallet"}).status_code == 422


def test_multiple_nonce_prompts_for_same_wallet_remain_valid(client):
    signing_key, wallet = make_wallet()
    first = client.post("/auth/nonce", json={"chain": "solana", "wallet": wallet}).json()
    second = client.post("/auth/nonce", json={"chain": "solana", "wallet": wallet}).json()
    assert first["nonce"] != second["nonce"]
    for challenge in (first, second):
        response = client.post(
            "/auth/wallet",
            json={
                "chain": "solana",
                "wallet": wallet,
                **challenge,
                "signature": sign_message(signing_key, challenge["message"]),
            },
        )
        assert response.status_code == 200


def test_public_blockchain_config_is_solana_only(client):
    response = client.get("/blockchain/solana/config")
    assert response.status_code == 200
    assert response.json()["chain"] == "solana"
    assert set(response.json()) == {"chain", "network", "program_id"}
    assert client.get("/blockchain/ethereum/transaction/anything").status_code == 404


def test_state_changing_routes_require_matching_session(client, adapter):
    owner_wallet, _owner = login(client)
    other_wallet, other = login(client)
    digest, object_id = adapter.mint_faction(owner_wallet, 5)
    body = {"faction_id": 5, "nft_object_id": object_id, "tx_digest": digest}
    assert client.post(f"/players/{owner_wallet}/faction", json=body).status_code == 401
    assert client.post(f"/players/{owner_wallet}/faction", headers=auth_headers(other), json=body).status_code == 403
    assert other_wallet != owner_wallet


def test_faction_registration_requires_matching_onchain_nft(client, adapter):
    wallet, player = login(client)
    digest, object_id = adapter.mint_faction(wallet, 1)
    response = client.post(
        f"/players/{wallet}/faction",
        headers=auth_headers(player),
        json={"faction_id": 2, "nft_object_id": object_id, "tx_digest": digest},
    )
    assert response.status_code == 400


def test_faction_registration_rejects_transaction_from_another_wallet(client, adapter):
    wallet, player = login(client)
    digest, object_id = adapter.mint_faction(wallet, 5)
    adapter.txs[digest].sender = "another-solana-wallet"
    response = client.post(
        f"/players/{wallet}/faction",
        headers=auth_headers(player),
        json={"faction_id": 5, "nft_object_id": object_id, "tx_digest": digest},
    )
    assert response.status_code == 400
    assert "mint_faction" in response.json()["detail"]


def test_faction_registration_rejects_unrelated_successful_transaction(client, adapter):
    wallet, player = login(client)
    digest, object_id = adapter.mint_faction(wallet, 5)
    adapter.txs[digest].events = []
    response = client.post(
        f"/players/{wallet}/faction",
        headers=auth_headers(player),
        json={"faction_id": 5, "nft_object_id": object_id, "tx_digest": digest},
    )
    assert response.status_code == 400


def test_reward_requires_owned_winning_battle_and_is_single_use(client, adapter):
    wallet, player = login(client)
    register_faction(client, adapter, wallet, player)
    battle_id = win_battle(client, wallet, player)
    headers = auth_headers(player)
    assert client.post(
        "/rewards/claim", headers=headers, json={"wallet": wallet, "battle_id": "battle-does-not-exist"}
    ).status_code == 404

    response = client.post("/rewards/claim", headers=headers, json={"wallet": wallet, "battle_id": battle_id})
    assert response.status_code == 200, response.text
    digest = response.json()["tx_digest"]
    assert response.json()["battle_id"] == battle_id
    assert client.post("/rewards/claim", headers=headers, json={"wallet": wallet, "battle_id": battle_id}).status_code == 409
    assert client.get(f"/blockchain/solana/transaction/{digest}").status_code == 200


def test_solana_login_uses_base58_signature(client):
    wallet, player = login_solana(client)
    assert player["chain"] == "solana"
    assert player["wallet"] == wallet
    assert player["access_token"]
