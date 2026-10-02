#!/usr/bin/env node
// Foil coverage check: finds every repeating background layer that is bigger
// than its card but positioned so the tile no longer covers the card (a
// position under 0% or over 100% on a layer wider or taller than the box).
// That is what draws a hard seam that moves with the tilt (V, VMAX, VSTAR and
// Double Rare seams, 2026-09-29): the tile wraps round inside the card.
//
//   node .claude/skills/card-textures/scripts/fam/bw-secret/foil_coverage_mine.mjs      (no arguments)
// bw-secret copy of foil_coverage.mjs that checks the 32 faces of the family (bw1-115 ... bw11-115) and nothing else.
//   BATCH=60 node .../foil_coverage.mjs sv1        # every card of the set, 60 to a lab page
//
// Renders the lab at six pinned poses (the corners and edges of the pointer
// range) and prints one JSON line per offending layer; no output means every
// layer covers its card. Run it over every set before merging a change to a
// foil recipe: `BATCH=60 node ... $(ls data/*.json | xargs -n1 basename | sed s/.json//)`.
// Small tiles (glitter, grain) repeat by design and are ignored.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const ROOT=new URL("../../../../../..",import.meta.url).pathname.replace(/\/$/,"");
const g=execSync("npm root -g",{encoding:"utf8"}).trim();
const pw=createRequire(join(g,"noop.js"))("playwright");
const T={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".webp":"image/webp",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{const p=decodeURIComponent(new URL(req.url,"http://x").pathname);let f=normalize(join(ROOT,p));try{if((await stat(f)).isDirectory())f=join(f,"index.html")}catch{if(extname(p))return res.writeHead(404).end();f=join(ROOT,"index.html")}try{res.writeHead(200,{"content-type":T[extname(f)]||"application/octet-stream"});res.end(await readFile(f))}catch{res.writeHead(404).end()}});
await new Promise(o=>server.listen(0,"127.0.0.1",o));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await pw.chromium.launch();
const sets=process.argv.slice(2);
import { readFileSync } from "node:fs";
// bw-secret: every face of the family (js/fam/bw-secret.js), one lab page per set, so the check reaches all 32 cards
const MINE={bw1:[115],bw3:[102],bw4:[100,101,102,103],bw5:[109,110,111],bw6:[125,126,127,128],bw7:[150,151,152,153],bw8:[136,137,138],bw9:[117,118,119,120,121,122],bw10:[102,103,104,105],bw11:[114,115]};
const seen=new Map();
const jobs=Object.entries(MINE).map(([st,nums])=>[st,"&cards="+nums.join(",")]);
for(const [st,cardsq] of jobs){
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto(`${base}/.claude/skills/card-textures/lab/index.html?set=${st}&proof=off&maps=1&w=300&poses=10:10,90:90,10:90,90:10,50:10,50:90${cardsq}`,{waitUntil:"networkidle",timeout:120000});
  await page.waitForSelector("body[data-ready='1']",{timeout:30000});
  const res=await page.evaluate(()=>{
    const out=[];
    const split=(s)=>{const r=[];let d=0,c="";for(const ch of s){if(ch=="(")d++;if(ch==")")d--;if(ch==","&&d==0){r.push(c.trim());c="";}else c+=ch;}r.push(c.trim());return r;};
    const W=300;
    const parse=(v,dim)=>{ // px or % => number of px given dim
      v=v.trim(); if(v.endsWith("%"))return parseFloat(v)/100*dim; if(v.endsWith("px"))return parseFloat(v); return NaN;};
    for(const card of document.querySelectorAll(".lab-row .tcg")){
      const pose=card.closest(".lab-row").dataset.pose;
      const r=card.getBoundingClientRect(); const cw=card.offsetWidth, ch=card.offsetHeight;
      for(const [sel,ps] of [[".foil",null],[".foil","::before"],[".foil","::after"],[".glare",null],[".glare","::after"],[".cure",null]]){
        const el=card.querySelector(sel); if(!el)continue;
        const cs=getComputedStyle(el,ps);
        if(cs.display=="none")continue;
        const imgs=split(cs.backgroundImage),sizes=split(cs.backgroundSize),poss=split(cs.backgroundPosition),reps=split(cs.backgroundRepeat);
        imgs.forEach((im,i)=>{
          if(im=="none")return;
          const sz=sizes[i%sizes.length].split(/\s+/),pp=poss[i%poss.length].split(/\s+/),rp=reps[i%reps.length];
          if(/cover|contain/.test(sizes[i%sizes.length]))return;
          if(rp.startsWith("no-repeat"))return;
          const S=[parse(sz[0],cw),parse(sz[1]??"auto",ch)];
          if(isNaN(S[0])){return}
          const dims=[cw,ch];
          [0,1].forEach(ax=>{
            const s=S[ax]; if(isNaN(s))return; if(s<dims[ax]*0.999)return; // small tiles repeat by design
            const p=pp[ax]||"50%"; let off;
            if(p.endsWith("%"))off=(dims[ax]-s)*parseFloat(p)/100; else if(p.endsWith("px"))off=parseFloat(p); else return;
            if(off>0.5||off+s<dims[ax]-0.5){out.push({card:card.className.replace(/\s+/g," ").slice(0,90),pose,layer:sel+(ps||""),i,ax:ax?"y":"x",size:sz[ax],pos:p,gap:(off>0?off:dims[ax]-(off+s)).toFixed(1)})}
          });
        });
      }
    }
    return out;
  });
  for(const x of res){const k=x.layer+"|"+x.i+"|"+x.ax+"|"+x.card.split(" ").filter(c=>/foil-|swsh-|has-/.test(c)).join(" ");if(!seen.has(k)){seen.set(k,x);}}
  await page.close();
}
for(const x of seen.values())console.log(JSON.stringify(x));
await browser.close();server.close();
