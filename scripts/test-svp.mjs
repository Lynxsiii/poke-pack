// SV Black Star Promos: a promo set with no boosters, whose products open other
// sets' packs. Run: node scripts/test-svp.mjs
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {BASIC_ENERGY,PLAYABLE_SETS,findOffer,getSet,offerPackSets,promoOffers} from '../js/catalog.js';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const set=getSet('svp');
assert.equal(set.id,'svp');
assert.ok(PLAYABLE_SETS.includes(set),'the SVP page is live');
assert.ok(set.promoSet&&!set.wrappers.length&&!set.slots.length,'it sells no boosters');

// Cards: every SVP promo no set's own boxes carry, each once, with its scan and price.
const cards=read(set.dataFile);
assert.equal(cards.length,set.totalCount);
assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'card ids are unique');
for(const c of cards){
  assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
  assert.match(c.printedNumber,/^SVP \d{3}$/,`${c.id} prints its SVP number`);
  assert.ok(c.market>0,`${c.id} has a market price`);
  for(const path of [c.image,c.imageSmall,c.foilMap,c.etchMap].filter(Boolean)) assert.ok(existsSync(new URL(path,root)),`${c.id}: ${path} exists`);
}
// A set's own SVP promos stay filed under that set: no number is built twice.
const numbers=new Set(cards.map(c=>c.number));
for(const file of readdirSync(new URL('data/',root)).filter(f=>f.endsWith('.json'))){
  if(file==='svp.json')continue;
  const list=read(`data/${file}`);
  if(!Array.isArray(list))continue;
  for(const c of list) assert.ok(!(c.promo&&numbers.has(c.number)),`${c.id} is already in data/svp.json`);
}
// Full-art ex promos read as Illustration Rares from TCG Live; they are Ultra Rares.
assert.equal(cards.find(c=>c.number==='svp125').foilAs,'Ultra Rare');
assert.equal(cards.find(c=>c.number==='svp056').foilAs,'Ultra Rare');

// Products: each opens its real packs by set, at TCGplayer market.
const products=read('data/products.json').svp;
const byId=Object.fromEntries([...cards,...BASIC_ENERGY].map(c=>[c.id,c]));
const offers=promoOffers(products);
assert.equal(offers.length,products.length,'every product is on sale');
for(const offer of offers){
  assert.ok(offer.price>0,`${offer.id} has a price`);
  for(const id of offer.promos) assert.ok(byId[id]?.promo,`${offer.id}: ${id} is in data/svp.json`);
  if(offer.kind==='deck'||offer.kind==='event') assert.equal(offer.packs,0,`${offer.id} holds no packs`);
  else {
    assert.ok(offer.from,`${offer.id} names the sets its packs come from`);
    assert.equal(offer.packs,Object.values(offer.from).reduce((a,b)=>a+b,0));
    for(const id of Object.keys(offer.from)) assert.match(id,/^(sv\d+(pt5)?|me\d+|swsh\d+(pt5)?)$/,`${offer.id}: ${id} is a Scarlet & Violet, Sword & Shield or Mega Evolution set`);
    if(!offer.image) assert.fail(`${offer.id} has a box photo`);
    else assert.ok(existsSync(new URL(offer.image,root)),`${offer.image} exists`);
  }
}
// A product waits for every set its packs come from.
const blocked=offers.find(offer=>offer.from&&Object.keys(offer.from).some(id=>!PLAYABLE_SETS.some(s=>s.id===id)));
if(blocked) assert.equal(offerPackSets(blocked,set),null,`${blocked.id} waits for its sets`);
const houndstone=findOffer({},products,'houndstone-ex-box');
assert.deepEqual(offerPackSets(houndstone,set).map(g=>[g.set.id,g.count]),[['sv7',2],['sv6',2]]);

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

assert.equal((await post('/api/packs/rip',{setId:'svp'})).status,400,'there is no SVP booster');
let res=await post('/api/sealed/open',{setId:'svp',product:'houndstone-ex-box'});
assert.equal(res.status,200,JSON.stringify(res.body));
assert.deepEqual(res.body.packs.map(p=>p.setId),['sv7','sv7','sv6','sv6']);
for(const pack of res.body.packs){
  assert.ok(getSet(pack.setId).wrappers.some(w=>w.id===pack.wrapperId),'each pack wears its own set\'s wrapper');
  assert.ok(pack.cards.every(c=>c.energy||c.id.startsWith(`${pack.setId}-`)),'and holds that set\'s cards');
  assert.equal(pack.cards.length,11);
}
assert.deepEqual(res.body.promos.map(c=>c.id),['svp-svp162']);
assert.equal(cents(coins()),cents(5000-houndstone.price));
assert.deepEqual(db.prepare('SELECT set_id FROM pack_log WHERE user_id=? ORDER BY id').all('test').map(r=>r.set_id),['sv7','sv7','sv6','sv6'],'each pack is logged under its own set');
assert.equal(db.prepare("SELECT qty FROM cards WHERE user_id=? AND card_id='svp-svp162'").get('test').qty,1);
if(blocked){
  res=await post('/api/sealed/open',{setId:'svp',product:blocked.id});
  assert.equal(res.status,400);
  assert.match(res.body.error,/aren't open yet/);
}
// A battle deck and an event promo are the promo alone.
res=await post('/api/sealed/open',{setId:'svp',product:'battle-deck-lucario'});
assert.equal(res.status,200);
assert.equal(res.body.packs.length,0);
assert.deepEqual(res.body.promos.map(c=>c.id),['svp-svp017']);
const before=coins();
res=await post('/api/sealed/open',{setId:'svp',product:'event-svp045'});
assert.equal(res.status,200);
assert.deepEqual(res.body.promos.map(c=>c.id),['svp-svp045']);
assert.equal(cents(before-coins()),cents(findOffer({},products,'event-svp045').price),'an event promo costs its market price');
console.log(`SVP checks passed: ${cards.length} promos with scans and prices, none built twice, ${offers.length} products at market, cross-set packs opened by the Worker and logged per set, decks and event promos.`);
