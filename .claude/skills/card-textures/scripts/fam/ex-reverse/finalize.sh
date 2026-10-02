#!/bin/bash
# finalize.sh <set...>: redraw the cards that have hints, drop the skipped ones, copy the rest into assets/foil/fam/ex-reverse/
S=/tmp/claude-0/-home-user-poke-pack/df72335e-214f-5d4a-b747-c7cb0408b049/scratchpad/exrev
M=/tmp/claude-0/-home-user-poke-pack/df72335e-214f-5d4a-b747-c7cb0408b049/scratchpad/models
cd /home/user/poke-pack/.claude/skills/card-textures/scripts/fam/ex-reverse
for s in "$@"; do
  ids=$(python3 -c "import json,sys;print(','.join(k for k,v in json.load(open('make_ex_reverse_hints.json')).items() if k.startswith('$s-') and not v.get('skip')))")
  [ -n "$ids" ] && nice -n 10 python3 make_ex_reverse_maps.py --list $S/cards.json --ids $ids --out $S/out --sal-cache $S/sal --models $M 2>&1 | grep -c '^{'
  mkdir -p /home/user/poke-pack/assets/foil/fam/ex-reverse
  python3 - $s <<'P'
import json,sys,os,shutil,glob
s=sys.argv[1]
S='/tmp/claude-0/-home-user-poke-pack/df72335e-214f-5d4a-b747-c7cb0408b049/scratchpad/exrev/'
H=json.load(open('make_ex_reverse_hints.json'))
dst='/home/user/poke-pack/assets/foil/fam/ex-reverse/'
n=0
for f in sorted(glob.glob(S+f'out/{s}-*-v1.webp')):
    cid=os.path.basename(f)[:-8]
    if H.get(cid,{}).get('skip'):
        continue
    shutil.copy(f,dst+os.path.basename(f)); n+=1
for cid,v in H.items():
    if v.get('skip') and cid.startswith(s+'-') and os.path.exists(dst+cid+'-v1.webp'): os.remove(dst+cid+'-v1.webp')
print(s,'copied',n)
P
done
