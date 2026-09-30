import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import worker from '../worker/index.js';
import {productGear,rollGear,normalizeGear,equippedCoin,equippedSleeve,HOUSE_COIN} from '../js/gear.js';
// Sleeves and coins: catalog integrity, grants on opening, equip rules, reset. Same in-memory D1 stand-in as test-sealed.mjs.
const catalog=JSON.parse(readFileSync(new URL('../data/gear.json',import.meta.url),'utf8'));
const products=JSON.parse(readFileSync(new URL('../data/products.json',import.meta.url),'utf8'));
const sealed=JSON.parse(readFileSync(new URL('../data/sealed.json',import.meta.url),'utf8'));

// --- Catalog integrity: every reference resolves, every file exists, ids never repeat.
const files=p=>existsSync(new URL('../'+p,import.meta.url));
for(const [id,item] of Object.entries(catalog.sleeves)) {
  assert.equal(item.id,id);assert.ok(files(item.art),`${id} art ${item.art}`);assert.match(item.art,/-v\d+\.webp$/,`${id}: assets are versioned`);
}
for(const [id,item] of Object.entries(catalog.coins)) {
  assert.equal(item.id,id);assert.ok(files(item.front),`${id} art ${item.front}`);assert.match(item.front,/-v\d+\.webp$/,`${id}: assets are versioned`);
}
let rows=0;
for(const [key,row] of Object.entries(catalog.products)) {
  const [setId,productId]=key.split('/');
  const offer=(products[setId]||[]).some(p=>p.id===productId)||(sealed[setId]&&productId in sealed[setId]);
  assert.ok(offer,`${key} is not a product the site sells`);
  for(const id of row.sleeves||[]) assert.ok(catalog.sleeves[id],`${key} sleeve ${id}`);
  for(const id of row.coins||[]) assert.ok(catalog.coins[id],`${key} coin ${id}`);
  assert.ok((row.sleeves||[]).length+(row.coins||[]).length>0,`${key} holds nothing`);
  rows++;
}
assert.ok(rows>0);
for(const item of [...Object.values(catalog.sleeves),...Object.values(catalog.coins)]) {
  for(const key of item.from||[]) assert.ok(catalog.products[key],`${item.id} says it comes from ${key}`);
}

// --- Shared rules.
assert.deepEqual(rollGear(null),[]);
assert.equal(equippedCoin(normalizeGear(null),catalog).id,HOUSE_COIN.id,'no coin equipped means the house coin');
assert.equal(equippedSleeve(normalizeGear({sleeves:{},equipped:{sleeve:'x'}}),catalog),null,'an equipped sleeve you no longer hold does not show');
const seq=[0.99,0,0.5];let n=0;
const picked=rollGear({sleeves:[],coins:['a','b','c'],pick:{coins:1}},()=>seq[n++%3]);
assert.equal(picked.length,1,'pick 1 of 3 hands out one');

