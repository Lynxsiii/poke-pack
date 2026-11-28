import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {pullMessage,blackLabelMessage} from '../worker/discord.js';
import {totpAt,base32Decode,base32Encode,deviceLabel,maskEmail,sessionKey} from '../worker/security.js';
// Account security (worker/security.js): two-step sign-in, devices, history,
// throttling, email (off without a provider), Discord, and the delete clearing it all.
// Runs the real Worker against in-memory sqlite. Run: node scripts/test-security.mjs
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
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const WIN='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
async function request(path,method='GET',body,sid,{ua=IPHONE,ip='1.1.1.1'}={}){
  const req=new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip','user-agent':ua,'cf-connecting-ip':ip,...(sid?{cookie:'pp_sid='+sid}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const res=await worker.fetch(req,env);
  return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')||''};
}
const sidOf=res=>/pp_sid=([^;]+)/.exec(res.cookie)?.[1];
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS ',name);};
const signup=handle=>request('/api/auth/signup','POST',{name:handle,handle,password:'hunter22',color:'gold',birthYear:1995,birthMonth:3,agree:true});

await check('helpers: base32 round trip, RFC 6238 test vector, device labels, masked email', async()=>{
  const bytes=new TextEncoder().encode('12345678901234567890');
  assert.deepEqual([...base32Decode(base32Encode(bytes))],[...bytes]);
  // RFC 6238 SHA-1 vector: T=59s -> 94287082 (8 digits), so the 6-digit code is 287082.
  assert.equal(await totpAt(base32Encode(bytes),1),'287082');
  assert.equal(deviceLabel(IPHONE),'iPhone · Safari');
  assert.equal(deviceLabel(WIN),'Windows · Chrome');
  assert.equal(maskEmail('noah@gmail.com'),'n***@gmail.com');
});

let sidA, secret;
await check('signup tags the session; the security page lists the device and the signup', async()=>{
  const a=await signup('secure_a');
  assert.equal(a.status,201,JSON.stringify(a.body));
  sidA=sidOf(a);
  const sec=await request('/api/me/security','GET',null,sidA);
  assert.equal(sec.status,200,JSON.stringify(sec.body));
  assert.equal(sec.body.devices.length,1);
  assert.equal(sec.body.devices[0].device,'iPhone · Safari');
  assert.equal(sec.body.devices[0].current,true);
  assert.notEqual(sec.body.devices[0].id,sidA,'the cookie value never leaves the server');
  assert.equal(sec.body.history[0].kind,'signup');
  assert.equal(sec.body.mailReady,false);
  assert.equal(sec.body.discordReady,false);
  assert.equal(sec.body.totp,null);
});

await check('wrong passwords go in the history, and the 11th in 15 minutes is refused even with the right one', async()=>{
  for(let i=0;i<10;i++){
    const bad=await request('/api/auth/signin','POST',{handle:'secure_a',password:'nope'+i},null,{ip:'2.2.2.2'});
    assert.equal(bad.status,401);
  }
  const shut=await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ip:'2.2.2.2'});
  assert.equal(shut.status,429);
  const elsewhere=await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ip:'3.3.3.3',ua:WIN});
  assert.equal(elsewhere.status,200,'one address guessing does not lock the trainer out everywhere');
  for(let i=0;i<40;i++) await request('/api/auth/signin','POST',{handle:'secure_a',password:'x'+i},null,{ip:'4.4.4.'+i});
  assert.equal((await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ip:'5.5.5.5'})).status,429,'50 for one account from anywhere');
  const sec=await request('/api/me/security','GET',null,sidA);
  assert.ok(sec.body.history.filter(h=>h.kind==='signin_failed').length>=10);
  db.prepare("DELETE FROM auth_throttle").run();
  const ok=await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ua:WIN});
  assert.equal(ok.status,200);
  const list=await request('/api/me/security','GET',null,sidA);
  assert.equal(list.body.devices.length,3);
});

await check('signing out one device, then every other device', async()=>{
  const list=(await request('/api/me/security','GET',null,sidA)).body.devices;
  const other=list.find(d=>!d.current);
  const out=await request('/api/me/security/signout','POST',{id:other.id},sidA);
  assert.equal(out.body.devices.length,list.length-1);
  const cur=list.find(d=>d.current);
  await request('/api/me/security/signout','POST',{id:cur.id},sidA);
  assert.equal((await request('/api/me','GET',null,sidA)).status,200,'the current device is never signed out by id');
  await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ua:WIN});
  await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ua:WIN});
  const all=await request('/api/me/security/signout','POST',{all:true},sidA);
  assert.equal(all.body.devices.length,1);
  assert.equal(all.body.devices[0].current,true);
});

