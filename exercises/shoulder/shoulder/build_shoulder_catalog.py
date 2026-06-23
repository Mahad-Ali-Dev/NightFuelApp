"""
Shoulder catalog builder — same template as chest/back/upper-arms but with
SHOULDER exercise science: the three deltoid heads (anterior / medial / posterior),
the upper traps, and the rotator cuff (infraspinatus, teres minor, subscapularis,
supraspinatus). Each exercise gets a step-by-step `instructions` array written to
be READ ALOUD by the app's speaker/TTS feature.
Run from this folder: python build_shoulder_catalog.py
"""
import os, re, json, shutil
from collections import defaultdict, Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = os.path.dirname(os.path.abspath(__file__))
OUT_XLSX = os.path.join(SRC, "Shoulder_Exercise_Catalog.xlsx")
OUT_JSON = os.path.join(SRC, "shoulder_catalog.json")
TITLE = "Shoulder"


def parse(fn):
    base = fn[:-4]
    m = re.match(r'^(\d+)-(.*)$', base)
    rid, s = (m.group(1), m.group(2)) if m else ('', base)
    s = re.sub(r'\s*\(\d+\)\s*$', '', s)
    name_part = s.split('_')[0]
    low = name_part.lower()
    gender = 'Female' if ('female' in low or re.search(r'\(fe', low)) else 'Male'
    name = re.sub(r'\((?:fe)?male\)', '', name_part, flags=re.I)
    name = re.sub(r'-?FIX2?', '', name, flags=re.I)
    name = re.sub(r'\(version[- ]?\d\)', '', name, flags=re.I)
    name = name.replace('-', ' ')
    name = re.sub(r'\s+', ' ', name).strip(' _-')
    return {'file': fn, 'id': rid, 'name': name, 'gender': gender, 'bodypart': 'Shoulders'}


def equipment(n):
    l = n.lower()
    if 'smith' in l: return 'Smith Machine'
    if 'landmine' in l or 't-bar' in l or 't bar' in l: return 'Landmine'
    if 'barbell' in l: return 'Barbell'
    if 'dumbbell' in l: return 'Dumbbell'
    if 'kettlebell' in l: return 'Kettlebell'
    if 'cable' in l: return 'Cable'
    if 'machine' in l or 'lever' in l or 'plate-loaded' in l: return 'Machine (Lever)'
    if re.search(r'\bband\b', l) or 'resistance band' in l: return 'Resistance Band'
    if 'suspension' in l or 'trx' in l: return 'Suspension (TRX)'
    if 'battling rope' in l or 'battle rope' in l: return 'Battle Ropes'
    return 'Bodyweight'


def movement(n):
    l = n.lower()
    # Stretch / mobility / self-myofascial. `\broll\b` catches "Roll Shoulders"
    # but NOT "Rollout". Arm/elbow "circles" are warm-up mobility.
    if any(k in l for k in ['stretch', 'mobility', 'opener', 'dislocate', 'foam',
                            'roller', 'release', 'circle', 'cat ', 'child']) or re.search(r'\broll\b', l):
        return 'Stretch/Mobility'
    # Rotator cuff — internal/external/"lateral" rotation + Cuban rotation. MUST be
    # checked before 'lateral' (Lateral Raise) since "lateral rotation" contains it.
    if 'rotation' in l or 'rotator' in l or 'cuban' in l:
        return 'Rotator Cuff'
    if 'face' in l:                       # face pull (rear delts + external rotators)
        return 'Face Pull'
    if 'shrug' in l:
        return 'Shrug'
    if 'upright' in l:
        return 'Upright Row'
    # Rear delts: anything "rear", a reverse fly/raise, or a bent-over / prone /
    # face-down raise or row — in a shoulder context these all hit the posterior
    # delts, NOT the side delts, so they must be caught before the Lateral Raise rule.
    if any(k in l for k in ['rear', 'reverse fly', 'reverse-fly', 'reverse raise', 'rear fly',
                            'rear delt', 'high reverse', 'deltoid rear', 'bent over', 'bent-over',
                            'bentover', 'prone']):
        return 'Rear Delt'
    if any(k in l for k in ['press', 'military', 'overhead', 'arnold', 'clean and press', 'push press']):
        return 'Overhead Press'
    if 'front' in l:
        return 'Front Raise'
    if 'lateral' in l or 'raise' in l or 'iron cross' in l:
        return 'Lateral Raise'
    return 'Lateral Raise'


