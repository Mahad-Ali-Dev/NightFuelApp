from typing import Dict, Any
from fastapi import APIRouter, Request, Depends
from .models import DayPlanRequest, DayPlanResponse, GoalPreferences, WeeklyAuditRequest
from .validators import generate_skeleton
from .chains.plan_generator import generate_plan_content, LLMProvider
from .chains.audit_generator import generate_weekly_audit
from .chains.meal_swap import generate_meal_alternatives
from .logger import logger
from .rate_limiter import check_rate_limit
from .auth import require_caller, require_internal
from pydantic import BaseModel

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/generate-plan", response_model=DayPlanResponse)
async def generate_plan(
    request: DayPlanRequest,
    http_request: Request,
    provider: str = "anthropic",
    # F34 #6: s2s only — internal token required (NOT a user JWT) so users can't
    # call ai-pipeline directly and bypass plan-service's daily AI cap.
    identity: str = Depends(require_internal),
):
    """
    Synchronous endpoint for plan generation.
    Takes a single day's circadian profile and returns a structured AI-generated plan.
    """
    logger.info(f"Generating plan for user {request.userId} on date {request.date}")
    await check_rate_limit(identity, category="generation")

    # Layer 2: Chrono-Nutrition Optimizer (Rules Engine)
    skeleton = generate_skeleton(request)
    logger.info("Generated plan skeleton", extra={"skeleton_rules": skeleton["rules"]})

    # Validate provider input — default to OpenAI since that key is configured
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        logger.warning(f"Invalid provider requested '{provider}', falling back to OpenAI.")
        active_provider = LLMProvider.ANTHROPIC

    pref_dict = request.preferences.model_dump() if request.preferences else {}
    logic_targets_dict = request.logicTargets.model_dump() if request.logicTargets else None
    
    # Layer 3: Adaptive LLM Layer
    structured_plan = await generate_plan_content(
        user_id=request.userId,
        skeleton=skeleton,
        user_preferences=pref_dict,
        logic_targets=logic_targets_dict,
        provider=active_provider,
        cycle_phase=request.cyclePhase,
        # F35 #12: attribute telemetry to the verified caller identity, not the
        # client-supplied body userId. For this s2s route identity == "internal",
        # so the handler keeps the body userId the sibling service vouched for.
        verified_identity=identity,
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
    payload: WeeklyAuditRequest,
    http_request: Request,
    provider: str = "anthropic",
    # F34 #6: s2s only — internal token required (NOT a user JWT). progress-service
    # is the real caller and enforces the cap before reaching here.
    identity: str = Depends(require_internal),
):
    """
    Generate a coaching summary/audit for the last 7 days.
    """
    logger.info(f"Generating weekly audit for user {payload.userId}")
    await check_rate_limit(identity, category="generation")

    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.ANTHROPIC

    return await generate_weekly_audit(
        userId=payload.userId,
        stats=payload.stats,
        history=payload.history,
        preferences=payload.preferences,
        provider=active_provider
    )

class SwapPayload(BaseModel):
    userId: str
    meal_to_swap: Dict[str, Any]
    preferences: GoalPreferences

@router.post("/meal-swap")
async def meal_swap(
    payload: SwapPayload,
    http_request: Request,
    provider: str = "anthropic",
    # F35a review: user-facing — the web dashboard "Swap meal" button calls this
    # directly with a user JWT (clients/web/lib/api.ts swapMeal). Unlike
    # generate-plan/weekly-audit there is no daily-cap server path to bypass, so it
    # stays require_caller (per-identity rate-limited below) rather than internal-only.
    identity: str = Depends(require_caller),
):
    """
    Swap a single meal for an alternative that fits the same caloric/macro profile.
    """
    logger.info("Swapping meal", extra={"meal": payload.meal_to_swap.get("name", "Unknown")})
    await check_rate_limit(identity, category="generation")
    
    # Validate provider
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.ANTHROPIC

    pref_dict = payload.preferences.model_dump() if payload.preferences else {}
    
    return await generate_meal_alternatives(
        user_id=payload.userId,
        meal=payload.meal_to_swap,
        preferences=pref_dict,
        provider=active_provider,
        # F35 #12: user-facing route — attribute telemetry to the verified JWT
        # identity so a forged body userId can't book usage to another account.
        verified_identity=identity,
    )

