// Black & White era scaffold: the finish classes, the engine pools, bwSlots (Ace Spec, Legendary
// Treasures' Radiant Collection, Dragon Vault), the eight-type BW Energy print and the foil hooks.
// Needs no BW set data (the sets are built by the set builders).
// Run: node scripts/test-bw.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {BASIC_ENERGY,RARITY_ORDER,RARITY_LABEL,RARITY_MARK,SELL_VALUE,boxCardList,bwSlots,xySlots} from '../js/catalog.js';
import {HIT_RARITIES,poolsFrom,ripPack,isHit} from '../js/engine.js';
import {foilExtras,isBw,isXy,bwPattern,reverseFinish} from '../js/foil-maps.js';
import {isRadiantCollection,bwReverseFinish,bwEtched} from '../js/bw-foil.js';
import {energySet} from '../js/grading-rules.js';

const root=new URL('../',import.meta.url);

// ---- isBw ---------------------------------------------------------------------------------------
for(const id of ['bw1-1','bw11-RC5','bw10-105','dv1-3','bwp-bwp001','bw5-bwp045','dv1-bwp012','mcd11-1','mcd12-12','bwtk5a-3'])
  assert.ok(isBw({id}),`${id} is a Black & White print`);
for(const id of ['sm1-1','swsh1-1','xy1-1','xyp-xyp001','me5-12','energy-fire-bw','mcd14-1','mcd17-1','sv1-1','dp1-1','ex1-1'])
  assert.ok(!isBw({id}),`${id} is not`);
assert.ok(isBw({id:'smp-smp001',era:'bw'}),'era "bw" is enough (a promo reprint)');
assert.ok(!isXy({id:'bw1-1'})&&!isXy({id:'dv1-1'}));

