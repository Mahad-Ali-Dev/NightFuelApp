from fastapi.testclient import TestClient
from app.main import app
from app.models import DayPlanRequest
from app.validators import generate_skeleton

try:
    # CircadianProfile is referenced by some legacy skeleton tests below. It is
    # not currently exported by app.models, so fall back to a permissive shim
    # so the module still imports (and the F22 input-bounds / redaction tests
    # below can run) regardless of whether the model exists.
    from app.models import CircadianProfile  # type: ignore
except ImportError:  # pragma: no cover
    from pydantic import BaseModel

    class CircadianProfile(BaseModel):  # type: ignore
        model_config = {"extra": "allow"}

client = TestClient(app)

# F22 #8: every data route now requires auth. The internal service token is the
# simplest credential for tests that aren't specifically about auth.
INTERNAL_HEADERS = {"X-Internal-Token": "test-internal-token"}

def get_test_profile():
    return CircadianProfile(
        bodyTemperatureCurve={"00:00": 36.5},
        insulinSensitivityWindows=[{"start": "08:00", "end": "10:00"}],
        cortisolRhythm={"08:00": 100.0},
        melatoninOnset="22:00",
        caffeineMetabolismWindow={"start": "06:00", "end": "14:00"},
        optimalExerciseWindows=[{"start": "16:00", "end": "18:00"}]
    )

