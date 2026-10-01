import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {boxCardList} from '../js/catalog.js';
// Same in-memory D1 stand-in as test-sealed.mjs.
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
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',100000,100000,now,'[]');
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',cookie:'pp_sid=local-test-session'},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}

// The table: every row names a real product and real cards.
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const box=read('box-contents.json');
const products=read('products.json');
const sealed=read('sealed.json');
const cardIds=new Set();
for(const file of readdirSync(new URL('../data/',import.meta.url))){
  if(!file.endsWith('.json')||['products.json','sealed.json','pullrates.json','patch-notes.json','box-contents.json'].includes(file))continue;
  const rows=read(file);
  if(Array.isArray(rows))for(const row of rows)if(row?.id)cardIds.add(row.id);
}
for(const type of ['grass','fire','water','lightning','psychic','fighting','darkness','metal'])
  for(const suffix of ['','-tera','-unova','-swsh','-mee','-sm17','-sm19','-xy','-bw'])cardIds.add(`energy-${type}${suffix}`);
cardIds.add('energy-fairy-xy');
const offers=new Map();
for(const [setId,rows] of Object.entries(products)){if(setId.startsWith('_'))continue;for(const row of rows)offers.set(`${setId}/${row.id}`,row);}
for(const [setId,prices] of Object.entries(sealed))for(const id of ['boosterBox','eliteTrainerBox','boosterBundle'])if(prices?.[id]>0&&!offers.has(`${setId}/${id}`))offers.set(`${setId}/${id}`,{promos:[]});
assert.ok(Object.keys(box).length>50,'the table has its rows');
const ids=list=>list.flatMap(([id])=>Array.isArray(id)?id:[id]);
for(const [key,entry] of Object.entries(box)){
  assert.ok(offers.has(key),`${key} is a product the site sells`);
  assert.ok(entry.label,`${key} has a shop label`);
  const used=[...ids(entry.cards||[]),...(entry.variants||[]).flatMap(v=>ids(v.cards)),
    ...Object.values(entry.recipe?.groups||{}).flatMap(g=>ids(g.cards)),...ids(entry.recipe?.fixed||[]),
    ...(entry.recipe?.trainers?.pool||[]).map(([id])=>id)];
  for(const id of used)assert.ok(cardIds.has(id),`${key}: ${id} is a card the site has`);
  for(const v of entry.variants||[])for(const promo of v.promos)assert.ok((offers.get(key).promos||[]).includes(promo),`${key}: ${promo} is one of its promos`);
  for(const promo of Object.keys(entry.recipe?.groups||{}))assert.ok((offers.get(key).promos||[]).includes(promo),`${key}: ${promo} is one of its promos`);
}

// The deal: a Build & Battle Box always comes to its full deck, the promo counted in.
let dealt=0;
for(const [key,entry] of Object.entries(box)){
  if(entry.recipe){
    for(const promo of Object.keys(entry.recipe.groups))for(let i=0;i<200;i++){
      const list=boxCardList(entry,[promo]);
      const size=list.reduce((sum,row)=>sum+row.n,0)+1;
      assert.equal(size,entry.recipe.total,`${key} ${promo}: dealt ${size}`);
      assert.ok(list.every(row=>row.n>0&&cardIds.has(row.id)));
      dealt+=1;
    }
  }else if(entry.spread){
    const list=boxCardList(entry,[]);
    assert.equal(list.reduce((sum,row)=>sum+row.n,0),entry.spread.total,`${key}: Energy adds up`);
    assert.ok(list.every(row=>cardIds.has(row.id)));
  }
}
assert.ok(dealt>0,'random decks were dealt');
// A variant follows its promo; without the promo nothing of it is dealt.
const variantKey=Object.keys(box).find(key=>box[key].variants?.length>1);
if(variantKey){
  const [a,b]=box[variantKey].variants;
  const first=boxCardList(box[variantKey],a.promos);
  const second=boxCardList(box[variantKey],b.promos);
  assert.notDeepEqual(first,second,`${variantKey}: each promo has its own deck`);
  assert.deepEqual(boxCardList(box[variantKey],[]),[]);
}

