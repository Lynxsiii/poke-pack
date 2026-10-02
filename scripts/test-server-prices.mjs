/**
 * The server prices what it sells from the newest recorded TCGplayer prices
 * (worker/prices.js latestPrices, applied in worker/index.js), so a sealed
 * order costs what the page shows, not what data/sealed.json had baked.
 */
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
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
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('test','Price Tester','pricetester','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('local-test-session','test',now,now+3600000);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',100000,100000,now,'[]');
// A recorded day that prices me5's booster box and ETB differently from the committed file.
const sealed=JSON.parse(readFileSync(new URL('../data/sealed.json',import.meta.url),'utf8'));
const box=Math.round((sealed.me5.boosterBox+123.45)*100)/100;
db.exec(`CREATE TABLE IF NOT EXISTS price_days (set_id TEXT NOT NULL, day TEXT NOT NULL, prices TEXT NOT NULL, recorded_at INTEGER NOT NULL, PRIMARY KEY (set_id, day))`);
db.prepare('INSERT INTO price_days VALUES(?,?,?,?)').run('me5','2026-10-02',JSON.stringify({cards:{},sealed:{boosterBox:box}}),now);
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
const res=await worker.fetch(new Request('https://poke-pack.rip/api/sealed/open',{method:'POST',headers:{'content-type':'application/json',origin:'https://poke-pack.rip',cookie:'pp_sid=local-test-session'},body:JSON.stringify({setId:'me5',product:'boosterBox'})}),env);
const body=await res.json();
assert.equal(res.status,200,JSON.stringify(body));
assert.equal(body.cost,box,'the box was charged the committed price, not the recorded one');
assert.notEqual(body.cost,sealed.me5.boosterBox);
console.log('Server price checks passed: a sealed order is charged the newest recorded TCGplayer price.');
