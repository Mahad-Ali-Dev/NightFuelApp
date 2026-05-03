from typing import Optional, List, Dict, Any
from pydantic import BaseModel

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

class CoachChatRequest(BaseModel):
    userId: str
    message: str
    history: List[Dict[str, str]] = [] # list of {role: 'user'|'assistant', content: '...'}
    context: Dict[str, Any] = {} # stats, profile, etc.
