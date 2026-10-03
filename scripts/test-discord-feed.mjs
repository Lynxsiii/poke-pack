// The Discord feed (worker/discord.js): which pulls are shared, the outbox and its retry rules, the
// per-trainer setting, patch-note posting and the /discord redirect. Runs the real Worker against
// in-memory SQLite, like test-sealed.mjs. Needs Node 22 or later (node:sqlite).
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {isBigPull,pullFeedStmts,queueBlackLabel,flushFeed,postNewPatchNotes,pullMessage,blackLabelMessage,noteMessage,DISCORD_URL} from '../worker/discord.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql){let params=[];const statement={
    bind(...values){params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r||null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const now=Date.now();
db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run('u1','Ash Ketchum','ash','unused','gold',now,now);
db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('s1','u1',now,now+3600000);
db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run('u1',500,500,now,'[]');
let notes=[];
const ASSETS={fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(path==='/data/patch-notes.json')return new Response(JSON.stringify(notes),{headers:{'content-type':'application/json'}});
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}};
const env={DB,ASSETS,SITE_ORIGIN:'https://poke-pack.rip'};
const call=(path,method='GET',body)=>worker.fetch(new Request('https://poke-pack.rip'+path,{method,redirect:'manual',headers:{'content-type':'application/json',origin:'https://poke-pack.rip',cookie:'pp_sid=s1'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(p){pending.push(p);}});
const pending=[];

// The redirect: a 302 so the invite can change without a deploy.
let res=await call('/discord');
assert.equal(res.status,302);assert.equal(res.headers.get('location'),DISCORD_URL);
assert.equal((await call('/discord/')).status,302);
assert.notEqual((await call('/discordish')).status,302);

// Which cards count: SIR or above by rarity, or $100 and up; never a reverse copy.
const card=(extra)=>({id:'sv9-1',name:'Test',rarity:'Rare',market:1,...extra});
assert.equal(isBigPull(card({rarity:'Special Illustration Rare',market:5})),true);
assert.equal(isBigPull(card({rarity:'Hyper Rare',market:5})),true);
assert.equal(isBigPull(card({rarity:'Illustration Rare',market:99.99})),false);
assert.equal(isBigPull(card({rarity:'Rare Holo',market:100})),true);
assert.equal(isBigPull(card({rarity:'Common',market:2})),false);
assert.equal(isBigPull(card({rarity:'Special Illustration Rare',market:500,reverse:true})),false,'a reverse copy is not a big pull');

const set={id:'sv9',name:'Journey Together'};
const sir={id:'sv9-170',name:'Lillie\'s Clefairy ex',number:'170',rarity:'Special Illustration Rare',market:84.5,image:'assets/cards/sv9/170.webp'};
const cheap={id:'sv9-5',name:'Pidgey',rarity:'Common',market:0.1,reverse:false};
const packs=[{set,cards:[cheap,sir]}];

// No webhook set: nothing is queued, and the table is not even created.
assert.deepEqual(await pullFeedStmts(env,'u1',set,packs),[]);
assert.equal((await call('/api/me')).status,200);

// With a webhook set, a big pull queues one outbox statement that saves with the rip.
env.DISCORD_PULLS_WEBHOOK='https://discord.test/api/webhooks/1/secret';
env.DISCORD_NOTES_WEBHOOK='https://discord.test/api/webhooks/2/secret';
assert.deepEqual(await pullFeedStmts(env,'u1',set,[{set,cards:[cheap]}]),[],'a cheap pack queues nothing');
let stmts=await pullFeedStmts(env,'u1',set,packs);
assert.equal(stmts.length,1);
await DB.batch(stmts);
const row=db.prepare('SELECT * FROM discord_feed').get();
assert.equal(row.kind,'pulls');assert.equal(row.user_id,'u1');assert.equal(row.sent_at,null);
const payload=JSON.parse(row.payload);
assert.equal(payload.handle,'ash');assert.equal(payload.cards.length,1);assert.equal(payload.cards[0].name,"Lillie's Clefairy ex");

// The post: one embed with the card as the image, a link to the profile, no pings.
const msg=pullMessage(payload);
assert.equal(msg.embeds[0].author.url,'https://poke-pack.rip/u/ash');
assert.equal(msg.embeds[0].image.url,'https://poke-pack.rip/assets/cards/sv9/170.webp');
assert.match(msg.embeds[0].description,/Special Illustration Rare from Journey Together\n\*\*\$84\.50\*\* market value/);

// Flushing posts it once; a second flush finds nothing.
const sent=[];
const fetcher=async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return new Response(null,{status:204});};
assert.deepEqual(await flushFeed(env,{fetcher}),{sent:1});
assert.equal(sent.length,1);assert.deepEqual(sent[0].body.allowed_mentions,{parse:[]});
assert.deepEqual(await flushFeed(env,{fetcher}),{sent:0});
assert.equal(sent.length,1,'a pull is posted exactly once');

// A rate-limited post is kept for the next flush; a refused post is dropped.
await DB.batch(await pullFeedStmts(env,'u1',set,packs,[],[],now+1));
assert.deepEqual(await flushFeed(env,{fetcher:async()=>new Response('',{status:429})}),{sent:0});
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discord_feed WHERE sent_at IS NULL').get().n,1,'429 leaves the row to retry');
assert.deepEqual(await flushFeed(env,{fetcher:async()=>new Response('',{status:404})}),{sent:0});
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discord_feed WHERE sent_at IS NULL').get().n,0,'a refused post is not retried');
// A post older than an hour is dropped rather than announced late.
await DB.batch(await pullFeedStmts(env,'u1',set,packs,[],[],now-2*3600000));
db.prepare('DELETE FROM discord_feed WHERE sent_at IS NOT NULL').run();
assert.deepEqual(await flushFeed(env,{fetcher}),{sent:0});

// At most six posts per trainer per hour.
db.prepare('DELETE FROM discord_feed').run();
for(let i=0;i<8;i+=1) await DB.batch(await pullFeedStmts(env,'u1',set,packs,[],[],Date.now()));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discord_feed').get().n,6);

// The trainer's choice: on by default, off after PATCH /api/me, nothing queued while off.
db.prepare('DELETE FROM discord_feed').run();
res=await call('/api/me');
assert.equal((await res.json()).user.feedShare,true);
res=await call('/api/me','PATCH',{feedShare:false});
assert.equal(res.status,200);assert.equal((await res.json()).user.feedShare,false);
assert.deepEqual(await pullFeedStmts(env,'u1',set,packs),[]);
await queueBlackLabel(env,{id:'u1'},{id:'sv9-1',name:'Caterpie',rarity:'Common',market:0.2},set);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discord_feed').get().n,0,'opted out: no Black Label post either');
res=await call('/api/me','PATCH',{feedShare:true});
assert.equal((await res.json()).user.feedShare,true);

// A Black Label 10 is queued and posted with its slab value.
await queueBlackLabel(env,{id:'u1'},{id:'sv9-170',name:'Lillie\'s Clefairy ex',number:'170',rarity:'Special Illustration Rare',market:84.5,image:'assets/cards/sv9/170.webp'},set);
const bl=JSON.parse(db.prepare("SELECT payload FROM discord_feed WHERE kind='blacklabel'").get().payload);
assert.ok(bl.card.slab>84.5,'a Black Label slab is worth more than the raw card');
assert.match(blackLabelMessage(bl).embeds[0].title,/^Black Label 10: Lillie/);
sent.length=0;
assert.deepEqual(await flushFeed(env,{fetcher}),{sent:1});

// A real rip with the feed on still works and answers normally.
db.prepare('DELETE FROM discord_feed').run();
res=await call('/api/packs/rip','POST',{setId:'me5'});
assert.equal(res.status,200,'a rip with the webhook set still opens');
await Promise.all(pending.splice(0));

// Patch notes: the first run records history and posts only today's entries; later runs post new ones, once.
const day=(offset)=>new Date(now+offset*86400000).toISOString().slice(0,10);
notes=[
  {id:'n3',date:day(0),title:'Today',summary:'Posted at once.',items:['One thing','Another thing']},
  {id:'n2',date:day(-1),title:'Yesterday',summary:'Already history.',items:['Old']},
  {id:'n1',date:day(-5),title:'Last week',summary:'Older.',items:['Older']},
];
sent.length=0;
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher}),{posted:1});
assert.equal(sent[0].url,env.DISCORD_NOTES_WEBHOOK);assert.equal(sent[0].body.embeds[0].title,'Today');
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher}),{posted:0});
notes.unshift({id:'n4',date:day(0),title:'Fresh',summary:'New one.',groups:[{title:'Cards',items:['A','B']}]});
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher}),{posted:1});
assert.equal(sent.at(-1).body.embeds[0].title,'Fresh');
assert.match(sent.at(-1).body.embeds[0].description,/\*\*Cards\*\*\n• A\n• B/);
assert.equal(noteMessage(notes[0]).embeds[0].url,'https://poke-pack.rip/notes#note-n4');
// A rate-limited note is retried on the next run, not lost.
notes.unshift({id:'n5',date:day(0),title:'Retry me',summary:'x',items:[]});
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher:async()=>new Response('',{status:429})}),{posted:0});
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher}),{posted:1});
// No webhook, no posts and no records.
delete env.DISCORD_NOTES_WEBHOOK;
notes.unshift({id:'n6',date:day(0),title:'Quiet',summary:'x',items:[]});
assert.deepEqual(await postNewPatchNotes(env,{now,fetcher}),{posted:0});
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM discord_posted WHERE key='n6'").get().n,0);
console.log('discord feed: ok');
