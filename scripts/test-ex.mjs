// EX generation scaffold (2003-2007: ex1-ex16, np, POP Series 1-5, the EX Trainer Kits): the finish classes, the engine pools,
// exSlots (early and late layout, Pokémon-ex, Gold Star, secret, cracked ice, Unown, holo Energy, Crystal Guardians' Delta sheet),
// popSlots' fixed rare position, reverseTwice / reverseOwnEnergy / boxTopper, the registries and the foil hooks.
// Needs no EX set data (the sets are built by the set builders). Modelled on scripts/test-dp.mjs.
// Run: node scripts/test-ex.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {RARITY_ORDER,RARITY_LABEL,RARITY_MARK,SELL_VALUE,BASIC_ENERGY,exSlots,popSlots,xySlots,NP_PROMOS} from '../js/catalog.js';
import {HIT_RARITIES,poolsFrom,ripPack,isHit} from '../js/engine.js';
import {foilExtras,isEx,isDp,isBw,isXy,isSm,isSwsh,exPattern,reverseFinish} from '../js/foil-maps.js';
import {exRefractor,isCrackedIce,exEtched,exMap,exReverseFinish,exReversePattern,EX_REVERSE} from '../js/ex-foil.js';
import {FINISH_PRINTERS,ERA_NAMES} from '../js/achievement-eras.js';
import {releaseYear,bandFor} from '../js/grading-rules.js';
import {tcgdexId} from '../js/liveprices.js';

// ---- isEx ---------------------------------------------------------------------------------------
for(const id of ['ex1-1','ex10-A','ex10-EXCL','ex16-108','ex5-np012','np-np001','pop1-3','pop5-17','extk1a-4','extk2b-6','tk1a-4','tk2b-6'])
  assert.ok(isEx({id}),`${id} is an EX generation print`);
for(const id of ['dp1-1','pl2-RT1','hgss1-ONE','col1-SL1','dpp-dpp01','pop6-1','pop9-17','dptk3a-4','sm1-1','swsh1-1','xy1-1','bw1-1','bwtk5a-1','me5-12','sv1-1','energy-fire-dp','base1-4','neo1-9','xyp-xyp001'])
  assert.ok(!isEx({id}),`${id} is not`);
assert.ok(isEx({id:'smp-smp001',era:'ex'}),'era "ex" is enough (a promo reprint)');
for(const id of ['ex1-1','np-np001','pop3-4','extk1a-1']) assert.ok(!isDp({id})&&!isBw({id})&&!isXy({id})&&!isSm({id})&&!isSwsh({id}),`no other era claims ${id}`);

