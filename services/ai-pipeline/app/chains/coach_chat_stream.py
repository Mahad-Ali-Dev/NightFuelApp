"""
Streaming variant of `coach_chat.generate_chat_response`.

Closes M1 from PRODUCTION_READINESS.md. The non-streaming version makes
mobile show a 5-15 second blank chat bubble while Claude composes the
full reply. With streaming, the user sees tokens append in real time —
massive UX improvement for the same per-call cost.

Yields a sequence of dicts that the route handler serializes as SSE
events:
    {"type": "token", "delta": "..."}     each chunk
    {"type": "done",  "tokens": 234,
                       "cost_usd": 0.0042,
                       "model": "...",
                       "latency_ms": 4231}
    {"type": "error", "message": "...", "fallback": "..."}

The route handler is responsible for:
    1. Wrapping each yield as a `data: <json>\\n\\n` SSE line
    2. Flushing immediately so the browser/EventSource sees each token
    3. Sending a final `data: [DONE]\\n\\n` and closing the connection

Closes M5 (cost telemetry) and M6 (model version) by including them in
the `done` event.
"""

import os
import time
from json import dumps
from typing import AsyncIterator, Dict, Any, List

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage

from .plan_generator import get_llm, LLMProvider, no_live_provider
from ..llm_config import ANTHROPIC_MODEL_FAST, OPENAI_MODEL_FAST
from ..prompts.prompts import SYSTEM_PROMPT
from ..telemetry import TokenTelemetryHandler
from ..logger import logger
from .coach_chat import CHAT_PROMPT


async def generate_chat_response_stream(
    user_id: str,
    message: str,
    history: List[Dict[str, str]],
    context: Dict[str, Any],
    provider: LLMProvider = LLMProvider.OPENAI,
    verified_identity: str = None,
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream a coach chat response. Yields {"type": "token"|"done"|"error", ...}.
    """
    started_at = time.perf_counter()

    if no_live_provider():
        # Stream the canned demo reply word-by-word so the UX is consistent.
        # No tokens / cost emitted because nothing was actually billed.
        demo = (
            "Hey! I'm Ria, your Zeitra coach. I'm currently running in "
            "demo mode. Once the AI service is fully configured, I'll be "
            "able to give you personalized advice on nutrition, sleep, and "
            "training based on your shift schedule. Stay consistent!"
        )
        for word in demo.split(" "):
            yield {"type": "token", "delta": word + " "}
        yield {
            "type": "done",
            "tokens": 0,
            "cost_usd": 0.0,
            "model": "demo-mode",
            "latency_ms": int((time.perf_counter() - started_at) * 1000),
        }
        return

    try:
        llm = get_llm(provider)

        prompt = ChatPromptTemplate.from_messages([
            ("system", CHAT_PROMPT),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{message}")
        ])

        chain = prompt | llm | StrOutputParser()

        langchain_history = []
        for msg in history:
            if msg.get("role") == "user":
                langchain_history.append(HumanMessage(content=msg.get("content", "")))
            else:
                langchain_history.append(AIMessage(content=msg.get("content", "")))

        handler = TokenTelemetryHandler(
            user_id=user_id,
            action="chat-stream",
            provider=provider.value,
            verified_identity=verified_identity,
        )

        async for chunk in chain.astream(
            {
                "system_prompt": SYSTEM_PROMPT,
                "user_context_json": dumps(context, indent=2),
                "history": langchain_history,
                "message": message,
            },
            config={"callbacks": [handler]},
        ):
            # `astream` from a StrOutputParser yields plain string deltas.
            if chunk:
                yield {"type": "token", "delta": chunk}

        # Pull telemetry off the handler that langchain populated mid-stream.
        # Fields are best-effort — older langchain versions don't populate
        # all of these. Defaults keep the schema stable for the client.
        tokens_in = getattr(handler, "input_tokens", 0) or 0
        tokens_out = getattr(handler, "output_tokens", 0) or 0
        cost_usd = getattr(handler, "cost_usd", 0.0) or 0.0
        model = getattr(handler, "model_name", None) or _model_name_for_provider(provider)

        yield {
            "type": "done",
            "tokens_input": tokens_in,
            "tokens_output": tokens_out,
            "tokens": tokens_in + tokens_out,
            "cost_usd": round(cost_usd, 6),
            "model": model,
            "latency_ms": int((time.perf_counter() - started_at) * 1000),
        }

    except Exception as e:  # noqa: BLE001
        import traceback
        logger.error(f"Streaming chat failed [{type(e).__name__}]: {e}\n{traceback.format_exc()}")
        yield {
            "type": "error",
            "message": "stream_failed",
            "fallback": (
                "Sorry, I'm having trouble connecting right now. Please try "
                "again in a moment! In the meantime, stay hydrated and stick "
                "to your meal schedule."
            ),
        }


def _model_name_for_provider(provider: LLMProvider) -> str:
    """Best-effort model identity when handler doesn't have one.

    Must mirror the model get_llm() actually instantiates (the fast model),
    otherwise telemetry reports a model that was never called.
    """
    if provider == LLMProvider.ANTHROPIC:
        return ANTHROPIC_MODEL_FAST
    return OPENAI_MODEL_FAST
