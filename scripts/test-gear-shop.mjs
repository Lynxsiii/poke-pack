import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {gearPrice,HOUSE_COIN} from '../js/gear.js';
// The sleeve and coin shop: POST /api/gear/buy charges gearPrice() once, grants the item in the same batch,
// refuses what it can't sell, and two taps at once pay once. Runs the real Worker against in-memory sqlite.
// Run: node scripts/test-gear-shop.mjs
const catalog=JSON.parse(readFileSync(new URL('../data/gear.json',import.meta.url),'utf8'));
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
// D1 runs a batch as one transaction, so batches never interleave: the lock gives the stand-in the same property.
let lock=Promise.resolve();
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){assert.ok(values.length<=100,'D1 allows at most 100 bound parameters');params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  batch(statements){
    const run=lock.then(async()=>{const out=[];for(const s of statements)out.push(await s.run());return out;});
    lock=run.catch(()=>{});
    return run;
  },
};
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
const now=Date.now();
function addUser(id,coins) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'unused','gold',now,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sid-'+id,id,now,now+3600000);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id,coins,coins,now,'[]');
}
async function request(path,method='GET',body,id) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(id?{cookie:'pp_sid=sid-'+id}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
const buy=(id,kind,item)=>request('/api/gear/buy','POST',{kind,id:item},id);
const wallet=id=>db.prepare('SELECT coins,granted FROM profiles WHERE user_id=?').get(id);
const held=(id,kind,item)=>db.prepare('SELECT qty FROM user_gear WHERE user_id=? AND kind=? AND item_id=?').get(id,kind,item);
const rows=id=>db.prepare('SELECT COUNT(*) n FROM user_gear WHERE user_id=?').get(id).n;

// --- gearPrice: one rule for page and Worker.
const sleeves=Object.values(catalog.sleeves),coins=Object.values(catalog.coins);
for(const [kind,list] of [['sleeve',sleeves],['coin',coins]]) for(const item of list) {
  const p=gearPrice(kind,item);
  assert.ok(Number.isFinite(p)&&p>=1&&p<=100,`${item.id} price ${p}`);
  assert.equal(p,Math.round(p*100)/100,`${item.id} has at most 2 decimals`);
  assert.equal(gearPrice(kind,item),p,'deterministic');
}
assert.equal(gearPrice('coin',HOUSE_COIN),null,'the house coin is not for sale');
assert.equal(gearPrice('coin',null),null);
assert.equal(gearPrice('card',sleeves[0]),null,'unknown kind');
const plastic=coins.find(c=>c.material==='plastic'),metal=coins.find(c=>c.material==='metal'&&c.sets[0]===plastic.sets[0]);
if(metal) assert.ok(gearPrice('coin',metal)>gearPrice('coin',plastic),'metal costs more than plastic of the same set');
const sm=sleeves.find(s=>s.sets[0].startsWith('sm')),me=sleeves.find(s=>s.sets[0].startsWith('me'));
assert.ok(gearPrice('sleeve',sm)>gearPrice('sleeve',me),'an older set costs more');
// A drawn placeholder or an item with no set still gets a sensible price.
assert.ok(gearPrice('coin',{id:'x',material:'metal',drawn:true,sets:[],from:[]})>=1);
assert.ok(gearPrice('sleeve',{id:'y'})>=1);

// --- Auth.
addUser('rich',10_000);addUser('poor',2);addUser('racer',500);addUser('bystander',500);
const sleeve=sleeves[0],coin=coins.find(c=>c.material==='metal');
const sleevePrice=gearPrice('sleeve',sleeve),coinPrice=gearPrice('coin',coin);
assert.equal((await buy(null,'sleeve',sleeve.id)).status,401,'sign-in required');

// --- Buying works and deducts once.
let r=await buy('rich','sleeve',sleeve.id);
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.coins,10_000-sleevePrice);
assert.equal(wallet('rich').coins,10_000-sleevePrice,'charged the catalog price');
assert.equal(wallet('rich').granted,10_000,'spending does not touch the granted total');
assert.equal(held('rich','sleeve',sleeve.id).qty,1);
assert.equal(r.body.gear.sleeves[sleeve.id],1,'the reply carries the new holdings');
assert.equal(r.body.save.gear.sleeves[sleeve.id],1,'and the save');
assert.deepEqual(r.body.bought,{kind:'sleeve',id:sleeve.id,name:sleeve.name,price:sleevePrice});
r=await buy('rich','coin',coin.id);
assert.equal(r.status,200);
assert.equal(wallet('rich').coins,Math.round((10_000-sleevePrice-coinPrice)*100)/100);
assert.equal((await request('/api/gear','GET',null,'rich')).body.gear.coins[coin.id],1);

