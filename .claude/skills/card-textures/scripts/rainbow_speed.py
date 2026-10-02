#!/usr/bin/env python3
"""How fast does each rainbow move? Flags gradient layers that sweep more than LIMIT spectrum cycles as the pointer
crosses the whole card (Noah, 2026-10-02: "the rainbow affect moves way too fast when you move your mouse around").

  python3 .claude/skills/card-textures/scripts/rainbow_speed.py css/holo/fam/*.css [--limit 1.5] [--all]

For every background or mask layer whose position follows --background-x (or --pointer-x), it works out
  shift  = 0.26 x k x (S - 1) card widths  (--background-x runs 37%..63% as the pointer crosses the card; k is the
           multiplier on (--background-x - 50%), S the layer's background-size as a multiple of the card)
  period = the gradient's colour cycle in card widths (a repeating gradient's last stop x S; a plain gradient: S)
  cycles = shift / period: how many full spectra slide past a point as the pointer crosses the card.
A real holo shifts about one spectrum across a full tilt. Over LIMIT (default 1.5) is printed and the exit code is 1.
XY full arts at 9.4 cycles (400% columns, period 6.25%, k 3) were what Noah saw racing. Hue-rotate filters driven by
the pointer or the rotation are listed too (360deg is one cycle). It parses CSS approximately: read what it prints.
"""
import re,sys,glob
args=[a for a in sys.argv[1:] if not a.startswith('--')]
LIMIT=float(sys.argv[sys.argv.index('--limit')+1]) if '--limit' in sys.argv else 1.5
SHOWALL='--all' in sys.argv
bad=0
def split_top(s):
    out,d,cur=[],0,""
    for ch in s:
        if ch=="(":d+=1
        if ch==")":d-=1
        if ch=="," and d==0: out.append(cur.strip()); cur=""
        else: cur+=ch
    if cur.strip(): out.append(cur.strip())
    return out
def props(block):
    p={}
    for m in re.finditer(r"(?:^|;)\s*([-\w]+)\s*:\s*([^;]+)",block,re.S): p[m.group(1)]=m.group(2).strip()
    return p
def coef(pos):
    # coefficient of --background-x (or --pointer-x scaled) in a position's x part
    x=pos
    m=re.search(r"var\(--background-x\)\s*-\s*50%\)\s*\*\s*(-?[\d.]+)",x) or re.search(r"50%\s*-\s*var\(--background-x\)\)\s*\*\s*(-?[\d.]+)",x)
    if m: return abs(float(m.group(1))),"bgx"
    if re.match(r"\s*var\(--background-x\)",x): return 1.0,"bgx"
    m=re.search(r"var\(--pointer-x\)[^*]*\*\s*(-?[\d.]+)",x)
    if m: return abs(float(m.group(1)))/0.26*1.0,"ptr"   # pointer range 100% vs bgx 26%
    if "pointer-x" in x: return 1/0.26,"ptr"
    return None,None
for f in [a for a in args if a.endswith('.css')]:
    css=open(f).read(); css=re.sub(r"/\*.*?\*/","",css,flags=re.S)
    vars_={}
    for m in re.finditer(r"(--[-\w]+)\s*:\s*([^;{}]+);",css): vars_[m.group(1)]=m.group(2)
    def ev(s,n=0):
        return re.sub(r"var\((--[-\w]+)\)",lambda m: ev(vars_[m.group(1)],n+1) if m.group(1) in vars_ and n<4 and m.group(1) not in("--background-x","--background-y","--pointer-x","--pointer-y") else m.group(0),s)
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}",css):
        sel,blk=m.group(1).strip(),m.group(2); p=props(blk)
        for kind in ("background","mask"):
            img=p.get(f"{kind}-image") or p.get(f"-webkit-{kind}-image"); pos=p.get(f"{kind}-position") or p.get(f"-webkit-{kind}-position"); size=p.get(f"{kind}-size") or p.get(f"-webkit-{kind}-size")
            if not img or not pos: continue
            imgs=split_top(ev(img)); poss=split_top(ev(pos)); sizes=split_top(ev(size)) if size else ["auto"]
            for i,im in enumerate(imgs):
                ps=poss[i] if i<len(poss) else poss[-1]; sz=sizes[i] if i<len(sizes) else sizes[-1]
                k,src=coef(ps)
                if not k: continue
                ms=re.match(r"\s*([\d.]+)%",sz); S=float(ms.group(1))/100 if ms else 1.0
                shift=0.26*k*max(S-1,0) if src=="bgx" else 0.26*k*max(S-1,0)
                if "repeating" in im:
                    stops=re.findall(r"\)\s+([\d.]+)(%|px)",im); last=[float(a) for a,u in stops if u=="%"]
                    per=(max(last)/100*S) if last else S
                    kindg="rep"
                elif "gradient" in im:
                    per=S; kindg="lin"
                else:
                    per=None; kindg="img"
                cyc=shift/per if per else None
                sel_s=re.sub(r"body\.fx-holo\.fx-holo\.fx-holo\s*|\.tcg|\.era-\w+|\.fam-[-\w]+","",sel)[-70:]
                flag=cyc is not None and cyc>LIMIT
                bad+=flag
                if flag or (SHOWALL and cyc and cyc>0.3):
                    print(("TOO FAST " if flag else "ok       ")+f"{f.split('/')[-1][:24]:24s} {kind[:2]} L{i} {kindg} S={S:.1f} k={k:.2f} shift={shift:.2f}card cyc={cyc if cyc is None else round(cyc,2)} | {sel_s.strip()}")
    for m in re.finditer(r"hue-rotate\(calc\(([^;]*?)\)\)",css):
        e=m.group(1); tot=0
        for v,c in re.findall(r"var\(--(rotate-[xy])\)\s*\*\s*(-?[\d.]+)",e): tot+=abs(float(c))*28/360
        for c in re.findall(r"var\(--pointer-from-(?:left|top)\)\s*\*\s*(-?[\d.]+)deg",e): tot+=abs(float(c))/360
        if tot>LIMIT or (SHOWALL and tot>0.3):
            bad+=tot>LIMIT
            print(("TOO FAST " if tot>LIMIT else "ok       ")+f"{f.split('/')[-1][:24]:24s} hue-rotate {tot:.2f} cycles over a full diagonal sweep: {e.strip()[:60]}")
sys.exit(1 if bad else 0)