REGION = {  # movement -> training category
    'Overhead Press': 'Press', 'Lateral Raise': 'Lateral', 'Front Raise': 'Front',
    'Rear Delt': 'Rear', 'Face Pull': 'Rear', 'Upright Row': 'Upright',
    'Shrug': 'Traps', 'Rotator Cuff': 'Cuff', 'Stretch/Mobility': 'Stretch',
}

ADV = ['one-arm', 'one arm', 'single-arm', 'single arm', 'behind head', 'behind the head',
       'behind neck', 'behind-the-neck', 'push press', 'clean and press', 'snatch', 'bradford',
       'z press', 'z-press', 'handstand', 'pike', 'poliquin', 'iron cross']
BEG = ['machine', 'lever', 'cable', 'band', 'supported', 'assisted', 'stretch', 'mobility',
       'circle', 'shrug', 'rotation', 'rotator', 'face pull', 'wall']


def level(n, mv):
    l = n.lower()
    if mv in ('Stretch/Mobility', 'Rotator Cuff'): return 'Beginner'
    if any(k in l for k in ADV): return 'Advanced'
    if any(k in l for k in BEG): return 'Beginner'
    return 'Intermediate'


def muscles(mv):
    return {
        'Overhead Press':   ('Anterior deltoid, Medial deltoid', 'Triceps brachii, Upper trapezius, Serratus anterior'),
        'Lateral Raise':    ('Medial (lateral) deltoid', 'Anterior deltoid, Supraspinatus, Upper trapezius'),
        'Front Raise':      ('Anterior deltoid', 'Medial deltoid, Upper pectoralis major, Serratus anterior'),
        'Rear Delt':        ('Posterior deltoid', 'Rhomboids, Middle trapezius, Infraspinatus, Teres minor'),
        'Face Pull':        ('Posterior deltoid, Infraspinatus, Teres minor', 'Middle trapezius, Rhomboids'),
        'Upright Row':      ('Medial deltoid, Upper trapezius', 'Anterior deltoid, Biceps brachii, Supraspinatus'),
        'Shrug':            ('Upper trapezius', 'Levator scapulae, Rhomboids, Forearm flexors (grip)'),
        'Rotator Cuff':     ('Rotator cuff (infraspinatus, teres minor, subscapularis)', 'Posterior deltoid, Supraspinatus'),
        'Stretch/Mobility': ('Deltoids & rotator cuff (stretch)', 'Trapezius, Pectoralis major'),
    }.get(mv, ('Deltoids', 'Trapezius, Rotator cuff'))


def describe(eq, mv):
    rl = {
        'Overhead Press': "a vertical press overhead that builds the front and side delts, with the triceps and upper traps assisting.",
        'Lateral Raise': "an isolation raise out to the sides that targets the side (medial) deltoids and builds shoulder width.",
        'Front Raise': "an isolation raise to the front that targets the front (anterior) deltoids.",
        'Rear Delt': "a reverse-fly style movement that targets the rear (posterior) deltoids and upper back — key for shoulder balance and posture.",
        'Face Pull': "a cable pull toward the face that targets the rear delts and external rotators — excellent for posture and shoulder health.",
        'Upright Row': "a vertical pull toward the chin that works the side delts and upper traps.",
        'Shrug': "an isolation lift for the upper traps, elevating the shoulders against the load.",
        'Rotator Cuff': "a rotator-cuff drill that strengthens the small muscles which stabilize and rotate the shoulder joint.",
        'Stretch/Mobility': "a shoulder stretch and mobility drill that opens the delts and rotator cuff and improves overhead range.",
    }.get(mv, "a shoulder movement that builds the deltoids.")
    # rl already begins with its own article ("a"/"an") — just capitalize it
    # (no extra article, which would double to "An a vertical press…").
    eqs = '' if eq == 'Bodyweight' else f" Performed with {('an ' if eq[0] in 'AEIOU' else 'a ')}{eq.lower()}."
    return rl[0].upper() + rl[1:] + eqs


