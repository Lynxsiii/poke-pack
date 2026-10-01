// XY era scaffold: the finish classes, the engine pools, xySlots, the nine-type XY Energy print
// and the foil hooks. Needs no XY set data (the sets are built by the set builders).
// Run: node scripts/test-xy.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {BASIC_ENERGY,RARITY_ORDER,RARITY_LABEL,RARITY_MARK,SELL_VALUE,boxCardList,xySlots, PLAYABLE_SETS} from '../js/catalog.js';
import {HIT_RARITIES,poolsFrom,ripPack,isHit} from '../js/engine.js';
import {foilExtras,isXy,xyPattern,reverseFinish} from '../js/foil-maps.js';
import {isRadiantCollection,xyReverseFinish} from '../js/xy-foil.js';
import {isPrinted,RARITIES_IN_PRINT} from '../js/achievement-eras.js';

const root=new URL('../',import.meta.url);

// ---- isXy ---------------------------------------------------------------------------------------
for(const id of ['xy1-1','xy12-99','xy0-3','dc1-4','g1-RC5','xyp-xyp001','xy5-xyp003','mcd14-1','mcd16-12','xytk6a-3','xy10-120'])
  assert.ok(isXy({id}),`${id} is an XY print`);
for(const id of ['sm1-1','swsh1-1','bw1-1','me5-12','energy-fire-xy','mcd17-1','sv1-1'])
  assert.ok(!isXy({id}),`${id} is not`);
assert.ok(isXy({id:'smp-smp001',era:'xy'}),'era "xy" is enough (a promo reprint)');

// ---- xyPattern ----------------------------------------------------------------------------------
const pat=(card)=>xyPattern({supertype:'Pokémon',subtypes:['Basic'],...card});
assert.equal(pat({rarity:'Common'}),'');
assert.equal(pat({rarity:'Uncommon'}),'');
assert.equal(pat({rarity:'Rare'}),'foil-none','the plain Rare is not foil');
assert.equal(pat({rarity:'Rare Holo'}),'foil-holo xy-holo');
assert.equal(pat({rarity:'Rare Holo EX',subtypes:['Basic','EX']}),'foil-ex xy-ex');
assert.equal(pat({rarity:'Rare Holo EX',subtypes:['MEGA','EX'],name:'M Venusaur-EX'}),'foil-ex xy-ex xy-mega');
assert.equal(pat({rarity:'Rare Holo EX',subtypes:['Basic','EX'],name:'M Rayquaza-EX'}),'foil-ex xy-ex xy-mega','a name starting "M " is a Mega');
assert.equal(pat({rarity:'Rare BREAK',subtypes:['BREAK']}),'foil-ex xy-break');
assert.equal(pat({rarity:'Rare Ultra',subtypes:['Basic','EX']}),'foil-ultra xy-fa');
assert.equal(pat({rarity:'Rare Ultra',subtypes:['MEGA','EX'],name:'M Gardevoir-EX'}),'foil-ultra xy-fa xy-mega');
assert.equal(pat({rarity:'Rare Ultra',supertype:'Trainer',subtypes:['Supporter']}),'foil-ultra xy-fa xy-tfa');
assert.equal(pat({rarity:'Rare Secret',subtypes:['Basic','EX']}),'foil-gold xy-secret');
assert.equal(pat({rarity:'Rare Secret',supertype:'Trainer',subtypes:['Item']}),'foil-gold xy-secret');
assert.equal(pat({rarity:'Promo'}),'');
// Generations' Radiant Collection: every RC card is foil, whatever its print's rarity.
assert.ok(isRadiantCollection({id:'g1-RC9'})&&isRadiantCollection({id:'x',rc:true})&&!isRadiantCollection({id:'g1-9'}));
assert.equal(pat({id:'g1-RC9',rarity:'Common'}),'foil-holo xy-rc');
assert.equal(pat({id:'g1-RC1',rarity:'Rare'}),'foil-holo xy-rc');
assert.equal(pat({id:'g1-RC6',rarity:'Rare Holo EX',subtypes:['Basic','EX']}),'foil-ex xy-ex xy-rc');
assert.equal(pat({id:'g1-RC29',rarity:'Rare Ultra'}),'foil-ultra xy-fa xy-rc');

