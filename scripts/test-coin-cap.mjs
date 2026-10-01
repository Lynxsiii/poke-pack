import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
// The hourly bonus, quests and achievements top a wallet up to the 1,000,000 cap.
// They must never lower a wallet that is already over it (casino wins, big sales):
// a friend with 1.6M claimed the hourly and was reset to exactly 1M.
// Runs the real Worker against in-memory sqlite. Run: node scripts/test-coin-cap.mjs
const DAY=86_400_000;
const MAX_COINS=1_000_000;
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
let lock=Promise.resolve();
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){params=values;return statement;},
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
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
const now=Date.now();
function addUser(id,coins) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'unused','gold',now-30*DAY,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sid-'+id,id,now,now+3650*DAY);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder,packs_opened) VALUES(?,?,?,?,?,?)').run(id,coins,coins,now-30*DAY,'[]',50);
}
async function request(path,method,body,id) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',cookie:'pp_sid=sid-'+id},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
const wallet=id=>db.prepare('SELECT coins,granted FROM profiles WHERE user_id=?').get(id);

// ---- Hourly bonus ----
for(const [id,start,expectCoins,expectGranted] of [
  ['small',500,600,600],
  ['edge',MAX_COINS-40,MAX_COINS,MAX_COINS],
  ['atcap',MAX_COINS,MAX_COINS,MAX_COINS],
  ['whale',1_600_000,1_600_000,1_600_000],
  ['cents',1_234_567.89,1_234_567.89,1_234_567.89],
]) {
  addUser(id,start);
  const out=await request('/api/daily','POST',undefined,id);
  assert.equal(out.status,200,`${id}: ${JSON.stringify(out.body)}`);
  assert.equal(wallet(id).coins,expectCoins,`${id}: coins after the hourly bonus`);
  assert.equal(wallet(id).granted,expectGranted,`${id}: granted counts only what was credited`);
  assert.equal((await request('/api/daily','POST',undefined,id)).status,400,`${id}: the cooldown still holds`);
}

// ---- Quest reward ----
for(const [id,start] of [['qsmall',500],['qwhale',1_600_000]]) {
  addUser(id,start);
  assert.equal((await request('/api/daily','POST',undefined,id)).status,200);
  const before=wallet(id).coins;
  const out=await request('/api/quests/claim','POST',{id:'daily-bonus'},id);
  assert.equal(out.status,200,`${id}: ${JSON.stringify(out.body)}`);
  if(start>=MAX_COINS) assert.equal(wallet(id).coins,before,`${id}: a quest reward never lowers a wallet over the cap`);
  else assert.equal(wallet(id).coins,before+25,`${id}: the quest pays in full under the cap`);
}

// ---- Achievements ----
for(const [id,start] of [['asmall',500],['awhale',1_600_000]]) {
  addUser(id,start);
  const out=await request('/api/achievements/claim','POST',{all:true},id);
  assert.equal(out.status,200,`${id}: ${JSON.stringify(out.body)}`);
  assert.ok(out.body.claimed.length>0,`${id}: something was claimed`);
  if(start>=MAX_COINS) assert.equal(wallet(id).coins,start,`${id}: achievement rewards never lower a wallet over the cap`);
  else assert.equal(wallet(id).coins,start+out.body.coins,`${id}: achievements pay in full under the cap`);
}
console.log('coin cap tests passed');
