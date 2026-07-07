import os, json, shutil
SRC=os.path.dirname(os.path.abspath(__file__))
for e in json.load(open(os.path.join(SRC,'_organize_manifest.json'),encoding='utf-8')):
    cur=os.path.join(SRC,*e['folder'].split('/'),e['file'])
    if os.path.exists(cur): shutil.move(cur, os.path.join(SRC,e['file']))
print('undone')
