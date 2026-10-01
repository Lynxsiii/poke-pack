// Diamond & Pearl generation scaffold (2007-2011: dp1-dp7, pl1-pl4, hgss1-hgss4, col1, POP 6-9, the Trainer Kits): the finish
// classes, the engine pools, dpSlots (LV.X, Prime, LEGEND, Shining, Rotom, Arceus AR, Shiny Legendary, Alph Lithograph, dp1's
// commons-sheet Energy, Call of Legends' reverse Energy), popSlots, the eight-type DP Energy print and the foil hooks.
// Needs no DP set data (the sets are built by the set builders). Modelled on scripts/test-bw.mjs.
// Run: node scripts/test-dp.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {BASIC_ENERGY,RARITY_ORDER,RARITY_LABEL,RARITY_MARK,SELL_VALUE,boxCardList,dpSlots,popSlots,xySlots} from '../js/catalog.js';
import {HIT_RARITIES,poolsFrom,ripPack,isHit} from '../js/engine.js';
import {foilExtras,isDp,isBw,isXy,dpPattern,reverseFinish} from '../js/foil-maps.js';
import {legendHalf,isAlph,dpEtched,dpReverseFinish,dpMap} from '../js/dp-foil.js';
import {energySet} from '../js/grading-rules.js';
import {FINISH_PRINTERS} from '../js/achievement-eras.js';

const root=new URL('../',import.meta.url);

// ---- isDp ---------------------------------------------------------------------------------------
for(const id of ['dp1-1','dp7-SH1','pl1-128','pl2-RT1','pl4-AR9','hgss1-ONE','hgss4-102','col1-SL11','dpp-dpp05','dp1-dpp01','pl2-dpp42','hsp-hsp01','hgss2-hsp10','col1-hsp24','pop6-1','pop9-17','dptk3a-4','hgsstk4b-30'])
  assert.ok(isDp({id}),`${id} is a Diamond & Pearl generation print`);
for(const id of ['sm1-1','swsh1-1','xy1-1','bw1-1','bwp-bwp001','bwtk5a-1','me5-12','energy-fire-dp','mcd11-1','sv1-1','ex1-1','pop5-1','pop1-3','base1-4','neo1-9'])
  assert.ok(!isDp({id}),`${id} is not`);
assert.ok(isDp({id:'smp-smp001',era:'dp'}),'era "dp" is enough (a promo reprint)');
assert.ok(!isBw({id:'dp1-1'})&&!isXy({id:'pl1-1'})&&!isBw({id:'hgss1-1'}));

