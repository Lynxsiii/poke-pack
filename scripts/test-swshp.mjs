// SWSH Black Star Promos: a promo set with no boosters, whose products open other
// sets' packs. Run: node scripts/test-swshp.mjs
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {BASIC_ENERGY,PLAYABLE_SETS,findOffer,getSet,offerPackSets,promoOffers} from '../js/catalog.js';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const set=getSet('swshp');
assert.equal(set.id,'swshp');
assert.ok(PLAYABLE_SETS.includes(set),'the SVP page is live');
assert.ok(set.promoSet&&!set.wrappers.length&&!set.slots.length,'it sells no boosters');

// Cards: every SVP promo no set's own boxes carry, each once, with its scan and price.
const cards=read(set.dataFile);
assert.equal(cards.length,set.totalCount);
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'card ids are unique');
for(const c of cards){
  assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
  assert.match(c.printedNumber,/^SWSH \d{3}$/,`${c.id} prints its SWSH number`);
  assert.ok(c.market>0,`${c.id} has a market price`);
  for(const path of [c.image,c.imageSmall,c.foilMap,c.etchMap].filter(Boolean)) assert.ok(existsSync(new URL(path,root)),`${c.id}: ${path} exists`);
}
// A set's own SVP promos stay filed under that set: no number is built twice.
const numbers=new Set(cards.map(c=>c.number));
for(const file of readdirSync(new URL('data/',root)).filter(f=>f.endsWith('.json'))){
  if(file==='swshp.json')continue;
  const list=read(`data/${file}`);
  if(!Array.isArray(list))continue;
  for(const c of list) assert.ok(!(c.promo&&numbers.has(c.number)),`${c.id} is already in data/swshp.json`);
}

// Products: each opens its real packs by set, at TCGplayer market.
const products=read('data/products.json').swshp;
const byId=Object.fromEntries([...cards,...BASIC_ENERGY].map(c=>[c.id,c]));
const offers=promoOffers(products);
assert.equal(offers.length,products.length,'every product is on sale');
for(const offer of offers){
  assert.ok(offer.price>0,`${offer.id} has a price`);
  for(const id of offer.promos) assert.ok(byId[id]?.promo,`${offer.id}: ${id} is in data/swshp.json`);
  if(!offer.packs) assert.equal(offer.from,undefined,`${offer.id} holds no packs`);
  else {
    assert.ok(offer.from,`${offer.id} names the sets its packs come from`);
    assert.equal(offer.packs,Object.values(offer.from).reduce((a,b)=>a+b,0));
    for(const id of Object.keys(offer.from)) assert.match(id,/^(sv\d+(pt5)?|swsh\d+(pt5)?|cel25|pgo)$/,`${offer.id}: ${id} is a Scarlet & Violet, Sword & Shield or Mega Evolution set`);
    if(!offer.image) assert.fail(`${offer.id} has a box photo`);
    else assert.ok(existsSync(new URL(offer.image,root)),`${offer.image} exists`);
  }
}
// A product waits for every set its packs come from.
const blocked=offers.find(offer=>offer.from&&Object.keys(offer.from).some(id=>!PLAYABLE_SETS.some(s=>s.id===id)));
if(blocked) assert.equal(offerPackSets(blocked,set),null,`${blocked.id} waits for its sets`);
const zeraora=findOffer({},products,'zeraora-vmax-vstar-battle-box');
assert.deepEqual(offerPackSets(zeraora,set).map(g=>[g.set.id,g.count]),[['swsh11',2],['swsh10',1],['swsh9',1]]);

// The Worker opens it: other sets' packs, this set's promo, one charge.
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql){let params=[];const statement={
    bind(...values){assert.ok(values.length<=100);params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r||null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('test','Promo Tester','promotester','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('s','test',now,now+3600000);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',5000,5000,now,'[]');
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
const post=async(path,body)=>{
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method:'POST',headers:{'content-type':'application/json',origin:'https://poke-pack.rip',cookie:'pp_sid=s'},body:JSON.stringify(body)}),env);
  return {status:res.status,body:await res.json()};
};
const coins=()=>db.prepare('SELECT coins FROM profiles WHERE user_id=?').get('test').coins;
const cents=n=>Math.round(n*100);

assert.equal((await post('/api/packs/rip',{setId:'swshp'})).status,400,'there is no SWSH promo booster');
let res=await post('/api/sealed/open',{setId:'swshp',product:'zeraora-vmax-vstar-battle-box'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.deepEqual(res.body.packs.map(p=>p.setId),['swsh11','swsh11','swsh10','swsh9']);
for(const pack of res.body.packs){
  assert.ok(getSet(pack.setId).wrappers.some(w=>w.id===pack.wrapperId),'each pack wears its own set\'s wrapper');
  assert.ok(pack.cards.every(c=>c.energy||c.id.startsWith(`${pack.setId}-`)),'and holds that set\'s cards');
  assert.equal(pack.cards.length,11);
}
assert.deepEqual(res.body.promos.map(c=>c.id),['swshp-swshp263','swshp-swshp264','swshp-swshp265']);
assert.equal(cents(coins()),cents(5000-zeraora.price));
assert.deepEqual(db.prepare('SELECT set_id FROM pack_log WHERE user_id=? ORDER BY id').all('test').map(r=>r.set_id),['swsh11','swsh11','swsh10','swsh9'],'each pack is logged under its own set');
assert.equal(db.prepare("SELECT qty FROM cards WHERE user_id=? AND card_id='swshp-swshp263'").get('test').qty,1);
if(blocked){
  res=await post('/api/sealed/open',{setId:'swshp',product:blocked.id});
  assert.equal(res.status,400);
  assert.match(res.body.error,/aren't open yet/);
}
// A battle deck is the promo alone.
res=await post('/api/sealed/open',{setId:'swshp',product:'victini-v-battle-deck'});
assert.equal(res.status,200);
assert.equal(res.body.packs.length,0);
assert.deepEqual(res.body.promos.map(c=>c.id),['swshp-swshp104']);
console.log(`SWSH promo checks passed: ${cards.length} promos with scans and prices, none built twice, ${offers.length} products at market, cross-set packs opened by the Worker and logged per set, decks.`);