// ---- exPattern ----------------------------------------------------------------------------------
const pat=(card)=>exPattern({supertype:'Pokémon',subtypes:['Basic'],...card});
assert.equal(pat({id:'ex1-5',rarity:'Common'}),'');
assert.equal(pat({id:'ex1-5',rarity:'Uncommon'}),'');
assert.equal(pat({id:'ex1-5',rarity:'Rare'}),'foil-none','the plain Rare is not foil');
assert.equal(pat({id:'pop1-1',rarity:'Rare'}),'foil-none','POP in-pack rares are not foil');
assert.equal(pat({id:'ex1-1',rarity:'Rare Holo'}),'foil-holo ex-cosmos');
assert.equal(pat({id:'ex12-1',rarity:'Rare Holo'}),'foil-holo ex-cosmos','Legend Maker is cosmos');
assert.equal(pat({id:'ex1-100',rarity:'Rare Holo EX',name:'Magmar ex'}),'foil-ex ex-ex');
assert.equal(pat({id:'ex7-107',rarity:'Rare Holo Star',name:'Mudkip ★'}),'foil-ultra ex-star');
assert.equal(pat({id:'ex3-98',rarity:'Rare Secret',name:'Charmander'}),'foil-holo ex-cosmos ex-secret');
assert.equal(pat({id:'ex10-117',rarity:'Rare Secret',name:'Celebi ex'}),'foil-ex ex-ex ex-secret','a secret Pokémon-ex keeps the ex frame');
assert.equal(pat({id:'ex10-A',rarity:'Rare Unown',name:'Unown'}),'foil-holo ex-cosmos ex-unown');
assert.equal(pat({id:'ex10-A',rarity:'Rare',name:'Unown',unown:true}),'foil-holo ex-cosmos ex-unown','by flag too');
assert.equal(pat({id:'np-np001',rarity:'Promo'}),'');
// refractor ("inverse"): all Delta Species holos, Holon Phantoms holos but not the Energy, CG's Delta holos, all Dragon Frontiers
assert.equal(pat({id:'ex11-1',rarity:'Rare Holo',name:'Beedrill δ'}),'foil-holo ex-refractor');
assert.equal(pat({id:'ex11-108',rarity:'Rare Holo EX',name:'Flareon ex'}),'foil-ex ex-ex','Delta Species ex is cosmos');
assert.equal(pat({id:'ex11-111',rarity:'Rare Holo Star',name:'Groudon ★'}),'foil-ultra ex-star','Delta Species stars stay cosmos');
assert.equal(pat({id:'ex13-1',rarity:'Rare Holo',name:'Armaldo δ'}),'foil-holo ex-refractor');
assert.equal(pat({id:'ex13-105',rarity:'Energy',holoEnergy:true,supertype:'Energy',name:'Grass Energy'}),'foil-holo ex-sheen ex-energy','Holon Phantoms Energy is sheen');
assert.equal(pat({id:'ex16-103',rarity:'Energy',holoEnergy:true,supertype:'Energy'}),'foil-holo ex-sheen ex-energy');
assert.equal(pat({id:'ex9-101',rarity:'Energy',holoEnergy:true,supertype:'Energy'}),'foil-holo ex-cosmos ex-energy','Emerald Energy is cosmos');
assert.equal(pat({id:'ex14-2',rarity:'Rare Holo',name:'Blastoise δ'}),'foil-holo ex-refractor','CG: the Delta holos');
assert.equal(pat({id:'ex14-1',rarity:'Rare Holo',name:'Banette'}),'foil-holo ex-cosmos','CG: the others are cosmos');
assert.equal(pat({id:'ex14-96',rarity:'Rare Holo EX',name:'Sceptile ex δ'}),'foil-ex ex-ex ex-refractor');
assert.equal(pat({id:'ex14-89',rarity:'Rare Holo EX',name:'Aggron ex'}),'foil-ex ex-ex');
assert.equal(pat({id:'ex15-1',rarity:'Rare Holo',name:'Ampharos δ'}),'foil-holo ex-refractor');
assert.equal(pat({id:'ex15-90',rarity:'Rare Holo EX',name:'Altaria ex δ'}),'foil-ex ex-ex ex-refractor','Dragon Frontiers: no cosmos at all');
assert.equal(pat({id:'ex15-100',rarity:'Rare Holo Star',name:'Charizard ★ δ'}),'foil-ultra ex-star ex-refractor');
assert.equal(pat({id:'ex16-1',rarity:'Rare Holo',name:'Aggron'}),'foil-holo ex-cosmos','Power Keepers is cosmos again');
assert.equal(pat({id:'ex16-1',rarity:'Rare Holo',name:'Aggron',refractor:true}),'foil-holo ex-refractor','the per-card flag wins');
assert.equal(pat({id:'ex15-1',rarity:'Rare Holo',name:'Ampharos δ',refractor:false}),'foil-holo ex-cosmos','and can switch a card off');
assert.ok(exRefractor({id:'ex11-5',rarity:'Rare Holo'})&&!exRefractor({id:'ex12-5',rarity:'Rare Holo'})&&!exRefractor({id:'ex1-5',rarity:'Rare Holo'}));
// cracked ice: Regirock, Regice, Registeel ex (ex5) and the secret bird ex (ex6)
assert.equal(pat({id:'ex5-99',rarity:'Rare Holo EX',name:'Regirock ex'}),'foil-ex ex-ex ex-cracked-ice');
assert.equal(pat({id:'ex5-95',rarity:'Rare Holo EX',name:'Rayquaza ex'}),'foil-ex ex-ex');
assert.equal(pat({id:'ex6-114',rarity:'Rare Secret',name:'Articuno ex'}),'foil-ex ex-ex ex-secret ex-cracked-ice');
assert.equal(pat({id:'ex6-113',rarity:'Rare Secret',name:'Charmander'}),'foil-holo ex-cosmos ex-secret','the Charmander topper is cosmos');
assert.equal(pat({id:'ex9-98',rarity:'Rare Holo EX',name:'Regice ex'}),'foil-ex ex-ex','Emerald Regi ex are cosmos');
assert.ok(isCrackedIce({id:'ex5-100',rarity:'Rare Holo EX',name:'Registeel ex'})&&!isCrackedIce({id:'ex9-100',rarity:'Rare Holo EX',name:'Registeel ex'}));
assert.ok(isCrackedIce({id:'ex9-1',crackedIce:true})&&!isCrackedIce({id:'ex5-99',rarity:'Rare Holo EX',name:'Regirock ex',crackedIce:false}));
// the Trainer Kits' holo half-deck cards
assert.equal(pat({id:'extk1a-4',rarity:'Rare',holo:true,name:'Latias'}),'foil-holo ex-cosmos ex-kit');
assert.equal(pat({id:'extk2b-6',rarity:'Common',holo:true,name:'Minun'}),'foil-holo ex-cosmos ex-kit');
assert.equal(pat({id:'extk1a-1',rarity:'Common',name:'Bagon'}),'');
assert.equal(exEtched({id:'ex1-1'}),false);assert.equal(exMap({id:'ex1-1'}),'');

