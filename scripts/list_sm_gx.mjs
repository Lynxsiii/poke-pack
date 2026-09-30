import { smPattern, isSm } from "../js/sm-foil.js";
import { readFileSync, readdirSync } from "node:fs";
const out=[];
for(const f of readdirSync(new URL("../data",import.meta.url).pathname)){
  if(!/^(sm\d+|smp|det1|mcd1\d)\.json$/.test(f))continue;
  let d;try{d=JSON.parse(readFileSync(new URL("../data/"+f,import.meta.url).pathname,"utf8"))}catch{continue}
  if(!Array.isArray(d))continue;
  for(const c of d){ if(!isSm(c))continue; const k=c.foilAs&&!c.reverse?{...c,rarity:c.foilAs}:c; const p=smPattern(k); if(/\bsm-gx\b/.test(p)&&!/sm-shiny/.test(p)&&!/sm-fa/.test(p)) out.push({id:c.id,image:c.image,foilMap:c.foilMap||null,p}); }
}
console.log(JSON.stringify(out));
