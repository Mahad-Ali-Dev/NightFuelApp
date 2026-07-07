"""Augment the original chest_catalog.json with a step-by-step `instructions`
array (read aloud by the app's speaker/TTS), matching the other muscle groups.
Non-destructive: only ADDS the field, keyed on the existing movement + region.
Run: python _add_chest_instructions.py"""
import json, os

SRC = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.join(SRC, 'chest_catalog.json')


def chest_instructions(eq, mv, reg):
    region_label = {'Upper': 'upper chest', 'Mid': 'mid chest', 'Lower': 'lower chest'}.get(reg, 'chest')
    tool = 'the bar' if eq in ('Barbell', 'Smith Machine') else 'the handles' if eq == 'Cable' \
        else 'the dumbbells' if eq == 'Dumbbell' else 'the weight'
    STEPS = {
        'Press': [
            f"Lie back on the bench and hold {tool} at chest level, elbows bent and shoulder blades pulled together.",
            f"Press {tool} up and slightly in until your arms are extended over your {region_label}.",
            "Squeeze your chest hard at the top.",
            f"Lower {tool} slowly back to your chest, keeping your elbows at about forty-five degrees. Don't bounce it off your chest.",
        ],
        'Fly / Squeeze': [
            f"Hold {tool} out over your chest with a slight, fixed bend in your elbows.",
            "Open your arms wide in an arc until you feel a stretch across your chest.",
            f"Bring {tool} back together over your {region_label}, squeezing as if hugging a barrel.",
            "Lower slowly back to the stretch. Keep the elbow bend constant the whole time.",
        ],
        'Dip': [
            "Support yourself on the bars with your arms straight and lean your torso forward.",
            "Lower yourself by bending your elbows until you feel a stretch across your lower chest.",
            "Press back up powerfully while staying leaned forward to keep the work on the chest.",
            "Stop just short of locking out and repeat, smooth and controlled.",
        ],
        'Pullover': [
            f"Lie back and hold {tool} above your chest with a slight bend in your elbows.",
            f"Lower {tool} back behind your head until you feel a deep stretch across your chest and lats.",
            f"Pull {tool} back over your chest, keeping your elbows fixed and your ribs down.",
            "Squeeze your chest at the top and repeat under control.",
        ],
        'Push-up': [
            "Set up in a rigid plank with your hands a little wider than your shoulders and your body in a straight line.",
            "Brace your core and lower your chest toward the floor until your elbows reach about ninety degrees.",
            "Press back up powerfully, keeping your body straight and your elbows tucked at roughly forty-five degrees.",
            "Don't let your hips sag or pike — this trains the chest, shoulders, triceps and bracing core.",
        ],
        'Power / Throw': [
            "Set a strong, braced position with the weight at your chest.",
            "Explode through the movement, pressing or throwing the load as fast as you can.",
            "Catch or reset under control, absorbing the load with bent arms.",
            "Reset fully between reps — this is a high-intensity power drill, so favour quality over quantity.",
        ],
        'Dynamic warm-up': [
            "Stand tall with your arms relaxed and your core gently braced.",
            "Move through the controlled dynamic motion, gradually increasing the range as your chest and shoulders warm up.",
            "Keep it smooth and rhythmic, breathing steadily throughout.",
        ],
        'Stretch/Mobility': [
            "Ease into the stretch slowly until you feel a gentle pull across your chest and the front of your shoulders.",
            "Hold the position and breathe deeply, letting the chest open with each exhale.",
            "Come out of the stretch under control and repeat on the other side if needed.",
        ],
    }
    return STEPS.get(mv, [
        f"Set up safely with {tool} at chest level and your shoulder blades set.",
        f"Move {tool} through a full range under control, working the {region_label}.",
        "Return to the start under control and repeat.",
    ])


d = json.load(open(CAT, encoding='utf-8'))
for e in d:
    e['instructions'] = chest_instructions(e.get('equipment', ''), e.get('movement', ''), e.get('region', 'Mid'))
json.dump(d, open(CAT, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
print(f"Added instructions to {len(d)} chest entries.")
