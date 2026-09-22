"""Gameplay routes remain usable, but every state change is session-bound."""

from conftest import login


def auth_headers(player: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {player['access_token']}"}


def test_f2p_guest_flow(client):
    player = client.post("/auth/guest", json={"username": "TuongQuan_DaiViet"}).json()
    headers = auth_headers(player)
    assert player["is_guest"] is True
    assert player["access_token"]

    factions = client.get("/factions").json()
    tran_faction = next(faction for faction in factions if faction["name"] == "Nhà Trần")
    selected = client.post(
        f"/players/{player['wallet']}/faction/select",
        headers=headers,
        json={"faction_id": tran_faction["faction_id"]},
    )
    assert selected.status_code == 200

    army = client.get(f"/players/{player['wallet']}/army", headers=headers)
    assert army.status_code == 200
    assert army.json()["equipped_advisor_id"] == "tran_hung_dao"


def test_guest_cannot_modify_another_player(client):
    first = client.post("/auth/guest", json={"username": "Mot"}).json()
    second = client.post("/auth/guest", json={"username": "Hai"}).json()
    response = client.post(
        f"/players/{first['wallet']}/faction/select",
        headers=auth_headers(second),
        json={"faction_id": 5},
    )
    assert response.status_code == 403


def test_advisor_catalog(client):
    advisors = client.get("/advisors").json()
    assert len(advisors) >= 10
    assert any(advisor["id"] == "tran_hung_dao" for advisor in client.get("/advisors?faction_id=5").json())
    assert client.get("/advisors/tran_hung_dao").json()["rarity"] == "legendary"


def test_offchain_battle_engine_is_authenticated(client):
    player = client.post("/auth/guest", json={"username": "ChiHuyTruong"}).json()
    headers = auth_headers(player)
    client.post(f"/players/{player['wallet']}/faction/select", headers=headers, json={"faction_id": 5}).raise_for_status()
    body = {
        "player_wallet": player["wallet"],
        "scenario_id": "bach_dang_1288",
        "tactical_formation": "defensive",
        "advisor_id": "tran_hung_dao",
    }
    result = client.post("/battles", headers=headers, json=body)
    assert result.status_code == 200
    assert len(result.json()["combat_logs"]) == 5
    assert client.post("/battles", headers=headers, json={**body, "scenario_id": "anything"}).status_code == 422


def test_battle_requires_selected_faction(client):
    wallet, player = login(client)
    response = client.post(
        "/battles",
        headers=auth_headers(player),
        json={"player_wallet": wallet, "scenario_id": "bach_dang_1288", "tactical_formation": "aggressive"},
    )
    assert response.status_code == 409
    assert "chọn faction" in response.json()["detail"]


def test_marketplace_is_read_only_until_escrow_contract_exists(client):
    listings = client.get("/marketplace")
    assert listings.status_code == 200
    assert listings.json() == []
    response = client.post(
        "/marketplace/buy",
        json={"listing_id": "not-listed", "buyer_wallet": "attacker", "tx_digest": "fake"},
    )
    assert response.status_code == 503
