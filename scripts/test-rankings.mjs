// Rankings: the pack log walk, snapshots, the boards, scopes and the guards.
// node scripts/test-rankings.mjs (Node 22+ for node:sqlite)
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {processPackLog,refreshScores,refreshScore,resetRankingsCache,placesFor} from '../worker/rankings.js';
import {weekOf,weekStart,RANKINGS_OPENED,MIN_PACKS} from '../js/rankings-rules.js';
import {seedLevel} from './lib/level-seed.mjs';

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
  async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}},
};
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};

const me5=JSON.parse(readFileSync(new URL('../data/me5.json',import.meta.url),'utf8'));
const byValue=[...me5].filter(c=>typeof c.market==='number'&&c.market>0).sort((a,b)=>b.market-a.market);
const big=byValue[0], mid=byValue[10], small=byValue[byValue.length-1];
const now=Date.now();
const old=RANKINGS_OPENED-86400000*30;

function addUser(id,handle,{created=old,packsOpened=0}={}) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,handle.toUpperCase(),handle,'x','gold',created,now);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,packs_opened) VALUES(?,?,?,?,?)').run(id,25,25,created,packsOpened);
}
function rip(id,cards,at=now) {
  db.prepare('INSERT INTO pack_log(user_id,set_id,wrapper_id,cost,cards,at) VALUES(?,?,?,?,?,?)').run(id,'me5','w',5,JSON.stringify(cards.map(c=>({id:c.id,reverse:false,rarity:c.rarity}))),at);
  db.prepare('UPDATE profiles SET packs_opened=packs_opened+1 WHERE user_id=?').run(id);
}
addUser('a','alpha'); addUser('b','bravo'); addUser('c','claude'); addUser('d','delta',{created:now,packsOpened:400}); addUser('e','echo');
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sa','a',now,now+3600000);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sd','d',now,now+3600000);
seedLevel(db,'a',30); seedLevel(db,'b',50);
const lastWeek=weekStart(weekOf(now)-1)+3600000;
for(let i=0;i<6;i++) rip('a',[small,mid]);
rip('a',[big],lastWeek);
for(let i=0;i<8;i++) rip('b',[small]);
for(let i=0;i<9;i++) rip('c',[big]);
for(let i=0;i<6;i++) rip('d',[mid]);
rip('e',[big]); // one pack: under MIN_PACKS for all-time boards
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('a',big.id,2,0);
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('b',small.id,3,0);
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('d',big.id,50,0);
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('c',big.id,99,0);

const deps={findCatalogCard:async(env,req,id)=>me5.find(c=>c.id===id)||null};

// The log walk counts each pack once, in small batches, and a second walk adds nothing.
let n=await processPackLog(env,deps,{batch:7});
assert.equal(n,31);
assert.equal(await processPackLog(env,deps,{batch:7}),0);
const totals=Object.fromEntries(db.prepare('SELECT * FROM rank_totals').all().map(r=>[r.user_id,r]));
assert.equal(totals.a.packs,7); assert.equal(totals.b.packs,8); assert.equal(totals.c.packs,9);
assert.equal(totals.a.best_card,big.id);
const wk=weekOf(now);
const weekA=db.prepare('SELECT * FROM rank_weekly WHERE user_id=? AND week=?').get('a',wk);
assert.equal(weekA.packs,6); assert.equal(weekA.best_card,mid.id);
await refreshScores(env,deps);
const scores=Object.fromEntries(db.prepare('SELECT * FROM rank_scores').all().map(r=>[r.user_id,r]));
assert.equal(scores.d.eligible,0,'new account with a big import sits out');
assert.equal(scores.a.eligible,1);
assert.ok(scores.a.worth>0);
assert.equal(scores.b.level>scores.a.level,true);

async function get(path,sid) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{headers:sid?{cookie:'pp_sid='+sid}:{}}),env);
  return {status:res.status,body:await res.json()};
}
resetRankingsCache();
let r=await get('/api/rankings?board=worth');
assert.equal(r.status,200,JSON.stringify(r.body));
let handles=r.body.rows.map(x=>x.user.handle);
assert.ok(!handles.includes('claude'),'hidden account stays off the public board');
assert.ok(!handles.includes('delta'),'imported account stays off collection');
assert.ok(!handles.includes('echo'),'under the pack minimum');
assert.deepEqual(handles,['alpha','bravo']);
assert.equal(r.body.rows[0].place,1);
assert.equal(r.body.me,null);

r=await get('/api/rankings?board=best&period=week','sa');
handles=r.body.rows.map(x=>x.user.handle);
assert.ok(handles.includes('delta'),'server packs always count on the pull board');
assert.ok(handles.includes('echo'),'weekly boards need only one pack');
assert.equal(r.body.rows[0].card.id,big.id);
assert.ok(r.body.me.place>=1);
assert.equal(r.body.lastWeek.length,1);
assert.equal(r.body.lastWeek[0].user.handle,'alpha');
assert.equal(r.body.lastWeek[0].card.id,big.id);

r=await get('/api/rankings?board=worth','sd');
assert.equal(r.body.me.place,null);
assert.match(r.body.me.reason,/before you signed up/);

r=await get('/api/rankings?board=level','sa');
assert.deepEqual(r.body.rows.map(x=>x.user.handle),['bravo','alpha']);
assert.equal(r.body.me.place,2);
assert.equal(r.body.rows[0].level.level,50);

// Friends scope: only friends and you, and a hidden friend does show.
db.prepare("INSERT INTO friends(from_id,to_id,status,created_at) VALUES('a','c','accepted',?),('c','a','accepted',?)").run(now,now);
r=await get('/api/rankings?board=packs&period=all&scope=friends','sa');
assert.equal(r.body.scope,'friends');
assert.deepEqual(r.body.rows.map(x=>x.user.handle),['claude','alpha']);
assert.equal(r.body.me.place,2);
assert.equal(r.body.me.of,2);

// Ties share a place.
r=await get('/api/rankings?board=packs&period=week');
const places=r.body.rows.map(x=>[x.user.handle,x.place]);
assert.ok(places.length>=3);

// Bad input falls back; POST is refused.
r=await get('/api/rankings?board=nope&period=zzz');
assert.equal(r.body.board,'worth'); assert.equal(r.body.period,'all');
const post=await worker.fetch(new Request('https://poke-pack.rip/api/rankings',{method:'POST'}),env);
assert.equal(post.status,404);

const places2=await placesFor(env,'alpha');
assert.ok(places2.places.some(p=>p.board==='worth'&&p.place===1));
r=await get('/api/rankings/u/alpha');
assert.equal(r.status,200); assert.equal(r.body.handle,'alpha');

console.log(`Rankings checks passed: log walk once per pack (${MIN_PACKS}-pack minimum), weekly and all-time, snapshots, hidden and imported guards, friends scope, viewer place and reasons, podium, fallbacks.`);