// ---- bwPattern ----------------------------------------------------------------------------------
const pat=(card)=>bwPattern({supertype:'Pokémon',subtypes:['Basic'],...card});
assert.equal(pat({id:'bw1-1',rarity:'Common'}),'');
assert.equal(pat({id:'bw1-1',rarity:'Uncommon'}),'');
assert.equal(pat({id:'bw1-1',rarity:'Rare'}),'foil-none','the plain Rare is not foil');
assert.equal(pat({id:'bw1-5',rarity:'Rare Holo'}),'foil-holo bw-holo');
assert.equal(pat({id:'bw4-5',rarity:'Rare Holo EX',subtypes:['Basic','EX']}),'foil-ex bw-ex');
assert.equal(pat({id:'bw8-108',rarity:'Rare Holo EX',subtypes:['Basic','EX','Team Plasma']}),'foil-ex bw-ex');
assert.equal(pat({id:'bw1-113',rarity:'Rare Ultra'}),'foil-ultra bw-fa bw-flat','Black & White full arts are untextured');
assert.equal(pat({id:'bw3-100',rarity:'Rare Ultra'}),'foil-ultra bw-fa bw-flat');
assert.equal(pat({id:'bw4-100',rarity:'Rare Ultra'}),'foil-ultra bw-fa','from Next Destinies on they are etched');
assert.equal(pat({id:'bw8-135',rarity:'Rare Ultra',supertype:'Trainer',subtypes:['Supporter','Team Plasma']}),'foil-ultra bw-fa bw-tfa');
assert.equal(pat({id:'bw7-128',rarity:'Rare ACE',supertype:'Trainer',subtypes:['Item','ACE SPEC']}),'foil-holo bw-ace');
assert.equal(pat({id:'bw1-115',rarity:'Rare Secret'}),'foil-ultra bw-secret bw-yellow','Pikachu is a yellow-bordered secret');
assert.equal(pat({id:'bw4-103',rarity:'Rare Secret'}),'foil-ultra bw-secret bw-yellow','a shiny reprint of the first sets');
assert.equal(pat({id:'bw7-150',rarity:'Rare Secret'}),'foil-ultra bw-secret bw-gold','gold from Boundaries Crossed on');
assert.equal(pat({id:'bw11-115',rarity:'Rare Secret'}),'foil-gold bw-secret bw-gold bw-goldfull');
assert.equal(pat({id:'bw5-109',rarity:'Rare Secret',supertype:'Trainer',subtypes:['Item']}),'foil-ultra bw-secret bw-yellow bw-item');
assert.equal(pat({id:'bwp-bwp001',rarity:'Promo'}),'');
// Dragon Vault: all 21 are holofoil, the ones pkmn.gg gives no rarity included.
assert.equal(pat({id:'dv1-5',rarity:'Rare Holo'}),'foil-holo bw-holo bw-vault');
assert.equal(pat({id:'dv1-21',rarity:''}),'foil-holo bw-holo bw-vault');
assert.equal(pat({id:'dv1-18',rarity:'',supertype:'Trainer',subtypes:['Pokémon Tool']}),'foil-holo bw-holo bw-vault');
// Legendary Treasures' Radiant Collection: every RC card is foil, whatever its print's rarity.
assert.ok(isRadiantCollection({id:'bw11-RC9'})&&isRadiantCollection({id:'x',rc:true})&&!isRadiantCollection({id:'bw11-9'})&&!isRadiantCollection({id:'g1-RC9'}));
assert.equal(pat({id:'bw11-RC1',rarity:'Common'}),'foil-holo bw-rc');
assert.equal(pat({id:'bw11-RC3',rarity:'Uncommon'}),'foil-holo bw-rc');
assert.equal(pat({id:'bw11-RC11',rarity:'Rare',subtypes:['Basic','EX']}),'foil-holo bw-rc bw-rc-fa','RC11 is a regular-art Pokémon-EX that pkmn.gg labels Rare: foil edge to edge like the full arts');
assert.equal(pat({id:'bw11-RC11',rarity:'Rare Holo EX',subtypes:['Basic','EX']}),'foil-holo bw-rc bw-rc-fa');
assert.equal(pat({id:'bw11-RC21',rarity:'Rare Ultra',subtypes:['Basic','EX']}),'foil-holo bw-rc bw-rc-fa');
assert.equal(pat({id:'bw11-5',rarity:'Rare',subtypes:['Basic','EX']}),'foil-none','a plain Rare outside the RC stays plain');

