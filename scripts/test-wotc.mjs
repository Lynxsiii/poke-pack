// Wizards of the Coast generation scaffold (1999-2003: base1-base6, gym1-gym2, neo1-neo4, si1, ecard1-ecard3, the promo sets basep and bp):
// the finish classes, the engine pools (Shining, Crystal, noPack), wotcSlots (11-card packs with 0-2 basic Energy, Dark Raichu, Shining,
// Legendary Collection's reverse, the 9-card e-Card packs with a holo that replaces a common and a Crystal Pokémon), the foil hooks, the
// registries, the grading band and the achievement rows. Needs no WotC set data (the sets are built by the set builders).
// Modelled on scripts/test-dp.mjs.
// Run: node scripts/test-wotc.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {BASIC_ENERGY,RARITY_ORDER,RARITY_LABEL,RARITY_MARK,SELL_VALUE,wotcSlots,dpSlots,xySlots,BASEP_PROMOS,BP_PROMOS} from '../js/catalog.js';
import {HIT_RARITIES,poolsFrom,ripPack,isHit} from '../js/engine.js';
import {foilExtras,isWotc,isDp,isBw,isXy,wotcPattern,reverseFinish} from '../js/foil-maps.js';
import {wotcMap,wotcReverseFinish,isCrystal,WOTC_FULL_ART} from '../js/wotc-foil.js';
import {bandFor,releaseYear} from '../js/grading-rules.js';
import {FINISH_PRINTERS} from '../js/achievement-eras.js';
import {WOTC_FINISHES} from '../js/achievement-kit.js';

// ---- isWotc ---------------------------------------------------------------------------------------
for(const id of ['base1-4','base2-1','base3-15','base4-130','base5-83','base6-110','gym1-6','gym2-132','neo1-9','neo2-1','neo3-65','neo4-113','si1-18','ecard1-1','ecard2-H8','ecard3-149','basep-basep01','base2-basep01','neo1-basep22','ecard3-basep30','bp-bp01'])
  assert.ok(isWotc({id}),`${id} is a Wizards of the Coast print`);
for(const id of ['sm1-1','swsh1-1','xy1-1','bw1-1','dp1-1','pl1-1','hgss1-1','col1-1','bwp-bwp001','dpp-dpp01','me5-12','energy-fire-dp','mcd11-1','sv1-1','ex1-1','pop5-1','pop1-3','basepx','bpx-1','neo','gym','base','bw5-bwp003'])
  assert.ok(!isWotc({id}),`${id} is not`);
assert.ok(isWotc({id:'smp-smp001',era:'wotc'}),'era "wotc" is enough (a promo reprint)');
assert.ok(!isDp({id:'base1-1'})&&!isBw({id:'neo1-1'})&&!isXy({id:'ecard1-1'}));

