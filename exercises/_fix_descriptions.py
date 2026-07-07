"""One-off: fix the doubled leading article in catalog descriptions
("An a horizontal pull" -> "A horizontal pull"; "An an overhead" -> "An overhead").
Idempotent — only rewrites when a <article> <article> prefix is present.
Skips the 'upper arms' catalog (a background agent owns it)."""
import json, re, glob

pat = re.compile(r'^(?:An?|A)\s+(an?)\s+', re.I)
fixed_files = 0
for f in glob.glob('**/*_catalog.json', recursive=True):
    norm = f.replace('\\', '/')
    if 'upper arms' in norm:
        continue
    try:
        d = json.load(open(f, encoding='utf-8'))
    except Exception as e:
        print('skip', f, e)
        continue
    changed = 0
    for e in d:
        desc = e.get('description')
        if isinstance(desc, str):
            new = pat.sub(lambda m: m.group(1).capitalize() + ' ', desc, count=1)
            if new != desc:
                e['description'] = new
                changed += 1
    if changed:
        json.dump(d, open(f, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
        print(f'  fixed {changed:4d} descriptions in {norm}')
        fixed_files += 1

print(f'\nTotal catalog files cleaned: {fixed_files}')
rem = 0
for f in glob.glob('**/*_catalog.json', recursive=True):
    if 'upper arms' in f.replace('\\', '/'):
        continue
    for e in json.load(open(f, encoding='utf-8')):
        desc = e.get('description')
        if isinstance(desc, str) and pat.match(desc):
            rem += 1
print('remaining double-article descriptions:', rem)