await check('two-step: a wrong code is refused, the right one turns it on and signs other devices out', async()=>{
  const other=sidOf(await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ua:WIN}));
  const start=await request('/api/me/security/totp/start','POST',{},sidA);
  assert.equal(start.status,200);
  secret=start.body.secret;
  assert.match(start.body.uri,/^otpauth:\/\/totp\/Poke%20Pack%3A%40secure_a\?secret=/);
  const wrong=await request('/api/me/security/totp/confirm','POST',{code:'000000'},sidA);
  assert.equal(wrong.status,400);
  const step=Math.floor(Date.now()/30000);
  const on=await request('/api/me/security/totp/confirm','POST',{code:await totpAt(secret,step)},sidA);
  assert.equal(on.status,200,JSON.stringify(on.body));
  assert.equal((await request('/api/me','GET',null,other)).status,401,'the other device was signed out');
  assert.equal((await request('/api/me','GET',null,sidA)).status,200);
});

await check('two-step sign-in: password gives a ticket, a used code fails, the next code signs in once', async()=>{
  const first=await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'});
  assert.equal(first.status,200);
  assert.equal(first.body.twoStep,true);
  assert.equal(sidOf(first),undefined,'no session before the code');
  const step=Math.floor(Date.now()/30000);
  const replay=await request('/api/auth/signin/code','POST',{ticket:first.body.ticket,code:await totpAt(secret,step)});
  assert.equal(replay.status,401,'the code used to turn it on cannot be used again');
  const ok=await request('/api/auth/signin/code','POST',{ticket:first.body.ticket,code:await totpAt(secret,step+1)});
  assert.equal(ok.status,200,JSON.stringify(ok.body));
  assert.ok(sidOf(ok));
  const again=await request('/api/auth/signin/code','POST',{ticket:first.body.ticket,code:await totpAt(secret,step+1)});
  assert.equal(again.status,401,'a ticket works once');
});

