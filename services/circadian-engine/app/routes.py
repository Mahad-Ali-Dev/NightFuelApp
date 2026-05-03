from fastapi import APIRouter
from .models import Shift, ComputedProfile, compute_profile

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/profile", response_model=ComputedProfile)
def generate_profile(shift: Shift):
    """
    Synchronously compute a circadian profile from a shift.
    Primarily called by ai-pipeline when it needs a fresh profile.
    """
    profile = compute_profile(shift)
    return profile
