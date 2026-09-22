from fastapi import APIRouter, HTTPException, Request

from app.core.store import store
from app.schemas import (
    BuyListingRequest,
    CancelListingRequest,
    CreateListingRequest,
    CreateTradeRequest,
    MarketplaceListingOut,
    TradeActionRequest,
    TradeOut,
)

router = APIRouter(tags=["marketplace"])


def _marketplace_unavailable() -> None:
    """Do not simulate settlement before an atomic escrow contract exists.

    A database flag plus an arbitrary transaction digest is not a marketplace:
    it cannot prove payment, transfer, price, or recipient.  Read-only catalogue
    access remains available while the on-chain escrow program is implemented.
    """
    raise HTTPException(
        status_code=503,
        detail="Marketplace đang tạm khóa: cần escrow contract on-chain xác minh thanh toán và chuyển NFT nguyên tử",
    )


# ---------------------------------------------------------------------------
# Marketplace Listings
# ---------------------------------------------------------------------------

@router.get("/marketplace", response_model=list[MarketplaceListingOut])
def list_marketplace_listings(chain: str | None = None, faction_id: int | None = None):
    listings = store.get_active_listings(chain=chain, faction_id=faction_id)
    out = []
    for l in listings:
        adv = store.get_advisor(l.advisor_id)
        if not adv:
            continue
        out.append(
            MarketplaceListingOut(
                listing_id=l.listing_id,
                advisor_id=l.advisor_id,
                advisor_name=adv["name"],
                faction_id=adv["faction_id"],
                rarity=adv["rarity"],
                seller_wallet=l.seller_wallet,
                price=l.price,
                currency=l.currency,
                chain=l.chain,
                status=l.status,
                created_at=l.created_at,
            )
        )
    return out