// ---- Foil hooks ---------------------------------------------------------------------------------
const url=(p)=>`/${p}`;
const flat=foilExtras({id:'bw1-113',rarity:'Rare Ultra',supertype:'Pokémon'},url);
assert.ok(/has-foil-map/.test(flat.classes)&&/era-bw/.test(flat.classes),`full art: ${flat.classes}`);
assert.ok(!/has-etch-tile/.test(flat.classes),'a Black & White full art is not etched');
assert.match(flat.style,/--foil-map:url\('\/assets\/foil\/maps\/full\.webp'\)/,'a full art takes the all-white map');
const etched=foilExtras({id:'bw5-107',rarity:'Rare Ultra',supertype:'Pokémon'},url);
assert.ok(/has-etch-tile/.test(etched.classes)&&/era-bw/.test(etched.classes),`Dark Explorers full art: ${etched.classes}`);
assert.match(etched.style,/--seed-x/,'tiled textures start somewhere different on every card');
assert.equal(bwEtched({id:'bw7-150',rarity:'Rare Secret'}),true);
assert.equal(bwEtched({id:'bw4-103',rarity:'Rare Secret'}),false,'a yellow shiny secret is not etched');
assert.equal(bwEtched({id:'bw1-5',rarity:'Rare Holo'}),false);
const holo=foilExtras({id:'bw1-5',rarity:'Rare Holo',supertype:'Pokémon'},url);
assert.ok(/era-bw/.test(holo.classes)&&!/has-foil-map/.test(holo.classes),'no map until a finish agent draws one');
const rev=foilExtras({id:'bw2-30',rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
assert.equal(rev.classes,'rev-mirror era-bw bw-rev');
const rev1=foilExtras({id:'bw1-30',rarity:'Common',supertype:'Pokémon',types:['Water'],reverse:true},url);
assert.equal(rev1.classes,'rev-mirror era-bw bw-rev bw-rev-plain','Black & White own reverse is the plain mirror');
assert.equal(bwReverseFinish({id:'bw1-2'}),'bw-plain');assert.equal(bwReverseFinish({id:'bw9-2'}),'bw');
assert.equal(reverseFinish({id:'bw8-30',reverse:true,rarity:'Common'}),'bw');
assert.equal(foilExtras({id:'xy1-1',rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-bw'),false,'XY is not Black & White');
assert.equal(foilExtras({id:'sm1-1',rarity:'Rare Holo',supertype:'Pokémon'},url).classes.includes('era-bw'),false);

// ---- Rarity registries --------------------------------------------------------------------------
{
  const r='Rare ACE';
  assert.ok(RARITY_ORDER.includes(r)&&RARITY_LABEL[r]&&RARITY_MARK[r]&&SELL_VALUE[r]>0,`${r} is registered`);
  assert.ok(HIT_RARITIES.has(r),`${r} is a hit`);
  assert.ok(isHit({rarity:r}));
}
assert.ok(RARITY_ORDER.includes('Rare Holo EX'),'Rare Holo EX is the XY registration, shared');

// ---- BW Energy: eight types, no Fairy -----------------------------------------------------------
const bwEnergy=BASIC_ENERGY.filter(c=>c.energyPrint==='bw');
assert.deepEqual(bwEnergy.map(c=>c.id.slice(7,-3)).sort(),['darkness','fighting','fire','grass','lightning','metal','psychic','water']);
for(const c of bwEnergy){
  assert.ok(c.id.endsWith('-bw')&&c.energy&&c.supertype==='Energy'&&c.variant==='Black & White 2011');
  for(const path of [c.image,c.imageSmall]) assert.ok(existsSync(new URL(path,root)),path);
}
assert.equal(BASIC_ENERGY.length,73,'24 SVE + 8 each of swsh, mee, sm17, sm19, bw + 9 xy');
assert.equal(energySet('energy-fire-bw').released,'2011');
assert.equal(energySet('energy-fire-xy').released,'2014');
const fake=(rarity,extra={})=>({id:`bw8-${Math.random().toString(36).slice(2,8)}`,name:'x',number:'1',rarity,supertype:'Pokémon',subtypes:['Basic'],...extra});
const base=[];
const add=(n,rarity,extra)=>{for(let i=0;i<n;i++) base.push(fake(rarity,typeof extra==='function'?extra(i):extra));};
add(30,'Common');add(20,'Uncommon');add(10,'Rare');add(6,'Rare Holo');
add(5,'Rare Holo EX',{subtypes:['Basic','EX']});add(3,'Rare ACE',{supertype:'Trainer',subtypes:['Item','ACE SPEC']});
add(4,'Rare Ultra',{subtypes:['Basic','EX']});add(2,'Rare Secret');
// Legendary Treasures' Radiant Collection: 10 commons, 9 uncommons, RC11 ("Rare Holo EX" through the set config's rarityOverrides; pkmn.gg says "Rare"), 5 full arts
add(10,'Common',{rc:true,number:'RC1'});add(9,'Uncommon',{rc:true,number:'RC3'});
add(1,'Rare Holo EX',{rc:true,number:'RC11',subtypes:['Basic','EX']});add(5,'Rare Ultra',{rc:true,number:'RC21'});
const pools=poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'bw'});
assert.equal(pools.energy.length,8,'the energy pool is the eight BW Energy');
assert.equal(poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'xy'}).energy.length,9);
assert.equal(poolsFrom([...base,...BASIC_ENERGY],{energyPrint:'own'}).energy.length,0,'a set on its own Energy matches no shared print');
assert.equal(pools.aceSpec.length,3);assert.equal(pools.exAll.length,5);assert.equal(pools.megaEx.length,0,'no Mega EX in this era');
assert.equal(pools.common.length,30,'RC cards are not in the main pools');
assert.equal(pools.rareUltra.length,4);assert.equal(pools.secret.length,2);
assert.equal(pools.rcCommon.length,10);assert.equal(pools.rcUncommon.length,9);assert.equal(pools.rcUltra.length,6,'RC11 (Rare Holo EX after the override) counts as an RC ultra');
assert.equal(pools.radiantCollection.length,25);

// ---- Box Energy: an eight-type print deals 5 of each in a 40 ----------------------------------------
let rows=boxCardList({spread:{total:40,print:'bw'}});
assert.equal(rows.length,8);for(const r of rows) assert.equal(r.n,5);
assert.ok(rows.every(r=>/-bw$/.test(r.id)&&!/fairy/.test(r.id)));

// ---- bwSlots ------------------------------------------------------------------------------------
assert.equal(typeof bwSlots,'function');
// A standard pack: 10 cards, the Ace Spec in the reverse slot
let slots=bwSlots({holo:0.2222,ex:0.0741,ultra:0.0237,secret:0.0133,aceSpec:0.0417});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',5],['uncommon',3],['reverse',1],['rare-slot',1]],'ten cards, no Energy slot');
assert.deepEqual(slots.find(s=>s.pool==='reverse').table,[['reverse',0.9583],['aceSpec',0.0417]],'the Ace Spec takes the reverse slot');
const rare=slots.find(s=>s.pool==='rare-slot');
assert.deepEqual(rare.table.map(([k])=>k),['rare','holo','exAll','rareUltra','secret']);
assert.ok(Math.abs(rare.table.reduce((n,[,p])=>n+p,0)-1)<1e-9,'the rare slot sums to one');
assert.deepEqual(bwSlots({holo:0.2639,ultra:0.0556,secret:0.0139}).find(s=>s.pool==='rare-slot').table.map(([k])=>k),['rare','holo','rareUltra','secret'],'Black & White: no Pokémon-EX');
assert.deepEqual(bwSlots({holo:0.3}).find(s=>s.pool==='reverse'),{pool:'reverse',count:1},'no Ace Spec: a plain reverse slot');
// bw1: the eight Energy on the commons sheet
slots=bwSlots({holo:0.2639,ultra:0.0556,secret:0.0139,commonEnergy:0.5});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['common',1],['uncommon',3],['reverse',1],['rare-slot',1]]);
// Legendary Treasures: 4 C + 2 U + reverse-or-holo + rare slot + 2 Radiant Collection cards
slots=bwSlots({commons:4,uncommons:2,holo:0,holoReverse:0.5,ex:0.1667,secret:0.0093,rcSlots:{uncommon:0.7,ultra:0.3}});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['common',4],['uncommon',2],['reverse',1],['rare-slot',1],['rcUncommon',1],['rcCommon',1]]);
assert.deepEqual(slots.find(s=>s.pool==='reverse').table,[['reverse',0.5],['holo',0.5]]);
assert.deepEqual(slots.find(s=>s.pool==='rare-slot').table.map(([k])=>k),['rare','exAll','secret'],'no holo in the rare slot');
assert.deepEqual(slots.find(s=>s.pool==='rcUncommon').table,[['rcUncommon',0.7],['rcUltra',0.3]]);
// Dragon Vault: five holo cards, one of which may be the scarce one
slots=bwSlots({holoPack:5,scarce:0.0413});
assert.deepEqual(slots.map(s=>[s.pool,s.count]),[['vault',4],['vault',1]]);
assert.deepEqual(slots[1].table,[['vault',0.9587],['scarce',0.0413]]);
assert.deepEqual(bwSlots({holoPack:5}),[{pool:'vault',count:5}]);
// xySlots keeps its own tests (test-xy) and bwSlots is the same builder
assert.deepEqual(bwSlots({holo:0.2,ex:0.1}),xySlots({holo:0.2,ex:0.1}));

