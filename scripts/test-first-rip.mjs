// The free first pack (worker/first-rip.js): a visitor's pack is kept and goes
// onto the account they make, an account made without one opens its first
// pack free, and either way an account gets one, once.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {FIRST_RIP_MAX_COST,FIRST_RIP_SINCE,firstRipOk} from '../js/first-rip-rules.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,{ip='203.0.113.1',cookie=''}={}) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip','CF-Connecting-IP':ip,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const set=res.headers.get('set-cookie')||'';
  return {status:res.status,body:await res.json(),cookie:set.split(';')[0]};
}
const person={password:'hunter22',color:'gold',birthYear:1995,birthMonth:5,agree:true};
const signup=(handle,extra={},opts)=>request('/api/auth/signup','POST',{...person,name:handle,handle,...extra},opts);
const owned=save=>Object.values(save.collection||{}).reduce((n,q)=>n+q,0);
let n=0;
const check=async(name,fn)=>{await fn();n+=1;console.log('ok',name);};

assert.equal(firstRipOk({wrappers:[{}]},FIRST_RIP_MAX_COST),true);
assert.equal(firstRipOk({wrappers:[{}]},FIRST_RIP_MAX_COST+0.01),false);
assert.equal(firstRipOk({wrappers:[{}],promoSet:true},5),false);
assert.equal(firstRipOk({wrappers:[]},5),false);