// ---- wotcPattern ----------------------------------------------------------------------------------
const pat=(card)=>wotcPattern({supertype:'Pokémon',subtypes:['Basic'],...card});
assert.equal(pat({id:'base1-9',rarity:'Common'}),'');
assert.equal(pat({id:'base1-9',rarity:'Uncommon'}),'');
assert.equal(pat({id:'base1-9',rarity:'Rare'}),'foil-none','the plain Rare is not foil (the non-holo twin of a holo)');
assert.equal(pat({id:'base1-4',rarity:'Rare Holo'}),'foil-holo wotc-cosmos wotc-starlight','Base Set: starlight');
assert.equal(pat({id:'base2-1',rarity:'Rare Holo'}),'foil-holo wotc-cosmos wotc-starlight');
assert.equal(pat({id:'base3-1',rarity:'Rare Holo'}),'foil-holo wotc-cosmos wotc-starlight');
for(const id of ['base4-1','base5-1','base6-3','gym1-1','gym2-2','neo1-9','neo2-1','neo4-1']) assert.equal(pat({id,rarity:'Rare Holo'}),'foil-holo wotc-cosmos',`${id}: cosmos from Base Set 2 on`);
for(const id of ['ecard1-1','ecard2-H8','ecard3-H1']) assert.equal(pat({id,rarity:'Rare Holo'}),'foil-holo wotc-ecard',`${id}: the e-Card holo`);
assert.equal(pat({id:'neo1-19',rarity:'Rare Holo',supertype:'Energy'}),'foil-holo wotc-cosmos','Metal Energy is an ordinary holo');
assert.equal(pat({id:'base5-83',name:'Dark Raichu',rarity:'Rare Secret'}),'foil-holo wotc-cosmos','Dark Raichu sits on the holo sheet');
assert.equal(pat({id:'neo3-65',rarity:'Rare Shining'}),'foil-holo wotc-shining');
assert.equal(pat({id:'neo4-110',rarity:'Rare Shining'}),'foil-holo wotc-shining');
assert.equal(pat({id:'ecard2-149',rarity:'Rare Crystal'}),'foil-holo wotc-crystal');
assert.equal(pat({id:'ecard2-148',rarity:'Rare Secret'}),'foil-holo wotc-crystal','pkmn.gg\'s "Rare Secret" 148-150 are the Crystal Pokémon even before the override');
assert.equal(pat({id:'ecard3-145',rarity:'Rare Secret'}),'foil-holo wotc-crystal');
assert.equal(pat({id:'ecard3-150',rarity:'Rare Secret'}),'foil-holo wotc-crystal');
assert.ok(isCrystal({id:'ecard3-146',rarity:'Rare Crystal'})&&!isCrystal({id:'ecard3-144',rarity:'Rare Secret'})&&!isCrystal({id:'ecard2-147',rarity:'Rare Secret'})&&!isCrystal({id:'base5-83',rarity:'Rare Secret'}));
// promos draw their finish from the data
assert.equal(pat({id:'basep-basep02',rarity:'Promo'}),'foil-none','a flat promo');
assert.equal(pat({id:'basep-basep10',rarity:'Promo',holo:true}),'foil-holo wotc-cosmos','Meowth is a cosmos holo');
assert.equal(pat({id:'basep-basep34',rarity:'Promo',reverse:true}),'','a reverse promo takes the reverse path');
assert.equal(pat({id:'bp-bp04',rarity:'Promo'}),'foil-none');
assert.equal(pat({id:'si1-1',rarity:''}),'','Southern Islands: the generic engine decides until a finish agent looks');
assert.equal(pat({id:'si1-1',rarity:'None'}),'');
assert.equal(pat({id:'base1-97',rarity:'Energy',supertype:'Energy'}),'');
assert.deepEqual([...WOTC_FULL_ART],[],'no full-art print in this generation');
assert.equal(wotcMap({id:'base1-4',rarity:'Rare Holo'}),'','no map until a finish agent draws one');

