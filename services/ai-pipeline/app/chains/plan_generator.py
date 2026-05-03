import os
import json
from enum import Enum
from typing import Dict, Any, Optional

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.exceptions import OutputParserException

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from ..prompts.prompts import SYSTEM_PROMPT, build_user_context
from ..validators import generate_skeleton, validate_plan_against_skeleton
from ..logger import logger

class LLMProvider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"

def get_llm(provider: LLMProvider):
    # Retrieve mock/real API keys
    if provider == LLMProvider.ANTHROPIC:
        key = os.environ.get("ANTHROPIC_API_KEY", "mock-key")
        return ChatAnthropic(
            model="claude-haiku-4-5",
            anthropic_api_key=key,
            temperature=0.2,
            max_tokens=4096
        )
    elif provider == LLMProvider.OPENAI:
        key = os.environ.get("OPENAI_API_KEY", "mock-key")
        return ChatOpenAI(
            model="gpt-4o-mini",
            openai_api_key=key,
            temperature=0.2,
            max_tokens=4096
        )
    else:
        raise ValueError(f"Unsupported provider: {provider}")

async def generate_plan_content(
    user_id: str,
    skeleton: Dict[str, Any],
    user_preferences: Dict[str, Any],
    logic_targets: Optional[Dict[str, Any]] = None,
    provider: LLMProvider = LLMProvider.OPENAI,
    max_retries: int = 3
) -> Dict[str, Any]:

    logger.info(f"Initializing LangChain with provider: {provider.value}")
    llm = get_llm(provider)
    parser = JsonOutputParser()

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{user_context}")
    ])

    chain = prompt | llm | parser
    user_context = build_user_context(skeleton, user_preferences, logic_targets)

    # Only mock if the active provider's key is missing/placeholder
    active_key_env = "ANTHROPIC_API_KEY" if provider == LLMProvider.ANTHROPIC else "OPENAI_API_KEY"
    active_key = os.environ.get(active_key_env, "mock-key")
    if not active_key or active_key in ("mock-key", "sk-ant-...", "sk-..."):
        logger.warning("Using mock API keys for LangChain, returning stubbed response.")
        return {
           "coaching_message": "Stay hydrated tonight! You're doing great. Remember to dim the lights 2 hours before sleep.",
           "hydration_goal": "3.5L",
           "supplement_suggestions": ["Whey Protein", "Creatine Monohydrate", "Magnesium Glycinate", "Vitamin D3"],
           "meals": [
             {
                "name": "Pre-Shift Fuel",
                "suggested_time": "17:30",
                "recommendation": "High-protein meal to fuel your shift",
                "items": [
                  {"name": "Scrambled Eggs", "amount": "3 large", "calories": 210, "protein": 18, "carbs": 2, "fat": 15},
                  {"name": "Whole Wheat Toast", "amount": "2 slices", "calories": 180, "protein": 6, "carbs": 30, "fat": 3},
                  {"name": "Avocado", "amount": "½ medium", "calories": 120, "protein": 1, "carbs": 6, "fat": 11},
                  {"name": "Black Coffee", "amount": "1 cup", "calories": 5, "protein": 0, "carbs": 0, "fat": 0}
                ]
             },
             {
                "name": "Mid-Shift Snack",
                "suggested_time": "21:00",
                "recommendation": "Light snack to maintain energy without spiking insulin",
                "items": [
                  {"name": "Greek Yogurt", "amount": "200g", "calories": 130, "protein": 20, "carbs": 8, "fat": 2},
                  {"name": "Mixed Berries", "amount": "100g", "calories": 57, "protein": 1, "carbs": 14, "fat": 0},
                  {"name": "Almonds", "amount": "15g", "calories": 87, "protein": 3, "carbs": 2, "fat": 8}
                ]
             },
             {
                "name": "Anchor Meal (Main)",
                "suggested_time": "00:30",
                "recommendation": "Your largest meal — optimized for recovery and satiety",
                "items": [
                  {"name": "Grilled Chicken Breast", "amount": "200g", "calories": 330, "protein": 62, "carbs": 0, "fat": 7},
                  {"name": "Brown Rice", "amount": "1 cup cooked", "calories": 215, "protein": 5, "carbs": 45, "fat": 2},
                  {"name": "Steamed Broccoli", "amount": "150g", "calories": 52, "protein": 4, "carbs": 10, "fat": 1},
                  {"name": "Olive Oil Drizzle", "amount": "1 tbsp", "calories": 120, "protein": 0, "carbs": 0, "fat": 14}
                ]
             },
             {
                "name": "Post-Shift Recovery",
                "suggested_time": "06:00",
                "recommendation": "Casein-rich meal for overnight muscle recovery",
                "items": [
                  {"name": "Cottage Cheese", "amount": "200g", "calories": 206, "protein": 28, "carbs": 6, "fat": 9},
                  {"name": "Banana", "amount": "1 medium", "calories": 105, "protein": 1, "carbs": 27, "fat": 0},
                  {"name": "Honey", "amount": "1 tsp", "calories": 21, "protein": 0, "carbs": 6, "fat": 0}
                ]
             },
             {
                "name": "Pre-Sleep Snack",
                "suggested_time": "08:00",
                "recommendation": "Light magnesium-rich snack to promote sleep quality",
                "items": [
                  {"name": "Tart Cherry Juice", "amount": "200ml", "calories": 68, "protein": 1, "carbs": 17, "fat": 0},
                  {"name": "Pumpkin Seeds", "amount": "20g", "calories": 110, "protein": 5, "carbs": 3, "fat": 9}
                ]
             }
           ],
            "workout_suggestion": {
                "title": "Upper Body Strength",
                "duration": "45 min",
                "intensity": "MODERATE",
                "exercises": [
                   {"name": "Bench Press", "sets": 4, "reps": "8", "notes": "Warm up with 50% 1RM"},
                   {"name": "Barbell Row", "sets": 4, "reps": "10", "notes": "Squeeze at top"},
                   {"name": "Overhead Press", "sets": 3, "reps": "10", "notes": "Controlled descent"},
                   {"name": "Dumbbell Curl", "sets": 3, "reps": "12", "notes": "Alternate arms"}
                ],
                "coaching_tips": "Focus on compound lifts for efficiency. Rest 90s between sets."
            },
           "caffeine_advice": f"Stop coffee strictly by {skeleton['rules']['caffeine_cutoff']}"
        }

    for attempt in range(max_retries):
        try:
            logger.info(f"Invoking LLM chain attempt: {attempt + 1}")
            
            from ..telemetry import TokenTelemetryHandler
            handler = TokenTelemetryHandler(user_id=user_id, action="generate-plan", provider=provider.value)

            response = await chain.ainvoke(
                {"user_context": user_context},
                config={"callbacks": [handler]}
            )
            
            # Layer 3 Validation Check
            violations = validate_plan_against_skeleton(response, skeleton)
            if not violations:
                logger.info("LLM plan passed validation.")
                return response
            
            # If violations exist, retry with stricter constraints
            logger.warning(f"LLM generated output violating rules. Attempt {attempt+1}/{max_retries}", extra={"violations": violations})
            user_context += f"\n\nCRITICAL FIX NEEDED! Your previous response violated these rules: {violations}"
            
        except OutputParserException as e:
            logger.error(f"Failed to parse JSON from LLM: {e}")
            user_context += "\n\nCRITICAL FIX NEEDED! Your previous response was NOT valid JSON. ONLY output raw JSON."
        except Exception as e:
            logger.error(f"Unexpected error calling LLM: {e}")
            raise e
            
    # Ultimate Fallback template if max retries reached and it still fails rules
    logger.error("Failed to generate rule-abiding LLM plan after max retries. Using templated fallback.")
    return {
        "coaching_message": "Emergency fallback plan generated.",
        "hydration_goal": "2.5L",
        "supplement_suggestions": [],
        "meals": [],
        "workout_suggestion": "Check skeleton",
        "caffeine_advice": "Check skeleton"
    }
