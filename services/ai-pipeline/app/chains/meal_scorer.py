from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from .plan_generator import get_llm, LLMProvider
from ..prompts.prompts import SYSTEM_PROMPT

SCORE_PROMPT = """
{system_prompt}

You are an expert nutrition coach analyzing a custom meal entered by the user.
Your job is to evaluate how well this meal aligns with the user's goals and provide a "Health Score" out of 10.

MEAL TO ANALYZE:
{meal_json}

USER GOALS & PREFERENCES:
{user_preferences_json}

OUTPUT FORMAT (Strict JSON):
{{
  "score": 8,
  "rationale": "Great protein content, but slightly high in saturated fats.",
  "quick_fix": "Swap the sour cream for Greek yogurt to hit your protein goal and reduce fat."
}}
"""

async def generate_meal_score(
    user_id: str,
    meal: Dict[str, Any],
    preferences: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI
) -> Dict[str, Any]:
    from json import dumps
    
    llm = get_llm(provider)
    parser = JsonOutputParser()
    
    prompt = ChatPromptTemplate.from_template(SCORE_PROMPT)
    chain = prompt | llm | parser
    
    from ..telemetry import TokenTelemetryHandler
    handler = TokenTelemetryHandler(user_id=user_id, action="meal-score", provider=provider.value)

    response = await chain.ainvoke({
        "system_prompt": SYSTEM_PROMPT,
        "meal_json": dumps(meal, indent=2),
        "user_preferences_json": dumps(preferences, indent=2)
    }, config={"callbacks": [handler]})
    
    return response
