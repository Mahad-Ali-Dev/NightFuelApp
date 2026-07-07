"""Final cross-catalog verification: every *_catalog.json the seeder will load."""
import json, glob, re
from collections import Counter

pat = re.compile(r'^(?:An?|A)\s+an?\s', re.I)
catalogs = sorted(glob.glob('**/*_catalog.json', recursive=True))
total = 0
print(f"{'catalog':<26}{'uniq':>5}{'instr%':>7}{'stretch':>8}{'dblArt':>7}  levels (B/I/A)")
print('-' * 78)
for f in catalogs:
    d = json.load(open(f, encoding='utf-8'))
    n = len(d); total += n
    with_instr = sum(1 for e in d if isinstance(e.get('instructions'), list) and len(e['instructions']) >= 1)
    instr_pct = round(100 * with_instr / n) if n else 0
    has_stretch = any('Stretch' in (e.get('folder') or '') for e in d)
    dbl = sum(1 for e in d if isinstance(e.get('description'), str) and pat.match(e['description']))
    lv = Counter((e.get('level') or '?') for e in d)
    slug = f.replace('\\', '/').split('/')[0]
    print(f"{slug:<26}{n:>5}{instr_pct:>6}%{('yes' if has_stretch else 'NO'):>8}{dbl:>7}  "
          f"{lv.get('Beginner',0)}/{lv.get('Intermediate',0)}/{lv.get('Advanced',0)}")
print('-' * 78)
print(f"{'TOTAL':<26}{total:>5} exercises across {len(catalogs)} muscle groups")

# Gender coverage (so the library can split Male/Female)
allg = Counter()
for f in catalogs:
    for e in json.load(open(f, encoding='utf-8')):
        allg[e.get('gender', '?')] += 1
print('gender split (catalog rows):', dict(allg))