@router.get("/marketplace/{listing_id}", response_model=MarketplaceListingOut)
def get_marketplace_listing(listing_id: str):
    listing = store.get_listing(listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy niêm yết trên chợ tướng")
    adv = store.get_advisor(listing.advisor_id)
    if not adv:
        raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu tướng cố vấn")
    return MarketplaceListingOut(
        listing_id=listing.listing_id,
        advisor_id=listing.advisor_id,
        advisor_name=adv["name"],
        faction_id=adv["faction_id"],
        rarity=adv["rarity"],
        seller_wallet=listing.seller_wallet,
        price=listing.price,
        currency=listing.currency,
        chain=listing.chain,
        status=listing.status,
        created_at=listing.created_at,
    )


@router.post("/marketplace/list", response_model=MarketplaceListingOut)
def create_listing(body: CreateListingRequest, request: Request):
    _marketplace_unavailable()
    advisor = store.get_advisor(body.advisor_id)
    if advisor is None:
        raise HTTPException(status_code=404, detail="Tướng cố vấn không tồn tại trong kho game")

    # Xác minh quyền sở hữu on-chain qua adapter nếu có thể
    adapter = request.app.state.resolver.get(body.chain)
    is_owner = adapter.verify_ownership(body.seller_wallet, body.token_id)
    if not is_owner:
        # Fallback check qua store ownership
        local_owner = store.get_advisor_ownership(body.advisor_id)
        if not local_owner or local_owner.owner_wallet != body.seller_wallet:
            # Cho phép tạo nếu đang trong môi trường dev/localnet hoặc đã ký
            pass

    listing = store.create_listing(
        advisor_id=body.advisor_id,
        seller_wallet=body.seller_wallet,
        price=body.price,
        currency=body.currency,
        chain=body.chain,
        token_id=body.token_id,
    )

    return MarketplaceListingOut(
        listing_id=listing.listing_id,
        advisor_id=listing.advisor_id,
        advisor_name=advisor["name"],
        faction_id=advisor["faction_id"],
        rarity=advisor["rarity"],
        seller_wallet=listing.seller_wallet,
        price=listing.price,
        currency=listing.currency,
        chain=listing.chain,
        status=listing.status,
        created_at=listing.created_at,
    )


@router.post("/marketplace/buy", response_model=MarketplaceListingOut)
def buy_listing(body: BuyListingRequest, request: Request):
    _marketplace_unavailable()
    listing = store.get_listing(body.listing_id)
    if listing is None or listing.status != "active":
        raise HTTPException(status_code=400, detail="Niêm yết không còn khả dụng để mua")

    # Xác thực transaction on-chain qua adapter
    adapter = request.app.state.resolver.get(listing.chain)
    tx = adapter.get_transaction(body.tx_digest)
    if tx and not tx.succeeded:
        raise HTTPException(status_code=400, detail="Giao dịch mua trên blockchain thất bại")

    ok = store.buy_listing(body.listing_id, body.buyer_wallet)
    if not ok:
        raise HTTPException(status_code=400, detail="Không thể hoàn tất giao dịch mua")

    adv = store.get_advisor(listing.advisor_id)
    return MarketplaceListingOut(
        listing_id=listing.listing_id,
        advisor_id=listing.advisor_id,
        advisor_name=adv["name"] if adv else listing.advisor_id,
        faction_id=adv["faction_id"] if adv else 1,
        rarity=adv["rarity"] if adv else "common",
        seller_wallet=listing.seller_wallet,
        price=listing.price,
        currency=listing.currency,
        chain=listing.chain,
        status="sold",
        created_at=listing.created_at,
    )


@router.post("/marketplace/cancel", response_model=MarketplaceListingOut)
def cancel_listing(body: CancelListingRequest):
    _marketplace_unavailable()
    listing = store.get_listing(body.listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy niêm yết")

    ok = store.cancel_listing(body.listing_id, body.seller_wallet)
    if not ok:
        raise HTTPException(status_code=403, detail="Chỉ người bán mới có quyền hủy niêm yết")

    adv = store.get_advisor(listing.advisor_id)
    return MarketplaceListingOut(
        listing_id=listing.listing_id,
        advisor_id=listing.advisor_id,
        advisor_name=adv["name"] if adv else listing.advisor_id,
        faction_id=adv["faction_id"] if adv else 1,
        rarity=adv["rarity"] if adv else "common",
        seller_wallet=listing.seller_wallet,
        price=listing.price,
        currency=listing.currency,
        chain=listing.chain,
        status="cancelled",
        created_at=listing.created_at,
    )


# ---------------------------------------------------------------------------
# Peer-to-Peer Trades
# ---------------------------------------------------------------------------

@router.post("/trades", response_model=TradeOut)
def create_trade(body: CreateTradeRequest):
    _marketplace_unavailable()
    offered_adv = store.get_advisor(body.offered_advisor_id)
    requested_adv = store.get_advisor(body.requested_advisor_id)
    if not offered_adv or not requested_adv:
        raise HTTPException(status_code=404, detail="Tướng cố vấn trong đề nghị trao đổi không tồn tại")

    trade = store.create_trade(
        initiator_wallet=body.initiator_wallet,
        target_wallet=body.target_wallet,
        offered_advisor_id=body.offered_advisor_id,
        requested_advisor_id=body.requested_advisor_id,
        chain=body.chain,
    )

    return TradeOut(
        trade_id=trade.trade_id,
        initiator_wallet=trade.initiator_wallet,
        target_wallet=trade.target_wallet,
        offered_advisor_id=trade.offered_advisor_id,
        offered_advisor_name=offered_adv["name"],
        requested_advisor_id=trade.requested_advisor_id,
        requested_advisor_name=requested_adv["name"],
        chain=trade.chain,
        status=trade.status,
        created_at=trade.created_at,
    )


@router.post("/trades/{trade_id}/accept", response_model=TradeOut)
def accept_trade(trade_id: str, body: TradeActionRequest):
    _marketplace_unavailable()
    trade = store.get_trade(trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lời đề nghị trao đổi")

    ok = store.accept_trade(trade_id, body.wallet, body.tx_digest)
    if not ok:
        raise HTTPException(status_code=400, detail="Không thể chấp nhận giao dịch trao đổi")

    offered_adv = store.get_advisor(trade.offered_advisor_id)
    requested_adv = store.get_advisor(trade.requested_advisor_id)

    return TradeOut(
        trade_id=trade.trade_id,
        initiator_wallet=trade.initiator_wallet,
        target_wallet=trade.target_wallet,
        offered_advisor_id=trade.offered_advisor_id,
        offered_advisor_name=offered_adv["name"] if offered_adv else trade.offered_advisor_id,
        requested_advisor_id=trade.requested_advisor_id,
        requested_advisor_name=requested_adv["name"] if requested_adv else trade.requested_advisor_id,
        chain=trade.chain,
        status="accepted",
        created_at=trade.created_at,
    )


@router.post("/trades/{trade_id}/reject", response_model=TradeOut)
def reject_trade(trade_id: str, body: TradeActionRequest):
    _marketplace_unavailable()
    trade = store.get_trade(trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lời đề nghị trao đổi")

    ok = store.reject_trade(trade_id, body.wallet)
    if not ok:
        raise HTTPException(status_code=403, detail="Không có quyền từ chối lời đề nghị trao đổi này")

    offered_adv = store.get_advisor(trade.offered_advisor_id)
    requested_adv = store.get_advisor(trade.requested_advisor_id)

    return TradeOut(
        trade_id=trade.trade_id,
        initiator_wallet=trade.initiator_wallet,
        target_wallet=trade.target_wallet,
        offered_advisor_id=trade.offered_advisor_id,
        offered_advisor_name=offered_adv["name"] if offered_adv else trade.offered_advisor_id,
        requested_advisor_id=trade.requested_advisor_id,
        requested_advisor_name=requested_adv["name"] if requested_adv else trade.requested_advisor_id,
        chain=trade.chain,
        status="rejected",
        created_at=trade.created_at,
    )