// Opening: the cards land in the collection in their copies, never as pulls.
const profile=()=>db.prepare('SELECT coins,packs_opened,pulls FROM profiles WHERE user_id=?').get('test');
const owned=id=>db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test',id)?.qty||0;
const key=Object.keys(box).find(k=>box[k].recipe&&k.startsWith('sv'))||Object.keys(box).find(k=>box[k].recipe);
const [setId,product]=key.split('/');
let before=profile();
let response=await request('/api/sealed/open','POST',{setId,product});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.ok(response.body.boxCards.length>10,'a deck came out');
const deck=response.body.boxCards;
const total=deck.reduce((sum,card)=>sum+card.n,0)+response.body.promos.length;
assert.equal(total,box[key].recipe.total,'the deck is its full size with the promo');
const pulledIn=response=>{const c={};for(const card of [...response.body.promos,...response.body.packs.flatMap(p=>p.cards)])c[card.id]=(c[card.id]||0)+1;return c;};
const pulled1=pulledIn(response);
for(const card of deck){
  assert.equal(owned(card.id),card.n+(pulled1[card.id]||0),`${card.id} is owned in ${card.n} copies, plus what the packs gave`);
  assert.ok(card.wasNew,'the first box makes every card new');
  assert.ok(card.name&&card.image,'a card the opening can draw');
}
const packs=response.body.packs.length;
assert.equal(profile().packs_opened,before.packs_opened+packs,'deck cards are not packs');
assert.equal(profile().pulls,before.pulls+response.body.packs.flatMap(pack=>pack.cards).length+response.body.promos.length,'deck cards are not pulls');
assert.equal(response.body.cost,offers.get(key).price,'one charge, the market price');
// A second box adds to the copies, and only cards not owned before are new.
const owned1={};for(const row of db.prepare('SELECT card_id,qty FROM cards WHERE user_id=?').all('test'))owned1[row.card_id]=row.qty;
response=await request('/api/sealed/open','POST',{setId,product});
const pulled2=pulledIn(response);
for(const card of response.body.boxCards){
  assert.equal(owned(card.id),(owned1[card.id]||0)+card.n+(pulled2[card.id]||0));
  assert.equal(card.wasNew,!owned1[card.id],`${card.id}: new only when it was not owned before`);
}
// Sun & Moon: an ETB holds 5 of each basic Energy in the set's own print (the nine-type box's Fairy is not on the site),
// and a premium collection its reprinted cards.
for(const [product,print] of [['sm10/elite-trainer-box','sm19'],['sm11/elite-trainer-box','sm19']]) {
  const [sm,id]=product.split('/');
  assert.deepEqual(box[product]?.spread,{total:40,print},`${product} deals 40 Energy in the ${print} print`);
  response=await request('/api/sealed/open','POST',{setId:sm,product:id});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.boxCards.length,8,'one row per basic Energy type');
  for(const card of response.body.boxCards){
    assert.equal(card.n,5);
    assert.ok(card.id.endsWith('-'+print)&&card.id.startsWith('energy-'),`${card.id} is ${print} Energy`);
    assert.ok(card.image&&card.name,'an Energy card the opening can draw');
  }
}
response=await request('/api/sealed/open','POST',{setId:'sm10',product:'blastoise-gx-premium-collection'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.deepEqual(response.body.boxCards.map(card=>card.id).sort(),['sm10-33','sm10-34']);
// A product with no list still opens as before.
response=await request('/api/sealed/open','POST',{setId:'me5',product:'boosterBundle'});
assert.equal(response.status,200);
assert.deepEqual(response.body.boxCards,[]);
console.log('Box contents checks passed: every row names real cards and a real product, decks deal to their full size, and opening adds the cards in their copies without counting them as pulls or packs.');
