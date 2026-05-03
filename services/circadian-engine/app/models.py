from typing import Optional, List, Dict
from pydantic import BaseModel
from datetime import datetime, timedelta
import numpy as np
from .logger import logger

class Shift(BaseModel):
    id: str
    userId: str
    shiftDate: str
    startTime: str
    endTime: str
    shiftType: str
    sleepWindowStart: Optional[str] = None
    sleepWindowEnd: Optional[str] = None
    workIntensity: str
    commuteMinutes: int
    isDayOff: bool

class ComputedProfile(BaseModel):
    userId: str
    shiftId: Optional[str]
    date: str
    bodyTemperatureCurve: Dict[str, float]
    insulinSensitivityWindows: List[Dict[str, str]]
    cortisolRhythm: Dict[str, float]
    melatoninOnset: Optional[str]
    caffeineMetabolismWindow: Dict[str, str]
    optimalExerciseWindows: List[Dict[str, str]]

def _parse_time(time_str: str) -> datetime:
    # Handle ISO 8601 strings, e.g., "2026-03-01T22:00:00Z"
    if time_str.endswith("Z"):
        time_str = time_str[:-1]
    return datetime.fromisoformat(time_str)

def compute_profile(shift: Shift) -> ComputedProfile:
    logger.info("Computing profile for shift", extra={"shift_id": shift.id, "user_id": shift.userId})
    start_time = _parse_time(shift.startTime)
    end_time = _parse_time(shift.endTime)
    
    # Infer sleep window if not provided
    if shift.sleepWindowStart and shift.sleepWindowEnd:
        sleep_start = _parse_time(shift.sleepWindowStart)
        sleep_end = _parse_time(shift.sleepWindowEnd)
    else:
        # Simple heuristic: sleep for 8 hours starting after commute
        sleep_start = end_time + timedelta(minutes=shift.commuteMinutes)
        sleep_end = sleep_start + timedelta(hours=8)
    
    # Generate 24-hour time points starting from sleep_start
    times = [sleep_start + timedelta(hours=i) for i in range(24)]
    time_keys = [t.strftime("%H:%M") for t in times]
    
    # Numpy arrays for calculations
    t_hours = np.linspace(0, 24, 24, endpoint=False)
    
    # Body Temperature Curve
    # Min temperature typically ~2 hours before waking up (e.g. ~6 hours after sleep start)
    # Cosine wave: temp = 36.8 - 0.5 * cos(2 * pi * (t - t_min) / 24)
    t_min = 6.0
    temp_curve = 36.8 - 0.5 * np.cos(2 * np.pi * (t_hours - t_min) / 24.0)
    body_temp_dict = {k: round(float(v), 2) for k, v in zip(time_keys, temp_curve)}
    
    # Cortisol Rhythm
    # Peaks ~30 mins after waking up (e.g., 8.5 hours after sleep start)
    t_peak_cortisol = 8.5
    cortisol_curve = 50 + 50 * np.cos(2 * np.pi * (t_hours - t_peak_cortisol) / 24.0)
    cortisol_curve = np.clip(cortisol_curve, 10, 150)
    cortisol_dict = {k: round(float(v), 2) for k, v in zip(time_keys, cortisol_curve)}
    
    # Melatonin Onset
    # Typically ~2 hours before sleep time
    melatonin_onset_time = sleep_start - timedelta(hours=2)
    melatonin_onset_str = melatonin_onset_time.strftime("%H:%M")
    
    # Insulin Sensitivity Window
    # Highest during daylight / active hours. Let's say 4 to 12 hours after waking up.
    insulin_start = sleep_end + timedelta(hours=4)
    insulin_end = sleep_end + timedelta(hours=12)
    insulin_windows = [{"start": insulin_start.strftime("%H:%M"), "end": insulin_end.strftime("%H:%M")}]
    
    # Caffeine Metabolism Window
    # Avoid caffeine ~10 hours before sleep
    caffeine_start = sleep_end
    caffeine_end = sleep_start - timedelta(hours=10)
    caffeine_window = {"start": caffeine_start.strftime("%H:%M"), "end": caffeine_end.strftime("%H:%M")}
    
    # Optimal Exercise Windows
    # Typically 2-4 hours before bedtime or when body temp is peaking (18h after sleep start)
    exercise_start = sleep_start + timedelta(hours=16)
    exercise_end = sleep_start + timedelta(hours=19)
    exercise_windows = [{"start": exercise_start.strftime("%H:%M"), "end": exercise_end.strftime("%H:%M")}]
    
    logger.info("Profile computed successfully", extra={"shift_id": shift.id})
    
    return ComputedProfile(
        userId=shift.userId,
        shiftId=shift.id,
        date=shift.shiftDate,
        bodyTemperatureCurve=body_temp_dict,
        insulinSensitivityWindows=insulin_windows,
        cortisolRhythm=cortisol_dict,
        melatoninOnset=melatonin_onset_str,
        caffeineMetabolismWindow=caffeine_window,
        optimalExerciseWindows=exercise_windows
    )
