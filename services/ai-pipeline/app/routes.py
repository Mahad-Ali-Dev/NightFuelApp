from typing import Dict, Any, List
from fastapi import APIRouter
from .models import DayPlanRequest, DayPlanResponse, GoalPreferences
from .validators import generate_skeleton
from .chains.plan_generator import generate_plan_content, LLMProvider
from .chains.audit_generator import generate_weekly_audit
from .chains.meal_swap import generate_meal_alternatives
from .logger import logger
from .rate_limiter import check_rate_limit
from pydantic import BaseModel

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/generate-plan", response_model=DayPlanResponse)
async def generate_plan(request: DayPlanRequest, provider: str = "openai"):
    """
    Synchronous endpoint for plan generation.
    Takes a single day's circadian profile and returns a structured AI-generated plan.
    """
    logger.info(f"Generating plan for user {request.userId} on date {request.date}")
    await check_rate_limit(request.userId)

    # Layer 2: Chrono-Nutrition Optimizer (Rules Engine)
    skeleton = generate_skeleton(request)
    logger.info("Generated plan skeleton", extra={"skeleton_rules": skeleton["rules"]})

    # Validate provider input — default to OpenAI since that key is configured
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        logger.warning(f"Invalid provider requested '{provider}', falling back to OpenAI.")
        active_provider = LLMProvider.OPENAI

    pref_dict = request.preferences.model_dump() if request.preferences else {}
    logic_targets_dict = request.logicTargets.model_dump() if request.logicTargets else None
    
    # Layer 3: Adaptive LLM Layer
    structured_plan = await generate_plan_content(
        user_id=request.userId,
        skeleton=skeleton,
        user_preferences=pref_dict,
        logic_targets=logic_targets_dict,
        provider=active_provider
    )
    
    logger.info("Plan generation complete", extra={"structured_plan": structured_plan})
    
    return DayPlanResponse(
        userId=request.userId,
        date=request.date,
        structuredPlan=structured_plan,
        providerUsed=active_provider.value,
        tokensUsed=2000  
    )

@router.post("/weekly-audit")
async def weekly_audit(
    userId: str,
    stats: Dict[str, Any],
    history: List[Dict[str, Any]],
    preferences: Dict[str, Any],
    provider: str = "openai"
):
    """
    Generate a coaching summary/audit for the last 7 days.
    """
    logger.info(f"Generating weekly audit for user {userId}")
    await check_rate_limit(userId)
    
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.OPENAI

    return await generate_weekly_audit(
        userId=userId,
        stats=stats,
        history=history,
        preferences=preferences,
        provider=active_provider
    )

class SwapPayload(BaseModel):
    userId: str
    meal_to_swap: Dict[str, Any]
    preferences: GoalPreferences

@router.post("/meal-swap")
async def meal_swap(
    payload: SwapPayload,
    provider: str = "openai"
):
    """
    Swap a single meal for an alternative that fits the same caloric/macro profile.
    """
    logger.info("Swapping meal", extra={"meal": payload.meal_to_swap.get("name", "Unknown")})
    await check_rate_limit(payload.userId)
    
    # Validate provider
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.OPENAI

    pref_dict = payload.preferences.model_dump() if payload.preferences else {}
    
    return await generate_meal_alternatives(
        user_id=payload.userId,
        meal=payload.meal_to_swap,
        preferences=pref_dict,
        provider=active_provider
    )

from .chains.meal_scorer import generate_meal_score
from .models import MealScoreRequest

@router.post("/meal-score")
async def meal_score(
    payload: MealScoreRequest,
    provider: str = "openai"
):
    logger.info("Scoring custom meal", extra={"meal": payload.meal.get("name", "Unknown")})
    await check_rate_limit(payload.userId)
    
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.OPENAI
        
    pref_dict = payload.preferences.model_dump() if payload.preferences else {}
    
    return await generate_meal_score(
        user_id=payload.userId,
        meal=payload.meal,
        preferences=pref_dict,
        provider=active_provider
    )

from .chains.coach_chat import generate_chat_response
from .models import CoachChatRequest

@router.post("/chat")
async def chat_with_coach(
    payload: CoachChatRequest,
    provider: str = "openai"
):
    logger.info("Handling chat request", extra={"userId": payload.userId})
    await check_rate_limit(payload.userId)
    
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.OPENAI
        
    response_text = await generate_chat_response(
        user_id=payload.userId,
        message=payload.message,
        history=payload.history,
        context=payload.context,
        provider=active_provider
    )
    
    return {"reply": response_text}