// ---- Foil hooks ---------------------------------------------------------------------------------
const url=(p)=>`/${p}`;
const ultra=foilExtras({id:'xy1-141',rarity:'Rare Ultra',supertype:'Pokémon'},url);
assert.ok(/has-foil-map/.test(ultra.classes)&&/era-xy/.test(ultra.classes)&&/has-etch-tile/.test(ultra.classes),`full art: ${ultra.classes}`);
assert.match(ultra.style,/--foil-map:url\('\/assets\/foil\/maps\/full\.webp'\)/,'a full art takes the all-white map');
assert.match(ultra.style,/--seed-x/,'tiled textures start somewhere different on every card');
const holo=foilExtras({id:'xy1-12',rarity:'Rare Holo',supertype:'Pokémon'},url);
// f1: a holo with no TCG Live map falls back to the drawn art-window mask of its frame (assets/foil/xy-win/)
assert.ok(/era-xy/.test(holo.classes)&&/has-foil-map/.test(holo.classes),'holo window mask fallback');
assert.match(holo.style,/--foil-map:url\('\/assets\/foil\/xy-win\/pokemon\.webp'\)/);
const holoStage=foilExtras({id:'xy1-26',rarity:'Rare Holo',supertype:'Pokémon',subtypes:['Stage 2'],evolvesFrom:'Braixen'},url);
assert.match(holoStage.style,/xy-win\/pokemon-evo\.webp/,'a Stage card punches out its evolution circle');
assert.match(foilExtras({id:'xy1-12',rarity:'Rare Holo',supertype:'Pokémon',foilMap:'assets/foil/maps/xy1/12.webp'},url).style,/maps\/xy1\/12\.webp/,'a TCG Live map wins');
assert.match(foilExtras({id:'xy12-15',rarity:'Rare',supertype:'Pokémon',subtypes:['Stage 1']},url).classes,/era-xy/,'xy12 Rare Holo filed as Rare still resolves');
const rev=foilExtras({id:'xy1-30',rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
assert.equal(rev.classes,'rev-mirror era-xy xy-rev xy-rev-water');
assert.match(rev.style,/--rev-pattern:url\('\/assets\/foil\/xy-reverse\/water\.webp'\)/);
assert.match(rev.style,/--xy-win:url\('\/assets\/foil\/xy-win\/pokemon\.webp'\)/);
assert.match(foilExtras({id:'xy1-130',rarity:'Uncommon',supertype:'Trainer',subtypes:['Item'],reverse:true},url).classes,/xy-rev-trainer/);
assert.match(foilExtras({id:'xy1-132',rarity:'Energy',supertype:'Energy',subtypes:['Basic'],types:['Fire'],reverse:true},url).classes,/xy-rev-energy/);
assert.equal(xyReverseFinish({}),'xy');
assert.equal(reverseFinish({id:'xy1-30',reverse:true,rarity:'Common'}),'xy');
assert.equal(foilExtras({id:'sm1-1',rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-xy'),false,'Sun & Moon is not XY');

// ---- Rarity registries --------------------------------------------------------------------------
for(const r of ['Rare Holo EX','Rare BREAK']){
  assert.ok(RARITY_ORDER.includes(r)&&RARITY_LABEL[r]&&RARITY_MARK[r]&&SELL_VALUE[r]>0,`${r} is registered`);
  assert.ok(HIT_RARITIES.has(r),`${r} is a hit`);
}
assert.ok(RARITY_ORDER.indexOf('Rare Holo EX')>RARITY_ORDER.indexOf('Rare Holo')&&RARITY_ORDER.indexOf('Rare Holo EX')<RARITY_ORDER.indexOf('Rare Ultra'));
assert.ok(isHit({rarity:'Rare BREAK'})&&!isHit({rarity:'Rare Holo EX',reverse:true}));
// "Full spectrum" asks for a BREAK exactly when a playable set prints one (BREAKthrough on).
const breakSets=PLAYABLE_SETS.filter(s=>/^xy(8|9|10|11|12)$/.test(s.id));
assert.equal(isPrinted('Rare BREAK'),breakSets.length>0);
assert.equal(RARITIES_IN_PRINT.includes('Rare BREAK'),breakSets.length>0);

// ---- XY Energy: nine types, Fairy only in this print -----------------------------------------------
const xyEnergy=BASIC_ENERGY.filter(c=>c.energyPrint==='xy');
assert.deepEqual(xyEnergy.map(c=>c.id.slice(7,-3)).sort(),['darkness','fairy','fighting','fire','grass','lightning','metal','psychic','water']);
for(const c of xyEnergy){
  assert.ok(c.id.endsWith('-xy')&&c.energy&&c.supertype==='Energy'&&c.variant==='XY 2013');
  for(const path of [c.image,c.imageSmall]) assert.ok(existsSync(new URL(path,root)),path);
}
assert.equal(BASIC_ENERGY.filter(c=>/fairy/.test(c.id)).length,1,'Fairy exists in the XY print only');
for(const print of ['','tera','unova','swsh','sm17','sm19','mee']) assert.equal(BASIC_ENERGY.filter(c=>(c.energyPrint||'')===print).length,8,`${print||'SVE 001-008'} keeps eight types`);
// A set on the XY print draws from the nine; every other set from its own eight.
const fake=(rarity,extra={})=>({id:`xy9-${Math.random().toString(36).slice(2,8)}`,name:'x',number:'1',rarity,supertype:'Pokémon',subtypes:['Basic'],...extra});
const base=[];
const add=(n,rarity,extra)=>{for(let i=0;i<n;i++) base.push(fake(rarity,typeof extra==='function'?extra(i):extra));};
add(30,'Common');add(20,'Uncommon');add(10,'Rare');add(6,'Rare Holo');
add(5,'Rare Holo EX',{subtypes:['Basic','EX']});add(3,'Rare Holo EX',{subtypes:['MEGA','EX'],name:'M Foo-EX'});
add(4,'Rare BREAK',{subtypes:['BREAK']});add(4,'Rare Ultra',{subtypes:['Basic','EX']});add(2,'Rare Secret');
add(3,'Common',{rc:true,number:'RC1'});add(2,'Rare Ultra',{rc:true,number:'RC28'});
const pools=poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'xy'});
assert.equal(pools.energy.length,9,'the energy pool is the nine XY Energy');
assert.equal(poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'sm19'}).energy.length,8);
assert.equal(pools.ex.length,5);assert.equal(pools.megaEx.length,3);assert.equal(pools.exAll.length,8);
assert.equal(pools.break.length,4);assert.equal(pools.radiantCollection.length,5);
assert.equal(pools.common.length,30,'RC cards are not in the main pools');
assert.equal(pools.rareUltra.length,4);assert.equal(pools.secret.length,2);
assert.equal(pools.radiant.length,0,'`radiant` stays Sword & Shield’s Radiant Rare pool');

// ---- Box Energy: a nine-type print deals 5 of each in a 45 -------------------------------------------
let rows=boxCardList({spread:{total:45,print:'xy'}});
assert.equal(rows.length,9);for(const r of rows) assert.equal(r.n,5);
assert.ok(rows.some(r=>r.id==='energy-fairy-xy'));
rows=boxCardList({spread:{total:40,print:'sm19'}});
assert.equal(rows.length,8);for(const r of rows) assert.equal(r.n,5);
rows=boxCardList({spread:{total:40}});assert.ok(rows.every(r=>!/fairy/.test(r.id)&&r.n===5));
// An uneven total still adds up, with Fairy among the odd cards' types.
rows=boxCardList({spread:{total:47,print:'xy'}});
assert.equal(rows.reduce((n,r)=>n+r.n,0),47);
rows=boxCardList({recipe:{groups:{a:{cards:[]}},energy:{print:'xy'},total:60}});
assert.equal(rows.reduce((n,r)=>n+r.n,0)>=59,true);
assert.ok(rows.every(r=>/-xy$/.test(r.id)),'a recipe deck deals the xy print');

// ---- xySlots ------------------------------------------------------------------------------------
const slotsOf=(args)=>xySlots(args);
let slots=slotsOf({holo:1/3-0.2,ex:0.12,megaEx:0.04,ultra:0.03,secret:0.01,break:0.1});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',5],['uncommon',3],['reverse',1],['rare-slot',1]],'ten cards, no Energy slot');
const reverse=slots.find(s=>s.pool==='reverse');
assert.deepEqual(reverse.table.map(([k])=>k),['reverse','break'],'BREAK takes the reverse slot');
assert.ok(Math.abs(reverse.table.reduce((n,[,p])=>n+p,0)-1)<1e-9);
const rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','ex','megaEx','rareUltra','secret']);
assert.ok(Math.abs(rare.table.reduce((n,[,p])=>n+p,0)-1)<1e-9,'the rare slot sums to one');
slots=slotsOf({holo:0.3,ex:0.2});
assert.deepEqual(slots.find(s=>s.pool==='rare-slot').table.map(([k])=>k),['rare','holo','exAll'],'no megaEx rate: one EX pool');
assert.deepEqual(slots.find(s=>s.pool==='reverse'),{pool:'reverse',count:1},'no BREAK: a plain reverse slot');
slots=slotsOf({holo:0.3,ex:0.2,energy:1});
assert.equal(slots[0].pool,'energy');
slots=slotsOf({holo:0.3,ex:0.2,radiant:0.1,break:0.05,reverseSpecial:[['somePool',0.02]]});
assert.deepEqual(slots.find(s=>s.pool==='reverse').table.map(([k])=>k),['reverse','somePool','break','radiantCollection']);
slots=slotsOf({holo:0.3,ex:0.2,radiant:0.1,radiantSlot:'rare'});
assert.ok(slots.find(s=>s.pool==='rare-slot').table.some(([k])=>k==='radiantCollection'));

// Energy on the commons sheet, a secret on the uncommon sheet, Double Crisis' seven cards
slots=slotsOf({holo:0.2,ex:0.1,commonEnergy:0.4,uncommonSecret:0.12});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',1],['uncommon',1],['uncommon',1],['reverse',1],['rare-slot',1]]);
assert.deepEqual(slots[1].table,[['common',0.6],['energy',0.4]]);
assert.ok(Math.abs(slots[2].table[1][1]-0.04)<1e-9,'the secret share is spread over the three uncommon slots');
{
  const evo={energyPrint:'xy',slots};
  const evoCards=[...base,...BASIC_ENERGY,...Array.from({length:5},()=>fake('Rare Secret'))];
  let en=0,sec=0;const N=4000;
  for(let i=0;i<N;i++){const pack=ripPack(evo,evoCards);assert.equal(pack.length,10);assert.equal(new Set(pack.map(c=>c.id)).size,10);en+=pack.filter(c=>c.energy).length;sec+=pack.filter(c=>c.rarity==='Rare Secret').length;}
  assert.ok(en>N*0.3&&en<N*0.5,`Energy about 0.4 per pack (${en/N})`);
  assert.ok(sec>N*0.08&&sec<N*0.17,`secret about 0.12 per pack (${sec/N})`);
}
slots=slotsOf({commons:3,uncommons:2,holo:0.8889,ultra:0.1111});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',3],['uncommon',2],['reverse',1],['rare-slot',1]],'Double Crisis: seven cards');
assert.ok(!slots[3].table.some(([k])=>k==='rare'),'no plain Rare in a Double Crisis pack');

// ---- A rip of a fake set -------------------------------------------------------------------------
const set={energyPrint:'xy',slots:slotsOf({holo:1/3-0.25,ex:0.14,megaEx:0.04,ultra:0.04,secret:0.02,break:0.12,radiant:0.05})};
const seen=new Set();let breaks=0,rcs=0;
const all=[...base,...BASIC_ENERGY];
for(let i=0;i<4000;i++){
  const pack=ripPack(set,all);
  assert.equal(pack.length,10,'an XY pack is ten cards');
  assert.equal(pack.filter(c=>c.energy).length,0,'no Energy card in a pack');
  assert.equal(new Set(pack.map(c=>c.id)).size,10,'no duplicate in a pack');
  for(const c of pack){seen.add(c.rarity);if(c.rarity==='Rare BREAK'){breaks++;assert.ok(c.supertype&&!c.reverse);} if(c.rc)rcs++;}
}
for(const r of ['Common','Uncommon','Rare','Rare Holo','Rare Holo EX','Rare BREAK','Rare Ultra','Rare Secret']) assert.ok(seen.has(r),`a pack deals ${r}`);
assert.ok(breaks>4000*0.08&&breaks<4000*0.16,`BREAK about 12 percent of packs (${breaks})`);
assert.ok(rcs>0);

console.log('XY scaffold: ok');