let pack;
await check('a visitor rips one pack and nothing is charged or owned',async()=>{
  const res=await request('/api/packs/first','POST',{setId:'me6'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.guest,true);
  assert.match(res.body.id,/^[0-9a-f]{32}$/);
  assert.equal(res.body.setId,'me6');
  assert.equal(res.body.cards.length,11);
  assert.ok(res.body.cards.every(card=>card.wasNew&&card.name&&card.id));
  assert.equal(res.body.save,undefined);
  pack=res.body;
});
await check('the same network gets the same pack back: reloading is not a reroll',async()=>{
  for(const setId of ['me6','me5']) {
    const res=await request('/api/packs/first','POST',{setId});
    assert.equal(res.body.id,pack.id);
    assert.deepEqual(res.body.cards.map(c=>[c.id,c.reverse]),pack.cards.map(c=>[c.id,c.reverse]));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM first_rips').get().n,1);
});
await check('a pack the starting coins could not buy is never the free one',async()=>{
  const res=await request('/api/packs/first','POST',{setId:'base1'},{ip:'203.0.113.2'});
  assert.equal(res.status,400,JSON.stringify(res.body));
  assert.equal((await request('/api/packs/first','POST',{setId:'nope'},{ip:'203.0.113.2'})).status,400);
});
let first;
await check('signing up puts that pack on the account, with the full starting coins',async()=>{
  first=await signup('keeper',{firstRip:pack.id});
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal(first.body.firstRipCards,11);
  assert.equal(first.body.save.coins,25);
  assert.equal(first.body.save.packsOpened,1);
  assert.equal(owned(first.body.save),11);
  for(const card of pack.cards) assert.ok(first.body.save.collection[card.id]>0,card.id);
  assert.equal(first.body.user.firstRip,undefined);
  const row=db.prepare('SELECT * FROM first_rips WHERE id=?').get(pack.id);
  assert.equal(row.user_id,first.body.user.id);
  assert.equal(row.ip_key,null);
  assert.equal(db.prepare('SELECT cost FROM pack_log WHERE user_id=?').get(first.body.user.id).cost,0);
});
await check('that account has had its free pack',async()=>{
  const again=await request('/api/packs/first','POST',{setId:'me6'},{cookie:first.cookie});
  assert.equal(again.status,409,JSON.stringify(again.body));
  const me=await request('/api/me','GET',null,{cookie:first.cookie});
  assert.equal(me.body.user.firstRip,undefined);
  assert.equal(me.body.save.packsOpened,1);
});
let second;
await check('a spent pack named again gives nothing',async()=>{
  second=await signup('copycat',{firstRip:pack.id});
  assert.equal(second.status,201);
  assert.equal(second.body.firstRipCards,0);
  assert.equal(second.body.save.packsOpened,0);
  assert.equal(owned(second.body.save),0);
  assert.equal(second.body.save.coins,25);
  for(const bad of ['', 'x', '../etc', 'z'.repeat(32), 12]) {
    const res=await signup('bad'+Math.random().toString(36).slice(2,8),{firstRip:bad});
    assert.equal(res.body.firstRipCards,0);
  }
});
await check('an account made without one opens its first pack free, once',async()=>{
  assert.equal(second.body.user.firstRip,true);
  const dear=await request('/api/packs/first','POST',{setId:'base1'},{cookie:second.cookie});
  assert.equal(dear.status,400);
  const res=await request('/api/packs/first','POST',{setId:'me5'},{cookie:second.cookie});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.free,true);
  assert.equal(res.body.save.coins,25);
  assert.equal(res.body.save.packsOpened,1);
  assert.equal(owned(res.body.save),res.body.cards.length);
  const again=await request('/api/packs/first','POST',{setId:'me5'},{cookie:second.cookie});
  assert.equal(again.status,409);
  // Both at once: the unique index lets one through.
  const third=await signup('racer');
  const both=await Promise.all([1,2].map(()=>request('/api/packs/first','POST',{setId:'me6'},{cookie:third.cookie})));
  assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('/api/me','GET',null,{cookie:third.cookie})).body.save.packsOpened,1);
});
await check('the next pack costs what it always did',async()=>{
  const res=await request('/api/packs/rip','POST',{setId:'me6'},{cookie:second.cookie});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.ok(res.body.cost>0);
  assert.equal(res.body.save.coins,Math.round((25-res.body.cost)*100)/100);
});
await check('an account from before the free pack has none',async()=>{
  const old=await signup('oldtimer');
  db.prepare('UPDATE users SET created_at=? WHERE id=?').run(FIRST_RIP_SINCE-1,old.body.user.id);
  const me=await request('/api/me','GET',null,{cookie:old.cookie});
  assert.equal(me.body.user.firstRip,undefined);
  assert.equal((await request('/api/packs/first','POST',{setId:'me6'},{cookie:old.cookie})).status,400);
  assert.equal(me.body.save.packsOpened,0);
});
await check('a pack nobody came back for expires',async()=>{
  const res=await request('/api/packs/first','POST',{setId:'me6'},{ip:'203.0.113.9'});
  db.prepare('UPDATE first_rips SET created_at=? WHERE id=?').run(Date.now()-8*86400000,res.body.id);
  const late=await signup('latecomer',{firstRip:res.body.id});
  assert.equal(late.body.firstRipCards,0);
  assert.equal(late.body.user.firstRip,true);
  // After a day the network rolls a new one, and the stale row is swept.
  const fresh=await request('/api/packs/first','POST',{setId:'me6'},{ip:'203.0.113.9'});
  assert.notEqual(fresh.body.id,res.body.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM first_rips WHERE id=?').get(res.body.id).n,0);
});
await check('one network cannot roll pack after pack',async()=>{
  const ip='203.0.113.50';
  let last;
  for(let i=0;i<6;i+=1) {
    last=await request('/api/packs/first','POST',{setId:'me6'},{ip});
    assert.equal(last.status,200,`roll ${i+1}`);
    // Spent, as if an account took it, so the next ask is a new roll.
    db.prepare('UPDATE first_rips SET user_id=?,ip_key=NULL WHERE id=?').run('spent-'+i,last.body.id);
  }
  const over=await request('/api/packs/first','POST',{setId:'me6'},{ip});
  assert.equal(over.status,429);
  assert.equal(over.body.needAccount,true);
});
await check('deleting the account removes its row',async()=>{
  const gone=await request('/api/auth/delete','POST',{password:person.password},{cookie:first.cookie});
  assert.equal(gone.status,200,JSON.stringify(gone.body));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM first_rips WHERE user_id=?').get(first.body.user.id).n,0);
});
console.log(`First rip checks passed: ${n}.`);