// --- Can't buy twice.
const before=wallet('rich').coins;
r=await buy('rich','sleeve',sleeve.id);
assert.equal(r.status,400);assert.equal(r.body.error,'You already own this.');
assert.equal(wallet('rich').coins,before,'a second buy costs nothing');
assert.equal(held('rich','sleeve',sleeve.id).qty,1);
// An item that arrived another way (a box) counts as owned too.
db.prepare('INSERT INTO user_gear(user_id,kind,item_id,qty,first_at,last_at) VALUES(?,?,?,?,?,?)').run('rich','sleeve',sleeves[1].id,3,now,now);
r=await buy('rich','sleeve',sleeves[1].id);
assert.equal(r.status,400);assert.equal(r.body.error,'You already own this.');
assert.equal(wallet('rich').coins,before);

// --- Can't afford: nothing is charged or granted.
r=await buy('poor','coin',coin.id);
assert.equal(r.status,400);assert.match(r.body.error,/Not enough coins/);
assert.equal(wallet('poor').coins,2);assert.equal(rows('poor'),0,'a short wallet gets nothing');
// Exactly enough works and leaves zero.
db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(coinPrice,'poor');
r=await buy('poor','coin',coin.id);
assert.equal(r.status,200);assert.equal(wallet('poor').coins,0);

// --- Refusals: house coin, unknown ids, bad kinds.
const bystanderBefore=wallet('bystander').coins;
for(const [kind,id] of [['coin','house'],['coin','no-such-coin'],['sleeve','no-such-sleeve'],['sleeve',coin.id],['coin',sleeve.id],['card',sleeve.id],['sleeve',''],['coin',null]]) {
  r=await buy('bystander',kind,id);
  assert.equal(r.status,400,`${kind}/${id} refused`);
}
assert.equal((await buy('bystander','coin','house')).body.error,"That isn't for sale.");
assert.equal(wallet('bystander').coins,bystanderBefore);assert.equal(rows('bystander'),0);
assert.equal((await request('/api/gear/buy','POST',null,'bystander')).status,400,'no body');

// --- Two taps at once pay once.
const results=await Promise.all([buy('racer','coin',coin.id),buy('racer','coin',coin.id),buy('racer','coin',coin.id)]);
assert.deepEqual(results.map(x=>x.status).sort(),[200,400,400],JSON.stringify(results.map(x=>x.body.error||'ok')));
assert.equal(wallet('racer').coins,Math.round((500-coinPrice)*100)/100,'charged exactly once');
assert.equal(held('racer','coin',coin.id).qty,1);
for(const x of results.filter(x=>x.status===400)) assert.equal(x.body.error,'You already own this.');
// Two different items at once while the wallet only covers one: the second is refused whole.
db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(Math.max(sleevePrice,gearPrice('sleeve',sleeves[2])),'racer');
const pair=await Promise.all([buy('racer','sleeve',sleeve.id),buy('racer','sleeve',sleeves[2].id)]);
assert.equal(pair.filter(x=>x.status===200).length,1,'only one fits the wallet');
assert.ok(wallet('racer').coins>=0&&wallet('racer').coins<Math.min(sleevePrice,gearPrice('sleeve',sleeves[2])),'never negative');
assert.equal(rows('racer'),2,'the coin plus one sleeve');

// --- A bought item can be equipped.
r=await request('/api/gear/equip','POST',{kind:'coin',id:coin.id},'rich');
assert.equal(r.status,200);assert.equal(r.body.gear.equipped.coin,coin.id);

console.log(`gear shop ok: ${sleeves.length} sleeves ${Math.min(...sleeves.map(s=>gearPrice('sleeve',s)))} to ${Math.max(...sleeves.map(s=>gearPrice('sleeve',s)))}, ${coins.length} coins ${Math.min(...coins.map(s=>gearPrice('coin',s)))} to ${Math.max(...coins.map(s=>gearPrice('coin',s)))}`);