// ---- Foil hooks -----------------------------------------------------------------------------------
const url=(p)=>`/${p}`;
const holo=foilExtras({id:'base1-4',rarity:'Rare Holo',supertype:'Pokémon'},url);
assert.ok(/era-wotc/.test(holo.classes)&&!/has-foil-map/.test(holo.classes)&&!/has-etch-tile/.test(holo.classes),`no map and no etch: ${holo.classes}`);
assert.match(holo.style,/--seed-x/,'tiled textures start somewhere different on every card');
assert.ok(!/era-dp|era-bw|era-xy/.test(holo.classes));
const rev=foilExtras({id:'ecard1-30',rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
assert.equal(rev.classes,'rev-mirror era-wotc wotc-rev','the e-Card reverse');
assert.equal(foilExtras({id:'base6-30',rarity:'Uncommon',supertype:'Pokémon',types:['Fire'],reverse:true},url).classes,'rev-mirror era-wotc wotc-rev wotc-rev-legendary','Legendary Collection\'s fireworks');
assert.equal(foilExtras({id:'base6-3',rarity:'Rare Holo',supertype:'Pokémon',reverse:true},url).classes,'rev-mirror era-wotc wotc-rev wotc-rev-legendary','a Rare Holo\'s reverse takes the same');
assert.equal(foilExtras({id:'basep-basep34',rarity:'Promo',supertype:'Pokémon',reverse:true},url).classes,'rev-mirror era-wotc wotc-rev','Entei\'s promo reverse');
assert.equal(wotcReverseFinish({id:'base6-1'}),'wotc-legendary');assert.equal(wotcReverseFinish({id:'ecard2-5'}),'wotc');
assert.equal(reverseFinish({id:'ecard3-30',reverse:true,rarity:'Common'}),'wotc');
assert.equal(reverseFinish({id:'base6-30',reverse:true,rarity:'Common'}),'wotc-legendary');
for(const id of ['xy1-1','sm1-1','bw1-1','sv1-1','swsh1-1','dp1-1','hgss1-1']) assert.equal(foilExtras({id,rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-wotc'),false,`${id} is not Wizards of the Coast`);
assert.match(foilExtras({id:'dp1-2',rarity:'Common',supertype:'Pokémon',reverse:true},url).classes,/^rev-mirror era-dp dp-rev\b/,'the DP reverse is untouched');

// ---- Rarity registries ----------------------------------------------------------------------------
assert.ok(RARITY_ORDER.includes('Rare Crystal')&&RARITY_LABEL['Rare Crystal']&&RARITY_MARK['Rare Crystal']&&SELL_VALUE['Rare Crystal']>0,'Rare Crystal is registered');
assert.ok(HIT_RARITIES.has('Rare Crystal')&&isHit({rarity:'Rare Crystal'})&&HIT_RARITIES.has('Rare Shining'));
assert.deepEqual(FINISH_PRINTERS['Rare Crystal'],['ecard2','ecard3']);
for(const s of ['sm35','dp7','neo3','neo4']) assert.ok(FINISH_PRINTERS['Rare Shining'].includes(s),`Rare Shining is printed by ${s}`);
assert.equal(new Set(RARITY_ORDER).size,RARITY_ORDER.length,'no rarity twice');
assert.equal(RARITY_LABEL['Rare Crystal'],'Crystal Pokémon');
assert.deepEqual(WOTC_FINISHES,['Rare Holo','Rare Shining','Rare Crystal','Rare Secret']);
assert.equal(BASIC_ENERGY.length,81,'no new shared Energy print: the Wizards sets deal their own numbered Energy');

// ---- Grading band ---------------------------------------------------------------------------------
assert.equal(bandFor(BASEP_PROMOS).id,'wotc');assert.equal(bandFor(BP_PROMOS).id,'wotc');
assert.equal(bandFor({era:'Wizards of the Coast',released:'May 12, 2003'}).id,'wotc','Skyridge is 2003 but still the Wizards band');
assert.equal(bandFor({era:'Wizards of the Coast',released:'January 15, 2003'}).id,'wotc','Aquapolis too');
assert.equal(bandFor({era:'EX',released:'July 2003'}).id,'exdp','EX Ruby & Sapphire starts the next band');
assert.equal(releaseYear(BASEP_PROMOS),1999);
assert.equal(bandFor({id:'base1',released:'January 9, 1999'}).id,'wotc');

// ---- Promo sets -----------------------------------------------------------------------------------
for(const s of [BASEP_PROMOS,BP_PROMOS]){
  assert.ok(s.promoSet&&s.packSize===0&&!s.slots.length&&!s.wrappers.length&&s.era==='Wizards of the Coast'&&s.edition===s.era);
  assert.ok(s.viewOf.includes(s.id)&&s.dataFile===`data/${s.id}.json`);
}
assert.ok(['base1','base2','base3','base4','base5','gym1','gym2','neo1','neo2','si1','neo3','neo4','base6','ecard1','ecard2','ecard3'].every(id=>BASEP_PROMOS.viewOf.includes(id)),'basep views every Wizards set');
assert.deepEqual(BP_PROMOS.viewOf,['bp'],'Best of Game is its own set: no product carries it');

// ---- Fake sets and pools --------------------------------------------------------------------------
const fake=(rarity,extra={})=>({id:`neo9-${Math.random().toString(36).slice(2,8)}`,name:'x',number:'1',rarity,supertype:'Pokémon',subtypes:['Basic'],...extra});
const base=[];
const add=(n,rarity,extra)=>{for(let i=0;i<n;i++) base.push(fake(rarity,typeof extra==='function'?extra(i):extra));};
add(30,'Common');add(20,'Uncommon');add(15,'Rare');add(12,'Rare Holo');add(1,'Rare Secret',{name:'Dark Raichu'});
add(2,'Rare Shining');add(6,'Rare Crystal');
add(1,'Rare Holo',{noPack:true,name:'Machamp'});
const own=[];for(let i=0;i<6;i++) own.push(fake('Energy',{id:`neo9-${106+i}`,supertype:'Energy',types:['Grass']}));
const pools=poolsFrom([...base,...own,...BASIC_ENERGY],{energyPrint:'own'});
assert.equal(pools.crystal.length,6,'the Crystal pool is "Rare Crystal"');
assert.equal(pools.shining.length,2);assert.equal(pools.secret.length,1);
assert.equal(pools.holo.length,12,'a noPack holo (Base Set\'s Machamp) is in no pool');
assert.equal(pools.rare.length,15);assert.equal(pools.energy.length,6,'energyPrint "own": only the set\'s own Energy');
assert.ok(poolsFrom(base,{}).holo.every(c=>!c.noPack));

// ---- wotcSlots ------------------------------------------------------------------------------------
assert.equal(typeof wotcSlots,'function');
const sum=(table)=>table.reduce((n,[,p])=>n+p,0);
const total=(slots)=>slots.reduce((n,s)=>n+s.count,0);
const near=(a,b,tol=1e-9)=>Math.abs(a-b)<tol;
// Jungle: 7 C + 3 U + rare slot, no Energy and no reverse
let slots=wotcSlots({holo:0.3333});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',7],['uncommon',3],['rare-slot',1]],'eleven cards, no reverse slot');
assert.equal(total(slots),11);
let rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo']);assert.ok(near(sum(rare.table),1)&&near(rare.table[0][1],0.6667,1e-4),'plain Rare two packs in three');
// Base Set: two basic Energy in front, 5 commons
slots=wotcSlots({commons:5,energy:2,holo:0.3333});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['energy',2],['common',5],['uncommon',3],['rare-slot',1]]);assert.equal(total(slots),11);
// Gym Heroes, Gym Challenge, Neo Genesis: one Energy
slots=wotcSlots({commons:6,energy:1,holo:0.3333});assert.equal(total(slots),11);assert.deepEqual(slots[0],{pool:'energy',count:1});
// Team Rocket: Dark Raichu on the holo sheet
slots=wotcSlots({holo:0.3151,secret:0.0182});rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','secret']);assert.ok(near(sum(rare.table),1,1e-9)&&near(rare.table[0][1],0.6667,1e-4));
// Neo Revelation and Neo Destiny: the Shining in the rare slot
slots=wotcSlots({holo:0.2972,rareSpecial:[['shining',0.0364]]});rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','shining']);assert.ok(near(sum(rare.table),1));assert.equal(total(slots),11);
slots=wotcSlots({holo:0.25,rareSpecial:[['shining',0.0833]]});rare=slots.find(s=>s.pool==='rare-slot');
assert.ok(near(rare.table[0][1],0.6667,1e-3)&&near(sum(rare.table),1));
// Legendary Collection: a reverse of any of the 110, 6 C + 3 U + rare slot
slots=wotcSlots({commons:6,holo:0.3333,reverseSlot:true});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',6],['uncommon',3],['reverse',1],['rare-slot',1]]);assert.equal(total(slots),11);
assert.deepEqual(slots.find(s=>s.pool==='reverse'),{pool:'reverse',count:1},'a plain reverse slot');
// Expedition: 9 cards, a plain Rare guaranteed, a holo that replaces a common, a reverse
slots=wotcSlots({commons:5,uncommons:2,reverseSlot:true,commonHolo:[['holo',0.3333]]});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',2],['reverse',1],['rare-slot',1]]);assert.equal(total(slots),9,'nine cards');
assert.deepEqual(slots[1].table.map(([k])=>k),['common','holo']);assert.ok(near(sum(slots[1].table),1)&&near(slots[1].table[1][1],0.3333));
assert.deepEqual(slots.find(s=>s.pool==='rare-slot').table,[['rare',1]],'a plain Rare in every pack');
// Aquapolis / Skyridge: the Crystal Pokémon shares the holo slot
slots=wotcSlots({commons:5,uncommons:2,reverseSlot:true,commonHolo:[['holo',0.3061],['crystal',0.0273]]});
assert.deepEqual(slots[1].table.map(([k])=>k),['common','holo','crystal']);assert.ok(near(sum(slots[1].table),1));assert.equal(total(slots),9);
// xySlots keeps its defaults (the reverse slot, the Energy-only common table) and wotcSlots is the same builder
assert.deepEqual(xySlots({holo:0.2}).map(s=>s.pool),['common','uncommon','reverse','rare-slot']);
assert.deepEqual(xySlots({holo:0.2,commonEnergy:0.3}).map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',3],['reverse',1],['rare-slot',1]]);
assert.deepEqual(xySlots({holo:0.2,commonEnergy:0.3})[1].table,[['common',0.7],['energy',0.3]],'the commonEnergy table is unchanged');
assert.deepEqual(wotcSlots({commons:5,uncommons:3,reverseSlot:true,holo:0.2}),xySlots({commons:5,uncommons:3,holo:0.2}));
assert.deepEqual(dpSlots({holo:0.2,rareSpecial:[['lvx',0.1]]}),xySlots({holo:0.2,rareSpecial:[['lvx',0.1]]}));

// ---- Rips of fake sets ----------------------------------------------------------------------------
const all=[...base,...own,...BASIC_ENERGY];
{
  // Base Set shape: two Energy, no reverse, 11 cards
  const set={energyPrint:'own',slots:wotcSlots({commons:5,energy:2,holo:0.3333})};
  let holos=0,machamp=0;const N=4000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,11,'eleven cards');assert.equal(new Set(pack.map(c=>c.id)).size,11,'no duplicate');
    assert.equal(pack.filter(c=>c.rarity==='Energy').length,2,'two basic Energy');
    assert.ok(pack.every(c=>!c.reverse),'no reverse before Legendary Collection');
    assert.ok(pack.every(c=>!String(c.id).startsWith('energy-')),'shared Energy never in a pack on energyPrint own');
    holos+=pack.filter(c=>c.rarity==='Rare Holo').length;machamp+=pack.filter(c=>c.noPack).length;
  }
  assert.ok(holos>N*0.3&&holos<N*0.37,`a holo one pack in three (${holos/N})`);
  assert.equal(machamp,0,'Base Set\'s Machamp never comes out of a pack');
}
{
  // Neo Destiny shape: Shining in the rare slot
  const set={slots:wotcSlots({holo:0.25,rareSpecial:[['shining',0.0833]]})};
  let shining=0,holos=0;const N=6000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,11);assert.equal(pack.filter(c=>c.energy||c.rarity==='Energy').length,0,'no Energy in a Neo Destiny pack');
    assert.ok(pack.filter(c=>c.rarity==='Rare Shining'||c.rarity==='Rare Holo'||c.rarity==='Rare').length>=1&&pack.filter(c=>c.rarity!=='Common'&&c.rarity!=='Uncommon').length===1,'one rare-slot card');
    shining+=pack.filter(c=>c.rarity==='Rare Shining').length;holos+=pack.filter(c=>c.rarity==='Rare Holo').length;
  }
  assert.ok(shining>N*0.06&&shining<N*0.11,`Shining about 1 pack in 12 (${shining/N})`);
  assert.ok(holos>N*0.21&&holos<N*0.29,`holo about 1 pack in 4 (${holos/N})`);
}
{
  // Legendary Collection shape: a reverse in every pack, any of the cards
  const set={reverseRarities:['Common','Uncommon','Rare','Rare Holo'],slots:wotcSlots({commons:6,holo:0.3333,reverseSlot:true})};
  let reverses=0,holoRev=0;const N=4000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,11);assert.equal(new Set(pack.map(c=>c.id)).size,11);
    assert.equal(pack.filter(c=>c.reverse).length,1,'exactly one reverse');
    reverses+=pack.filter(c=>c.reverse).length;holoRev+=pack.filter(c=>c.reverse&&c.rarity==='Rare Holo').length;
    assert.ok(pack.every(c=>c.rarity!=='Rare Crystal'&&c.rarity!=='Rare Shining'));
  }
  assert.equal(reverses,N);assert.ok(holoRev>0,'a holo\'s reverse can come out');
}
{
  // Aquapolis shape: 9 cards, a guaranteed plain Rare, a holo or Crystal in place of a common, a reverse that is never a holo or a Crystal
  const set={reverseRarities:['Common','Uncommon','Rare'],slots:wotcSlots({commons:5,uncommons:2,reverseSlot:true,commonHolo:[['holo',0.3061],['crystal',0.0273]]})};
  let holos=0,crystals=0,commons=0;const N=6000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,9,'nine cards');assert.equal(new Set(pack.map(c=>c.id)).size,9);
    assert.equal(pack.filter(c=>c.rarity==='Rare'&&!c.reverse).length>=1,true,'a plain Rare in every pack');
    assert.equal(pack.filter(c=>c.reverse).length,1,'one reverse');
    assert.ok(pack.filter(c=>c.reverse).every(c=>c.rarity!=='Rare Holo'&&c.rarity!=='Rare Crystal'),'no reverse of a holo or a Crystal');
    holos+=pack.filter(c=>c.rarity==='Rare Holo').length;crystals+=pack.filter(c=>c.rarity==='Rare Crystal').length;
    commons+=pack.filter(c=>c.rarity==='Common'&&!c.reverse).length;
    assert.ok(pack.filter(c=>c.rarity==='Rare Holo'||c.rarity==='Rare Crystal').length<=1,'one holo-slot card at most');
  }
  assert.ok(holos>N*0.27&&holos<N*0.34,`holo about 0.306 a pack (${holos/N})`);
  assert.ok(crystals>N*0.012&&crystals<N*0.045,`Crystal about 1 pack in 37 (${crystals/N})`);
  assert.ok(commons/N>4.5&&commons/N<4.8,`4 2/3 commons a pack on average (${commons/N})`);
}

console.log('Wizards of the Coast scaffold: ok');