from .chains.meal_scorer import generate_meal_score
from .models import MealScoreRequest

@router.post("/meal-score")
async def meal_score(
    payload: MealScoreRequest,
    http_request: Request,
    provider: str = "anthropic",
    # F35a review: user-facing — the web meal-insights panel calls this directly with a
    # user JWT (clients/web/lib/api.ts scoreMeal). No daily-cap path to bypass, so it
    # stays require_caller (per-identity rate-limited below), not internal-only.
    identity: str = Depends(require_caller),
):
    logger.info("Scoring custom meal", extra={"meal": payload.meal.get("name", "Unknown")})
    await check_rate_limit(identity, category="generation")
    
    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.ANTHROPIC
        
    pref_dict = payload.preferences.model_dump() if payload.preferences else {}
    
    return await generate_meal_score(
        user_id=payload.userId,
        meal=payload.meal,
        preferences=pref_dict,
        provider=active_provider,
        # F35 #12: attribute telemetry to the verified JWT identity, not the body.
        verified_identity=identity,
    )

from .chains.coach_chat import generate_chat_response
from .chains.coach_chat_stream import generate_chat_response_stream
from .models import CoachChatRequest
from fastapi.responses import StreamingResponse
import json as _json

@router.post("/chat")
async def chat_with_coach(
    payload: CoachChatRequest,
    http_request: Request,
    provider: str = "anthropic",
    identity: str = Depends(require_caller),
):
    logger.info("Handling chat request", extra={"userId": payload.userId})
    await check_rate_limit(identity, category="chat")

    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.ANTHROPIC

    response_text = await generate_chat_response(
        user_id=payload.userId,
        message=payload.message,
        history=[h.model_dump() for h in payload.history],
        context=payload.context,
        provider=active_provider,
        # F35 #12: attribute telemetry to the verified JWT identity, not the body.
        verified_identity=identity,
    )

    return {"reply": response_text}


@router.post("/chat/stream")
async def chat_with_coach_stream(
    payload: CoachChatRequest,
    http_request: Request,
    provider: str = "anthropic",
    identity: str = Depends(require_caller),
):
    """
    Server-Sent Events streaming variant of /chat.

    The mobile client opens an EventSource against this URL with the JSON
    payload as POST body. We yield SSE-formatted lines:

        data: {"type": "token", "delta": "Hi"}\\n\\n
        data: {"type": "token", "delta": " there"}\\n\\n
        ...
        data: {"type": "done", "tokens": ..., "cost_usd": ..., "model": "..."}\\n\\n
        data: [DONE]\\n\\n

    The trailing `[DONE]` is for clients that prefer a sentinel string
    over parsing the structured "done" event — both are emitted.

    Closes M1, M5, M6 from PRODUCTION_READINESS.md.
    """
    logger.info("Handling streaming chat request", extra={"userId": payload.userId})
    await check_rate_limit(identity, category="chat")

    try:
        active_provider = LLMProvider(provider.lower())
    except ValueError:
        active_provider = LLMProvider.ANTHROPIC

    async def event_generator():
        async for event in generate_chat_response_stream(
            user_id=payload.userId,
            message=payload.message,
            history=[h.model_dump() for h in payload.history],
            context=payload.context,
            provider=active_provider,
            # F35 #12: attribute telemetry to the verified JWT identity, not the body.
            verified_identity=identity,
        ):
            # SSE: "data: <line>\n\n". JSON inside; one event per chunk.
            yield f"data: {_json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable nginx buffering for long-lived streams. The gateway
            # config also needs `proxy_buffering off` for the /v1/ai/chat/stream
            # location — see infra/docker/nginx/nginx.conf.
            "X-Accel-Buffering": "no",
        },
    )
