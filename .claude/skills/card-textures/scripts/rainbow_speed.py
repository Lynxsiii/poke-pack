#!/usr/bin/env python3
"""How fast does each rainbow move? Flags gradient layers that sweep more than LIMIT spectrum cycles as the pointer
crosses the whole card (Noah, 2026-10-02: "the rainbow affect moves way too fast when you move your mouse around").

  python3 .claude/skills/card-textures/scripts/rainbow_speed.py css/holo/fam/*.css [--limit 1.5] [--all]

For every background or mask layer whose position follows --background-x/y (or --pointer-x/y), it works out
  shift  = 0.26 x k x (S - 1) card widths  (--background-x runs 37%..63% as the pointer crosses the card; k is the
           multiplier on (--background-x - 50%), S the layer's background-size as a multiple of the card);
           across the card's height --background-y runs 33%..67%, so 0.34 x k x (Sy - 1) card heights
  period = the gradient's colour cycle along its own line (a repeating gradient's last stop, a plain gradient the
           whole line); the line of a gradient at angle a in a W x H tile is W|sin a| + H|cos a| long
  cycles = the shift along the gradient's direction / period: how many full spectra slide past a point as the
           pointer crosses the card, worked out for a sweep across (x) and down (y) the card.
A real holo shifts about one spectrum across a full tilt. Over LIMIT (default 1.5) is printed and the exit code is 1.
XY full arts at 9.4 cycles (400% columns, period 6.25%, k 3) were what Noah saw racing. Hue-rotate filters driven by
the pointer or the rotation are listed too (360deg is one cycle). It parses CSS approximately: read what it prints.
"""
import re,sys,glob,math
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
ASPECT=88/63   # a card's height in card widths
def coef(pos,ax="x"):
    # coefficient of --background-x/y (or --pointer-x/y scaled) in one axis of a position
    b,ptr,rng=("--background-x","--pointer-x",0.26) if ax=="x" else ("--background-y","--pointer-y",0.34)
    m=re.search(rf"var\({b}\)\s*-\s*50%\)\s*\*\s*(-?[\d.]+)",pos) or re.search(rf"50%\s*-\s*var\({b}\)\)\s*\*\s*(-?[\d.]+)",pos) \
        or re.search(rf"var\({b}\)\s*\*\s*(-?[\d.]+)",pos)
    if m: return abs(float(m.group(1)))
    if re.match(rf"\s*var\({b}\)",pos) or re.search(rf"calc\(\s*(100%\s*-\s*)?\(?\s*var\({b}\)\s*[-+)]",pos): return 1.0
    m=re.search(rf"var\({ptr}\)[^*]*\*\s*(-?[\d.]+)",pos)
    if m: return abs(float(m.group(1)))/rng   # pointer range 100% vs the background's
    if ptr in pos: return 1/rng
    return None
def axes(pos):
    # a position's x and y parts, split at the top-level space
    parts,d,cur=[],0,""
    for ch in pos:
        if ch=="(":d+=1
        if ch==")":d-=1
        if ch.isspace() and d==0:
            if cur: parts.append(cur); cur=""
        else: cur+=ch
    if cur: parts.append(cur)
    return (parts+["50%"])[:2] if parts else ["50%","50%"]
def stop_at(stop):
    # where a colour stop sits, in % of the gradient line (None for px or anything unparsed)
    m=re.search(r"calc\(\s*(-?[\d.]+)%\s*\*\s*([\d.]+)\s*(?:\+\s*([\d.]+)%)?\s*\)\s*$",stop)
    if m: return float(m.group(1))*float(m.group(2))+float(m.group(3) or 0)
    m=re.search(r"(?:^|[\s)])(-?[\d.]+)%\s*$",stop)
    return float(m.group(1)) if m else None
def gradient(im):
    # (angle in deg, last stop in %) of a linear gradient; angle None for radial and conic ones
    m=re.match(r"\s*(repeating-)?(linear|radial|conic)-gradient\((.*)\)\s*$",im,re.S)
    if not m: return None,None
    args=split_top(m.group(3)); ang=180.0
    if m.group(2)!="linear": ang=None
    elif args and re.match(r"\s*-?[\d.]+(deg|turn)\s*$",args[0]):
        v=float(re.match(r"\s*(-?[\d.]+)",args[0]).group(1)); ang=v*360 if "turn" in args[0] else v; args=args[1:]
    elif args and args[0].strip().startswith("to "):
        ang={"to top":0,"to right":90,"to bottom":180,"to left":270}.get(args[0].strip(),135); args=args[1:]
    stops=[x for x in (stop_at(a) for a in args) if x is not None]
    return ang,(max(stops) if stops else None)
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
                px_,py_=axes(ps); kx,ky=coef(px_,"x"),coef(py_,"y")
                if not kx and not ky: continue
                ss=re.findall(r"([\d.]+)%",sz)
                Sx=float(ss[0])/100 if ss else 1.0; Sy=float(ss[1])/100 if len(ss)>1 else 1.0   # one value: height auto, which for a gradient is 100%
                if "gradient" not in im:
                    kindg,per,ang="img",None,None
                else:
                    ang,last=gradient(im); kindg="rep" if "repeating" in im else "lin"
                    if ang is None: per=None
                    else:
                        a_=math.radians(ang); sa,ca=abs(math.sin(a_)),abs(math.cos(a_))
                        line=Sx*sa+Sy*ASPECT*ca          # the gradient line, in card widths
                        per=line*(last/100 if kindg=="rep" and last else 1.0)
                cyc=0.0; worst=""
                for ax,k,S,rng,proj in (("x",kx,Sx,0.26,None),("y",ky,Sy,0.34,None)):
                    if not k or not per: continue
                    shift=rng*k*max(S-1,0)*(1 if ax=="x" else ASPECT)   # card widths
                    along=shift*(sa if ax=="x" else ca)
                    c=along/per
                    if c>cyc: cyc,worst=c,ax
                if not per: cyc=None
                sel_s=re.sub(r"body\.fx-holo\.fx-holo\.fx-holo\s*|\.tcg|\.era-\w+|\.fam-[-\w]+","",sel)[-70:]
                flag=cyc is not None and cyc>LIMIT
                bad+=flag
                if flag or (SHOWALL and cyc and cyc>0.3):
                    print(("TOO FAST " if flag else "ok       ")+f"{f.split('/')[-1][:24]:24s} {kind[:2]} L{i} {kindg} S={Sx:.1f}x{Sy:.1f} k={kx or 0:.2f}/{ky or 0:.2f} ang={ang} cyc={cyc if cyc is None else round(cyc,2)} ({worst}) | {sel_s.strip()}")
    for m in re.finditer(r"hue-rotate\(calc\(([^;]*?)\)\)",css):
        e=m.group(1); tot=0
        for v,c in re.findall(r"var\(--(rotate-[xy])\)\s*\*\s*(-?[\d.]+)",e): tot+=abs(float(c))*28/360
        for c in re.findall(r"var\(--pointer-from-(?:left|top)\)\s*\*\s*(-?[\d.]+)deg",e): tot+=abs(float(c))/360
        if tot>LIMIT or (SHOWALL and tot>0.3):
            bad+=tot>LIMIT
            print(("TOO FAST " if tot>LIMIT else "ok       ")+f"{f.split('/')[-1][:24]:24s} hue-rotate {tot:.2f} cycles over a full diagonal sweep: {e.strip()[:60]}")
sys.exit(1 if bad else 0)