def instructions(eq, mv):
    """Step-by-step how-to, written to be READ ALOUD (speaker/TTS). Returns a list."""
    tool = ('the bar' if eq in ('Barbell', 'Smith Machine', 'Landmine')
            else 'the handle' if eq == 'Cable'
            else 'the band' if eq == 'Resistance Band'
            else 'the weight')
    STEPS = {
        'Overhead Press': [
            f"Stand or sit tall with {tool} at shoulder height, hands just outside your shoulders and your core braced.",
            f"Press {tool} straight overhead until your arms are fully extended, without leaning back.",
            "Pause briefly at the top with the weight stacked over your shoulders.",
            f"Lower {tool} slowly back to shoulder height under control. Keep your ribs down and don't arch your lower back.",
        ],
        'Lateral Raise': [
            f"Stand tall holding {tool} at your sides with a slight bend in your elbows.",
            f"Raise {tool} out to your sides until your arms reach shoulder height, leading with your elbows.",
            "Pause for a moment at the top — your body should form a T.",
            f"Lower {tool} slowly back to your sides. Keep the movement smooth and don't swing or shrug.",
        ],
        'Front Raise': [
            f"Stand tall holding {tool} in front of your thighs with a slight bend in your elbows.",
            f"Raise {tool} straight in front of you to about shoulder height.",
            "Pause briefly at the top, keeping your wrists firm.",
            f"Lower {tool} slowly back to the start without swinging or using momentum.",
        ],
        'Rear Delt': [
            f"Hinge forward at the hips, or set yourself face-down on an incline bench, and let {tool} hang below you.",
            f"With a slight bend in your elbows, raise {tool} out to your sides, squeezing your shoulder blades together.",
            "Pause at the top and feel your rear delts and upper back contract.",
            f"Lower {tool} slowly under control. Lead with your elbows and don't let your torso rise.",
        ],
        'Face Pull': [
            "Set the cable at about face height and grip the rope with your palms facing in.",
            "Step back to tension the cable, brace your core, and start with your arms extended.",
            "Pull the rope toward your face, flaring your elbows out wide and driving your hands past your ears.",
            "Squeeze your rear delts and upper back at the end, then return slowly under control.",
        ],
        'Upright Row': [
            f"Stand tall holding {tool} in front of your thighs with an overhand grip.",
            f"Pull {tool} straight up toward your chin, leading with your elbows and keeping it close to your body.",
            "Pause when your elbows reach about shoulder height.",
            f"Lower {tool} slowly back to the start. Don't pull so high that your shoulders pinch.",
        ],
        'Shrug': [
            f"Stand tall holding {tool} at arm's length by your sides, shoulders relaxed.",
            "Lift your shoulders straight up toward your ears as high as you can.",
            "Hold the squeeze at the very top for a moment.",
            "Lower slowly back to the start. Keep your arms straight and don't roll your shoulders.",
        ],
        'Rotator Cuff': [
            f"Tuck your elbow tight against your side, bent to ninety degrees, holding {tool}.",
            "Keeping your elbow pinned, rotate your forearm slowly outward (or inward) through a comfortable range.",
            "Pause briefly at the end of the range without letting your elbow drift.",
            f"Return {tool} slowly to the start. Use a light load — this is about control, not heavy weight.",
        ],
        'Stretch/Mobility': [
            "Move into the stretch slowly until you feel a gentle pull through your shoulder.",
            "Hold the position and breathe deeply, letting the muscles lengthen with each exhale.",
            "Ease out of the stretch under control and repeat on the other side if needed.",
        ],
    }
    return STEPS.get(mv, [
        f"Set up tall with a firm grip on {tool} and your core braced.",
        f"Move {tool} smoothly through the shoulder's range, keeping control.",
        f"Lower {tool} slowly under control and repeat.",
    ])


def folder_for(gender, mv):
    cat = {
        'Press': 'Overhead Press (Delts & Triceps)',
        'Lateral': 'Lateral Raises (Side Delts)',
        'Front': 'Front Raises (Front Delts)',
        'Rear': 'Rear Delts (Reverse Fly, Rows & Face Pulls)',
        'Upright': 'Upright Rows',
        'Traps': 'Traps (Shrugs)',
        'Cuff': 'Rotator Cuff (Stability)',
        'Stretch': 'Stretch & Mobility',
    }.get(REGION.get(mv, 'Lateral'), 'Other')
    return gender + '/' + cat


