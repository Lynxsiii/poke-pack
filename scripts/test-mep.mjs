// ME Black Star Promos: a promo set whose cards sit in the Mega Evolution sets' files
// (ids like "me5-mep055" stay, so saves and product lists keep working) but are listed,
// counted and sold under "mep", never under the set whose box carries them.
// Run: node scripts/test-mep.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {PLAYABLE_SETS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers,sealedOffers} from '../js/catalog.js';
import {homeSetId,inHomeSet,isMepCardId} from '../js/card-home.js';
import {ownedPerSet,setPercents} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rule --------------------------------------------------------------------------------
for(const id of ['me1-mep001','me1-mep009-pc','me2pt5-mep031','me2pt5-mep031-pc','me4-mep080-pc','me5-mep055','me55-mep107'])
  assert.ok(isMepCardId(id)&&homeSetId(id)==='mep',`${id} is an ME black star promo`);
for(const id of ['me5-12','me5-12-stamp','me5-asc097-cosmos','me3-meg010-cosmos','me55-116-blister','svp-svp056','sv4-mep1','energy-fire','me55','mep-mep001x'])
  assert.ok(!isMepCardId(id),`${id} is not`);
assert.equal(homeSetId('me5-12'),'me5');
assert.equal(homeSetId('me2pt5-123'),'me2pt5');
assert.equal(homeSetId('energy-fire'),'energy');
assert.ok(inHomeSet('me5-mep055','mep')&&!inHomeSet('me5-mep055','me5'));

// ---- The set ------------------------------------------------------------------------------------
const mep=getSet('mep');
assert.equal(mep.id,'mep');
assert.ok(PLAYABLE_SETS.includes(mep),'the page is live');
assert.ok(mep.promoSet&&!mep.wrappers.length&&!mep.slots.length&&mep.packSize===0,'it sells no boosters');
assert.ok(hasCardData(mep)&&!mep.dataFile,'its cards come from other sets\' files');
assert.deepEqual(dataSetsOf(mep).map(s=>s.id),mep.viewOf);
for(const path of ['assets/cards/sets/mep-logo.webp','assets/cards/sets/mep-symbol.webp']) assert.ok(existsSync(new URL(path,root)),`${path} exists`);

// Every ME black star promo, each once, with its scan, in promo-number order.
const files=Object.fromEntries(mep.viewOf.map(id=>[id,read(getSet(id).dataFile)]));
const promos=homeCards(mep,Object.values(files));
assert.equal(promos.length,mep.totalCount,'totalCount is every ME black star promo in the Mega Evolution files');
assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
for(const c of promos){
  assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
  assert.match(c.printedNumber,/^MEP \d{3}$/,`${c.id} prints its MEP number`);
  assert.ok(existsSync(new URL(c.image,root)),`${c.id} has its scan`);
}
const order=promos.map(c=>Number(/^mep(\d+)/.exec(c.number)[1]));
assert.deepEqual(order,[...order].sort((a,b)=>a-b),'listed in promo-number order');
assert.ok(promos.findIndex(c=>c.id==='me1-mep009')+1===promos.findIndex(c=>c.id==='me1-mep009-pc'),'a Pokémon Center print sits right after its plain card');
for(const id of mep.heroIds) assert.ok(promos.some(c=>c.id===id),`${id} is a promo`);
// No ME black star promo is left on any set's dex, and each set's total is its own cards.
for(const [setId,list] of Object.entries(files)){
  const set=getSet(setId);
  const own=homeCards(set,[list]);
  assert.ok(own.every(c=>!isMepCardId(c.id)),`${setId}: no MEP promo in its dex`);
  assert.equal(own.length,set.totalCount,`${setId}: totalCount is its own ${own.length} cards (the stamped and cosmos box promos stay)`);
  assert.ok(list.every(c=>homeSetId(c.id)===(isMepCardId(c.id)?'mep':setId)),`${setId}: every id belongs to a set`);
}
// A card is on one dex only.
const seen=new Map();
for(const set of PLAYABLE_SETS){
  if(!hasCardData(set)) continue;
  for(const c of homeCards(set,dataSetsOf(set).map(s=>read(s.dataFile??`data/${s.id}.json`)))){
    if(seen.has(c.id)) assert.fail(`${c.id} is on both ${seen.get(c.id)} and ${set.id}`);
    seen.set(c.id,set.id);
  }
}
// Product lists keep the old ids and the boxes stay on the sets that sell them.
const products=read('data/products.json');
let boxed=0;
for(const [setId,list] of Object.entries(products)){
  if(setId.startsWith('_')) continue;
  for(const offer of promoOffers(list)) for(const id of offer.promos) if(isMepCardId(id)){
    boxed++;
    assert.ok(files[setId]?.some(c=>c.id===id),`${setId}/${offer.id}: ${id} is in data/${setId}.json`);
  }
}
assert.ok(boxed>=40,`${boxed} box promos name an ME black star promo`);
assert.ok(!('mep' in products),'the MEP page has no products of its own');