def test_health_check():
    response = client.get("/v1/ai/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_generate_skeleton():
    request = DayPlanRequest(
        userId="user-123",
        date="2026-03-01",
        shiftType="NIGHT",
        circadianProfile=get_test_profile()
    )
    
    skeleton = generate_skeleton(request)
    
    assert "rules" in skeleton
    assert skeleton["rules"]["caffeine_cutoff"] == "14:00"
    assert skeleton["rules"]["optimal_workout_window"] == "16:00 - 18:00"
    assert skeleton["rules"]["high_gi_carbs_allowed_during"] == "08:00 - 10:00"
    assert skeleton["rules"]["recommended_intensity"] == "LOW/MODERATE"
    
def test_generate_skeleton_day_shift():
    request = DayPlanRequest(
        userId="user-123",
        date="2026-03-01",
        shiftType="DAY",
        circadianProfile=get_test_profile()
    )
    
    skeleton = generate_skeleton(request)
    assert skeleton["rules"]["recommended_intensity"] == "MODERATE"

def test_generate_skeleton_with_preferences():
    from app.models import GoalPreferences
    request = DayPlanRequest(
        userId="user-123",
        date="2026-03-01",
        shiftType="DAY",
        preferences=GoalPreferences(
            primaryGoal="MUSCLE_GAIN",
            splitPreference="PPL"
        ),
        circadianProfile=get_test_profile()
    )
    
    skeleton = generate_skeleton(request)
    assert skeleton["rules"]["split_focus"] == "PPL"
    
def test_generate_plan_endpoint():
    request_data = {
        "userId": "user-123",
        "date": "2026-03-01",
        "shiftType": "NIGHT",
        "circadianProfile": get_test_profile().model_dump()
    }
    
    # We pass 'provider=mock' or assume it defaults and hits the mock key fallback
    response = client.post(
        "/v1/ai/generate-plan?provider=anthropic",
        json=request_data,
        headers=INTERNAL_HEADERS,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["userId"] == "user-123"
    assert "structuredPlan" in data
    assert "Mocked LLM Meal: Grilled Chicken Quinoa Bowl" in data["structuredPlan"]["meals"][0]["recommendation"]


# ── F21: cross-provider fallback + provider-availability (Ria robustness) ────────
from langchain_core.runnables import RunnableWithFallbacks
from app.chains.plan_generator import (
    LLMProvider,
    get_llm,
    live_providers,
    no_live_provider,
    _live_key,
)

_REAL_ANTHROPIC = "sk-ant-real-aaaaaaaaaaaaaaaaaaaa"
_REAL_OPENAI = "sk-real-oooooooooooooooooooo"


def _set_keys(monkeypatch, anthropic="mock-key", openai="mock-key"):
    monkeypatch.setenv("ANTHROPIC_API_KEY", anthropic)
    monkeypatch.setenv("OPENAI_API_KEY", openai)


def test_live_key_rejects_placeholders(monkeypatch):
    for placeholder in ("", "mock-key", "sk-ant-...", "sk-..."):
        monkeypatch.setenv("ANTHROPIC_API_KEY", placeholder)
        assert _live_key(LLMProvider.ANTHROPIC) is None
    monkeypatch.setenv("ANTHROPIC_API_KEY", _REAL_ANTHROPIC)
    assert _live_key(LLMProvider.ANTHROPIC) == _REAL_ANTHROPIC


def test_no_live_provider_true_when_neither_configured(monkeypatch):
    _set_keys(monkeypatch, anthropic="mock-key", openai="mock-key")
    assert no_live_provider() is True


def test_live_providers_orders_requested_first(monkeypatch):
    _set_keys(monkeypatch, anthropic=_REAL_ANTHROPIC, openai=_REAL_OPENAI)
    assert live_providers(preferred=LLMProvider.ANTHROPIC) == [LLMProvider.ANTHROPIC, LLMProvider.OPENAI]
    assert live_providers(preferred=LLMProvider.OPENAI) == [LLMProvider.OPENAI, LLMProvider.ANTHROPIC]
    assert no_live_provider() is False


def test_live_providers_single_when_only_one_key(monkeypatch):
    _set_keys(monkeypatch, anthropic="mock-key", openai=_REAL_OPENAI)
    # Even when Anthropic is requested, only the live (OpenAI) provider is returned.
    assert live_providers(preferred=LLMProvider.ANTHROPIC) == [LLMProvider.OPENAI]
    assert no_live_provider() is False


def test_get_llm_wraps_cross_provider_fallback_when_both_live(monkeypatch):
    _set_keys(monkeypatch, anthropic=_REAL_ANTHROPIC, openai=_REAL_OPENAI)
    llm = get_llm(LLMProvider.ANTHROPIC)
    # Both keys set → primary (Anthropic) wrapped with one fallback (OpenAI).
    assert isinstance(llm, RunnableWithFallbacks)
    assert len(llm.fallbacks) == 1


def test_get_llm_no_fallback_when_single_provider(monkeypatch):
    _set_keys(monkeypatch, anthropic="mock-key", openai=_REAL_OPENAI)
    llm = get_llm(LLMProvider.OPENAI)
    # Only one live provider → a bare model, not a fallback wrapper.
    assert not isinstance(llm, RunnableWithFallbacks)


def test_get_llm_quality_tier_builds(monkeypatch):
    # fast=False (weekly-audit tier) must build without error on a single provider.
    _set_keys(monkeypatch, anthropic="mock-key", openai=_REAL_OPENAI)
    llm = get_llm(LLMProvider.OPENAI, fast=False, temperature=0.3)
    assert llm is not None


# ── F22: input bounds (unbounded LLM input) + 500 redaction ──────────────────
# These lock the security hardening. They FAIL against the pre-fix code, which
# had no length/size caps on CoachChatRequest / the loose /weekly-audit params,
# and which reflected the full traceback on the 500 body.
import pytest
from pydantic import ValidationError
from app.models import (
    CoachChatRequest,
    WeeklyAuditRequest,
    MAX_MESSAGE_CHARS,
    MAX_HISTORY_ITEMS,
    MAX_HISTORY_ENTRY_CHARS,
    MAX_CONTEXT_BYTES,
    MAX_DICT_BYTES,
    MAX_LIST_ITEMS,
)


def test_coach_chat_request_accepts_valid_payload():
    req = CoachChatRequest(
        userId="u-1",
        message="What should I eat after a night shift?",
        history=[{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hey"}],
        context={"goal": "WEIGHT_LOSS"},
    )
    assert req.message
    assert len(req.history) == 2


def test_coach_chat_request_rejects_overlong_message():
    with pytest.raises(ValidationError):
        CoachChatRequest(userId="u-1", message="x" * (MAX_MESSAGE_CHARS + 1))


def test_coach_chat_request_rejects_overlong_history():
    too_many = [{"role": "user", "content": "c"}] * (MAX_HISTORY_ITEMS + 1)
    with pytest.raises(ValidationError):
        CoachChatRequest(userId="u-1", message="hi", history=too_many)


def test_coach_chat_request_rejects_overlong_history_entry():
    with pytest.raises(ValidationError):
        CoachChatRequest(
            userId="u-1",
            message="hi",
            history=[{"role": "user", "content": "c" * (MAX_HISTORY_ENTRY_CHARS + 1)}],
        )


def test_coach_chat_request_rejects_oversized_context():
    with pytest.raises(ValidationError):
        CoachChatRequest(
            userId="u-1",
            message="hi",
            context={"blob": "v" * (MAX_CONTEXT_BYTES + 1)},
        )


def test_weekly_audit_request_accepts_valid_payload():
    req = WeeklyAuditRequest(
        userId="u-1",
        stats={"adherence": 0.9},
        history=[{"day": 1, "weight": 80.0}],
        preferences={"primaryGoal": "WEIGHT_LOSS"},
    )
    assert req.userId == "u-1"


def test_weekly_audit_request_rejects_oversized_stats():
    with pytest.raises(ValidationError):
        WeeklyAuditRequest(userId="u-1", stats={"blob": "v" * (MAX_DICT_BYTES + 1)})


def test_weekly_audit_request_rejects_too_many_history_items():
    with pytest.raises(ValidationError):
        WeeklyAuditRequest(userId="u-1", history=[{"day": 1}] * (MAX_LIST_ITEMS + 1))


def test_chat_endpoint_rejects_overlong_message_with_422():
    # The HTTP edge must reject an over-long message before any chain runs.
    resp = client.post(
        "/v1/ai/chat",
        json={"userId": "u-1", "message": "x" * (MAX_MESSAGE_CHARS + 1)},
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 422


def test_weekly_audit_endpoint_rejects_too_many_history_with_422():
    resp = client.post(
        "/v1/ai/weekly-audit",
        json={
            "userId": "u-1",
            "stats": {},
            "history": [{"day": 1}] * (MAX_LIST_ITEMS + 1),
            "preferences": {},
        },
        headers=INTERNAL_HEADERS,
    )
    assert resp.status_code == 422


def test_global_500_handler_redacts_traceback():
    """The unhandled-exception handler must ship a fixed, redacted body —
    never the exception message or traceback."""
    from app.main import app as main_app

    LEAKY = "boom secret /etc/passwd traceback frame"

    @main_app.get("/_f22_boom")
    async def _boom():  # pragma: no cover - exercised via the test client
        raise RuntimeError(LEAKY)

    # raise_server_exceptions=False so the registered handler runs and returns
    # a response instead of re-raising into the test.
    boom_client = TestClient(main_app, raise_server_exceptions=False)
    resp = boom_client.get("/_f22_boom")

    assert resp.status_code == 500
    assert resp.json() == {"detail": "Internal server error"}
    body = resp.text
    assert "traceback" not in body
    assert LEAKY not in body
    assert "/etc/" not in body


# ── planParams -> logicTargets wiring (the DETERMINISTIC TARGETS fix) ───────────
# plan-service now translates its snake_case planParams into the LogicTargets shape
# below and sends it as request.logicTargets. These tests lock that (1) DayPlanRequest
# parses that exact shape, and (2) build_user_context then EMITS the deterministic
# targets block (previously it never fired because logicTargets was always None).

def test_day_plan_request_parses_logic_targets_shape():
    from app.models import DayPlanRequest
    req = DayPlanRequest(
        userId="user-123",
        date="2026-03-01",
        shiftType="DAY",
        logicTargets={
            "calorieTarget": 2000,
            "proteinTargetG": 150,
            "carbsTargetG": 204,
            "fatTargetG": 65,
            "trainingVolumeMultiplier": 1.0,
        },
        cyclePhase="UNKNOWN",
    )
    assert req.logicTargets is not None
    assert req.logicTargets.calorieTarget == 2000
    assert req.logicTargets.proteinTargetG == 150
    assert req.logicTargets.trainingVolumeMultiplier == 1.0


def test_deterministic_targets_block_fires_when_logic_targets_present():
    from app.prompts.prompts import build_user_context
    out = build_user_context(
        {"rules": {}},
        {"primaryGoal": "MUSCLE_GAIN"},
        {
            "calorieTarget": 2000,
            "proteinTargetG": 150,
            "carbsTargetG": 204,
            "fatTargetG": 65,
            "trainingVolumeMultiplier": 1.0,
        },
        "UNKNOWN",
    )
    assert "DETERMINISTIC TARGETS" in out
    assert "2000 kcal" in out
    assert "150 g" in out


def test_deterministic_targets_block_absent_when_logic_targets_none():
    # Mirrors the OLD (buggy) behaviour for callers that genuinely send no targets:
    # the block must NOT appear -> proves the block is gated purely on presence.
    from app.prompts.prompts import build_user_context
    out = build_user_context({"rules": {}}, {"primaryGoal": "X"}, None, "UNKNOWN")
    assert "DETERMINISTIC TARGETS" not in out