// ---- The reverse families -------------------------------------------------------------------------
assert.deepEqual(Object.keys(EX_REVERSE),Array.from({length:16},(_,i)=>`ex${i+1}`));
const family={ex1:'mirror',ex2:'mirror',ex3:'mirror',ex4:'mirror',ex5:'energy',ex6:'energy',ex7:'energy',ex8:'wheel',ex9:'pokeball',ex10:'pokeball',ex11:'plain',ex12:'cosmos',ex13:'plain',ex14:'plain',ex15:'plain',ex16:'plain'};
for(const [id,f] of Object.entries(family)) assert.equal(exReversePattern(id),f,`${id} reverse family`);
assert.equal(exReversePattern('np'),'');assert.equal(exReversePattern('pop1'),'');assert.equal(exReversePattern(''),'');
assert.equal(EX_REVERSE.ex5.stamp,'type');assert.equal(EX_REVERSE.ex6.stamp,'ball');assert.equal(EX_REVERSE.ex14.border,'delta');assert.equal(EX_REVERSE.ex16.border,'');
const url=(p)=>`/${p}`;
for(const [id,f] of Object.entries(family)){
  const rev=foilExtras({id:`${id}-30`,rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
  assert.equal(rev.classes,`rev-mirror era-ex ex-rev ex-rev-${f} ex-rev-set-${id}`,id);
}
assert.equal(foilExtras({id:'ex1-104',rarity:'Energy',supertype:'Energy',reverse:true},url).classes,'rev-mirror era-ex ex-rev ex-rev-mirror ex-rev-set-ex1 ex-rev-basic-energy','a basic Energy reverse takes the whole-face Mirror');
assert.equal(exReverseFinish({id:'ex1-2'}),'ex');
assert.equal(reverseFinish({id:'ex8-30',reverse:true,rarity:'Common'}),'ex');

// ---- Foil hooks ---------------------------------------------------------------------------------
const holo=foilExtras({id:'ex1-1',rarity:'Rare Holo',supertype:'Pokémon'},url);
assert.ok(/era-ex/.test(holo.classes)&&/has-foil-map/.test(holo.classes)&&!/has-etch-tile/.test(holo.classes)&&/ex-win\/pokemon\.webp/.test(holo.style),'a holo takes its frame\'s drawn art window (i1)');
assert.match(holo.style,/--seed-x/,'tiled textures start somewhere different on every card');
for(const id of ['xy1-1','sm1-1','bw1-1','sv1-1','swsh1-1','dp1-1','pop6-1']) assert.equal(foilExtras({id,rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-ex'),false,`${id} is not EX`);
assert.ok(foilExtras({id:'np-np001',rarity:'Promo',supertype:'Pokémon'},url).classes.includes('era-ex'));

// ---- Rarity registries --------------------------------------------------------------------------
for(const r of ['Rare Holo Star','Rare Unown']){
  assert.ok(RARITY_ORDER.includes(r)&&RARITY_LABEL[r]&&RARITY_MARK[r]&&SELL_VALUE[r]>0,`${r} is registered`);
  assert.ok(HIT_RARITIES.has(r)&&isHit({rarity:r}),`${r} is a hit`);
  assert.ok(FINISH_PRINTERS[r]?.length,`${r} names the sets that print it`);
}
assert.equal(RARITY_LABEL['Rare Holo Star'],'Gold Star');
assert.deepEqual(FINISH_PRINTERS['Rare Holo Star'],['ex7','ex8','ex10','ex11','ex12','ex13','ex14','ex15','ex16']);
assert.deepEqual(FINISH_PRINTERS['Rare Unown'],['ex10']);
for(let i=1;i<=16;i++) assert.ok(FINISH_PRINTERS['Rare Holo EX'].includes(`ex${i}`),`ex${i} prints Pokémon-ex`);
assert.ok(FINISH_PRINTERS['Rare Holo EX'].includes('xy1')&&FINISH_PRINTERS['Rare Holo EX'].includes('bw4'),'the XY and BW sets keep theirs');
assert.equal(new Set(RARITY_ORDER).size,RARITY_ORDER.length,'no rarity twice');
assert.equal(BASIC_ENERGY.length,81,'EX adds no shared Energy print: ex1 numbers its own, the holo Energy are set cards');
assert.ok(!BASIC_ENERGY.some(c=>c.energyPrint==='ex'));

// ---- Grading band and TCGdex ids ------------------------------------------------------------------
assert.equal(releaseYear({released:'June 18, 2003'}),2003);assert.equal(bandFor({released:'February 14, 2007'}).id,'exdp');assert.equal(bandFor({era:'EX',name:'x'}).id,'exdp');
assert.equal(releaseYear(NP_PROMOS),2003);
assert.equal(tcgdexId('ex1','1'),'ex1-1');assert.equal(tcgdexId('ex16','108'),'ex16-108');assert.equal(tcgdexId('np','np012'),'np-12');assert.equal(tcgdexId('np','np040'),'np-40');
assert.equal(tcgdexId('pop5','17'),'pop5-17');assert.equal(tcgdexId('extk1a','4'),'tk-ex-latia-4');assert.equal(tcgdexId('extk2b','6'),'tk-ex-m-6');
assert.equal(tcgdexId('dpp','dpp01'),'dpp-DP01','the DP rule still holds');assert.equal(tcgdexId('sv1','5'),'sv01-005');

// ---- Fake set and pools ----------------------------------------------------------------------------
let n=0;
const fake=(rarity,extra={})=>{n+=1;return {id:`ex9-${n}`,name:`c${n}`,number:String(n),rarity,supertype:'Pokémon',subtypes:['Basic'],...extra};};
const base=[];
const add=(k,rarity,extra)=>{for(let i=0;i<k;i++) base.push(fake(rarity,typeof extra==='function'?extra(i):extra));};
add(30,'Common');add(20,'Uncommon');add(12,'Rare');add(10,'Rare Holo');
add(6,'Rare Holo EX');add(3,'Rare Holo EX',{crackedIce:true});add(3,'Rare Holo Star');
add(2,'Rare Secret');add(1,'Rare Secret',{boxTopper:true});
add(28,'Rare Unown',{name:'Unown'});
add(3,'Rare Holo',{deltaSheet:true});add(1,'Rare Holo EX',{deltaSheet:true});
const ownEnergy=[];for(let i=0;i<6;i++) ownEnergy.push(fake('Energy',{id:`ex9-${200+i}`,number:String(200+i),supertype:'Energy',subtypes:['Basic'],types:['Grass']}));
const holoEnergy=[];for(let i=0;i<6;i++) holoEnergy.push(fake('Energy',{id:`ex9-${300+i}`,number:String(300+i),supertype:'Energy',subtypes:['Basic'],holoEnergy:true}));
const all=[...base,...ownEnergy,...holoEnergy,...BASIC_ENERGY];
let pools=poolsFrom(all,{energyPrint:'own'});
assert.equal(pools.goldStar.length,3);assert.equal(pools.unown.length,28);
assert.equal(pools.secret.length,2,'the box topper is in no pool');
assert.ok(![pools.common,pools.uncommon,pools.rare,pools.holo,pools.exAll,pools.secret,pools.reversePool].some(p=>p.some(c=>c.boxTopper)),'boxTopper never dealt');
assert.equal(pools.holoEnergy.length,6);assert.equal(pools.energy.length,6,'energyPrint "own": only the set\'s own Energy, the holo Energy are a pool of their own');
assert.ok(pools.energy.every(c=>!c.holoEnergy));
assert.equal(pools.exPlain.length,6);assert.equal(pools.crackedIce.length,3);assert.equal(pools.deltaEx.length,1);assert.equal(pools.deltaHolo.length,3);
assert.equal(pools.holo.length,10,'the Delta sheet is not in the holo pool');
assert.equal(pools.exAll.length,10,'the XY pool is unchanged');
assert.equal(pools.reversePool.length,30+20+12,'reverseRarities defaults to Common, Uncommon, Rare');
// reverseTwice and reverseOwnEnergy
const set0={reverseRarities:['Common','Uncommon','Rare','Rare Holo']};
pools=poolsFrom(all,set0);
const plainReverse=pools.reversePool.length;
assert.equal(plainReverse,30+20+12+10+3,'C + U + R + Rare Holo (incl. the 3 Delta-sheet holos: reverses exist for all)');
pools=poolsFrom(all,{...set0,reverseTwice:['1','2','3']});
assert.equal(pools.reversePool.length,plainReverse+3,'three cards listed twice');
assert.equal(pools.reversePool.filter(c=>c.number==='1').length,2);
pools=poolsFrom(all,{...set0,reverseTwice:['ex9-4']});
assert.equal(pools.reversePool.filter(c=>c.id==='ex9-4').length,2,'ids work too');
assert.equal(poolsFrom(all,{...set0,reverseOwnEnergy:true,energyPrint:'own'}).reversePool.length,plainReverse+6,'the six own Energy join the reverse list');
assert.ok(poolsFrom(all,{...set0,reverseOwnEnergy:true}).reversePool.every(c=>!c.holoEnergy&&!String(c.id).startsWith('energy-')));
// the twice cards really come up twice as often
{
  const set={...set0,reverseTwice:['1'],slots:[{pool:'reverse',count:1}]};
  const reverses=all.filter(c=>['Common','Uncommon','Rare','Rare Holo'].includes(c.rarity));
  const counts=new Map();const N=40000;
  for(let i=0;i<N;i++){const c=ripPack(set,all)[0];counts.set(c.number,(counts.get(c.number)||0)+1);}
  const twice=counts.get('1'),once=counts.get('5');
  assert.ok(twice>once*1.5&&twice<once*2.6,`a twice card about doubles (${twice} vs ${once})`);
  void reverses;
}

// ---- exSlots: shapes -----------------------------------------------------------------------------
const sum=(table)=>table.reduce((s,[,p])=>s+p,0);
// ex1: early layout, Energy in the fifth slot
let slots=exSlots({early:true,holo:0.1667,ex:0.1667,energy:0.3333});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',2],['reverse',1],['rare',1]],'4 C + slot 5 + 2 U + reverse + a plain Rare = 9');
assert.deepEqual(slots[1].table.map(([k])=>k),['common','holo','exPlain','energy']);assert.ok(Math.abs(sum(slots[1].table)-1)<1e-9);
assert.ok(Math.abs(slots[1].table[0][1]-0.3333)<1e-3);
assert.equal(slots[3].table,undefined,'a plain reverse slot');
// ex3: secret in the fifth slot
slots=exSlots({early:true,holo:0.1349,ex:0.1667,secret:0.0318});
assert.deepEqual(slots[1].table.map(([k])=>k),['common','holo','exPlain','secret']);assert.ok(Math.abs(sum(slots[1].table)-1)<1e-9);
// ex4: late layout, holo / ex / secret in the rare slot
slots=exSlots({holo:0.2318,ex:0.0833,secret:0.0182});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',5],['uncommon',2],['reverse',1],['rare-slot',1]],'5 C + 2 U + reverse + rare slot = 9');
let rare=slots.find(s=>s.pool==='rare-slot');assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','secret','exPlain']);
assert.ok(Math.abs(sum(rare.table)-1)<1e-9);assert.ok(Math.abs(rare.table[0][1]-0.6667)<1e-3,'plain Rare takes two packs in three');
// ex5: cracked ice beside the cosmos ex
slots=exSlots({holo:0.25,ex:0.0556,exCracked:0.0278});
rare=slots.find(s=>s.pool==='rare-slot');assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','exPlain','crackedIce']);assert.ok(Math.abs(sum(rare.table)-1)<1e-9);
// ex9: holo Energy replace the reverse
slots=exSlots({holo:0.25,ex:0.0833,holoEnergy:0.3333});
const tbl=(t)=>t.map(([k,v])=>[k,Math.round(v*1e4)/1e4]);
assert.deepEqual(tbl(slots.find(s=>s.pool==='reverse').table),[['reverse',0.6667],['holoEnergy',0.3333]]);
// ex10: Unown replace the reverse, Gold Star and Celebi ex in the rare slot
slots=exSlots({holo:0.25,ex:0.0687,goldStar:0.0093,secret:0.0054,unown:0.1991});
assert.deepEqual(tbl(slots.find(s=>s.pool==='reverse').table),[['reverse',0.8009],['unown',0.1991]]);
rare=slots.find(s=>s.pool==='rare-slot');assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','secret','exPlain','goldStar']);assert.ok(Math.abs(sum(rare.table)-1)<1e-9);
// ex14: Crystal Guardians' Delta sheet
slots=exSlots({holo:0.1873,deltaHolo:0.0556,ex:0.0741,deltaEx:0.0093,goldStar:0.0071});
rare=slots.find(s=>s.pool==='rare-slot');assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','exPlain','goldStar','deltaHolo','deltaEx']);assert.ok(Math.abs(sum(rare.table)-1)<1e-9);
// xySlots untouched
assert.deepEqual(xySlots({holo:0.2,ex:0.1}),xySlots({holo:0.2,ex:0.1,rareSpecial:[]}));

// ---- exSlots: the sixteen sets as the SCAFFOLD-NOTES suggest them -------------------------------------------
const SETS={
  ex1:{early:true,holo:0.1667,ex:0.1667,energy:0.3333},ex2:{early:true,holo:0.1667,ex:0.1667},ex3:{early:true,holo:0.1349,ex:0.1667,secret:0.0318},
  ex4:{holo:0.2318,ex:0.0833,secret:0.0182},ex5:{holo:0.25,ex:0.0556,exCracked:0.0278},ex6:{holo:0.2222,ex:0.0833,secret:0.0278},
  ex7:{holo:0.2455,ex:0.0741,goldStar:0.0093,secret:0.0045},ex8:{holo:0.25,ex:0.0741,goldStar:0.0093},ex9:{holo:0.25,ex:0.0833,holoEnergy:0.3333},
  ex10:{holo:0.25,ex:0.0687,goldStar:0.0093,secret:0.0054,unown:0.1991},ex11:{holo:0.2963,ex:0.0278,goldStar:0.0093},ex12:{holo:0.2685,ex:0.0556,goldStar:0.0093},
  ex13:{holo:0.2936,ex:0.0278,goldStar:0.012,holoEnergy:0.3333},ex14:{holo:0.1873,deltaHolo:0.0556,ex:0.0741,deltaEx:0.0093,goldStar:0.0071},
  ex15:{holo:0.2417,ex:0.0833,goldStar:0.0083},ex16:{holo:0.2376,ex:0.0833,goldStar:0.0124,holoEnergy:0.2479},
};
for(const [id,args] of Object.entries(SETS)){
  const s=exSlots(args);
  const slotsOf=s.map(x=>[x.pool,x.count]);
  assert.equal(s.reduce((k,x)=>k+x.count,0),9,`${id}: nine cards`);
  for(const slot of s) if(slot.table) assert.ok(Math.abs(sum(slot.table)-1)<1e-9,`${id}: ${slot.pool} table sums to one`);
  void slotsOf;
}
{
  // a full rip of each shape: ex1 (Energy in slot 5, a plain Rare every pack), ex10 (Unown, Gold Star, Celebi), ex9 (holo Energy), ex14 (Delta sheet)
  const common=Array.from({length:30},(_,i)=>fake('Common',{number:`c${i}`}));
  void common;
  const run=(id,N=8000,extra={})=>{
    const set={reverseRarities:['Common','Uncommon','Rare','Rare Holo'],energyPrint:'own',slots:exSlots(SETS[id]),...extra};
    const stats={packs:N,holo:0,ex:0,star:0,secret:0,unown:0,holoEnergy:0,energy:0,reverse:0,rare:0,delta:0,cracked:0,topper:0};
    for(let i=0;i<N;i++){
      const pack=ripPack(set,all);
      assert.equal(pack.length,9,`${id}: a pack is nine cards`);
      assert.equal(new Set(pack.map(c=>c.id)).size,9,`${id}: no duplicate in a pack`);
      for(const c of pack){
        if(c.boxTopper) stats.topper+=1;
        if(c.reverse) stats.reverse+=1;
        else if(c.rarity==='Rare Holo'&&!c.deltaSheet) stats.holo+=1;
        else if(c.rarity==='Rare Holo'&&c.deltaSheet) stats.delta+=1;
        else if(c.rarity==='Rare Holo EX'&&c.crackedIce) stats.cracked+=1;
        else if(c.rarity==='Rare Holo EX') stats.ex+=1;
        else if(c.rarity==='Rare Holo Star') stats.star+=1;
        else if(c.rarity==='Rare Secret') stats.secret+=1;
        else if(c.rarity==='Rare Unown') stats.unown+=1;
        else if(c.holoEnergy) stats.holoEnergy+=1;
        else if(c.rarity==='Energy') stats.energy+=1;
        else if(c.rarity==='Rare') stats.rare+=1;
      }
    }
    return stats;
  };
  const near=(got,want,N,label)=>{const tol=Math.max(0.012,want*0.3);assert.ok(Math.abs(got/N-want)<tol,`${label}: ${(got/N).toFixed(4)} vs ${want}`);};
  let r=run('ex1');
  near(r.energy,0.3333,r.packs,'ex1 basic Energy');near(r.holo,0.1667,r.packs,'ex1 holo');near(r.ex,0.1667,r.packs,'ex1 Pokémon-ex');
  assert.equal(r.topper,0);
  r=run('ex1',3000,{reverseOwnEnergy:true});
  assert.ok(r.reverse>=r.packs*0.99,'a reverse in every pack');
  // early layout: the rare slot is always a plain Rare
  {
    const set={reverseRarities:['Common','Uncommon','Rare'],slots:exSlots(SETS.ex2)};
    for(let i=0;i<500;i++){const pack=ripPack(set,all);assert.equal(pack.filter(c=>c.rarity==='Rare'&&!c.reverse).length,1,'one plain Rare in every early pack');assert.equal(pack.filter(c=>c.rarity==='Rare Holo'&&!c.reverse).length+pack.filter(c=>c.rarity==='Rare Holo EX').length<=1,true,'a holo or an ex in the fifth slot, never both');}
  }
  r=run('ex4');near(r.holo,0.2318,r.packs,'ex4 holo');near(r.ex,0.0833,r.packs,'ex4 ex');near(r.secret,0.0182,r.packs,'ex4 secret');assert.equal(r.topper,0,'the box topper (Absol) is never in a pack');
  r=run('ex5');near(r.cracked,0.0278,r.packs,'ex5 cracked ice');near(r.ex,0.0556,r.packs,'ex5 cosmos ex');
  r=run('ex9');near(r.holoEnergy,0.3333,r.packs,'ex9 holo Energy in the reverse slot');
  r=run('ex10');near(r.unown,0.1991,r.packs,'ex10 Unown');near(r.star,0.0093,r.packs,'ex10 Gold Star');near(r.secret,0.0054,r.packs,'ex10 Celebi ex');
  r=run('ex14');near(r.delta,0.0556,r.packs,'ex14 Delta holos');near(r.holo,0.1873,r.packs,'ex14 cosmos holos');
  r=run('ex16');near(r.holoEnergy,0.2479,r.packs,'ex16 holo Energy');near(r.star,0.0124,r.packs,'ex16 Gold Star');
}

// ---- popSlots: the rare in a fixed position --------------------------------------------------------
{
  const small=[];
  const addp=(k,rarity)=>{for(let i=0;i<k;i++) small.push(fake(rarity,{id:`pop1-${small.length+1}`}));};
  addp(7,'Rare');addp(5,'Uncommon');addp(5,'Common');
  const s2=popSlots({rare:0.1,rareAt:2});
  assert.deepEqual(s2.map(x=>[x.pool,x.count]),[['common',1],['common',1]]);
  assert.equal(s2[0].table.some(([k])=>k==='rare'),false,'POP 1 and 2: the first card is never the rare');
  assert.equal(s2[1].table[0][0],'rare');assert.ok(Math.abs(sum(s2[1].table)-1)<1e-9&&s2[1].table[0][1]===0.1);
  const s1=popSlots({rare:0.1,rareAt:1});
  assert.equal(s1[0].table[0][0],'rare');assert.equal(s1[1].table.some(([k])=>k==='rare'),false,'POP 3: the second card is never the rare');
  assert.deepEqual(popSlots({rare:0.1}),s1,'rareAt defaults to the first card (POP 6-9 unchanged)');
  const N=8000;let first=0,second=0;
  for(let i=0;i<N;i++){
    const pack=ripPack({slots:s2},small);
    assert.equal(pack.length,2,'a POP pack is two cards');assert.equal(new Set(pack.map(c=>c.id)).size,2);
    if(pack[0].rarity==='Rare') first+=1;
    if(pack[1].rarity==='Rare') second+=1;
  }
  assert.equal(first,0);assert.ok(second>N*0.07&&second<N*0.13,`the rare in about 1 pack in 10, always the second card (${second/N})`);
}

// ---- The np promo set definition ---------------------------------------------------------------------
assert.equal(NP_PROMOS.id,'np');assert.equal(NP_PROMOS.promoPrefix,'NP ');assert.equal(NP_PROMOS.dataFile,'data/np.json');
assert.ok(NP_PROMOS.viewOf.includes('np')&&NP_PROMOS.viewOf.includes('ex1')&&NP_PROMOS.viewOf.includes('ex16')&&NP_PROMOS.viewOf.includes('pop1'));
assert.ok(ERA_NAMES.length>=0);

console.log('EX scaffold: ok');