// ---- Counting -----------------------------------------------------------------------------------
const owned={'me5-12':1,'me5-mep055':2,'me5-mep056':1,'me1-mep009':1,'me1-mep009-pc':1,'me55-mep107':1,'me55-1':1};
const per=ownedPerSet(owned);
assert.equal(per.get('me5'),1,'Pitch Black counts its own card only');
assert.equal(per.get('mep'),5,'the five promos count under MEP');
assert.equal(per.get('me1')??0,0);
assert.equal(per.get('me55'),1);
const pct=Object.fromEntries(PLAYABLE_SETS.map((set,i)=>[set.id,setPercents(owned)[i]]));
assert.equal(pct.mep,Math.floor(5/mep.totalCount*100));
const ctx=achievementContext({collection:owned},{cards:Object.keys(owned).map(id=>({id,name:'x',rarity:'Promo'}))});
assert.equal(ctx.setOwned('mep'),5);
assert.equal(ctx.setOwned('me5'),1);
assert.equal(ctx.setTotal('mep'),mep.totalCount);
assert.ok(ctx.promoOwned>=5,'a promo set counts as black star promos');

// ---- The Worker ---------------------------------------------------------------------------------
const {db,env}=createTestDb();
const session=seedPlayer(db,{coins:1000});
const request=requester(worker,env,session);
const give=(id,qty,rev=0)=>db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test',id,qty,rev);
give('me5-12',3);give('me5-mep055',3);give('me5-mep056',1);give('me1-mep009',2);give('me1-mep009-pc',1);give('me55-mep107',2);
let res=await request('/api/me');
assert.equal(res.status,200);
for(const [id,qty] of [['me5-12',3],['me5-mep055',3],['me5-mep056',1],['me1-mep009',2],['me1-mep009-pc',1],['me55-mep107',2]])
  assert.equal(res.body.save.collection[id],qty,`${id} keeps its count`);

// Pitch Black sells its own spares and leaves the promos alone.
const coins=()=>db.prepare('SELECT coins FROM profiles WHERE user_id=?').get('test').coins;
const qty=id=>db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test',id)?.qty;
res=await request('/api/cards/sell-duplicates','POST',{setId:'me5'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.equal(res.body.copies,2,'two spare Pitch Black copies');
assert.equal(qty('me5-12'),1);
assert.equal(qty('me5-mep055'),3,'a promo is not sold with Pitch Black');
assert.equal(qty('me1-mep009'),2);
res=await request('/api/cards/sell-duplicates','POST',{setId:'me1'});
assert.equal(res.status,400,'Mega Evolution has no spare of its own');
assert.equal(qty('me1-mep009'),2);

// ME Black Star Promos sells the promos' spares, whichever set's file holds them.
const before=coins();
res=await request('/api/cards/sell-duplicates','POST',{setId:'mep'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.equal(res.body.copies,2+1+1,'spares: mep055 x2, mep009 x1, mep107 x1');
assert.ok(coins()>before);
for(const id of ['me5-mep055','me1-mep009','me55-mep107']) assert.equal(qty(id),1,`${id} keeps one copy`);
assert.equal(qty('me5-mep056'),1);
assert.equal(qty('me1-mep009-pc'),1);
assert.equal(qty('me5-12'),1);
assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'mep'})).status,400,'nothing left to sell');

// Selling and showing a promo by its old id still works.
res=await request('/api/cards/sell','POST',{cardId:'me5-mep055'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.equal(qty('me5-mep055'),undefined);

// A Pitch Black box still deals its promo, filed under the old id and owned by the player.
db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(1000,'test');
const sealed=read('data/sealed.json');
const etb=sealedOffers(sealed.me5,products.me5).find(o=>o.id==='eliteTrainerBox');
res=await request('/api/sealed/open','POST',{setId:'me5',product:'eliteTrainerBox'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.deepEqual(res.body.promos.map(c=>c.id),['me5-mep088']);
assert.equal(qty('me5-mep088'),1,'the promo lands in the collection');
assert.equal(etb.promos.length,1);

console.log(`MEP checks passed: ${promos.length} promos filed under ${mep.viewOf.length} Mega Evolution files, none on a Mega Evolution dex, totals match, counts and sales follow the promo set, ${boxed} box promos still deal.`);
