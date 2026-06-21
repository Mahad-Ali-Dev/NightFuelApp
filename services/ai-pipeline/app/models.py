import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator

# ── Input bounds (security: prevent unbounded LLM inputs / token-cost abuse) ──
# Caps for free-form text and loosely-typed dict/list payloads that flow into
# the LLM. Kept generous enough for every legitimate client payload while
# rejecting the kind of oversized input that would blow up token cost or memory.
MAX_MESSAGE_CHARS = 4000          # single chat message
MAX_HISTORY_ITEMS = 20            # turns of prior conversation
MAX_HISTORY_ENTRY_CHARS = 4000    # content of one history turn
MAX_CONTEXT_BYTES = 16 * 1024     # serialized context dict (16 KB)
MAX_DICT_BYTES = 64 * 1024        # serialized loose stats/preferences dict (64 KB)
MAX_LIST_ITEMS = 100              # entries in a loose history list


def _reject_oversized_dict(value: Optional[Dict[str, Any]], limit: int, field_name: str):
    """Raise if the JSON-serialized dict exceeds ``limit`` bytes."""
    if value is None:
        return value
    try:
        size = len(json.dumps(value, default=str).encode("utf-8"))
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} is not serializable")
    if size > limit:
        raise ValueError(f"{field_name} exceeds maximum allowed size of {limit} bytes")
    return value

class GoalPreferences(BaseModel):
    primaryGoal: str  # e.g., "WEIGHT_LOSS", "MUSCLE_GAIN", "ENERGY"
    experienceLevel: Optional[str] = "BEGINNER" # "BEGINNER", "INTERMEDIATE", "ADVANCED", "ATHLETE"
    workoutEnvironment: Optional[str] = "GYM" # "HOME", "GYM", "HYBRID"
    availableEquipment: Optional[List[str]] = [] # ["DUMBBELLS", "BARBELL", "BANDS"]
    isBodybuilderMode: Optional[bool] = False
    isInjurySafeMode: Optional[bool] = False
    workoutDurationPreference: Optional[int] = 60 # 20, 40, 60
    splitPreference: Optional[str] = "FULL_BODY" # "PPL", "BRO_SPLIT", "FULL_BODY"
    dietaryPreference: Optional[str] = "ANY"
    dietMode: Optional[str] = "BALANCED"
    healthConditions: Optional[List[str]] = []
    region: Optional[str] = "us" # 'us', 'eu', 'ap'

class LogicTargets(BaseModel):
    calorieTarget: int
    proteinTargetG: int
    carbsTargetG: int
    fatTargetG: int
    trainingVolumeMultiplier: float

class DayPlanRequest(BaseModel):
    userId: str
    date: str
    shiftType: str
    circadianProfile: Optional[Dict[str, Any]] = None # Changed to Dict for flexibility
    logicTargets: Optional[LogicTargets] = None
    preferences: Optional[GoalPreferences] = None
    context: Optional[Dict[str, Any]] = None # New field for meal/exercise context

class DayPlanResponse(BaseModel):
    userId: str
    date: str
    structuredPlan: Dict[str, Any]
    providerUsed: str
    tokensUsed: int

class MealSwapRequest(BaseModel):
    userId: str
    region: str = "us"
    dietaryPreference: str = "ANY"
    dietMode: str = "BALANCED"
    healthConditions: List[str] = []
    targetCalories: int
    targetProteinG: int
    targetCarbsG: int
    targetFatG: int
    mealName: str

class MealSwapResponse(BaseModel):
    alternatives: List[Dict[str, Any]] # Each dict is a complete meal alternative

class ObjectivePreferences(BaseModel):
    primaryGoal: str = "WEIGHT_LOSS"
    dietaryPreference: str = "ANY"

class MealScoreRequest(BaseModel):
    userId: str
    meal: Dict[str, Any]
    preferences: ObjectivePreferences

# Redefining for accurate parsing if needed, or we just rely on Dicts
class MealScoreResponse(BaseModel):
    score: int
    rationale: str
    quick_fix: str

class WeeklyAuditRequest(BaseModel):
    """Bounded request body for /weekly-audit.

    Replaces the previous loose `Dict`/`List` query/body params so the
    aggregated stats/history/preferences that flow into the LLM cannot be
    arbitrarily large. Field shapes stay `Dict`/`List[Dict]` so existing
    valid payloads keep working; validators cap their serialized size.
    """
    userId: str
    stats: Dict[str, Any] = Field(default_factory=dict)
    history: List[Dict[str, Any]] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    preferences: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("stats", "preferences")
    @classmethod
    def _bound_dicts(cls, v: Dict[str, Any], info) -> Dict[str, Any]:
        return _reject_oversized_dict(v, MAX_DICT_BYTES, info.field_name)

    @field_validator("history")
    @classmethod
    def _bound_history(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for i, entry in enumerate(v):
            _reject_oversized_dict(entry, MAX_DICT_BYTES, f"history[{i}]")
        return v


class ChatHistoryEntry(BaseModel):
    role: str = Field(max_length=32)  # 'user' | 'assistant'
    content: str = Field(max_length=MAX_HISTORY_ENTRY_CHARS)


class CoachChatRequest(BaseModel):
    userId: str
    message: str = Field(max_length=MAX_MESSAGE_CHARS)
    # list of {role: 'user'|'assistant', content: '...'}; each entry bounded.
    history: List[ChatHistoryEntry] = Field(default_factory=list, max_length=MAX_HISTORY_ITEMS)
    context: Dict[str, Any] = Field(default_factory=dict)  # stats, profile, etc.

    @field_validator("context")
    @classmethod
    def _bound_context(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return _reject_oversized_dict(v, MAX_CONTEXT_BYTES, "context")
