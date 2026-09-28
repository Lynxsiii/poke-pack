import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {CardSpring} from '../js/card-motion.js';
import {validateProfilePages,selectedProfilePages} from '../js/profile-pages.js';
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
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('test','Page Tester','pagetester','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('local-test-session','test',now,now+3600000);
const binder=Array.from({length:45},(_,i)=>i%9===0?{id:'me5-1',reverse:false}:null);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('test',50000,50000,now,JSON.stringify(binder));
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-1',5,0);
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,signed=true) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(signed?{cookie:'pp_sid=local-test-session'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
assert.equal((await request('/api/me','PATCH',{binderPages:[0,1,2,3]},false)).status,401);
let response=await request('/api/me','PATCH',{binderPages:[0,1,2,3]});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.deepEqual(response.body.user.binderPages,[0,1,2,3]);
assert.equal((await request('/api/me','PATCH',{binderPages:[0,1,2,3,4]})).status,400);
assert.equal((await request('/api/me','PATCH',{binderPages:[0,0]})).status,400);
assert.equal((await request('/api/me','PATCH',{binderPages:[99]})).status,400);
assert.equal((await request('/api/me','PATCH',{binderPages:['1']})).status,400);
response=await request('/api/u/pagetester','GET',null,false);
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.binderPages.length,4);
assert.equal(response.body.binderPages[0].slots[0].name,'Tropius');
assert.equal(response.body.binderPages[0].slots.length,9);
// A live page follows edits; the unshared fifth page is never exposed.
const moved=binder.slice();moved[0]=null;moved[1]={id:'me5-1',reverse:true};
assert.equal((await request('/api/binder','PUT',{binder:moved})).status,200);
response=await request('/api/u/pagetester','GET',null,false);
assert.equal(response.body.binderPages[0].slots[0],null);
assert.equal(response.body.binderPages[0].slots[1].reverse,true);
assert.ok(response.body.binderPages.every(page=>page.index<4));
assert.equal((await request('/api/me','PATCH',{binderPages:[1,2,3]})).status,200);
assert.equal((await request('/api/u/pagetester','GET',null,false)).body.binderPages.length,3);
assert.equal(validateProfilePages([0],Array(9).fill(null)), 'Add a card to the page before displaying it.');
assert.deepEqual(selectedProfilePages([0],[{id:'unowned'}],{}),[]);
// Bulk sale keeps one of each card, preserves binder pockets, and cannot be
// claimed twice or used without a session.
db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-2',2,2);
assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'me5'},false)).status,401);
assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'bogus'})).status,400);
response=await request('/api/cards/sell-duplicates','POST',{setId:'me5'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.copies,5);
assert.ok(response.body.value>0);
assert.deepEqual(db.prepare('SELECT card_id,qty,reverse_qty FROM cards WHERE user_id=? ORDER BY card_id').all('test').map(row=>[row.card_id,row.qty,row.reverse_qty]),[['me5-1',1,0],['me5-2',1,1]]);
assert.equal(response.body.save.binder[1].id,'me5-1');
assert.equal(response.body.save.binder.filter(slot=>slot?.id==='me5-1').length,1);
assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'me5'})).status,400);
assert.equal(response.body.save.quests.progress['daily-spares'],5);
assert.equal((await request('/api/quests/claim','POST',{id:'daily-rip'})).status,400);
response=await request('/api/quests/claim','POST',{id:'daily-spares'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.coins,20);
assert.equal((await request('/api/quests/claim','POST',{id:'daily-spares'})).status,400);
response=await request('/api/daily','POST');
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal(response.body.save.quests.progress['daily-bonus'],1);
assert.equal((await request('/api/quests/claim','POST',{id:'daily-bonus'})).status,200);
for(const hz of [30,60,120]) {
  const spring=new CardSpring(0);spring.target=1;
  for(let i=0;i<hz;i++){spring.step(1/hz);assert.ok(spring.value>=0 && spring.value<=1);}
  assert.ok(Math.abs(spring.value-1)<.001);
  spring.target=0;for(let i=0;i<hz*2;i++)spring.step(1/hz,11);
  assert.equal(spring.value,0);
}
console.log('Profile page API checks passed: authentication, four-page cap, malformed input, persistence, public rendering, live edits, removal and ownership. Spring checks passed at 30/60/120 Hz.');
if(process.argv.includes('--serve')) {
  const {createServer}=await import('node:http');
  const {extname}=await import('node:path');
  const fullCards=JSON.parse(readFileSync(new URL('../data/me5.json',import.meta.url),'utf8'));
  const fixtureCards=fullCards.filter(c=>['Double Rare','Illustration Rare','Special Illustration Rare'].includes(c.rarity)).slice(0,36);
  const fullBinder=fixtureCards.map(c=>({id:c.id,reverse:false}));
  for(const card of fixtureCards) db.prepare('INSERT OR REPLACE INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test',card.id,1,0);
  db.prepare('UPDATE profiles SET binder=? WHERE user_id=?').run(JSON.stringify(fullBinder),'test');
  db.prepare('UPDATE users SET binder_pages=?,showcase=? WHERE id=?').run('[0,1]',JSON.stringify(fixtureCards.slice(0,6).map(c=>({id:c.id,reverse:false}))),'test');
  env.SITE_ORIGIN='http://127.0.0.1:5174';
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,env.SITE_ORIGIN);
      if(url.pathname.startsWith('/api/')) {
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const result=await worker.fetch(new Request(url,{method:req.method,headers:{...req.headers,cookie:'pp_sid=local-test-session'},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),env);
        res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
      }
      const path=/^\/(?:js|css|data|assets)\//.test(url.pathname)?url.pathname:'/index.html';
      const content=readFileSync(new URL('..'+path,import.meta.url));
      const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.avif':'image/avif','.woff2':'font/woff2','.mp3':'audio/mpeg','.ico':'image/x-icon'};
      res.writeHead(200,{'content-type':mime[extname(path)] || 'application/octet-stream','cache-control':'no-store'});res.end(content);
    }catch(err){res.writeHead(500);res.end(String(err));}
  });
  server.listen(5174,'127.0.0.1',()=>console.log('Disposable profile preview: http://127.0.0.1:5174/binder (memory only).'));
}
