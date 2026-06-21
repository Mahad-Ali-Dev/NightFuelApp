"""Tests for AI telemetry integrity (F35 #11, #12).

#11 — TokenTelemetryHandler.on_llm_end must capture real token counts + cost +
      model from the LLM callback and expose them as attributes (coach_chat_stream
      reads handler.input_tokens / output_tokens / cost_usd / model_name for the
      streaming "done" event; before the fix those attributes never existed →
      always zero, broken cost accounting).

#12 — Telemetry must be attributed to the VERIFIED identity threaded in from
      require_caller, NOT the client-supplied body userId, and the POST to the
      usage sink must carry the X-Internal-Token so the (now-guarded) sink accepts
      it. A forged body userId must not book usage against another account.
"""

import asyncio

import pytest

from langchain_core.outputs import LLMResult, ChatGeneration
from langchain_core.messages import AIMessage

from app.telemetry import TokenTelemetryHandler, compute_cost_usd


# ── Helpers ──────────────────────────────────────────────────────────────────

def _llm_result(input_tokens, output_tokens, model="claude-haiku-4-5-20251001"):
    """Build an LLMResult shaped like what ChatAnthropic/ChatOpenAI emit:
    usage_metadata on the generated AIMessage + a model id in response_metadata."""
    message = AIMessage(
        content="hi there",
        usage_metadata={
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        },
        response_metadata={"model": model},
    )
    return LLMResult(generations=[[ChatGeneration(message=message)]])


def _run(coro_fn):
    """Run an async function in a fresh event loop.

    Takes a zero-arg coroutine FUNCTION (not a coroutine) so that any
    asyncio.create_task() inside it has a running loop (Python 3.14 no longer
    auto-creates a loop for get_event_loop()).
    """
    return asyncio.run(coro_fn())


# ── #11: handler records non-zero tokens + cost for a mocked LLM run ──────────

def test_handler_records_nonzero_tokens_and_cost(monkeypatch):
    sent = {}

    async def _fake_send(self, p, c, t, cost, model):
        sent.update(prompt=p, completion=c, total=t, cost=cost, model=model)

    monkeypatch.setattr(TokenTelemetryHandler, "_send_telemetry", _fake_send)

    handler = TokenTelemetryHandler(user_id="body-user", action="chat-stream", provider="anthropic")

    async def _go():
        await handler.on_llm_end(_llm_result(1000, 500))
        await asyncio.sleep(0)  # let the fire-and-forget _send_telemetry task run

    _run(_go)

    # Attributes the streaming "done" event reads are now populated (were absent before).
    assert handler.input_tokens == 1000
    assert handler.output_tokens == 500
    assert handler.total_tokens == 1500
    assert handler.model_name == "claude-haiku-4-5-20251001"
    # Haiku 4.5: $1/1M in, $5/1M out -> 1000*1e-6*1 + 500*1e-6*5 = 0.001 + 0.0025
    assert handler.cost_usd == pytest.approx(0.0035)
    assert sent["cost"] == pytest.approx(0.0035)


def test_handler_parses_openai_llm_output_fallback(monkeypatch):
    """When usage_metadata is absent, fall back to OpenAI's llm_output shape."""
    monkeypatch.setattr(TokenTelemetryHandler, "_send_telemetry",
                        lambda self, *a, **k: asyncio.sleep(0))

    result = LLMResult(
        generations=[[ChatGeneration(message=AIMessage(content="x"))]],
        llm_output={
            "model_name": "gpt-4o-mini-2024-07-18",
            "token_usage": {"prompt_tokens": 200, "completion_tokens": 100},
        },
    )
    handler = TokenTelemetryHandler(user_id="u", action="chat", provider="openai")
    _run(lambda: handler.on_llm_end(result))

    assert handler.input_tokens == 200
    assert handler.output_tokens == 100
    # gpt-4o-mini: $0.15/1M in, $0.60/1M out
    assert handler.cost_usd == pytest.approx(200 * 0.15e-6 + 100 * 0.60e-6)


def test_compute_cost_unknown_model_is_zero():
    assert compute_cost_usd("some-unpriced-model", 1000, 1000) == 0.0
    assert compute_cost_usd(None, 1000, 1000) == 0.0


# ── #12: telemetry uses the VERIFIED identity, not the spoofed body userId ────

def test_telemetry_attributed_to_verified_identity_not_body():
    # Attacker passes someone else's id in the body, but is authenticated as victim.
    handler = TokenTelemetryHandler(
        user_id="victim-spoofed-in-body",
        action="chat",
        provider="anthropic",
        verified_identity="user:real-caller-123",
    )
    assert handler._telemetry_user_id() == "real-caller-123"


def test_telemetry_internal_caller_trusts_body_userid():
    # s2s caller (require_internal) -> identity == "internal"; the body userId is
    # the real user the sibling service already authenticated, so it's kept.
    handler = TokenTelemetryHandler(
        user_id="real-user-from-sibling",
        action="generate-plan",
        provider="anthropic",
        verified_identity="internal",
    )
    assert handler._telemetry_user_id() == "real-user-from-sibling"


# ── #12: the sink POST carries auth and the verified identity ────────────────

def test_sink_post_carries_internal_token_and_verified_identity(monkeypatch):
    captured = {}

    class _FakeResp:
        pass

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None, timeout=None):
            captured.update(url=url, json=json, headers=headers)
            return _FakeResp()

    monkeypatch.setattr("app.telemetry.httpx.AsyncClient", lambda *a, **k: _FakeClient())

    handler = TokenTelemetryHandler(
        user_id="spoofed-body-id",
        action="chat-stream",
        provider="anthropic",
        verified_identity="user:verified-789",
    )
    async def _go():
        await handler.on_llm_end(_llm_result(10, 20))
        await asyncio.sleep(0)  # let the fire-and-forget POST task run

    _run(_go)

    # Sink call must be authenticated (was previously unauthenticated).
    assert captured["headers"]["X-Internal-Token"] == handler.settings.INTERNAL_SERVICE_TOKEN
    # And attributed to the verified identity, not the body userId.
    assert captured["json"]["userId"] == "verified-789"
    assert captured["json"]["totalTokens"] == 30
    assert captured["json"]["costUsd"] == pytest.approx(handler.cost_usd)
