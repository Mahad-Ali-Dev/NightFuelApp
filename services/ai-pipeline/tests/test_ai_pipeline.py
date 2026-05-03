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
