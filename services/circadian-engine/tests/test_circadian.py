import re

from fastapi.testclient import TestClient
from app.main import app
from app.models import compute_profile, Shift

client = TestClient(app)

def test_health_check():
    # The router is mounted under /v1/circadian (app.include_router prefix).
    response = client.get("/v1/circadian/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_generate_profile_endpoint():
    shift_data = {
        "id": "test-shift-1",
        "userId": "user-123",
        "shiftDate": "2026-03-01",
        "startTime": "2026-03-01T22:00:00Z",
        "endTime": "2026-03-02T06:00:00Z",
        "shiftType": "NIGHT",
        "workIntensity": "MODERATE",
        "commuteMinutes": 30,
        "isDayOff": False
    }
    
    response = client.post("/v1/circadian/profile", json=shift_data)
    assert response.status_code == 200
    
    data = response.json()
    assert data["userId"] == "user-123"
    assert data["shiftId"] == "test-shift-1"
    assert "bodyTemperatureCurve" in data
    assert "melatoninOnset" in data

def test_compute_profile():
    shift = Shift(
        id="test-shift-id",
        userId="test-user-id",
        shiftDate="2026-03-01",
        startTime="2026-03-01T22:00:00Z",
        endTime="2026-03-02T06:00:00Z",
        shiftType="NIGHT",
        workIntensity="MODERATE",
        commuteMinutes=45,
        isDayOff=False
    )
    
    profile = compute_profile(shift)
    
    assert profile.userId == "test-user-id"
    assert profile.shiftId == "test-shift-id"
    assert profile.date == "2026-03-01"
    # melatoninOnset is DERIVED from the shift's sleep window, not a fixed value.
    # Assert it's a present, well-formed HH:MM time rather than a stale literal.
    assert profile.melatoninOnset is not None
    assert re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", profile.melatoninOnset)
    assert len(profile.insulinSensitivityWindows) > 0
