from fastapi import APIRouter

from app.core.store import store
from app.schemas import LeaderboardEntryOut

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("", response_model=list[LeaderboardEntryOut])
def get_leaderboard():
    entries = store.get_leaderboard()
    return [LeaderboardEntryOut(**e) for e in entries]

