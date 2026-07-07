"""
Legs catalog builder — same proven template as back/chest/biceps but with LEGS
exercise science (quads / hamstrings / glutes), and a step-by-step `instructions`
array per exercise written to be READ ALOUD by the app's speaker/TTS feature.
Run from this folder: python build_legs_catalog.py
"""
import os, re, json, shutil
from collections import defaultdict, Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

SRC = os.path.dirname(os.path.abspath(__file__))
OUT_XLSX = os.path.join(SRC, "Legs_Exercise_Catalog.xlsx")
OUT_JSON = os.path.join(SRC, "legs_catalog.json")
TITLE = "Legs"


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
    return {'file': fn, 'id': rid, 'name': name, 'gender': gender, 'bodypart': 'Upper Legs'}


def equipment(n):
    l = n.lower()
    if 'smith' in l: return 'Smith Machine'
    if 'trap bar' in l or 'trap-bar' in l or 'hex bar' in l or 'landmine' in l: return 'Trap-Bar / Landmine'
    if 'barbell' in l: return 'Barbell'
    if 'dumbbell' in l: return 'Dumbbell'
    if 'kettlebell' in l: return 'Kettlebell'
    if 'cable' in l: return 'Cable'
    if 'sled' in l or 'leg press' in l or 'hack' in l: return 'Machine (Sled)'
    if 'machine' in l or 'lever' in l or 'plate-loaded' in l or 'plate loaded' in l: return 'Machine (Lever)'
    if re.search(r'\bband\b', l) or 'resistance band' in l: return 'Resistance Band'
    if 'suspension' in l or 'suspended' in l or 'suspender' in l or 'trx' in l: return 'Suspension (TRX)'
    return 'Bodyweight'


def movement(n):
    l = n.lower()
    # Stretch / mobility / self-myofascial (foam-rolling). `\broll\b` catches
    # "Roll ..." moves but NOT "Rollout" (one word = no boundary = a core move).
    if any(k in l for k in ['stretch', 'mobility', 'opener', 'foam',
                            'roller', 'release', 'sit (wall)', 'wall sit', 'march sit']) or re.search(r'\broll\b', l):
        return 'Stretch/Mobility'
    if 'leg extension' in l or 'knee extension' in l: return 'Leg Extension'
    if 'leg curl' in l or 'hamstring curl' in l or 'lying curl' in l or 'seated curl' in l: return 'Leg Curl'
    if any(k in l for k in ['romanian', 'rdl', 'stiff', 'stiff-leg', 'good morning', 'good-morning']):
        return 'Hinge (RDL)'
    if 'deadlift' in l: return 'Hinge (RDL)'
    if 'leg press' in l or 'hack' in l: return 'Leg Press'
    if 'split squat' in l or 'bulgarian' in l or 'lunge' in l: return 'Lunge'
    if 'step up' in l or 'step-up' in l: return 'Step-up'
    if 'squat' in l: return 'Squat'
    return 'Squat'


CATEGORY = {  # movement -> folder category (NO "/" allowed in a dir name -> use "&")
    'Squat': 'Quads (Squat & Press)',
    'Leg Press': 'Quads (Squat & Press)',
    'Leg Extension': 'Quads (Isolation)',
    'Leg Curl': 'Hamstrings (Curl & Hinge)',
    'Hinge (RDL)': 'Hamstrings (Curl & Hinge)',
    'Lunge': 'Lunges & Unilateral',
    'Step-up': 'Lunges & Unilateral',
    'Stretch/Mobility': 'Stretch & Mobility',
}


def level(n, mv):
    l = n.lower()
    if mv == 'Stretch/Mobility': return 'Beginner'
    if any(k in l for k in ['machine', 'lever', 'leg extension', 'knee extension',
                            'leg curl', 'leg press', 'smith']): return 'Beginner'
    if any(k in l for k in ['barbell squat', 'front squat', 'bulgarian', 'single-leg',
                            'single leg', 'one-leg', 'one leg', 'deficit', 'pistol']): return 'Advanced'
    return 'Intermediate'


