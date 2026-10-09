import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {TERMS_VERSION,ageOf,readAgeAndAgreement} from '../worker/terms.js';
// The age screen, the Terms agreement, the casino age list and what deleting an
// account clears (worker/terms.js, worker/gates.js). Runs the real Worker against
// in-memory sqlite at the schema production has (no 0034: the Worker adds it).
// Run: node scripts/test-terms.mjs
const DAY=86_400_000;
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  if(file.startsWith('0034'))continue;
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
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};
async function request(path,method='GET',body,sid){
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(sid?{cookie:'pp_sid='+sid}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')||''};
}
const sidOf=res=>/pp_sid=([^;]+)/.exec(res.cookie)?.[1];
const thisYear=new Date().getUTCFullYear();
const base={password:'hunter22',color:'gold'};
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS ',name);};

await check('ageOf counts whole years from a birth month', ()=>{
  const at=Date.UTC(2026,9,9);
  assert.equal(ageOf('2013-10',at),13,'born this month counts');
  assert.equal(ageOf('2013-11',at),12);
  assert.equal(ageOf('2008-10',at),18);
  assert.equal(ageOf('2008-11',at),17);
  assert.equal(ageOf(null,at),null);
  assert.equal(readAgeAndAgreement({birthYear:2014,birthMonth:1,agree:true},at).underage,true);
  assert.equal(readAgeAndAgreement({birthYear:2000,birthMonth:13,agree:true},at).status,400);
  assert.equal(readAgeAndAgreement({birthYear:2000,birthMonth:1},at).status,400,'the box must be ticked');
});

await check('signup: under 13 makes nothing, no box is refused, 13+ stores the month and the Terms', async()=>{
  const kid=await request('/api/auth/signup','POST',{...base,name:'Kid',handle:'kiddo',birthYear:thisYear-10,birthMonth:1,agree:true});
  assert.equal(kid.status,403);
  assert.equal(kid.body.underage,true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE handle='kiddo'").get().n,0);
  const nobox=await request('/api/auth/signup','POST',{...base,name:'Nobox',handle:'nobox',birthYear:2000,birthMonth:1});
  assert.equal(nobox.status,400);
  const noage=await request('/api/auth/signup','POST',{...base,name:'Noage',handle:'noage',agree:true});
  assert.equal(noage.status,400);
  const teen=await request('/api/auth/signup','POST',{...base,name:'Teen',handle:'teenager',birthYear:thisYear-15,birthMonth:1,agree:true});
  assert.equal(teen.status,201,JSON.stringify(teen.body));
  assert.equal(teen.body.user.termsOk,true);
  assert.equal(teen.body.user.adult,false);
  assert.equal(teen.body.user.born,undefined,'the birth month never leaves the server');
  const row=db.prepare("SELECT born,terms_version,terms_at FROM users WHERE handle='teenager'").get();
  assert.equal(row.born,`${thisYear-15}-01`);
  assert.equal(row.terms_version,TERMS_VERSION);
  assert.ok(row.terms_at>0);
});

await check('casino: the age screen never shuts the casino for a 13+ player (Noah chose 13+)', async()=>{
  const teen=db.prepare("SELECT id FROM users WHERE handle='teenager'").get().id;
  const sid=db.prepare('SELECT id FROM sessions WHERE user_id=?').get(teen).id;
  for(const path of ['/api/casino/coinflips','/api/casino/jackpots','/api/battles','/api/casino/upgrades']){
    const res=await request(path,'POST',{requestId:'r1'},sid);
    assert.notEqual(res.body.needAge,18,path+' '+JSON.stringify(res.body));
  }
  const adult=await request('/api/auth/signup','POST',{...base,name:'Grown',handle:'grownup',birthYear:1990,birthMonth:6,agree:true});
  assert.equal(adult.body.user.adult,true);
});

await check('an account from before the Terms is asked once, and its birth month is set only once', async()=>{
  const now=Date.now();
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('old','Old','oldtimer','unused','gold',now-90*DAY,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sid-old','old',now,now+30*DAY);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('old',25,25,now,'[]');
  const me=await request('/api/me','GET',undefined,'sid-old');
  assert.equal(me.body.user.termsOk,false);
  assert.equal(me.body.user.adult,false,'no birth month yet: the casino stays shut');
  const nobox=await request('/api/me/terms','POST',{birthYear:1999,birthMonth:2},'sid-old');
  assert.equal(nobox.status,400);
  const ok=await request('/api/me/terms','POST',{birthYear:1999,birthMonth:2,agree:true},'sid-old');
  assert.equal(ok.status,200,JSON.stringify(ok.body));
  assert.equal(ok.body.user.termsOk,true);
  assert.equal(ok.body.user.adult,true);
  // A teen who agreed can't come back and claim to be older.
  const teen=db.prepare("SELECT id FROM users WHERE handle='teenager'").get().id;
  const sid=db.prepare('SELECT id FROM sessions WHERE user_id=?').get(teen).id;
  const again=await request('/api/me/terms','POST',{birthYear:1980,birthMonth:1,agree:true},sid);
  assert.equal(again.status,200);
  assert.equal(again.body.user.adult,false);
  assert.equal(db.prepare('SELECT born FROM users WHERE id=?').get(teen).born,`${thisYear-15}-01`);
});

await check('an account from before the Terms that answers under 13 is deleted only after it confirms', async()=>{
  const now=Date.now();
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('young','Young','younger','unused','gold',now-90*DAY,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('sid-young','young',now,now+30*DAY);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('young',25,25,now,'[]');
  await request('/api/me','GET',undefined,'sid-young');
  const ask=await request('/api/me/terms','POST',{birthYear:thisYear-11,birthMonth:3,agree:true},'sid-young');
  assert.equal(ask.status,403);
  assert.equal(ask.body.underage,true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE id='young'").get().n,1,'nothing deleted before confirming');
  const gone=await request('/api/me/terms','POST',{birthYear:thisYear-11,birthMonth:3,confirmUnder13:true},'sid-young');
  assert.equal(gone.status,200,JSON.stringify(gone.body));
  assert.equal(gone.body.deleted,true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE id='young'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id='young'").get().n,0);
});

await check('deleting an account clears chat, DMs, comments, friends and presence', async()=>{
  const a=await request('/api/auth/signup','POST',{...base,name:'Leaver',handle:'leaver',birthYear:1990,birthMonth:1,agree:true});
  const id=a.body.user.id;
  const other=db.prepare("SELECT id FROM users WHERE handle='grownup'").get().id;
  const now=Date.now();
  db.prepare('INSERT INTO chat_messages(user_id,body,created_at) VALUES(?,?,?)').run(id,'hi all',now);
  db.prepare('INSERT INTO dms(from_id,to_id,body,created_at) VALUES(?,?,?,?)').run(id,other,'yo',now);
  db.prepare('INSERT INTO dms(from_id,to_id,body,created_at) VALUES(?,?,?,?)').run(other,id,'hey',now);
  db.prepare('INSERT INTO profile_comments(profile_id,author_id,body,created_at) VALUES(?,?,?,?)').run(other,id,'nice binder',now);
  db.prepare("INSERT INTO friends(from_id,to_id,status,created_at) VALUES(?,?,'accepted',?)").run(other,id,now);
  db.prepare('INSERT OR REPLACE INTO presence(user_id,seen_at) VALUES(?,?)').run(id,now);
  const gone=await request('/api/auth/delete','POST',{password:'hunter22'},sidOf(a));
  assert.equal(gone.status,200,JSON.stringify(gone.body));
  for(const [t,where] of [['chat_messages','user_id=?'],['dms','from_id=? OR to_id=?'],['profile_comments','author_id=?'],['friends','from_id=? OR to_id=?'],['presence','user_id=?'],['users','id=?']]){
    const n=db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${where}`).get(...where.split('?').slice(1).map(()=>id)).n;
    assert.equal(n,0,t);
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE id=?").get(other).n,1,'the other trainer stays');
});

console.log(`\nterms tests passed (${passed})`);
