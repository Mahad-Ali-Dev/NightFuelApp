import os
from typing import Dict, Any, List
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from .plan_generator import get_llm, LLMProvider
from ..prompts.prompts import SYSTEM_PROMPT
from ..telemetry import TokenTelemetryHandler
from ..logger import logger

CHAT_PROMPT = """
{system_prompt}

You are Ria, the NightFuel AI Coach. You are speaking directly to the user in a chat interface. 
Keep your responses engaging, concise (1-3 sentences unless asked for detail), and highly actionable.

USER CONTEXT & CURRENT STATUS:
{user_context_json}

Use the user's name if available, and tailor your advice to their active goals.
Be empathetic but firm about circadian health protocols.
"""

async def generate_chat_response(
    user_id: str,
    message: str,
    history: List[Dict[str, str]],
    context: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI
) -> str:
    from json import dumps

    # Check if API key is valid before calling LLM
    active_key_env = "ANTHROPIC_API_KEY" if provider == LLMProvider.ANTHROPIC else "OPENAI_API_KEY"
    active_key = os.environ.get(active_key_env, "mock-key")
    if not active_key or active_key in ("mock-key", "sk-ant-...", "sk-..."):
        from ..logger import logger as chat_logger
        chat_logger.warning("Coach chat using mock response — no valid API key found")
        return "Hey! I'm Ria, your NightFuel coach. I'm currently running in demo mode. Once the AI service is fully configured, I'll be able to give you personalized advice on nutrition, sleep, and training based on your shift schedule. Stay consistent! 💪"

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
                
        handler = TokenTelemetryHandler(user_id=user_id, action="chat", provider=provider.value)

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