def main():
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.mp4'))
    if not files:
        print('No top-level .mp4 - already organized.'); return
    recs = []
    for f in files:
        r = parse(f)
        r['equipment'] = equipment(r['name'])
        r['movement'] = movement(r['name'])
        r['region'] = REGION.get(r['movement'], 'Lateral')
        r['level'] = level(r['name'], r['movement'])
        r['primary'], r['secondary'] = muscles(r['movement'])
        r['description'] = describe(r['equipment'], r['movement'])
        r['instructions'] = instructions(r['equipment'], r['movement'])
        r['flag'] = ''
        r['folder'] = folder_for(r['gender'], r['movement'])
        recs.append(r)
    groups = defaultdict(list)
    for r in recs:
        groups[(r['name'].lower(), r['gender'])].append(r)
    catalog = []
    for grp in groups.values():
        b = dict(grp[0]); b['variants'] = len(grp)
        b['files'] = '; '.join(sorted(set(g['file'] for g in grp)))
        catalog.append(b)
    catalog.sort(key=lambda r: (r['gender'], r['folder'], r['equipment'], r['name']))
    json.dump(catalog, open(OUT_JSON, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

    wb = Workbook(); ws = wb.active; ws.title = f'{TITLE} Catalog'
    cols = ['Exercise Name', 'Equipment', 'Gender', 'Level', 'Movement Type', 'Primary Muscle',
            'Secondary Muscles', 'Description', 'Step-by-step Instructions (TTS)', 'Variants', 'ID', 'Video File(s)', 'Folder']
    ws.append(cols)
    for r in catalog:
        ws.append([r['name'], r['equipment'], r['gender'], r['level'], r['movement'], r['primary'],
                   r['secondary'], r['description'], '\n'.join(f"{i+1}. {s}" for i, s in enumerate(r['instructions'])),
                   r['variants'], r['id'], r['files'], r['folder']])
    ARIAL = 'Arial'
    thin = Side(style='thin', color='D9D9D9'); border = Border(thin, thin, thin, thin)
    lvl_fill = {'Beginner': PatternFill('solid', fgColor='C6EFCE'), 'Intermediate': PatternFill('solid', fgColor='FFEB9C'),
                'Advanced': PatternFill('solid', fgColor='FFC7CE')}
    for i, w in enumerate([38, 18, 9, 13, 20, 34, 38, 56, 70, 9, 11, 50, 38], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for c in range(1, len(cols) + 1):
        cell = ws.cell(1, c); cell.fill = PatternFill('solid', fgColor='1F3864')
        cell.font = Font(name=ARIAL, bold=True, color='FFFFFF', size=11)
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); cell.border = border
    ws.row_dimensions[1].height = 30
    for row in range(2, ws.max_row + 1):
        for c in range(1, len(cols) + 1):
            cell = ws.cell(row, c); cell.font = Font(name=ARIAL, size=10)
            cell.alignment = Alignment(vertical='top', wrap_text=(c in (1, 6, 7, 8, 9, 12, 13))); cell.border = border
        lv = ws.cell(row, 4); lv.fill = lvl_fill.get(lv.value, PatternFill())
        lv.alignment = Alignment(horizontal='center', vertical='top')
    ws.freeze_panes = 'A2'; ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{ws.max_row}"
    sm = wb.create_sheet('Summary')
    sm.append([f'{TITLE} Exercise Catalog - Summary']); sm['A1'].font = Font(name=ARIAL, bold=True, size=14)
    sm.append([]); sm.append(['Total video files', len(files)]); sm.append(['Unique exercises', len(catalog)]); sm.append([])
    for t, k in [('By equipment', 'equipment'), ('By gender', 'gender'), ('By level', 'level'), ('By movement type', 'movement')]:
        sm.append([t]); sm.cell(sm.max_row, 1).font = Font(name=ARIAL, bold=True, size=11)
        for val, cnt in sorted(Counter(r[k] for r in catalog).items(), key=lambda x: -x[1]):
            sm.append([val, cnt])
        sm.append([])
    sm.column_dimensions['A'].width = 40; sm.column_dimensions['B'].width = 12
    wb.save(OUT_XLSX)

    manifest = []
    for f in files:
        r = parse(f)
        rel = folder_for(r['gender'], movement(r['name']))
        dest_dir = os.path.join(SRC, *rel.split('/')); os.makedirs(dest_dir, exist_ok=True)
        src = os.path.join(SRC, f); dst = os.path.join(dest_dir, f)
        if os.path.exists(src) and os.path.abspath(src) != os.path.abspath(dst):
            shutil.move(src, dst)
        manifest.append({'file': f, 'folder': rel})
    json.dump(manifest, open(os.path.join(SRC, '_organize_manifest.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(os.path.join(SRC, '_undo_organize.py'), 'w', encoding='utf-8').write(
        "import os, json, shutil\nSRC=os.path.dirname(os.path.abspath(__file__))\n"
        "for e in json.load(open(os.path.join(SRC,'_organize_manifest.json'),encoding='utf-8')):\n"
        "    cur=os.path.join(SRC,*e['folder'].split('/'),e['file'])\n"
        "    if os.path.exists(cur): shutil.move(cur, os.path.join(SRC,e['file']))\nprint('undone')\n")
    print('FILES', len(files), 'UNIQUE', len(catalog))
    print('LEVELS', dict(Counter(r['level'] for r in catalog)))
    print('CATEGORIES', dict(Counter(r['folder'] for r in catalog)))


if __name__ == '__main__':
    main()
