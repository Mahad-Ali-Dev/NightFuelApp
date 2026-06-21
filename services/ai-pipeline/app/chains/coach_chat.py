import os
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
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

FORMATTING — the app renders your reply as Markdown, so format for a phone screen:
- Short paragraphs only; never a wall of text.
- **Bold** the single most important number or takeaway.
- When giving steps or multiple tips, use a short Markdown bullet list ("- ").
- An occasional, relevant emoji adds warmth — use sparingly.
- Do NOT use headings (#) or tables in chat; keep it light and conversational.
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