// ---- Rips of fake sets ---------------------------------------------------------------------------
{
  const set={energyPrint:'bw',reverseRarities:['Common','Uncommon','Rare','Rare Holo'],slots:bwSlots({holo:0.22,ex:0.07,ultra:0.03,secret:0.013,aceSpec:0.04})};
  const seen=new Set();let aces=0;const N=4000;
  const all=[...base,...BASIC_ENERGY];
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,10,'a Black & White pack is ten cards');
    assert.equal(pack.filter(c=>c.energy).length,0,'no Energy card in a pack');
    assert.equal(pack.filter(c=>c.rc).length,0,'no Radiant Collection card outside Legendary Treasures');
    assert.equal(new Set(pack.map(c=>c.id)).size,10,'no duplicate in a pack');
    for(const c of pack){seen.add(c.rarity);if(c.rarity==='Rare ACE'){aces++;assert.ok(!c.reverse);}}
  }
  for(const r of ['Common','Uncommon','Rare','Rare Holo','Rare Holo EX','Rare ACE','Rare Ultra','Rare Secret']) assert.ok(seen.has(r),`a pack deals ${r}`);
  assert.ok(aces>N*0.025&&aces<N*0.06,`Ace Spec about 4 percent of packs (${aces})`);
}
{
  // Legendary Treasures
  const set={slots:bwSlots({commons:4,uncommons:2,holo:0,holoReverse:0.5,ex:0.1667,secret:0.0093,rcSlots:{uncommon:0.7,ultra:0.3}})};
  const all=[...base,...BASIC_ENERGY];
  let rcUltra=0,reverses=0,holos=0;const N=4000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,all);
    assert.equal(pack.length,10);
    assert.equal(new Set(pack.map(c=>c.id)).size,10);
    const rc=pack.filter(c=>c.rc);
    assert.equal(rc.length,2,'two Radiant Collection cards in every pack');
    assert.equal(rc.filter(c=>c.rarity==='Common').length,1,'slot B is always an RC common');
    if(rc.some(c=>c.rarity!=='Common'&&c.rarity!=='Uncommon'))rcUltra++;
    if(pack.some(c=>c.reverse))reverses++;
    if(pack.some(c=>c.rarity==='Rare Holo'))holos++;
  }
  assert.ok(rcUltra>N*0.25&&rcUltra<N*0.35,`RC ultra about 3 in 10 packs (${rcUltra/N})`);
  assert.ok(reverses>N*0.45&&reverses<N*0.55&&holos>N*0.45&&holos<N*0.55,`reverse or holo 50/50 (${reverses/N}, ${holos/N})`);
}
{
  // Dragon Vault
  const vault=[];
  for(let i=0;i<18;i++) vault.push(fake('Rare Holo',{id:`dv1-${i+1}`}));
  vault.push(fake('',{id:'dv1-21',scarce:true}));vault.push(fake('',{id:'dv1-20',supertype:'Trainer',subtypes:['Pokémon Tool']}));
  const set={slots:bwSlots({holoPack:5,scarce:0.0413})};
  let kyurem=0;const N=6000;
  for(let i=0;i<N;i++){
    const pack=ripPack(set,[...vault,...BASIC_ENERGY]);
    assert.equal(pack.length,5,'a Dragon Vault pack is five cards');
    assert.equal(new Set(pack.map(c=>c.id)).size,5);
    if(pack.some(c=>c.scarce))kyurem++;
  }
  assert.ok(kyurem>N*0.025&&kyurem<N*0.06,`the scarce card in about 4 percent of packs (${kyurem/N})`);
}

console.log('Black & White scaffold: ok');