// ---- dpPattern ----------------------------------------------------------------------------------
const pat=(card)=>dpPattern({supertype:'Pokémon',subtypes:['Basic'],...card});
assert.equal(pat({id:'dp1-5',rarity:'Common'}),'');
assert.equal(pat({id:'dp1-5',rarity:'Uncommon'}),'');
assert.equal(pat({id:'dp1-5',rarity:'Rare'}),'foil-none','the plain Rare is not foil');
assert.equal(pat({id:'pop6-2',rarity:'Rare'}),'foil-none','POP 6 rares are not foil either');
assert.equal(pat({id:'dp1-1',rarity:'Rare Holo'}),'foil-holo dp-holo');
assert.equal(pat({id:'hgss1-123',rarity:'Rare Holo'}),'foil-holo dp-holo','Red Gyarados is an ordinary holo');
assert.equal(pat({id:'dp1-120',rarity:'Rare Holo LV.X',subtypes:['Level-Up']}),'foil-ex dp-lvx');
assert.equal(pat({id:'hgss1-105',rarity:'Rare Prime'}),'foil-ex dp-prime');
assert.equal(pat({id:'dp2-124',rarity:'Rare Secret',supertype:'Trainer',subtypes:['Item']}),'foil-holo dp-holo dp-secret');
assert.equal(pat({id:'dp7-103',rarity:'Rare Secret'}),'foil-holo dp-holo dp-secret','the Stormfront Charizard is a cosmos holo, not a shiny');
assert.equal(pat({id:'dp7-SH1',rarity:'Rare Shining'}),'foil-holo dp-shining');
assert.equal(pat({id:'pl2-RT1',rarity:'Rare Rotom'}),'foil-holo dp-rotom');
assert.equal(pat({id:'pl4-AR1',rarity:'Rare Arceus'}),'foil-holo dp-holo dp-ar');
assert.equal(pat({id:'col1-SL1',rarity:'Rare Shiny Legendary'}),'foil-holo dp-holo dp-shiny-legend');
assert.equal(pat({id:'hgss1-ONE',name:'Alph Lithograph',rarity:'Rare Secret',supertype:'Trainer',subtypes:['Item']}),'foil-holo dp-alph','Alph Lithograph by name');
assert.equal(pat({id:'hgss3-THREE',name:'Alph Lithograph',rarity:'Rare Secret'}),'foil-holo dp-alph');
assert.equal(pat({id:'hgss2-TWO',rarity:'Rare Secret',alph:true}),'foil-holo dp-alph','Alph Lithograph by the data flag');
assert.equal(pat({id:'dpp-dpp01',rarity:'Promo'}),'');
assert.equal(pat({id:'dptk3a-4',rarity:'None'}),'');
// LEGEND: the whole face, top and bottom halves by the consecutive numbers of a pair
assert.equal(pat({id:'hgss1-111',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-top');
assert.equal(pat({id:'hgss1-112',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-bottom');
assert.equal(pat({id:'hgss1-113',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-top');
assert.equal(pat({id:'hgss2-90',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-top');
assert.equal(pat({id:'hgss2-95',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-bottom');
assert.equal(pat({id:'hgss3-87',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-top');
assert.equal(pat({id:'hgss4-102',rarity:'LEGEND'}),'foil-ultra dp-legend dp-legend-bottom');
assert.equal(pat({id:'hgss4-99',rarity:'LEGEND',legendHalf:'bottom'}),'foil-ultra dp-legend dp-legend-bottom','the data flag wins');
assert.equal(pat({id:'x-1',rarity:'LEGEND'}),'foil-ultra dp-legend','no half when the id says nothing');
assert.equal(legendHalf({id:'hgss1-111',rarity:'Rare Holo'}),'');
assert.ok(isAlph({name:'Alph Lithograph'})&&isAlph({alph:true})&&!isAlph({name:'Alakazam'}));

// ---- Foil hooks ---------------------------------------------------------------------------------
const url=(p)=>`/${p}`;
const legend=foilExtras({id:'hgss1-111',rarity:'LEGEND',supertype:'Pokémon'},url);
assert.ok(/has-foil-map/.test(legend.classes)&&/era-dp/.test(legend.classes),`LEGEND: ${legend.classes}`);
assert.match(legend.style,/--foil-map:url\('\/assets\/foil\/dp-special\/legend-(?:top|bottom)\.webp'\)/,'a LEGEND half takes its drawn half mask');
assert.match(legend.style,/--seed-x/,'tiled textures start somewhere different on every card');
const alph=foilExtras({id:'hgss1-ONE',rarity:'Rare Secret',supertype:'Trainer',name:'Alph Lithograph'},url);
assert.ok(!/has-etch-tile/.test(alph.classes)&&/era-dp/.test(alph.classes),`Alph Lithograph is lit stone, not an etch tile (h3): ${alph.classes}`);
assert.equal(dpEtched({id:'dp7-103',rarity:'Rare Secret'}),false,'cosmos secrets are not etched');
const holo=foilExtras({id:'dp1-1',rarity:'Rare Holo',supertype:'Pokémon'},url);
assert.ok(/era-dp/.test(holo.classes)&&/has-foil-map/.test(holo.classes)&&/dp-win\/dp-basic\.webp/.test(holo.style),`a Diamond & Pearl holo takes the drawn window mask: ${holo.classes} ${holo.style}`);
assert.equal(dpMap({id:'dp1-1',rarity:'Rare Holo'}),'assets/foil/dp-win/dp-basic.webp');assert.equal(dpMap({id:'dp1-5',rarity:'Common'}),'','a plain card has no map');
const lvx=foilExtras({id:'dp1-120',rarity:'Rare Holo LV.X',supertype:'Pokémon'},url);
assert.ok(/era-dp/.test(lvx.classes)&&/has-foil-map/.test(lvx.classes)&&/dp-special\/lvx\.webp/.test(lvx.style),`a LV.X takes its drawn mask (h2): ${lvx.classes} ${lvx.style}`);
const rev=foilExtras({id:'dp2-30',rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
assert.equal(rev.classes,'rev-mirror era-dp dp-rev dp-rev-dp dp-rev-basic');
assert.equal(foilExtras({id:'hgss3-30',rarity:'Uncommon',supertype:'Pokémon',types:['Fire'],reverse:true},url).classes,'rev-mirror era-dp dp-rev dp-rev-hgss dp-rev-basic');
assert.equal(foilExtras({id:'col1-90',rarity:'Energy',supertype:'Energy',reverse:true},url).classes,'rev-mirror era-dp dp-rev dp-rev-hgss dp-rev-energy dp-rev-cross','Call of Legends Energy reverses take the Crosshatch');
assert.equal(dpReverseFinish({id:'dp1-2'}),'dp');
assert.equal(reverseFinish({id:'pl3-30',reverse:true,rarity:'Common'}),'dp');
for(const id of ['xy1-1','sm1-1','bw1-1','sv1-1','swsh1-1']) assert.equal(foilExtras({id,rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-dp'),false,`${id} is not Diamond & Pearl`);
assert.ok(!foilExtras({id:'bw1-5',rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-dp'));

// ---- Rarity registries --------------------------------------------------------------------------
for(const r of ['Rare Holo LV.X','Rare Prime','LEGEND','Rare Rotom','Rare Arceus','Rare Shiny Legendary']){
  assert.ok(RARITY_ORDER.includes(r)&&RARITY_LABEL[r]&&RARITY_MARK[r]&&SELL_VALUE[r]>0,`${r} is registered`);
  assert.ok(HIT_RARITIES.has(r),`${r} is a hit`);
  assert.ok(isHit({rarity:r}));
  assert.ok(FINISH_PRINTERS[r]?.length,`${r} names the sets that print it (so "every finish" does not ask for it early)`);
}
assert.ok(RARITY_ORDER.includes('Rare Shining')&&HIT_RARITIES.has('Rare Shining')&&FINISH_PRINTERS['Rare Shining'].includes('dp7')&&FINISH_PRINTERS['Rare Shining'].includes('sm35'),'Rare Shining is Shining Legends\' word, shared');
assert.equal(new Set(RARITY_ORDER).size,RARITY_ORDER.length,'no rarity twice');
assert.ok(RARITY_ORDER.indexOf('Rare Holo LV.X')>RARITY_ORDER.indexOf('Rare Holo')&&RARITY_ORDER.indexOf('Rare Prime')>RARITY_ORDER.indexOf('Rare Holo LV.X')&&RARITY_ORDER.indexOf('LEGEND')>RARITY_ORDER.indexOf('Rare Prime'));
assert.equal(RARITY_LABEL['Rare Prime'],'Pokémon Prime');

// ---- DP Energy: eight types, no Fairy -----------------------------------------------------------
const dpEnergy=BASIC_ENERGY.filter(c=>c.energyPrint==='dp');
assert.deepEqual(dpEnergy.map(c=>c.id.slice(7,-3)).sort(),['darkness','fighting','fire','grass','lightning','metal','psychic','water']);
for(const c of dpEnergy){
  assert.ok(c.id.endsWith('-dp')&&c.energy&&c.supertype==='Energy'&&c.variant==='Diamond & Pearl 2007');
  for(const path of [c.image,c.imageSmall]) assert.ok(existsSync(new URL(path,root)),path);
}
assert.equal(BASIC_ENERGY.length,81,'24 SVE + 8 each of swsh, mee, sm17, sm19, bw, dp + 9 xy');
assert.equal(energySet('energy-fire-dp').released,'2007');
assert.equal(energySet('energy-fire-bw').released,'2011');
let rows=boxCardList({spread:{total:40,print:'dp'}});
assert.equal(rows.length,8);for(const r of rows) assert.equal(r.n,5);
assert.ok(rows.every(r=>/-dp$/.test(r.id)));

// ---- Fake sets and pools ------------------------------------------------------------------------
const fake=(rarity,extra={})=>({id:`dp9-${Math.random().toString(36).slice(2,8)}`,name:'x',number:'1',rarity,supertype:'Pokémon',subtypes:['Basic'],...extra});
const base=[];
const add=(n,rarity,extra)=>{for(let i=0;i<n;i++) base.push(fake(rarity,typeof extra==='function'?extra(i):extra));};
add(30,'Common');add(20,'Uncommon');add(15,'Rare');add(8,'Rare Holo');
add(4,'Rare Holo LV.X',{subtypes:['Level-Up']});add(6,'Rare Prime');add(4,'LEGEND');add(3,'Rare Secret');add(1,'Rare Secret',{alph:true,name:'Alph Lithograph',supertype:'Trainer',subtypes:['Item']});
add(3,'Rare Shining');add(6,'Rare Rotom');add(9,'Rare Arceus');add(11,'Rare Shiny Legendary');
// dp1's and hgss1's own basic Energy (rarity "Energy" after build_set), Call of Legends' reverse-only ones
const own=[];for(let i=0;i<8;i++) own.push(fake('Energy',{id:`dp9-${123+i}`,supertype:'Energy',types:['Grass']}));
const revEnergy=[];for(let i=0;i<8;i++) revEnergy.push(fake('Energy',{id:`col9-${88+i}`,supertype:'Energy',reverse:true}));
const pools=poolsFrom([...base,...own,...revEnergy,...BASIC_ENERGY],{energyPrint:'own'});
assert.equal(pools.lvx.length,4);assert.equal(pools.prime.length,6);assert.equal(pools.legend.length,4);
assert.equal(pools.shining.length,3,'the Shining pool is "Rare Shining"');
assert.equal(pools.rotom.length,6);assert.equal(pools.ar.length,9);assert.equal(pools.shinyLegend.length,11);
assert.equal(pools.alph.length,1);assert.equal(pools.secret.length,3,'the secret pool leaves the Alph Lithograph out');
assert.equal(pools.holo.length,8,'the subsets are not plain holos');assert.equal(pools.rare.length,15);
assert.equal(pools.energy.length,8,'energyPrint "own": only the set\'s own Energy');
assert.equal(pools.reverseEnergy.length,8);
assert.equal(poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'dp'}).energy.length,8,'POP 8 and 9 deal the shared DP print');
assert.equal(poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'bw'}).energy.length,8);

// ---- dpSlots ------------------------------------------------------------------------------------
assert.equal(typeof dpSlots,'function');
const sum=(table)=>table.reduce((n,[,p])=>n+p,0);
// dp6 Legends Awakened: 10 cards, LV.X in the rare slot, no Energy
let slots=dpSlots({holo:0.2778,rareSpecial:[['lvx',0.0556]]});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',5],['uncommon',3],['reverse',1],['rare-slot',1]],'ten cards, no Energy slot');
assert.deepEqual(slots.find(s=>s.pool==='reverse'),{pool:'reverse',count:1},'a plain mirror reverse slot');
let rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','lvx']);
assert.ok(Math.abs(sum(rare.table)-1)<1e-9,'the rare slot sums to one');
assert.ok(Math.abs(rare.table[0][1]-0.6666)<1e-3,'plain Rare is two packs in three');
// dp7 Stormfront: LV.X and the Charmander line in the rare slot, Shining in the reverse slot
slots=dpSlots({holo:0.2502,secret:0.0276,rareSpecial:[['lvx',0.0556]],reverseSpecial:[['shining',0.0248]]});
assert.deepEqual(slots.find(s=>s.pool==='reverse').table,[['reverse',0.9752],['shining',0.0248]]);
rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','secret','lvx']);assert.ok(Math.abs(sum(rare.table)-1)<1e-9);
// dp1: the eight Energy on the commons sheet
slots=dpSlots({holo:0.3056,rareSpecial:[['lvx',0.0278]],commonEnergy:0.3306});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',3],['reverse',1],['rare-slot',1]]);
assert.deepEqual(slots[1].table,[['common',0.6694],['energy',0.3306]]);
// pl4 Arceus: the AR subset takes a quarter of the reverse slots, Shining a little
slots=dpSlots({holo:0.25,rareSpecial:[['lvx',0.0833]],reverseSpecial:[['ar',0.25],['shining',0.0186]]});
assert.deepEqual(slots.find(s=>s.pool==='reverse').table,[['reverse',0.7314],['ar',0.25],['shining',0.0186]]);
// hgss1: Prime in the reverse slot, LEGEND and the Alph Lithograph in the rare slot
slots=dpSlots({holo:0.2361,rareSpecial:[['legend',0.0833],['alph',0.0139]],reverseSpecial:[['prime',0.1667]],commonEnergy:0.3306});
rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','legend','alph']);assert.ok(Math.abs(sum(rare.table)-1)<1e-9);
assert.ok(Math.abs(slots.find(s=>s.pool==='reverse').table[0][1]-0.8333)<1e-9);
// Call of Legends: Shiny Legendary or a reverse Energy replaces the reverse
slots=dpSlots({holo:0.3333,reverseSpecial:[['shinyLegend',0.0556],['reverseEnergy',0.0624]]});
assert.deepEqual(slots.find(s=>s.pool==='reverse').table.map(([k])=>k),['reverse','shinyLegend','reverseEnergy']);
assert.ok(Math.abs(sum(slots.find(s=>s.pool==='reverse').table)-1)<1e-9);
assert.deepEqual(slots.find(s=>s.pool==='rare-slot').table.map(([k])=>k),['rare','holo']);
// xySlots keeps its own tests and dpSlots is the same builder
assert.deepEqual(dpSlots({holo:0.2,ex:0.1}),xySlots({holo:0.2,ex:0.1}));
assert.deepEqual(xySlots({holo:0.2,ex:0.1}),xySlots({holo:0.2,ex:0.1,rareSpecial:[]}),'rareSpecial is optional');

// ---- Rips of fake sets ---------------------------------------------------------------------------
{
  // hgss1 shape: Energy on the commons sheet, Prime in the reverse slot, LEGEND and Alph in the rare slot
  const set={energyPrint:'own',reverseRarities:['Common','Uncommon','Rare','Rare Holo'],slots:dpSlots({holo:0.2361,rareSpecial:[['legend',0.0833],['alph',0.0139]],reverseSpecial:[['prime',0.1667]],commonEnergy:0.3306})};
  const all=[...base,...own,...BASIC_ENERGY];
  let primes=0,legends=0,alphs=0,energies=0;const N=6000;
  for(const [pool] of [['x']]) void pool;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,10,'a pack is ten cards');
    assert.equal(new Set(pack.map(c=>c.id)).size,10,'no duplicate in a pack');
    assert.ok(pack.filter(c=>c.rarity==='LEGEND'||c.alph).length<=1,'one rare-slot chase at most');
    primes+=pack.filter(c=>c.rarity==='Rare Prime').length;
    legends+=pack.filter(c=>c.rarity==='LEGEND').length;
    alphs+=pack.filter(c=>c.alph).length;
    energies+=pack.filter(c=>c.rarity==='Energy').length;
    assert.ok(pack.every(c=>c.rarity!=='Rare Holo LV.X'),'no LV.X in an HGSS pack');
    assert.ok(pack.every(c=>!c.energy||!String(c.id).startsWith('energy-')),'shared Energy never in a pack on energyPrint own');
  }
  assert.ok(primes>N*0.13&&primes<N*0.21,`Prime about 1 pack in 6 (${primes/N})`);
  assert.ok(legends>N*0.06&&legends<N*0.11,`LEGEND about 1 pack in 12 (${legends/N})`);
  assert.ok(alphs>0&&alphs<N*0.03,`Alph Lithograph rare (${alphs/N})`);
  assert.ok(energies>N*0.25&&energies<N*0.42,`about a third of a basic Energy a pack (${energies/N})`);
}
{
  // dp7 shape: Shining Pokémon replace the reverse, LV.X and secrets in the rare slot
  const set={reverseRarities:['Common','Uncommon','Rare','Rare Holo'],slots:dpSlots({holo:0.2502,secret:0.0276,rareSpecial:[['lvx',0.0556]],reverseSpecial:[['shining',0.0248]]})};
  const all=[...base,...own,...BASIC_ENERGY];
  let shining=0,lvx=0,secrets=0,reverses=0;const N=6000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,10);assert.equal(new Set(pack.map(c=>c.id)).size,10);
    assert.equal(pack.filter(c=>c.energy||c.rarity==='Energy').length,0,'no Energy card in a dp7 pack');
    shining+=pack.filter(c=>c.rarity==='Rare Shining').length;
    lvx+=pack.filter(c=>c.rarity==='Rare Holo LV.X').length;
    secrets+=pack.filter(c=>c.rarity==='Rare Secret').length;
    reverses+=pack.filter(c=>c.reverse).length;
    assert.ok(pack.every(c=>c.rarity!=='Rare Prime'&&c.rarity!=='LEGEND'),'no Prime or LEGEND in a Diamond & Pearl pack');
  }
  assert.ok(shining>N*0.012&&shining<N*0.045,`Shining about 1 pack in 40 (${shining/N})`);
  assert.ok(lvx>N*0.04&&lvx<N*0.075,`LV.X about 1 pack in 18 (${lvx/N})`);
  assert.ok(secrets>N*0.015&&secrets<N*0.045,`secret about 1 pack in 36 (${secrets/N})`);
  assert.ok(reverses>N*0.93&&reverses<N*0.99,`a reverse in almost every pack (${reverses/N})`);
}
{
  // Call of Legends shape: Shiny Legendary or a reverse basic Energy in the reverse slot
  const set={reverseRarities:['Common','Uncommon','Rare','Rare Holo'],slots:dpSlots({holo:0.3333,reverseSpecial:[['shinyLegend',0.0556],['reverseEnergy',0.0624]]})};
  const all=[...base,...revEnergy,...BASIC_ENERGY];
  let sl=0,re=0,holos=0;const N=6000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,10);assert.equal(new Set(pack.map(c=>c.id)).size,10);
    sl+=pack.filter(c=>c.rarity==='Rare Shiny Legendary').length;
    re+=pack.filter(c=>c.rarity==='Energy').length;
    holos+=pack.filter(c=>c.rarity==='Rare Holo'&&!c.reverse).length;
  }
  assert.ok(sl>N*0.04&&sl<N*0.075,`Shiny Legendary about 1 pack in 18 (${sl/N})`);
  assert.ok(re>N*0.04&&re<N*0.085,`a reverse Energy in about 6 packs in 100 (${re/N})`);
  assert.ok(holos>N*0.3&&holos<N*0.37,`a holo exactly one pack in three, give or take (${holos/N})`);
}

// ---- popSlots -----------------------------------------------------------------------------------
{
  const small=[];
  const addp=(n,rarity)=>{for(let i=0;i<n;i++) small.push(fake(rarity,{id:`pop9-${small.length+1}`}));};
  addp(5,'Rare');addp(6,'Uncommon');addp(6,'Common');
  // POP 6: a Rare in every pack plus a common-or-uncommon card
  let s=popSlots({rare:1});
  assert.deepEqual(s.map(x=>[x.pool,x.count]),[['rare',1],['common',1]]);
  assert.ok(Math.abs(sum(s[1].table)-1)<1e-9&&s[1].table[1][0]==='uncommon');
  // POP 7: two common-or-uncommon cards, a Rare one pack in ten
  s=popSlots({rare:0.1});
  assert.equal(s.length,2);assert.ok(Math.abs(sum(s[0].table)-1)<1e-9&&s[0].table[0][1]===0.1);
  // POP 8 and 9: Energy + Common + a common-uncommon-rare card
  s=popSlots({rare:0.165,uncommon:0.335,energy:1});
  assert.deepEqual(s.map(x=>[x.pool,x.count]),[['energy',1],['common',1],['uncommon',1]]);
  assert.ok(Math.abs(sum(s[2].table)-1)<1e-9);assert.deepEqual(s[2].table.map(([k])=>k),['common','uncommon','rare']);
  let rares=0,unc=0;const N=6000;
  const set8={energyPrint:'dp',slots:s};
  for(let i=0;i<N;i++){
    const pack=ripPack(set8,[...small,...BASIC_ENERGY]);
    assert.equal(pack.length,3,'a POP 8 pack is three cards');
    assert.equal(pack.filter(c=>c.energy&&c.energyPrint==='dp').length,1,'one DP Energy in every pack');
    assert.equal(new Set(pack.map(c=>c.id)).size,3);
    rares+=pack.filter(c=>c.rarity==='Rare').length;unc+=pack.filter(c=>c.rarity==='Uncommon').length;
  }
  assert.ok(rares>N*0.13&&rares<N*0.2,`rare 0.165 (${rares/N})`);assert.ok(unc>N*0.29&&unc<N*0.38,`uncommon 0.335 (${unc/N})`);
  const set6={slots:popSlots({rare:1})};
  let u6=0;
  for(let i=0;i<N;i++){
    const pack=ripPack(set6,small);
    assert.equal(pack.length,2,'a POP 6 pack is two cards');
    assert.equal(pack.filter(c=>c.rarity==='Rare').length,1,'a Rare in every POP 6 pack');
    u6+=pack.filter(c=>c.rarity==='Uncommon').length;
  }
  assert.ok(u6>N*0.12&&u6<N*0.21,`uncommon share 1 in 6 (${u6/N})`);
  const set7={slots:popSlots({rare:0.1})};
  let r7=0;
  for(let i=0;i<N;i++){const pack=ripPack(set7,small);assert.equal(pack.length,2);r7+=pack.filter(c=>c.rarity==='Rare').length;}
  assert.ok(r7>N*0.07&&r7<N*0.13,`POP 7 rare about 1 pack in 10 (${r7/N})`);
}

console.log('Diamond & Pearl scaffold: ok');
