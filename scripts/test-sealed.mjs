import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {sealedOffers} from '../js/catalog.js';
// Same in-memory D1 stand-in as test-profile-pages.mjs.
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){assert.ok(values.length<=100,'D1 allows at most 100 bound parameters');params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('test','Box Tester','boxtester','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('local-test-session','test',now,now+3600000);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',25,25,now,'[]');
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,signed=true) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(signed?{cookie:'pp_sid=local-test-session'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
const sealed=JSON.parse(readFileSync(new URL('../data/sealed.json',import.meta.url),'utf8'));
const profile=()=>db.prepare('SELECT coins,packs_opened,pulls,packs_since_hit FROM profiles WHERE user_id=?').get('test');
const cents=n=>Math.round(n*100);

// Offers follow sealed.json: special sets never had a booster box.
assert.deepEqual(sealedOffers(sealed.me5).map(o=>[o.id,o.packs]),[['boosterBox',36],['eliteTrainerBox',9],['boosterBundle',6]]);
assert.deepEqual(sealedOffers(sealed.me2pt5).map(o=>o.id),['eliteTrainerBox','boosterBundle']);

assert.equal((await request('/api/sealed/open','POST',{setId:'me5',product:'boosterBox'},false)).status,401);
assert.equal((await request('/api/sealed/open','POST',{setId:'sv0',product:'eliteTrainerBox'})).body.error,'Unknown set.','sets that are not open stay closed');
assert.equal((await request('/api/sealed/open','POST',{setId:'me2pt5',product:'boosterBox'})).status,400);
assert.equal((await request('/api/sealed/open','POST',{setId:'me5',product:'pcEliteTrainerBox'})).status,400);
let response=await request('/api/sealed/open','POST',{setId:'me5',product:'boosterBox'});
assert.equal(response.status,400);
assert.equal(response.body.error,'Not enough coins.');
assert.equal(profile().coins,25);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n,0,'a refused purchase adds nothing');

db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(1000,'test');
response=await request('/api/sealed/open','POST',{setId:'me5',product:'boosterBox'});
assert.equal(response.status,200,JSON.stringify(response.body));
const box=response.body;
assert.equal(box.packs.length,36);
assert.equal(box.cost,sealed.me5.boosterBox);
assert.equal(cents(profile().coins),cents(1000-sealed.me5.boosterBox));
assert.equal(profile().packs_opened,36);
const pulled=box.packs.flatMap(pack=>pack.cards);
assert.equal(profile().pulls,pulled.length);
assert.ok(box.packs.every(pack=>pack.cards.length>=10));
const wrappers=new Set(box.packs.map(pack=>pack.wrapperId));
assert.ok(wrappers.size>1,'a box mixes wrapper art');
// Every pulled copy is owned, and only the first copy of each card is new.
const counts={};for(const card of pulled)counts[card.id]=(counts[card.id]||0)+1;
for(const [id,n] of Object.entries(counts)) assert.equal(db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test',id).qty,n);
const seen=new Set();
for(const card of pulled){assert.equal(card.wasNew,!seen.has(card.id));seen.add(card.id);}
// Each pack is logged on its own and the shares add back to the price.
const logged=db.prepare('SELECT cost FROM pack_log WHERE user_id=?').all('test');
assert.equal(logged.length,36);
assert.equal(logged.reduce((sum,row)=>sum+cents(row.cost),0),cents(sealed.me5.boosterBox));
assert.ok(db.prepare('SELECT COUNT(*) AS n FROM history WHERE user_id=?').get('test').n<=24);
assert.equal(box.save.quests.progress['daily-five'],36);
assert.equal(box.save.quests.progress['weekly-packs'],36);
// packs_since_hit counts the dry packs after the box's last hit.
const lastHit=box.packs.findLastIndex(pack=>pack.cards.some(card=>!card.reverse&&['Double Rare','Ultra Rare','Illustration Rare','Special Illustration Rare','Mega Hyper Rare'].includes(card.rarity)));
assert.equal(profile().packs_since_hit,lastHit<0?36:35-lastHit);

// A second product and a single pack still work alongside it.
const before=profile().coins;
response=await request('/api/sealed/open','POST',{setId:'me2pt5',product:'eliteTrainerBox'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.packs.length,9);
assert.equal(cents(profile().coins),cents(before-sealed.me2pt5.eliteTrainerBox));
response=await request('/api/packs/rip','POST',{setId:'me5'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.cost,sealed.me5.boosterPack);
assert.equal(profile().packs_opened,36+9+1);

// Promo products: the promos come with the packs, are owned, and are not packs.
const products=JSON.parse(readFileSync(new URL('../data/products.json',import.meta.url),'utf8'));
const upc=products.me55.find(item=>item.id==='upc-night');
db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(5000,'test');
let packsBefore=profile().packs_opened;
response=await request('/api/sealed/open','POST',{setId:'me55',product:'upc-night'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.deepEqual(response.body.promos.map(card=>card.id),['me55-mep109','me55-mep110']);
assert.ok(response.body.promos.every(card=>card.wasNew&&card.rarity==='Promo'));
assert.equal(response.body.packs.length,30,'29 boosters and the Classic Collection pack');
const classicPack=response.body.packs.find(pack=>pack.wrapperId==='classic');
assert.ok(classicPack&&classicPack.cards.length===3&&classicPack.cards.every(card=>card.rarity==='Classic Collection'));
assert.ok(response.body.packs.flatMap(pack=>pack.cards).every(card=>!card.promo),'no promo comes out of a pack');
// It costs its market price, even though its promos sell for more right now.
assert.equal(response.body.cost,upc.price);
assert.equal(cents(profile().coins),cents(5000-response.body.cost));
assert.equal(profile().packs_opened,packsBefore+30);
assert.equal(db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test','me55-mep109').qty,1);
// The ETB comes with its promo, at market; a battle deck is a promo and no packs.
response=await request('/api/sealed/open','POST',{setId:'me55',product:'eliteTrainerBox'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.cost,sealed.me55.eliteTrainerBox);
assert.deepEqual(response.body.promos.map(card=>card.id),['me55-mep101']);
packsBefore=profile().packs_opened;
const logBefore=db.prepare('SELECT COUNT(*) AS n FROM pack_log WHERE user_id=?').get('test').n;
response=await request('/api/sealed/open','POST',{setId:'me55',product:'deck-espeon'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.packs.length,0);
assert.deepEqual(response.body.promos.map(card=>card.id),['me55-mep102']);
assert.equal(profile().packs_opened,packsBefore,'a deck is not a pack');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pack_log WHERE user_id=?').get('test').n,logBefore);
assert.equal((await request('/api/sealed/open','POST',{setId:'me5',product:'upc-night'})).status,400,'products belong to their set');
console.log('Sealed product checks passed: offers per set, authentication, retired and unsold products, refusal without coins, one charge per box, per-pack logging, ownership, new flags, quests, single packs, and promo products with their promos and special packs.');
