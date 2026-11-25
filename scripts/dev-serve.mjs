// Local copy of the site plus the real Worker on in-memory SQLite, for bug hunts and UI tests.
//
//   node scripts/dev-serve.mjs [--port 5174] [--coins 50000] [--guest]
//
// Serves the working tree live (edits show on reload), signed in as @devtester
// (level 40 unless --level N) with plenty of coins, two of every Pitch Black card,
// every sleeve and coin owned and terms accepted. A second player, @devfriend,
// is reached with the cookie pp_sid=friend-session. A request carrying the cookie `guest=1` is served signed out.
// Sign up extra players with POST /api/auth/signup; add testerKey: 'dev-tester-key'
// to make one a test account.
// Nothing touches the live site. Card images are hotlinked and may not load.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname} from 'node:path';
import worker from '../worker/index.js';
import {TERMS_VERSION} from '../worker/terms.js';
import {seedLevel} from './lib/level-seed.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const PORT=Number(arg('--port',5174));
const COINS=Number(arg('--coins',50000));
const LEVEL=Number(arg('--level',40));
const root=new URL('..',import.meta.url);

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('worker/migrations/',root)).sort()) {
  db.exec(readFileSync(new URL('worker/migrations/'+file,root),'utf8'));
}
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql){let params=[];const statement={
    bind(...values){params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r||null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
    async raw(){return db.prepare(sql).raw?db.prepare(sql).raw().all(...params):db.prepare(sql).all(...params).map(Object.values);},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
const cols=t=>db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name);
const userCols=cols('users');
const me5=JSON.parse(readFileSync(new URL('data/me5.json',root),'utf8'));
const gear=JSON.parse(readFileSync(new URL('data/gear.json',root),'utf8'));
// Two players, both levelled, terms accepted, with coins, two of every Pitch Black card
// and every sleeve and coin: @devtester (the default session) and @devfriend (friends with
// devtester; send cookie pp_sid=friend-session to play as them).
function addPlayer(id,name,handle,sid){
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,name,handle,'unused','gold',now-90*86400000,now);
  if(userCols.includes('born'))db.prepare('UPDATE users SET born=? WHERE id=?').run('1995-05',id);
  if(userCols.includes('terms_version'))db.prepare('UPDATE users SET terms_version=?,terms_at=? WHERE id=?').run(TERMS_VERSION,now,id);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(sid,id,now,now+30*86400000);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at) VALUES(?,?,?,?)').run(id,COINS,COINS,now-90*86400000);
  for(const c of me5)db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run(id,c.id,2,0);
  for(const [kind,table] of [['sleeve',gear.sleeves],['coin',gear.coins]])
    for(const gid of Object.keys(table))db.prepare('INSERT INTO user_gear(user_id,kind,item_id,qty,first_at,last_at) VALUES(?,?,?,?,?,?)').run(id,kind,gid,1,now,now);
  seedLevel(db,id,LEVEL);
}
addPlayer('dev','Dev Tester','devtester','dev-session');
addPlayer('friend','Dev Friend','devfriend','friend-session');
// A friendship is two accepted rows, one each way (worker/trades.js friendsNow reads both).
for(const [a,b] of [['dev','friend'],['friend','dev']]){try{db.prepare('INSERT INTO friends(from_id,to_id,status,created_at) VALUES(?,?,?,?)').run(a,b,'accepted',now);}catch{/* friends table is made by the Worker on first use */}}
const MIME={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.avif':'image/avif','.woff2':'font/woff2','.woff':'font/woff','.mp3':'audio/mpeg','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.txt':'text/plain','.xml':'application/xml','.ico':'image/x-icon'};
const fileFor=pathname=>{
  const clean=decodeURIComponent(pathname).replace(/\.\.+/g,'');
  const u=new URL('.'+clean,root);
  return clean!=='/'&&existsSync(u)&&statSync(u).isFile()?u:null;
};
// Sign-ups carrying testerKey: 'dev-tester-key' become test accounts (worker/testers.js).
const env={DB,TEST_ACCOUNT_KEY:'dev-tester-key',SITE_ORIGIN:`http://127.0.0.1:${PORT}`,ASSETS:{fetch:async request=>{
  const f=fileFor(new URL(request.url).pathname);
  return f?new Response(readFileSync(f),{headers:{'content-type':MIME[extname(f.pathname)]||'application/octet-stream'}}):new Response('',{status:404});
}}};
export {db,env};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,env.SITE_ORIGIN);
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const c of req)chunks.push(c);
      const guest=/(?:^|;\s*)guest=1/.test(req.headers.cookie||'');
      const headers={...req.headers};
      if(!guest&&!/pp_sid=/.test(headers.cookie||''))headers.cookie=[headers.cookie,'pp_sid=dev-session'].filter(Boolean).join('; ');
      const result=await worker.fetch(new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env,{waitUntil(){},passThroughOnException(){}});
      if(result.status>=500)console.error(`dev-serve: ${result.status} ${req.method} ${url.pathname}`);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    const f=fileFor(url.pathname)||new URL('index.html',root);
    res.writeHead(200,{'content-type':MIME[extname(f.pathname)]||'application/octet-stream','cache-control':'no-store'});
    res.end(readFileSync(f));
  }catch(err){console.error(`dev-serve: 500 ${req.method} ${req.url}`,err?.message||err);res.writeHead(500);res.end(String(err?.stack||err));}
}).listen(PORT,'127.0.0.1',()=>console.log(`dev-serve: http://127.0.0.1:${PORT}/ signed in as @devtester with ${COINS} coins (memory only).`));
