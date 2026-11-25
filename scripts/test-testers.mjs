// Test accounts (worker/testers.js): only the right key makes one, and a tester never
// shows in global chat, the online list or the Discord feed, and can't post in chat.
// Runs the real Worker against in-memory sqlite. Run: node scripts/test-testers.mjs
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {wantsTester,notTester} from '../worker/testers.js';
import {sharesFeed} from '../worker/discord.js';
import {HIDDEN_HANDLES} from '../worker/rankings.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
let lock=Promise.resolve();
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql){let params=[];const st={
    bind(...v){params=v;return st;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(c){const r=db.prepare(sql).get(...params);return c?r?.[c]:r||null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return st;},
  batch(sts){const run=lock.then(async()=>{const out=[];for(const s of sts)out.push(await s.run());return out;});lock=run.catch(()=>{});return run;},
};
const KEY='local-tester-key-123';
const env={DB,TEST_ACCOUNT_KEY:KEY,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,sid){
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(sid?{cookie:'pp_sid='+sid}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')||''};
}
const sidOf=res=>/pp_sid=([^;]+)/.exec(res.cookie)?.[1];
const base={password:'hunter22',color:'gold',birthYear:1995,birthMonth:5,agree:true};

assert.equal(wantsTester({},{testerKey:KEY}),false,'no secret, no testers');
assert.equal(wantsTester({TEST_ACCOUNT_KEY:KEY},{testerKey:'wrong-key-wrong-key!'}),false);
assert.equal(wantsTester({TEST_ACCOUNT_KEY:KEY},{}),false);
assert.equal(wantsTester({TEST_ACCOUNT_KEY:'short'},{testerKey:'short'}),false,'a weak secret is ignored');
assert.equal(wantsTester({TEST_ACCOUNT_KEY:KEY},{testerKey:KEY}),true);
assert.equal(notTester('u'),' AND COALESCE(u.tester, 0) = 0');
assert.equal(sharesFeed({feed_share:1,tester:1}),false);
assert.equal(sharesFeed({feed_share:1,tester:0}),true);
assert.ok(HIDDEN_HANDLES.includes('claude'));

const real=await request('/api/auth/signup','POST',{...base,name:'Real',handle:'realone'});
assert.equal(real.status,201,JSON.stringify(real.body));
const fake=await request('/api/auth/signup','POST',{...base,name:'Wrong',handle:'wrongkey',testerKey:'nope'});
assert.equal(fake.status,201);
const qa=await request('/api/auth/signup','POST',{...base,name:'QA',handle:'qabot1',testerKey:KEY});
assert.equal(qa.status,201);
const flag=h=>db.prepare('SELECT tester FROM users WHERE handle=?').get(h).tester;
assert.equal(flag('realone'),0);
assert.equal(flag('wrongkey'),0,'a wrong key makes a normal account');
assert.equal(flag('qabot1'),1);

// Global chat: the tester can't post; the real player can, and only real players are listed.
const blocked=await request('/api/chat','POST',{body:'hello from a test account'},sidOf(qa));
assert.equal(blocked.status,403);
const said=await request('/api/chat','POST',{body:'hello world'},sidOf(real));
assert.equal(said.status,200,JSON.stringify(said.body));
db.prepare('INSERT INTO chat_messages(user_id,body,created_at) SELECT id,?,? FROM users WHERE handle=?').run('sneaked in',Date.now(),'qabot1');
const lounge=await request('/api/lounge','GET',null,sidOf(qa));
assert.equal(lounge.status,200);
assert.ok(lounge.body.chat.some(m=>m.body==='hello world'));
assert.ok(!lounge.body.chat.some(m=>m.user?.handle==='qabot1'),'tester chat is hidden');
assert.ok(!lounge.body.online.some(u=>u.handle==='qabot1'),'tester is not in the online list');

// Rankings: the tester's board place reads as hidden, and boards leave it out.
const board=await request('/api/rankings','GET',null,sidOf(real));
assert.equal(board.status,200,JSON.stringify(board.body).slice(0,300));
assert.ok(!JSON.stringify(board.body).includes('qabot1'),'tester is not on a board');

// Reserved handles: no one signs up or renames into the site's or staff's names.
assert.equal((await request('/api/auth/signup','POST',{...base,name:'Admin',handle:'Admin'})).status,409);
assert.equal((await request('/api/auth/signup','POST',{...base,name:'Mod',handle:'mod_sam'})).status,409);
assert.equal((await request('/api/me','PATCH',{handle:'support'},sidOf(real))).status,409);
assert.equal((await request('/api/auth/handle?h=staff')).body.free,false);

console.log('Test account checks passed: key gate, chat post refused, hidden from chat, online list, Discord feed and boards; reserved handles refused.');
