from fastapi.testclient import TestClient
from app.main import app
from app.models import DayPlanRequest, CircadianProfile
from app.validators import generate_skeleton

client = TestClient(app)

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
    response = client.post("/v1/ai/generate-plan?provider=anthropic", json=request_data)

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
