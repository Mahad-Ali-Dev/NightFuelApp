from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage
from .plan_generator import get_llm, LLMProvider, no_live_provider
from ..prompts.prompts import SYSTEM_PROMPT
from ..telemetry import TokenTelemetryHandler
from ..logger import logger

CHAT_PROMPT = """
{system_prompt}

You are Ria, the Zeitra AI Coach, speaking directly to the user in a chat interface.

USER CONTEXT & CURRENT STATUS:
{user_context_json}

STYLE:
- Be engaging, concise (1-3 short sentences unless the user asks for detail), and highly actionable.
- Use the user's name if available and tailor advice to their active goals.
- Be empathetic but firm about circadian-health protocols.
- CYCLE-AWARE COACHING: when the context includes cyclePhase and/or todaySymptoms
  (mood 1-5, cramps 0-3, energy 1-5, flow), ADAPT your training and meal advice to
  them — gentler, lower-volume sessions and warm, iron-aware comfort meals when
  cramps are high or energy/mood is low; lean into progression and intensity when
  energy is high (follicular/ovulatory). Acknowledge the adaptation naturally and
  briefly ("since your energy's low today...") — never clinically, and never
  mention raw scores. This is wellness guidance, not medical advice.

FORMATTING — your reply is shown as PLAIN TEXT in a chat bubble AND read aloud by text-to-speech, so:
- Write plain conversational sentences. Short paragraphs only; never a wall of text.
- Do NOT use ANY Markdown or formatting symbols: no asterisks (* or **), no hash headings (#), no dash/bullet lists ("- "), no tables. They appear literally on screen and the voice reader pronounces them out loud (e.g. "asterisk asterisk").
- To emphasise something, say it in words ("the key number is 40g of protein") instead of bolding it.
- For steps or several tips, write them as a short natural sentence or split them onto separate lines — never with bullet symbols.
- An occasional, relevant emoji is fine — use sparingly.

STRUCTURED MEALS & WORKOUTS (renders as tap-to-add cards in the app):
When you recommend a SPECIFIC meal (with foods) or a workout (with exercises),
END your reply with ONE machine-readable block so the app can show an
add-to-log card with macros and images. Rules:
- Keep your spoken reply natural and SHORT — mention the idea in a sentence
  ("here's a light night-shift snack"), do NOT list every food or macro number
  in the prose; the card shows those.
- Append the block LAST, after all prose, EXACTLY in this form (no markdown
  fences), and NOTHING after it (this example's doubled braces render as single
  braces — your real output uses SINGLE braces like normal JSON):
[ZEITRA_PLAN]{{"meals":[{{"title":"Night-shift snack","mealType":"SNACK","items":[{{"name":"Greek yogurt","amount":"170g","calories":100,"protein":17,"carbs":6,"fat":0}},{{"name":"Blueberries","amount":"80g","calories":45,"protein":1,"carbs":11,"fat":0}}]}}],"workout":{{"title":"Upper-body strength","durationMin":40,"exercises":[{{"name":"Bench Press","sets":4,"reps":"8"}},{{"name":"Bent-over Row","sets":4,"reps":"10"}}]}}}}[/ZEITRA_PLAN]
- Include ONLY the relevant key: "meals" (array) when suggesting food,
  "workout" (object) when suggesting training — omit the other entirely.
- mealType is one of BREAKFAST, LUNCH, DINNER, SNACK. Use common, searchable
  food names (they are matched against a food database for images + exact
  macros). Give your best per-item calories/protein/carbs/fat estimates.
- reps is a string ("8", "8-12", "30s"). Keep workouts to 3-6 exercises.
- If the user is just chatting (no concrete meal/workout), DO NOT add a block.
"""

async def generate_chat_response(
    user_id: str,
    message: str,
    history: List[Dict[str, str]],
    context: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI,
    verified_identity: str = None,
) -> str:
    from json import dumps

    # Demo mode only when NO provider has a real key. With cross-provider
    # fallback, one configured key (Anthropic OR OpenAI) is enough.
    if no_live_provider():
        from ..logger import logger as chat_logger
        chat_logger.warning("Coach chat using mock response — no live LLM provider configured")
        return "Hey! I'm Ria, your Zeitra coach. I'm currently running in demo mode. Once the AI service is fully configured, I'll be able to give you personalized advice on nutrition, sleep, and training based on your shift schedule. Stay consistent! 💪"

    try:
        llm = get_llm(provider)
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", CHAT_PROMPT),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{message}")
        ])
        
        chain = prompt | llm | StrOutputParser()
        
        # Format history
        langchain_history = []
        for msg in history:
            if msg.get("role") == "user":
                langchain_history.append(HumanMessage(content=msg.get("content", "")))
            else:
                langchain_history.append(AIMessage(content=msg.get("content", "")))
                
        handler = TokenTelemetryHandler(user_id=user_id, action="chat", provider=provider.value, verified_identity=verified_identity)

        response = await chain.ainvoke({
            "system_prompt": SYSTEM_PROMPT,
            "user_context_json": dumps(context, indent=2),
            "history": langchain_history,
            "message": message
        }, config={"callbacks": [handler]})
        
        return response
    except Exception as e:
        import traceback
        logger.error(f"Coach chat failed [{type(e).__name__}]: {e}\n{traceback.format_exc()}")
        return "Sorry, I'm having trouble connecting right now. Please try again in a moment! In the meantime, stay hydrated and stick to your meal schedule. 🌙"
