// Trainer Kit copies: from the HGSS kit on, every copy in a half deck carries its own
// number (the Bisharp deck's 11 Metal Energy are 2, 3, 5 ... 24/30), so js/card-home.js
// KIT_COPIES lists each kit card once and the deal hands out copies as counts.
// The decklists are in /mnt/project-files/kit-energies/ (2+ sources per half deck).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SET_BY_ID,dataSetsOf,homeCards} from '../js/catalog.js';
import {KIT_COPIES,dexId,dexIds,kitCopyCount,foldCopies} from '../js/card-home.js';
import {ownedMap,ownedPerSet} from '../js/titles.js';

const read=(path)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const cardsOf=(setId)=>read(`data/${setId}.json`);
const KIT_SETS=['xytk6a','xytk6b','xytk7a','xytk7b','xytk8a','xytk8b','xytk9a','xytk9b','bwtk5a','bwtk5b','hgsstk4a','hgsstk4b','dptk3a','dptk3b','extk1a','extk1b','extk2a','extk2b'];
const market=new Map(KIT_SETS.flatMap((id)=>cardsOf(id).map((card)=>[card.id,card.market||0])));

// ---- every group is one card printed under several numbers ----------------------------------------
for(const [setId,groups] of Object.entries(KIT_COPIES)) {
  const byNumber=new Map(cardsOf(setId).map((card)=>[Number(card.number),card]));
  assert.equal(byNumber.size,30,`${setId} has 30 numbers`);
  const seen=new Set();
  for(const group of groups) {
    assert.ok(group.length>1,`${setId} group ${group} holds copies`);
    assert.deepEqual(group,[...group].sort((a,b)=>a-b),`${setId} group ${group} runs low to high (the lowest number is the card)`);
    assert.ok(!group.includes(30),`${setId}: the holo #30 is its own card`);
    const [first,...rest]=group.map((n)=>byNumber.get(n));
    for(const card of rest) {
      assert.ok(!seen.has(card.number),`${setId} #${card.number} in one group only`);
      for(const key of ['name','supertype','hp','artist']) assert.deepEqual(card[key],first[key],`${card.id} ${key} matches ${first.id}`);
      assert.deepEqual(card.types||[],first.types||[],`${card.id} types match ${first.id}`);
      assert.deepEqual((card.attacks||[]).map((a)=>a.name.trim()),(first.attacks||[]).map((a)=>a.name.trim()),`${card.id} attacks match ${first.id}`);
      assert.equal(dexId(card.id),first.id);
      seen.add(card.number);
    }
    assert.deepEqual(dexIds(first.id),group.map((n)=>`${setId}-${n}`));
  }
  // No two cards left in the dex share a name and look: every real copy is in a group.
  const left=[...byNumber.values()].filter((card)=>dexId(card.id)===card.id&&Number(card.number)!==30);
  const looks=left.map((card)=>JSON.stringify([card.name,card.hp||'',(card.attacks||[]).map((a)=>a.name.trim()),card.artist]));
  assert.equal(new Set(looks).size,looks.length,`${setId}: a copy is missing from KIT_COPIES`);
}

// ---- a kit's dex lists each card once, and its total says so ---------------------------------------
for(const setId of KIT_SETS) {
  const set=SET_BY_ID[setId];
  assert.ok(set,`${setId} is a set`);
  const lists=dataSetsOf(set).map((data)=>cardsOf(data.id));
  const dex=homeCards(set,lists);
  assert.equal(dex.length,set.totalCount,`${setId}: ${dex.length} cards in the dex, totalCount ${set.totalCount}`);
  assert.ok(dex.every((card)=>dexId(card.id)===card.id),`${setId}: no copy in the dex`);
  if(KIT_COPIES[setId]) assert.equal(set.totalCount,30-kitCopyCount(setId));
}
assert.equal(SET_BY_ID['xytk7a'].totalCount,14,'Bisharp: 30 cards, 16 of them copies');
assert.equal(kitCopyCount('xytk7a'),16);

// ---- the deal: both 30-card decks, copies as counts of the one card --------------------------------
const box=read('data/box-contents.json');
const products=read('data/products.json');
for(const setId of KIT_SETS) {
  const product=products[setId][0];
  const row=box[`${setId}/${product.id}`];
  assert.ok(row,`${setId} has a deal`);
  assert.equal(row.label,'2 × 30-card half deck');
  const dealt=row.cards.reduce((n,[,count])=>n+count,0);
  assert.equal(dealt+product.promos.length,60,`${setId}: ${dealt} cards plus the promo`);
  for(const [id,count] of row.cards) {
    assert.equal(dexId(id),id,`${setId} deals ${id}, a copy`);
    assert.ok(Number.isInteger(count)&&count>0);
  }
  assert.equal(new Set(row.cards.map(([id])=>id)).size,row.cards.length,`${setId}: one row per card`);
  if(product.priceDerived==='manual') {
    const sum=row.cards.reduce((n,[id,count])=>n+(market.get(id)||0)*count,0)+product.promos.reduce((n,id)=>n+(market.get(id)||0),0);
    assert.equal(product.price,Math.round(sum*100)/100,`${setId}: priced at the 60 cards it deals`);
  }
}
// The real Bisharp deck: 11 Metal Energy and 2 Pawniard.
const bisharp=new Map(box['xytk7a/xy-trainer-kit-bisharp-wigglytuff'].cards);
assert.equal(bisharp.get('xytk7a-2'),11);
assert.equal(bisharp.get('xytk7a-13'),2);
// DP and EX kits print each card once, so their counts come from the decklists.
assert.equal(new Map(box['extk1a/ex-trainer-kit-latias-latios'].cards).get('extk1a-10'),12,'12 Fire Energy, all 10/10');
assert.equal(new Map(box['dptk3a/dp-trainer-kit-manaphy-lucario'].cards).get('dptk3a-12'),12);

// ---- an old save that holds copy ids still counts each card once ------------------------------------
const save={collection:{'xytk7a-2':1,'xytk7a-3':2,'xytk7a-24':1,'xytk7a-13':1,'xytk7a-30':1},slabs:[]};
assert.deepEqual(foldCopies(save.collection),{'xytk7a-2':4,'xytk7a-13':1,'xytk7a-30':1});
assert.deepEqual(ownedMap(save),{'xytk7a-2':4,'xytk7a-13':1,'xytk7a-30':1});
assert.equal(ownedPerSet(save.collection).get('xytk7a'),3,'Metal Energy, Pawniard and the holo Bisharp');
assert.equal(dexId('base1-4'),'base1-4','any other card is itself');
assert.deepEqual(dexIds('base1-4'),['base1-4']);

console.log('kit copies ok');