def muscles(mv):
    return {
        'Squat':            ('Quadriceps', 'Gluteus maximus, Hamstrings, Adductors, Core'),
        'Leg Press':        ('Quadriceps', 'Gluteus maximus, Hamstrings'),
        'Leg Extension':    ('Quadriceps (rectus femoris, vasti)', '—'),
        'Leg Curl':         ('Hamstrings (biceps femoris, semitendinosus)', 'Gastrocnemius'),
        'Hinge (RDL)':      ('Hamstrings & Gluteus maximus', 'Erector spinae, Adductors'),
        'Lunge':            ('Quadriceps & Gluteus maximus', 'Hamstrings, Adductors, Core'),
        'Step-up':          ('Quadriceps & Gluteus maximus', 'Hamstrings, Calves'),
        'Stretch/Mobility': ('Quadriceps & Hamstrings (stretch)', 'Hip flexors, Adductors, Calves'),
    }.get(mv, ('Quadriceps', 'Gluteus maximus, Hamstrings, Adductors, Core'))


def describe(eq, mv):
    rl = {
        'Squat': "a compound knee-and-hip movement that builds the quads, with the glutes, hamstrings and core supporting under load.",
        'Leg Press': "a machine compound that loads the quads and glutes heavily while keeping the spine supported.",
        'Leg Extension': "an isolation lift that targets the quadriceps directly through knee extension.",
        'Leg Curl': "an isolation lift that targets the hamstrings through knee flexion, curling the heels toward the glutes.",
        'Hinge (RDL)': "a hip-hinge that loads the hamstrings and glutes through a long stretch, with the erectors bracing the spine.",
        'Lunge': "a single-leg movement that builds the quads and glutes while challenging balance and the adductors.",
        'Step-up': "a single-leg movement that drives the quads and glutes by pushing the body up onto a raised surface.",
        'Stretch/Mobility': "a lower-body stretch/mobility drill to lengthen the quads, hamstrings and hip flexors.",
    }.get(mv, "a lower-body movement for the legs.")
    art = 'An ' if rl[0] in 'AEIOUaeiou' else 'A '
    eqs = '' if eq == 'Bodyweight' else f" Performed with {('an ' if eq[0] in 'AEIOU' else 'a ')}{eq.lower()}."
    return art + rl + eqs


def instructions(eq, mv):
    """Step-by-step how-to, written to be READ ALOUD (speaker/TTS). Returns a list."""
    tool = 'the bar' if 'Bar' in eq or eq in ('Barbell', 'Smith Machine', 'Trap-Bar / Landmine') else \
           'the handle' if eq == 'Cable' else 'the weight' if eq in ('Dumbbell', 'Kettlebell') else 'the handles'
    STEPS = {
        'Squat': [
            "Stand with your feet about shoulder-width apart and your toes turned out slightly.",
            "Brace your core and keep your chest up.",
            "Sit down and back, keeping your chest up and your knees tracking out over your toes.",
            "Descend until your thighs are at least parallel to the floor.",
            "Drive through your heels to stand back up to the top. Keep your spine neutral and your knees tracking over your toes the whole way.",
        ],
        'Leg Press': [
            "Sit in the machine and place your feet about hip-width on the middle of the platform.",
            "Release the safeties and lower the platform under control until your knees reach about ninety degrees.",
            "Press the platform back up through your heels until your legs are nearly straight, without locking your knees out hard.",
            "Keep your lower back flat against the pad and your knees tracking over your toes throughout.",
        ],
        'Leg Extension': [
            "Sit in the machine with the pad resting on the front of your lower shins and your knees aligned with the pivot.",
            "Control the weight up by straightening your knees until your legs are out in front of you.",
            "Squeeze your quads hard at the top for a moment.",
            "Lower the weight slowly back to the start, staying in control the whole way.",
        ],
        'Leg Curl': [
            "Get into position with the pad against the back of your lower legs, just above your heels.",
            "Curl your heels up toward your glutes as far as you comfortably can.",
            "Squeeze your hamstrings hard at the top.",
            "Control the negative, lowering your legs slowly back to straight. Keep your hips down on the pad and don't let them lift.",
        ],
        'Hinge (RDL)': [
            f"Stand tall holding {tool} in front of your thighs, feet hip-width apart with a soft bend in your knees.",
            f"Push your hips back and lower {tool}, keeping it close to your legs and your back flat.",
            "Lower until you feel a strong stretch in your hamstrings, with your back staying neutral.",
            "Drive your hips forward to stand back up tall, squeezing your glutes at the top. Keep a soft bend in the knees and never round your lower back.",
        ],
        'Lunge': [
            f"Stand tall, holding {tool} if you're using load, with your feet hip-width apart.",
            "Take a controlled step and lower your back knee toward the floor, keeping your torso upright.",
            "Descend until your front thigh is about parallel and your front knee tracks over your toes.",
            "Drive through your front heel to return to the start, then repeat on the other side. Keep your core braced and your knee tracking the toes.",
        ],
        'Step-up': [
            f"Stand facing a sturdy box or bench, holding {tool} if you're using load.",
            "Place one whole foot flat on the box.",
            "Drive through that heel to step up until your leg is straight, keeping your chest up.",
            "Lower yourself back down under control with the same leg, then repeat. Keep your knee tracking over your toes.",
        ],
        'Stretch/Mobility': [
            "Move into the stretch slowly until you feel a gentle pull through your quads or hamstrings.",
            "Hold the position and breathe deeply, letting the muscles lengthen with each exhale.",
            "Ease out of the stretch under control and repeat on the other side if needed.",
        ],
    }
    return STEPS.get(mv, [
        "Set up with your feet shoulder-width apart and brace your core.",
        "Lower under control, keeping your knees tracking over your toes.",
        "Drive through your heels to return to the start and repeat. Keep your spine neutral throughout.",
    ])


