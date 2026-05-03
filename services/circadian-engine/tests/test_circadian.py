from fastapi.testclient import TestClient
from app.main import app
from app.models import compute_mock_profile, Shift

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
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

def test_compute_mock_profile():
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
    
    profile = compute_mock_profile(shift)
    
    assert profile.userId == "test-user-id"
    assert profile.shiftId == "test-shift-id"
    assert profile.date == "2026-03-01"
    assert profile.melatoninOnset == "22:00"
    assert len(profile.insulinSensitivityWindows) > 0
