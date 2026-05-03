from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from .plan_generator import get_llm, LLMProvider
from ..prompts.prompts import SYSTEM_PROMPT

MEAL_SWAP_PROMPT = """
{system_prompt}

You are a specialized nutrition swap assistant. 
The user wants to swap a specific meal in their plan, but you MUST stay within 10% of the original meal's calories and macro distribution.

ORIGINAL MEAL TO SWAP:
{original_meal_json}

USER PREFERENCES:
{user_preferences_json}

Your goal is to suggest 3 distinct alternatives. 
Every alternative MUST follow the diet mode (e.g., BUDGET, ACNE_SAFE, RAMADAN) and dietary preferences strictly.
For ACNE_SAFE: No dairy, no high-GI foods.
For RAMADAN: If the meal is Suhoor or Iftar, ensure the alternatives match that context (e.g. Suhoor = slow digesting).

OUTPUT FORMAT (Strict JSON):
{{
  "alternatives": [
    {{
      "name": "Distinct alternative name",
      "recommendation": "Brief reason why this fits",
      "items": [
        {{
          "name": "Item name",
          "amount": "Quantity",
          "calories": 250,
          "protein": 45,
          "carbs": 0,
          "fat": 6
        }}
      ]
    }}
  ]
}}
"""

async def generate_meal_alternatives(
    user_id: str,
    meal: Dict[str, Any],
    preferences: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI
) -> Dict[str, Any]:
    from json import dumps
    
    llm = get_llm(provider)
    parser = JsonOutputParser()
    
    prompt = ChatPromptTemplate.from_template(MEAL_SWAP_PROMPT)
    chain = prompt | llm | parser
    
    from ..telemetry import TokenTelemetryHandler
    handler = TokenTelemetryHandler(user_id=user_id, action="meal-swap", provider=provider.value)

    response = await chain.ainvoke({
        "system_prompt": SYSTEM_PROMPT,
        "original_meal_json": dumps(meal, indent=2),
        "user_preferences_json": dumps(preferences, indent=2)
    }, config={"callbacks": [handler]})
    
    return response
