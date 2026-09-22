from fastapi import APIRouter, HTTPException

from app.core.store import store
from app.schemas import AdvisorOut, AdvisorOwnershipOut

router = APIRouter(prefix="/advisors", tags=["advisor"])


@router.get("", response_model=list[AdvisorOut])
def list_advisors(faction_id: int | None = None, rarity: str | None = None):
    advisors = store.get_advisors()
    results = []
    for a in advisors:
        if faction_id is not None and a.get("faction_id") != faction_id:
            continue
        if rarity is not None and a.get("rarity", "").lower() != rarity.lower():
            continue
        results.append(AdvisorOut(**a))
    return results


@router.get("/{advisor_id}", response_model=AdvisorOut)
def get_advisor(advisor_id: str):
    advisor = store.get_advisor(advisor_id)
    if advisor is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy Tướng Cố Vấn")
    return AdvisorOut(**advisor)


@router.get("/{advisor_id}/ownership", response_model=AdvisorOwnershipOut)
def get_advisor_ownership(advisor_id: str):
    advisor = store.get_advisor(advisor_id)
    if advisor is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy Tướng Cố Vấn")
    
    ownership = store.get_advisor_ownership(advisor_id)
    return AdvisorOwnershipOut(
        advisor_id=advisor_id,
        advisor_name=advisor["name"],
        owner_wallet=ownership.owner_wallet if ownership else None,
        chain=ownership.chain if ownership else None,
        token_id=ownership.token_id if ownership else None,
        is_verified=ownership is not None,
        verified_at=str(ownership.verified_at) if ownership else None,
    )
