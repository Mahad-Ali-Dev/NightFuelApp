import httpx
from typing import Any, Optional
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.outputs import LLMResult
from .config import get_settings
from .logger import logger
import asyncio

# ── Per-model token pricing (USD per 1M tokens) ─────────────────────────────────
# MEDIUM #11: the streaming "done" event (and any non-streaming caller) reads
# handler.cost_usd, but nothing ever computed a cost. Without a price table every
# call books $0.00 — broken cost accounting. Keys are matched case-insensitively
# as a substring of the model id the provider reports back (e.g. langchain
# surfaces "claude-haiku-4-5-20251001" or "gpt-4o-mini-2024-07-18"), so a single
# family entry covers the dated snapshots. Unknown models fall back to (0, 0) and
# log a warning rather than guessing a price.
_PRICING_USD_PER_1M = {
    # Anthropic (input, output)
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    # OpenAI (input, output)
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
}


def _price_for_model(model_name: Optional[str]):
    """Return (input_price, output_price) per-1M for `model_name`, or None."""
    if not model_name:
        return None
    lowered = model_name.lower()
    for family, prices in _PRICING_USD_PER_1M.items():
        if family in lowered:
            return prices
    return None


def compute_cost_usd(model_name: Optional[str], input_tokens: int, output_tokens: int) -> float:
    """USD cost for a single LLM call. 0.0 when the model price is unknown."""
    prices = _price_for_model(model_name)
    if prices is None:
        if model_name:
            logger.warning(f"Telemetry: no price for model '{model_name}'; cost recorded as 0.")
        return 0.0
    in_price, out_price = prices
    return (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price


def _extract_usage(response: LLMResult):
    """Pull (input_tokens, output_tokens, model_name) from an LLMResult.

    Works across langchain provider integrations:
      * The cross-provider canonical home is generation.message.usage_metadata
        ({input_tokens, output_tokens, total_tokens}) — populated by both
        ChatAnthropic and ChatOpenAI.
      * Fall back to llm_output: OpenAI uses token_usage.{prompt,completion}_tokens,
        Anthropic uses usage.{input,output}_tokens.
    Model id is read from llm_output (model / model_name) then from response
    metadata, so cost can be priced even when only one source is present.
    """
    input_tokens = 0
    output_tokens = 0
    model_name: Optional[str] = None

    # 1. Canonical usage_metadata on the generated message (preferred).
    try:
        for gen_list in response.generations or []:
            for gen in gen_list or []:
                message = getattr(gen, "message", None)
                usage_metadata = getattr(message, "usage_metadata", None)
                if usage_metadata:
                    input_tokens = usage_metadata.get("input_tokens", input_tokens) or input_tokens
                    output_tokens = usage_metadata.get("output_tokens", output_tokens) or output_tokens
                response_metadata = getattr(message, "response_metadata", None) or {}
                model_name = model_name or response_metadata.get("model") or response_metadata.get("model_name")
    except Exception:  # noqa: BLE001 — usage parsing must never break the LLM call
        pass

    # 2. Fall back to llm_output (provider-specific shapes).
    llm_output = response.llm_output or {}
    if not model_name:
        model_name = llm_output.get("model_name") or llm_output.get("model")

    if input_tokens == 0 and output_tokens == 0:
        # OpenAI shape.
        token_usage = llm_output.get("token_usage")
        if token_usage:
            input_tokens = token_usage.get("prompt_tokens", 0) or 0
            output_tokens = token_usage.get("completion_tokens", 0) or 0
        # Anthropic shape.
        usage = llm_output.get("usage")
        if usage and input_tokens == 0 and output_tokens == 0:
            input_tokens = usage.get("input_tokens", 0) or 0
            output_tokens = usage.get("output_tokens", 0) or 0

    return input_tokens, output_tokens, model_name


class TokenTelemetryHandler(AsyncCallbackHandler):
    def __init__(
        self,
        user_id: str,
        action: str,
        provider: str,
        verified_identity: Optional[str] = None,
    ):
        # `user_id` is the request-BODY userId (client-supplied, spoofable).
        self.user_id = user_id
        self.action = action
        self.provider = provider
        # MEDIUM #12: prefer the identity verified by require_caller (the JWT
        # subject) over the body userId. When the verified identity is a real end
        # user ("user:<sub>"), telemetry is attributed to <sub> — a forged body
        # userId can no longer book usage against someone else's account. For
        # trusted server-to-server callers (verified_identity == "internal") the
        # body userId is the real user the sibling service already authenticated,
        # so we keep it.
        self.verified_identity = verified_identity
        self.settings = get_settings()
        # MEDIUM #11: attributes the streaming "done" event reads. Populated for
        # real on_llm_end so streaming + non-streaming both report real usage.
        self.input_tokens = 0
        self.output_tokens = 0
        self.total_tokens = 0
        self.cost_usd = 0.0
        self.model_name: Optional[str] = None

    def _telemetry_user_id(self) -> str:
        """The id telemetry is booked against — verified identity wins."""
        identity = self.verified_identity
        if identity and identity.startswith("user:"):
            return identity[len("user:"):]
        # "internal" (s2s) -> trust the body userId the sibling service vouched
        # for. No verified identity provided -> fall back to body userId too.
        return self.user_id

    async def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        try:
            input_tokens, output_tokens, model_name = _extract_usage(response)

            # Expose on the handler so coach_chat_stream's "done" event and any
            # other reader see real numbers instead of always-zero defaults.
            self.input_tokens = input_tokens
            self.output_tokens = output_tokens
            self.total_tokens = input_tokens + output_tokens
            self.model_name = model_name
            self.cost_usd = compute_cost_usd(model_name, input_tokens, output_tokens)

            if self.total_tokens > 0:
                logger.info(
                    f"Telemetry: {self._telemetry_user_id()} used {self.total_tokens} tokens "
                    f"(${self.cost_usd:.6f}) via {self.provider} for {self.action}"
                )
                # Fire-and-forget so we don't block the user's critical path.
                asyncio.create_task(
                    self._send_telemetry(input_tokens, output_tokens, self.total_tokens, self.cost_usd, model_name)
                )

        except Exception as e:
            logger.error(f"Telemetry Handler failed: {e}")

    async def _send_telemetry(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        cost_usd: float,
        model_name: Optional[str],
    ):
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.settings.PROGRESS_SERVICE_URL}/v1/progress/ai-usage",
                    json={
                        "userId": self._telemetry_user_id(),
                        "action": self.action,
                        "provider": self.provider,
                        "promptTokens": prompt_tokens,
                        "completionTokens": completion_tokens,
                        "totalTokens": total_tokens,
                        "costUsd": round(cost_usd, 6),
                        "model": model_name or "",
                    },
                    # MEDIUM #12: the usage sink is server-to-server only and now
                    # guarded by the shared internal-token check (F35a) on the
                    # progress-service. Authenticate the POST so it is accepted
                    # (and so the sink can stay closed to unauthenticated callers).
                    headers={"X-Internal-Token": self.settings.INTERNAL_SERVICE_TOKEN},
                    timeout=5.0,
                )
        except Exception as e:
            logger.error(f"Failed to send POST telemetry to Progress Service: {e}")
