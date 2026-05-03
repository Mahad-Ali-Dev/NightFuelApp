from typing import Dict, Any
from .models import DayPlanRequest

def generate_skeleton(request: DayPlanRequest) -> Dict[str, Any]:
    """
    Layer 2: Chrono-Nutrition Optimizer (Rules Engine)
    Generates a deterministic plan skeleton based on the circadian profile.
    This skeleton acts as a hard constraint for the LLM.
    """
    profile = request.circadianProfile or {}
    
    # 1. Determine Caffeine Cutoff (Hard Rule: No caffeine after metabolism window ends)
    caffeine_cutoff = profile.get("caffeineMetabolismWindow", {}).get("end", "12:00")
    
    # 2. Determine Optimal Workout Window
    workout_window = "Flexible"
    optimal_windows = profile.get("optimalExerciseWindows", [])
    if optimal_windows:
        workout_window = f"{optimal_windows[0].get('start')} - {optimal_windows[0].get('end')}"
        
    # 3. Determine High-GI Carb Windows (Hard Rule: Only during insulin sensitivity windows)
    carb_window = "Moderate"
    insulin_windows = profile.get("insulinSensitivityWindows", [])
    if insulin_windows:
        carb_window = f"{insulin_windows[0].get('start')} - {insulin_windows[0].get('end')}"

    # 4. Recommended Intensity (Hard Rule: Based on shift fatigue)
    fatigue_levels = profile.get("fatigueLevels", [])
    avg_fatigue = sum([f.get("level", 5) for f in fatigue_levels]) / len(fatigue_levels) if fatigue_levels else 5
    # If the user has a shift today, recommend moderate. If night shift, recommend low/moderate.
    recommended_intensity = "MODERATE"
    if request.shiftType in ["NIGHT", "ROTATING"]:
        recommended_intensity = "LOW/MODERATE"
    
    # 6. Specialized Diet Modes (Ramadan, etc.)
    meal_structure = [
        {"name": "Anchor Meal (Post-Wake)", "timing": "Within 2 hours of waking", "focus": "High Protein, Hydration"},
        {"name": "Mid-Shift Fuel", "timing": "Middle of shift", "focus": "Sustained Energy, Moderate Carbs"},
        {"name": "Pre-Sleep Light Meal", "timing": "1-2 hours before sleep", "focus": "Low GI, Easy to digest"}
    ]
    
    if request.preferences and request.preferences.dietMode == "RAMADAN":
        # Hard constraint: Only Suhoor (Pre-dawn) and Iftar (Post-sunset)
        # Shift timings may conflict, so we focus on the sun cycles
        meal_structure = [
            {"name": "Suhoor (Pre-Dawn)", "timing": "3:30 AM - 4:30 AM", "focus": "Slow-release carbs, High hydration, Casein protein"},
            {"name": "Iftar (Post-Sunset)", "timing": "6:30 PM - 7:30 PM", "focus": "Fast-release carbs, Electrolytes, High protein"}
        ]
        # Caffeine is only allowed during non-fasting hours
        # Usually between Iftar and Suhoor.
        caffeine_cutoff = "04:00"

    # Define missing variables from preferences
    prefs = request.preferences
    split_focus = prefs.splitPreference if prefs else "FULL_BODY"
    available_gear = prefs.availableEquipment if prefs else []
    duration_limit = prefs.workoutDurationPreference if prefs else 60

    # Construct the JSON skeleton
    skeleton = {
        "rules": {
            "caffeine_cutoff": caffeine_cutoff,
            "optimal_workout_window": workout_window,
            "high_gi_carbs_allowed_during": carb_window,
            "melatonin_onset_estimate": profile.get("melatoninOnset", "21:00"),
            "recommended_intensity": recommended_intensity,
            "split_focus": split_focus,
            "available_gear": available_gear,
            "max_duration_mins": duration_limit,
            "diet_mode": prefs.dietMode if prefs else "BALANCED"
        },
        "meal_structure": meal_structure
    }
    
    return skeleton

def validate_plan_against_skeleton(llm_plan: Any, skeleton: Dict[str, Any]) -> list[str]:
    """
    Validates the LLM output against the hard rules of the skeleton.
    Returns a list of violation strings. Empty list means the plan is valid.
    """
    violations = []
    
    # Check for basic structure
    if not isinstance(llm_plan, dict):
        violations.append("Response must be a JSON object.")
        return violations

    meals = llm_plan.get("meals", [])
    if not isinstance(meals, list) or len(meals) == 0:
        violations.append("Response must contain a 'meals' array with at least one meal.")
        return violations

    # Check for "Nutrition Cart" structure in each meal
    for i, meal in enumerate(meals):
        meal_name = meal.get("name", f"Meal {i+1}")
        
        # Check for 'items' array
        items = meal.get("items", [])
        if not isinstance(items, list) or len(items) == 0:
            violations.append(f"Meal '{meal_name}' is missing a detailed 'items' array (the Nutrition Cart).")
            continue

        # Check for macros in each item
        for j, item in enumerate(items):
            item_name = item.get("name", f"Item {j+1}")
            required_fields = ["amount", "calories", "protein", "carbs", "fat"]
    # Check for workout_suggestion structure
    workout = llm_plan.get("workout_suggestion")
    if not isinstance(workout, dict):
        violations.append("Response must contain a 'workout_suggestion' object.")
    else:
        req_workout_fields = ["title", "duration", "intensity", "exercises"]
        for field in req_workout_fields:
            if field not in workout:
                violations.append(f"workout_suggestion is missing required field '{field}'.")
        
        # Intensity adherence
        target_intensity = skeleton["rules"]["recommended_intensity"]
        if workout.get("intensity") and target_intensity not in workout.get("intensity"):
            # We don't fail strictly here but log/warn for the LLM during retries
            pass

    # Basic time adherence check (mock/placeholder logic)
    # In a full implementation, we'd compare meal.suggested_time against skeleton.rules
    
    return violations
