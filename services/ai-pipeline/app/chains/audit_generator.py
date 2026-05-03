from typing import Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from ..logger import logger
from .plan_generator import LLMProvider

AUDIT_SYSTEM_PROMPT = """
You are NightFuel, an elite chrono-nutrition AI coach. 
Your task is to analyze a user's last 7 days of performance and provide a 'Weekly Coaching Audit'.

DATA PROVIDED:
- user_preferences: Goals, diet types, and basic stats.
- weekly_stats: Aggregated metrics (avg calorie adherence, sleep quality trends, fatigue levels).
- daily_history: Day-by-day logs of adherence and weight.

YOUR OUTPUT MUST BE A JSON OBJECT:
{
  "summary": "A 2-3 sentence overview of the week (high energy, empathetic, direct).",
  "wins": ["List of 2-3 specific accomplishments based on data"],
  "struggles": ["List of 1-2 areas for improvement or concerning trends"],
  "coaching_advice": "Specific tactical advice for the upcoming week (e.g., 'Prioritize hydration on night shifts 2 and 3').",
  "rating": "Overall grade for the week (A, B, C, D, F)"
}
"""

async def generate_weekly_audit(
    userId: str,
    stats: Dict[str, Any],
    history: List[Dict[str, Any]],
    preferences: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI
) -> Dict[str, Any]:
    try:
        if provider == LLMProvider.ANTHROPIC:
            llm = ChatAnthropic(model_name="claude-3-5-sonnet-20240620", temperature=0.3)
        else:
            llm = ChatOpenAI(model_name="gpt-4o", temperature=0.3)

        prompt = ChatPromptTemplate.from_messages([
            ("system", AUDIT_SYSTEM_PROMPT),
            ("human", "User Context: {preferences}\n\nWeekly Stats: {stats}\n\nDaily History: {history}")
        ])

        chain = prompt | llm | JsonOutputParser()
        
        result = await chain.ainvoke({
            "preferences": preferences,
            "stats": stats,
            "history": history
        })

        return result
    except Exception as e:
        logger.error(f"Error generating weekly audit: {e}")
        return {
            "summary": "We couldn't generate your full audit right now, but keep pushing forward!",
            "wins": ["Consistency in logging"],
            "struggles": ["Data processing error"],
            "coaching_advice": "Stick to your circadian anchor meals.",
            "rating": "N/A"
        }