// --- API.
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
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
for(const [id,session] of [['test','local-test-session'],['other','other-session']]) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,id+' tester',id+'tester','unused','gold',now,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(session,id,now,now+3600000);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id,1000000,1000000,now,'[]');
}
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,session='local-test-session') {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(session?{cookie:'pp_sid='+session}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
assert.equal((await request('/api/gear','GET',null,null)).status,401);
assert.equal((await request('/api/gear/equip','POST',{kind:'coin',id:null},null)).status,401);
let r=await request('/api/gear');
assert.equal(r.status,200);
assert.deepEqual(r.body.gear,{sleeves:{},coins:{},equipped:{sleeve:null,coin:null},recent:[]});
assert.deepEqual((await request('/api/me')).body.save.gear,r.body.gear,'the save carries gear');

// Pick a product that hands out both a sleeve and a coin (else any).
const keys=Object.keys(catalog.products);
const both=keys.find(k=>catalog.products[k].sleeves?.length&&catalog.products[k].coins?.length&&!catalog.products[k].pick)||keys[0];
const [setId,productId]=both.split('/');
const before=db.prepare('SELECT coins FROM profiles WHERE user_id=?').get('test').coins;
r=await request('/api/sealed/open','POST',{setId,product:productId});
assert.equal(r.status,200,JSON.stringify(r.body));
const want=rollGear(productGear(catalog,setId,productId));
assert.deepEqual(r.body.gear.map(g=>[g.kind,g.id,g.qty,g.wasNew]).sort(),want.map(g=>[g.kind,g.id,1,true]).sort(),'the box hands out its sleeves and coins, all new');
assert.ok(db.prepare('SELECT coins FROM profiles WHERE user_id=?').get('test').coins<before);
for(const g of want) assert.equal(r.body.save.gear[g.kind==='sleeve'?'sleeves':'coins'][g.id],1);
// A second copy adds a copy and is no longer new.
r=await request('/api/sealed/open','POST',{setId,product:productId});
assert.ok(r.body.gear.every(g=>!g.wasNew&&g.qty===1));
const held=(await request('/api/gear')).body.gear;
for(const g of want) assert.equal(held[g.kind==='sleeve'?'sleeves':'coins'][g.id],2);
// Another player is unaffected.
assert.deepEqual((await request('/api/gear','GET',null,'other-session')).body.gear.sleeves,{});

// A refused purchase grants nothing.
db.prepare('UPDATE profiles SET coins=1 WHERE user_id=?').run('other');
r=await request('/api/sealed/open','POST',{setId,product:productId},'other-session');
assert.equal(r.status,400);
assert.deepEqual((await request('/api/gear','GET',null,'other-session')).body.gear.coins,{});

// Equip rules.
const sleeveId=want.find(g=>g.kind==='sleeve')?.id,coinId=want.find(g=>g.kind==='coin')?.id;
const stranger=Object.keys(catalog.coins).find(id=>!want.some(g=>g.id===id&&g.kind==='coin'));
assert.equal((await request('/api/gear/equip','POST',{kind:'hat',id:'x'})).status,400);
assert.equal((await request('/api/gear/equip','POST',{kind:'coin',id:'nope'})).status,400,'not in the catalog');
if(stranger) assert.equal((await request('/api/gear/equip','POST',{kind:'coin',id:stranger})).status,400,'not owned');
assert.equal((await request('/api/gear/equip','POST',{kind:'coin',id:'house'})).status,400,'the house coin is the absence of a coin');
if(coinId) {
  r=await request('/api/gear/equip','POST',{kind:'coin',id:coinId});
  assert.equal(r.status,200);assert.equal(r.body.gear.equipped.coin,coinId);
  assert.equal(equippedCoin(normalizeGear(r.body.gear),catalog).id,coinId);
}
if(sleeveId) {
  r=await request('/api/gear/equip','POST',{kind:'sleeve',id:sleeveId});
  assert.equal(r.body.gear.equipped.sleeve,sleeveId);
  assert.equal(equippedSleeve(normalizeGear(r.body.gear),catalog).id,sleeveId);
  assert.equal((await request('/api/me')).body.save.gear.equipped.sleeve,sleeveId,'equipped shows in the save');
  r=await request('/api/gear/equip','POST',{kind:'sleeve',id:null});
  assert.equal(r.body.gear.equipped.sleeve,null);
}
// Equipped items belong to the player who holds them.
if(coinId) assert.equal((await request('/api/gear/equip','POST',{kind:'coin',id:coinId},'other-session')).status,400);

// Progress reset starts the cosmetics over too.
assert.equal((await request('/api/me/reset','POST')).status,200);
assert.deepEqual((await request('/api/gear')).body.gear,{sleeves:{},coins:{},equipped:{sleeve:null,coin:null},recent:[]});
console.log(`Gear checks passed: ${Object.keys(catalog.sleeves).length} sleeves and ${Object.keys(catalog.coins).length} coins across ${rows} products resolve to real files and real products; opening grants once per copy, new flags, refusal grants nothing, equip needs ownership, saves carry gear, reset clears it.`);
