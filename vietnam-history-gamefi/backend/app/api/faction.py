import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.dependencies import require_session, require_wallet
from app.core.security import SessionPrincipal
from app.core.config import get_settings
from app.core.store import store
from app.schemas import FactionOut, FactionRegisterRequest, PlayerOut, SelectFactionRequest

router = APIRouter(tags=["faction"])


@router.get("/factions", response_model=list[FactionOut])
def list_factions():
    path = Path(get_settings().factions_file)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[3] / path
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return [FactionOut(**item) for item in data["factions"]]


def _faction_exists(faction_id: int) -> bool:
    return any(faction.faction_id == faction_id for faction in list_factions())


@router.get("/players/{wallet}", response_model=PlayerOut)
def get_player(wallet: str, chain: str | None = None):
    player = store.get_player(chain, wallet) if chain else store.find_player_any_chain(wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại")
    return PlayerOut(
        wallet=player.wallet,
        chain=player.chain,
        username=player.username,
        faction_id=player.faction_id,
        nft_object_id=player.nft_object_id,
        level=player.level,
        rice=player.rice,
        gold=player.gold,
        morale=player.morale,
        is_guest=player.is_guest,
    )


@router.post("/players/{wallet}/faction/select", response_model=PlayerOut)
def select_faction_f2p(
    wallet: str,
    body: SelectFactionRequest,
    principal: SessionPrincipal = Depends(require_session),
):
    """Chọn Faction cho người chơi F2P / Guest mà không bắt buộc phải mint NFT (Section 13)."""
    require_wallet(principal, wallet)
    if not principal.is_guest:
        raise HTTPException(status_code=403, detail="Ví đã kết nối phải đăng ký Faction NFT on-chain")
    if not _faction_exists(body.faction_id):
        raise HTTPException(status_code=422, detail="Faction không tồn tại")
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=401, detail="Phiên không có player hợp lệ")

    player.faction_id = body.faction_id
    # Tự động gán starting advisor của faction cho người chơi
    starting_adv = store.get_starting_advisor_for_faction(body.faction_id)
    if starting_adv:
        store.equip_advisor(wallet, starting_adv)

    return PlayerOut(
        wallet=player.wallet,
        chain=player.chain,
        username=player.username,
        faction_id=player.faction_id,
        nft_object_id=player.nft_object_id,
        level=player.level,
        rice=player.rice,
        gold=player.gold,
        morale=player.morale,
        is_guest=player.is_guest,
    )


@router.post("/players/{wallet}/faction", response_model=PlayerOut)
def register_player_faction(
    wallet: str,
    body: FactionRegisterRequest,
    request: Request,
    chain: str | None = None,
    principal: SessionPrincipal = Depends(require_session),
):
    require_wallet(principal, wallet)
    if principal.is_guest:
        raise HTTPException(status_code=403, detail="Tài khoản guest không thể đăng ký NFT")
    if chain is not None and chain.lower() != principal.chain:
        raise HTTPException(status_code=403, detail="Chain không thuộc phiên đăng nhập")
    if not _faction_exists(body.faction_id):
        raise HTTPException(status_code=422, detail="Faction không tồn tại")
    player = store.get_player(principal.chain, principal.wallet)
    if player is None:
        raise HTTPException(status_code=404, detail="Player chưa tồn tại — đăng nhập ví trước")

    adapter = request.app.state.resolver.get(player.chain)

    if not adapter.verify_faction_mint(
        player.wallet,
        body.nft_object_id,
        body.faction_id,
        body.tx_digest,
    ):
        raise HTTPException(status_code=400, detail="TX không phải mint_faction hợp lệ của ví này")
    matching_nft = next(
        (
            nft
            for nft in adapter.get_faction_nfts(player.wallet)
            if nft.object_id == body.nft_object_id
            and nft.owner == player.wallet
            and nft.faction_id == body.faction_id
        ),
        None,
    )
    if matching_nft is None:
        raise HTTPException(
            status_code=400,
            detail="NFT không đúng loại, không thuộc ví, hoặc không khớp Faction yêu cầu",
        )

    player.faction_id = body.faction_id
    player.nft_object_id = body.nft_object_id

    # Gán starting advisor
    starting_adv = store.get_starting_advisor_for_faction(body.faction_id)
    if starting_adv:
        store.equip_advisor(wallet, starting_adv)

    return PlayerOut(
        wallet=player.wallet,
        chain=player.chain,
        username=player.username,
        faction_id=player.faction_id,
        nft_object_id=player.nft_object_id,
        level=player.level,
        rice=player.rice,
        gold=player.gold,
        morale=player.morale,
        is_guest=player.is_guest,
    )
