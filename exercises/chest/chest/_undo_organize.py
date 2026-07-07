import os, json, shutil
SRC = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(SRC, '_organize_manifest.json'), encoding='utf-8'))
n = 0
for e in m:
    cur = os.path.join(SRC, *e['folder'].split('/'), e['file'])
    if os.path.exists(cur):
        shutil.move(cur, os.path.join(SRC, e['file'])); n += 1
for root, dirs, fs in os.walk(SRC, topdown=False):
    if root != SRC and not os.listdir(root):
        os.rmdir(root)
print('Reverted', n, 'files to flat layout')