await check('two-step sign-in: 5 wrong codes end the ticket; a recovery code works and is spent', async()=>{
  const t=(await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'})).body.ticket;
  for(let i=0;i<5;i++) assert.equal((await request('/api/auth/signin/code','POST',{ticket:t,code:'12345'+i})).status,401);
  const dead=await request('/api/auth/signin/code','POST',{ticket:t,code:'123456'});
  assert.equal(dead.status,429);
  assert.equal(dead.body.restart,true);
  const code=(await request('/api/me/recovery','POST',{},sidA)).body.code;
  const t2=(await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'})).body.ticket;
  const rec=await request('/api/auth/signin/code','POST',{ticket:t2,recovery:code});
  assert.equal(rec.status,200,JSON.stringify(rec.body));
  assert.equal(rec.body.usedRecovery,true);
  const t3=(await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'})).body.ticket;
  assert.equal((await request('/api/auth/signin/code','POST',{ticket:t3,recovery:code})).status,401,'spent');
});

await check('turning two-step off needs the password; then sign-in is one step again', async()=>{
  assert.equal((await request('/api/me/security/totp','DELETE',{password:'wrong'},sidA)).status,401);
  assert.equal((await request('/api/me/security/totp','DELETE',{password:'hunter22'},sidA)).status,200);
  const s=await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'});
  assert.ok(sidOf(s));
  assert.equal(s.body.twoStep,undefined);
});

await check('a password change signs other devices out and is logged', async()=>{
  const other=sidOf(await request('/api/auth/signin','POST',{handle:'secure_a',password:'hunter22'},null,{ua:WIN}));
  const ch=await request('/api/me','PATCH',{current:'hunter22',password:'hunter33'},sidA);
  assert.equal(ch.status,200,JSON.stringify(ch.body));
  assert.equal((await request('/api/me','GET',null,other)).status,401);
  assert.equal((await request('/api/me','GET',null,sidA)).status,200);
  const sec=await request('/api/me/security','GET',null,sidA);
  assert.equal(sec.body.history[0].kind,'password');
});

await check('email and Discord stay off without their setup; resets answer 503 without saying who exists', async()=>{
  assert.equal((await request('/api/me/security/email','POST',{email:'a@b.co',password:'hunter33'},sidA)).status,503);
  assert.equal((await request('/api/auth/reset/request','POST',{who:'secure_a'})).status,503);
  assert.equal((await request('/api/auth/reset/request','POST',{who:'nobody_here'})).status,503);
  assert.equal((await request('/api/me/security/discord','POST',{code:'x',verifier:'y'.repeat(50)},sidA)).status,503);
  const h=await request('/api/health');
  assert.equal(h.body.discord.linking,false);
});

await check('email with a provider: code, verify, reset by email, same answer for unknown accounts', async()=>{
  const sent=[];
  env.EMAIL={send:async m=>{sent.push(m);}};
  try{
    const start=await request('/api/me/security/email','POST',{email:'Trainer@Example.com',password:'hunter33'},sidA);
    assert.equal(start.status,200,JSON.stringify(start.body));
    const code=/(\d{6}) is your/.exec(sent[0].subject)[1];
    assert.equal((await request('/api/me/security/email/verify','POST',{code:'000000'},sidA)).status,400);
    const ok=await request('/api/me/security/email/verify','POST',{code},sidA);
    assert.equal(ok.status,200,JSON.stringify(ok.body));
    assert.equal(ok.body.email.masked,'t******@example.com');
    const known=await request('/api/auth/reset/request','POST',{who:'trainer@example.com'});
    const unknown=await request('/api/auth/reset/request','POST',{who:'ghost@example.com'});
    assert.deepEqual(known.body,unknown.body,'the same answer either way');
    assert.equal(sent.length,2,'only the real account got mail');
    const reset=/>(\d{6})</.exec(sent[1].html)[1];
    assert.equal((await request('/api/auth/reset/confirm','POST',{who:'secure_a',code:'111111',password:'newpass1'})).status,401);
    const done=await request('/api/auth/reset/confirm','POST',{who:'secure_a',code:reset,password:'newpass1'});
    assert.equal(done.status,200,JSON.stringify(done.body));
    assert.equal((await request('/api/me','GET',null,sidA)).status,401,'old sessions are gone');
    sidA=sidOf(done);
    assert.equal((await request('/api/auth/reset/confirm','POST',{who:'secure_a',code:reset,password:'newpass2'})).status,401,'a code works once');
    // A second account can't take the same address.
    const b=sidOf(await signup('secure_b'));
    await request('/api/me/security/email','POST',{email:'trainer@example.com',password:'hunter22'},b);
    const code2=/(\d{6}) is your/.exec(sent.at(-1).subject)[1];
    assert.equal((await request('/api/me/security/email/verify','POST',{code:code2},b)).status,409);
  } finally { delete env.EMAIL; }
});

await check('a shown Discord link is on the public profile, a hidden one is not', async()=>{
  const id=db.prepare("SELECT id FROM users WHERE handle='secure_a'").get().id;
  db.prepare("INSERT INTO user_discord (user_id,discord_id,username,global_name,avatar,shown,linked_at) VALUES (?,?,?,?,?,1,?)").run(id,'123456789012345678','ash','Ash',null,Date.now());
  const p=await request('/api/u/secure_a');
  assert.equal(p.body.user ? p.body.discord?.username : null,'ash');
  await request('/api/me/security/discord','PATCH',{shown:false},sidA);
  assert.equal((await request('/api/u/secure_a')).body.discord,null);
});

await check('deleting the account clears every security table', async()=>{
  const id=db.prepare("SELECT id FROM users WHERE handle='secure_a'").get().id;
  const gone=await request('/api/auth/delete','POST',{password:'newpass1'},sidA);
  assert.equal(gone.status,200,JSON.stringify(gone.body));
  for(const t of ['user_email','reset_codes','user_totp','signin_tickets','security_events','user_discord']){
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id=?`).get(id).n,0,t);
  }
});

await check('a linked trainer is mentioned on their own feed post, and only them', ()=>{
  const m=pullMessage({handle:'a',cards:[{name:'X',rarity:'SIR',price:120,count:1}],more:0,discordId:'123456789012345678'});
  assert.equal(m.content,'<@123456789012345678>');
  assert.deepEqual(m.allowed_mentions,{users:['123456789012345678']});
  assert.equal(pullMessage({handle:'a',cards:[{name:'X',rarity:'SIR',price:120,count:1}],more:0}).content,undefined);
  assert.equal(blackLabelMessage({handle:'a',card:{name:'X',rarity:'SIR',slab:5},discordId:'<@everyone>'}).content,undefined);
});

console.log(`\nsecurity tests passed (${passed})`);