def folder_for(gender, mv):
    cat = CATEGORY.get(mv, 'Quads (Squat & Press)')
    return gender + '/' + cat


def main():
    # Only treat raw (not-yet-organized) videos as the source set: those sitting in
    # the flat source subfolders (hamstrings/quadriceps) or at top level — anything
    # NOT already under a Male/Female organized tree.
    raw = []
    for root, _, fs in os.walk(SRC):
        rel = os.path.relpath(root, SRC).replace('\\', '/')
        if rel.split('/')[0] in ('Male', 'Female'):
            continue
        for f in fs:
            if f.lower().endswith('.mp4'):
                raw.append((root, f))
    if not raw:
        print('No raw .mp4 - already organized.'); return
    # The raw set is split across muscle subfolders (hamstrings/quadriceps); a few
    # identical filenames are cross-filed under both. Collapse to one (root, file)
    # per distinct basename so manifest == distinct files == files placed on disk.
    physical = len(raw)
    seen = {}
    for root, f in sorted(raw, key=lambda rf: rf[1]):
        seen.setdefault(f, root)
    raw = sorted(((root, f) for f, root in seen.items()), key=lambda rf: rf[1])
    files = sorted(f for _, f in raw)
    recs = []
    for f in files:
        r = parse(f)
        r['equipment'] = equipment(r['name'])
        r['movement'] = movement(r['name'])
        r['category'] = CATEGORY.get(r['movement'], 'Quads (Squat & Press)')
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
    for i, w in enumerate([38, 18, 9, 13, 20, 34, 38, 56, 70, 9, 11, 50, 34], 1):
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
    sm.column_dimensions['A'].width = 38; sm.column_dimensions['B'].width = 12
    wb.save(OUT_XLSX)

    manifest = []
    for root, f in sorted(raw, key=lambda rf: rf[1]):
        r = parse(f)
        rel = folder_for(r['gender'], movement(r['name']))
        dest_dir = os.path.join(SRC, *rel.split('/')); os.makedirs(dest_dir, exist_ok=True)
        src = os.path.join(root, f); dst = os.path.join(dest_dir, f)
        if os.path.exists(src) and os.path.abspath(src) != os.path.abspath(dst):
            shutil.move(src, dst)
        manifest.append({'file': f, 'folder': rel})
    json.dump(manifest, open(os.path.join(SRC, '_organize_manifest.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    open(os.path.join(SRC, '_undo_organize.py'), 'w', encoding='utf-8').write(
        "import os, json, shutil\nSRC=os.path.dirname(os.path.abspath(__file__))\n"
        "for e in json.load(open(os.path.join(SRC,'_organize_manifest.json'),encoding='utf-8')):\n"
        "    cur=os.path.join(SRC,*e['folder'].split('/'),e['file'])\n"
        "    if os.path.exists(cur): shutil.move(cur, os.path.join(SRC,e['file']))\nprint('undone')\n")
    print('PHYSICAL_MP4', physical, '(3 cross-filed dup basenames)')
    print('FILES', len(files), 'UNIQUE', len(catalog))
    print('LEVELS', dict(Counter(r['level'] for r in catalog)))
    print('CATEGORIES', dict(Counter(r['folder'] for r in catalog)))


if __name__ == '__main__':
    main()
