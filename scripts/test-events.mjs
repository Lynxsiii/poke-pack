// Weekly events and prizes: off by default, paid packs only, steps, the community goal,
// prize eligibility, one prize a week, held prizes, and single-payout claims.
// node scripts/test-events.mjs (Node 22+ for node:sqlite)
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {processEvents,freezePrizes,maintainEvents,resetEventsCache,holdReason} from '../worker/events.js';
import {processPackLog,resetRankingsCache,ensureRankSchema} from '../worker/rankings.js';
import {EVENTS_MODE,EVENT_REWARDS,eventFor,pointsFor,goalFor,prizeFor,weekOf,weekStart,STEP_COINS,GOAL_COINS,GOAL_FLOOR,HOLD_CENTS,PRIZE_TABLE,featuredSets,THROWBACK_ERAS,TYPES} from '../js/events-rules.js';
import {PLAYABLE_SETS} from '../js/catalog.js';

// The switches ship off. Turning them on is Noah's call, in a change of its own.
assert.equal(EVENTS_MODE,'off','events must ship switched off');
assert.equal(EVENT_REWARDS,false,'event rewards must ship switched off');

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
const call=async(path,{sid,method='GET',body}={})=>{
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{...(sid?{cookie:'pp_sid='+sid}:{}),...(body?{'content-type':'application/json',origin:'https://poke-pack.rip'}:{})},body:body?JSON.stringify(body):undefined}),env);
  return {status:res.status,body:await res.json()};
};

// ---- Off: nothing shows, nothing runs, no tables appear. ----
let r=await call('/api/events');
assert.deepEqual(r.body,{visible:false});
assert.deepEqual(await maintainEvents(env,{}),{off:true});
r=await call('/api/events/claim',{method:'POST',body:{kind:'step',week:weekOf(Date.now()),ref:'0'}});
assert.deepEqual(r.body,{visible:false});
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'event_%'").get().n,0,'off mode creates nothing');

// ---- The rotation and the four kinds of scoring. ----
for(let w=150;w<158;w++){const e=eventFor(w);assert.deepEqual(e,eventFor(w));assert.ok(e.title&&e.rule&&e.steps.length===4);}
assert.deepEqual([0,1,2,3].map(i=>eventFor(152+i).kind),['set','hits','type','era']);
assert.ok(featuredSets().every(s=>s.cost>0),'a set week never features a set with no packs to buy');
const none=async()=>null;
const typed=async id=>id.startsWith('T:')?[id.slice(2)]:null;
const setEv={kind:'set',setId:'me5'};
assert.equal(await pointsFor(setEv,{cost:5,set_id:'me5'},[],none),1);
assert.equal(await pointsFor(setEv,{cost:5,set_id:'me6'},[],none),0);
assert.equal(await pointsFor(setEv,{cost:0,set_id:'me5'},[],none),0,'a pack nobody paid for never scores (battle packs log at zero)');
const eraOf=id=>PLAYABLE_SETS.find(s=>s.id===id).era;
assert.equal(await pointsFor({kind:'era',era:eraOf('me5')},{cost:5,set_id:'me5'},[],none),1);
assert.equal(await pointsFor({kind:'era',era:'XY'},{cost:5,set_id:'me5'},[],none),0);
assert.equal(await pointsFor({kind:'hits'},{cost:5,set_id:'me5'},[{id:'me5-1',rarity:'Double Rare'},{id:'me5-2',rarity:'Common'},{id:'me5-3',rarity:'Ultra Rare',reverse:true}],none),1);
assert.equal(await pointsFor({kind:'type',type:'Fire'},{cost:5,set_id:'me5'},[{id:'T:Fire'},{id:'T:Water'},{id:'T:Fire'},{id:'x'}],typed),2);
assert.equal(goalFor({kind:'set'},0),GOAL_FLOOR.set);
assert.equal(goalFor({kind:'set'},40),480);
assert.equal(goalFor({kind:'hits',goal:999},40),999);
assert.deepEqual([1,2,3,4,10,11,25,26].map(prizeFor),[2000,1200,800,300,300,100,100,0]);

// ---- On (tests only: env.__events is an object, which no Worker variable can be). ----
env.__events={mode:'on',rewards:true};
const real=Date.now();
const W=weekOf(real), L=W-1;
const now=Math.max(real,weekStart(W)+7*3600_000);
const old=weekStart(L)-86400000*60;
function addUser(id,handle,{created=old,level=30,tester=0}={}) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,handle.toUpperCase(),handle,'x','gold',created,real);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,packs_opened) VALUES(?,?,?,?,?)').run(id,1000,1000,created,0);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('s'+id,id,real,real+3600000);
  levels.push([id,level]);
  if(tester)testers.push(id);
}
const levels=[],testers=[];
addUser('a','alpha'); addUser('b','bravo'); addUser('n','newbie',{created:weekStart(W)-86400000*2}); addUser('l','lowlvl',{level:2});
addUser('f','fewpacks'); addUser('c','claude'); addUser('h','holder'); addUser('p','polar'); addUser('t','tester',{tester:1});
await call('/api/events'); // lets the Worker add its lazy columns and tables
for(const id of testers)db.prepare('UPDATE users SET tester=1 WHERE id=?').run(id);
await ensureRankSchema(env);
for(const [id,level] of levels)db.prepare('INSERT INTO rank_scores(user_id,level,server_packs,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET level=excluded.level').run(id,level,50,real);

const otherSet=id=>PLAYABLE_SETS.find(s=>s.cost>0&&s.id!==id).id;
const otherEra=era=>PLAYABLE_SETS.find(s=>s.cost>0&&s.era!==era).id;
const eraSet=era=>PLAYABLE_SETS.find(s=>s.cost>0&&s.era===era).id;
/** One pack that scores exactly one point in that week's event (or none), whatever kind the rotation gave the week. */
function rip(user,week,{scores=true,cost=5,minute=0}={}) {
  const e=eventFor(week);
  let set='me5',cards=[{id:'me5-900',rarity:'Common',reverse:false}];
  if(e.kind==='set')set=scores?e.setId:otherSet(e.setId);
  if(e.kind==='era')set=scores?eraSet(e.era):otherEra(e.era);
  if(e.kind==='hits'&&scores)cards=[{id:'me5-901',rarity:'Double Rare',reverse:false}];
  if(e.kind==='type')cards=[{id:'T:'+(scores?e.type:TYPES.find(t=>t!==e.type)),rarity:'Common',reverse:false}];
  db.prepare('INSERT INTO pack_log(user_id,set_id,wrapper_id,cost,cards,at) VALUES(?,?,?,?,?,?)').run(user,set,'w',cost,JSON.stringify(cards),weekStart(week)+3600_000+minute*60_000);
}
const deps={findCatalogCard:async(e,req,id)=>id.startsWith('T:')?{id,supertype:'Pokémon',types:[id.slice(2)],market:1,rarity:'Common'}:{id,supertype:'Pokémon',types:['Normal'],market:1,rarity:'Common'}};
const many=(n,fn)=>{for(let i=0;i<n;i++)fn(i);};

// A pack from before the week events were switched on is never scored.
many(40,()=>rip('a',L-1));
assert.equal(await processEvents(env,deps,{now:weekStart(L)+60_000}),0);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_scores').get().n,0);

// Last week. alpha leads, bravo second, the rest fail one rule each.
many(12,i=>rip('a',L,{minute:i}));
many(11,i=>rip('b',L,{minute:20+i}));
many(20,i=>rip('n',L,{minute:40+i}));       // account too new
many(15,i=>rip('l',L,{minute:60+i}));       // level too low
many(3,i=>rip('f',L,{minute:80+i}));        // too few paid packs
many(30,i=>rip('c',L,{minute:90+i}));       // hidden handle
many(30,i=>rip('t',L,{minute:120+i}));      // test account
many(10,i=>rip('h',L,{minute:150+i}));      // fine, but fed by coin flips below
many(25,()=>rip('b',L,{cost:0}));           // battle packs: logged at zero, score nothing
many(6,()=>rip('b',L,{scores:false}));      // paid, but not this week's event
assert.equal(await processEvents(env,deps,{batch:17}),162);
assert.equal(await processEvents(env,deps),0,'a second walk counts nothing twice');
const score=(u,w)=>db.prepare('SELECT * FROM event_scores WHERE user_id=? AND week=?').get(u,w);
assert.equal(score('a',L).points,12);
assert.equal(score('b',L).points,11);
assert.equal(score('b',L).packs,17,'paid packs count toward the pack minimum, free ones do not');
await processPackLog(env,deps);

// Coin flips: holder beat the same player four times for more than the hold line. bravo lost one to alpha, which is nothing.
const flip=(id,host,guest,winner,value,at=weekStart(L)+7200_000)=>db.prepare("INSERT INTO coinflips(id,host_id,request_id,status,bot,host_stake,host_value,guest_id,guest_stake,guest_value,winner,created_at,expires_at,flipped_at) VALUES(?,?,?,'done',0,'[]',?,?,'[]',?,?,?,?,?)").run(id,host,id,value,guest,value,winner,at,at+1,at);
db.exec('DROP TRIGGER IF EXISTS coinflip_stake_check; DROP TRIGGER IF EXISTS coinflip_settle_check;');
for(const t of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='coinflips'").all())db.exec(`DROP TRIGGER "${t.name}"`);
many(4,i=>flip('hf'+i,'h','f','host',HOLD_CENTS/4+100));
flip('ab','a','b','host',HOLD_CENTS*3);
assert.match(await holdReason(env,'h',L),/^flips:f$/);
assert.equal(await holdReason(env,'a',L),null,'one big flip is a flip, not a feed');
assert.equal(await holdReason(env,'f',L),null);

// The freeze waits for the grace, then runs once.
assert.equal(await freezePrizes(env,{now:weekStart(W)+3600_000}),0,'inside the grace');
const frozen=await freezePrizes(env,{now});
assert.ok(frozen>0);
assert.equal(await freezePrizes(env,{now:now+1000}),0,'frozen once');
const prizes=db.prepare('SELECT p.*,u.handle FROM event_prizes p JOIN users u ON u.id=p.user_id WHERE week=? ORDER BY board,place').all(L);
const on=board=>prizes.filter(p=>p.board===board).map(p=>p.handle);
assert.deepEqual(on('event'),['alpha','bravo','holder']);
for(const board of ['event','packs','best'])for(const out of ['newbie','lowlvl','fewpacks','claude','tester'])assert.ok(!on(board).includes(out),`${out} takes no prize on ${board}`);
const prize=(board,handle)=>prizes.find(p=>p.board===board&&p.handle===handle);
assert.equal(prize('event','alpha').coins,2000);
// bravo is second here but first on Packs ripped, so the bigger prize is the one that pays.
assert.equal(prize('event','bravo').coins,0);
assert.equal(prize('packs','bravo').coins,2000);
assert.equal(prize('event','holder').coins,800);
assert.ok(prize('event','holder').held,'a fed account has its prize held');
assert.equal(prize('event','alpha').held,null);
// One prize a week: every other place the same player earned pays nothing.
for(const who of ['alpha','bravo','holder']){
  const paid=prizes.filter(p=>p.handle===who&&p.coins>0);
  assert.equal(paid.length,1,`${who} takes one prize`);
  assert.ok(prizes.filter(p=>p.handle===who&&!p.coins).every(p=>p.note==='smaller'));
}
assert.ok(prizes.reduce((n,p)=>n+p.coins,0)<=PRIZE_TABLE.reduce((n,[from,to,coins])=>n+(to-from+1)*coins,0)*3);

// ---- This week: the page's numbers, steps and the community goal. ----
const ev=eventFor(W);
many(ev.steps[1],i=>rip('a',W,{minute:i}));
many(ev.steps[0],i=>rip('b',W,{minute:i}));
many(1,()=>rip('f',W));
await processEvents(env,deps);
resetEventsCache();
r=await call('/api/events',{sid:'sa'});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.visible,true);
assert.equal(r.body.event.title,ev.title);
assert.deepEqual(r.body.event.steps.map(s=>s.coins),STEP_COINS);
assert.equal(r.body.me.points,ev.steps[1]);
assert.deepEqual(r.body.me.steps.map(s=>s.done),[true,true,false,false]);
assert.equal(r.body.me.place,1);
assert.deepEqual(r.body.board.map(x=>x.user.handle),['alpha','bravo','fewpacks']);
assert.equal(r.body.community.total,ev.steps[1]+ev.steps[0]+1);
assert.equal(r.body.community.reached,false);
assert.equal(r.body.last.winners.event[0].user.handle,'alpha');
assert.ok(r.body.me.waiting.some(w=>w.kind==='prize'&&w.ref==='event'&&w.coins===2000&&!w.held));
assert.ok(JSON.stringify(r.body).indexOf('password')<0);
r=await call('/api/events');
assert.equal(r.body.me,null,'signed out still sees the event');

const coins=id=>db.prepare('SELECT coins,granted FROM profiles WHERE user_id=?').get(id);
const claim=(sid,body)=>call('/api/events/claim',{sid,method:'POST',body});
// A step pays once. (D1 runs a batch as one transaction; this harness can't interleave two, so the claims go one after the other.)
const before=coins('a').coins;
const both=[await claim('sa',{kind:'step',week:W,ref:'0'}),await claim('sa',{kind:'step',week:W,ref:'0'})];
assert.deepEqual(both.map(x=>x.status).sort(),[200,400]);
assert.equal(coins('a').coins,before+STEP_COINS[0]);
assert.ok(both.find(x=>x.status===200).body.save,'the claim hands back the save');
assert.equal((await claim('sa',{kind:'step',week:W,ref:'2'})).status,400,'a step not reached');
assert.equal((await claim('sa',{kind:'step',week:W,ref:'9'})).status,400);
assert.equal((await claim('sa',{kind:'step',week:W+1,ref:'0'})).status,400,'a week that has not happened');
assert.equal((await claim('sa',{kind:'step',week:W-9,ref:'0'})).status,400,'a week long closed');
assert.equal((await claim(null,{kind:'step',week:W,ref:'0'})).status,401);
// The community goal: nothing until it is reached, then only for players at their first step.
assert.equal((await claim('sa',{kind:'goal',week:W,ref:'goal'})).status,400);
db.prepare('INSERT INTO event_scores(user_id,week,points,packs,at) VALUES(?,?,?,?,?)').run('c',W,GOAL_FLOOR[ev.kind]*20,1,real);
resetEventsCache();
assert.equal((await claim('sb',{kind:'goal',week:W,ref:'goal'})).status,400,'the hidden account does not fill the community goal');
db.prepare('INSERT INTO event_scores(user_id,week,points,packs,at) VALUES(?,?,?,?,?)').run('h',W,GOAL_FLOOR[ev.kind]*20,1,real);
resetEventsCache();
assert.equal((await claim('sf',{kind:'goal',week:W,ref:'goal'})).status,400,'one point is not a first step');
r=await claim('sb',{kind:'goal',week:W,ref:'goal'});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.coins,GOAL_COINS);
assert.equal((await claim('sb',{kind:'goal',week:W,ref:'goal'})).status,400);
r=await call('/api/events',{sid:'sa'});
assert.ok(!r.body.board.some(x=>x.user.handle==='claude'),'the hidden account stays off the event board');

// Prizes: paid once; a held one is refused until the owner lets it go; a place with no coins pays nothing.
const a0=coins('a').coins;
assert.equal((await claim('sa',{kind:'prize',week:L,ref:'event'})).status,200);
assert.equal((await claim('sa',{kind:'prize',week:L,ref:'event'})).status,400);
assert.equal((await claim('sa',{kind:'prize',week:L,ref:'packs'})).status,400,'the smaller place pays nothing');
assert.equal(coins('a').coins,a0+2000);
assert.equal((await claim('sh',{kind:'prize',week:L,ref:'event'})).status,409);
assert.equal((await call('/api/events/held',{sid:'sa'})).status,404,'only the owner sees held prizes');
r=await call('/api/events/held',{sid:'sp'});
assert.equal(r.body.held.length,1);
assert.match(r.body.held[0].why,/@fewpacks/);
assert.equal((await call('/api/events/held',{sid:'sa',method:'POST',body:{week:L,board:'event',place:3,pay:true}})).status,404);
r=await call('/api/events/held',{sid:'sp',method:'POST',body:{week:L,board:'event',place:3,pay:true}});
assert.equal(r.body.ok,true);
assert.equal((await claim('sh',{kind:'prize',week:L,ref:'event'})).status,200);
// Every coin that went out has a claim row to match.
const paid=db.prepare('SELECT COALESCE(SUM(coins),0) AS n FROM event_claims').get().n;
const minted=db.prepare('SELECT SUM(granted) AS n FROM profiles').get().n-9*1000;
assert.equal(minted,paid);

// ---- Rewards off: the event runs, the page shows no amounts and nothing can be claimed. ----
env.__events={mode:'on',rewards:false};
resetEventsCache();
r=await call('/api/events',{sid:'sb'});
assert.equal(r.body.rewards,false);
assert.equal(r.body.prizes,null);
assert.deepEqual(r.body.event.steps.map(s=>s.coins),[0,0,0,0]);
assert.equal((await claim('sb',{kind:'step',week:W,ref:'0'})).status,403);

// ---- Preview: only the owner sees it. ----
env.__events={mode:'preview',rewards:true};
assert.deepEqual((await call('/api/events',{sid:'sa'})).body,{visible:false});
assert.deepEqual((await call('/api/events')).body,{visible:false});
assert.equal((await call('/api/events',{sid:'sp'})).body.visible,true);
assert.deepEqual((await claim('sa',{kind:'step',week:W,ref:'1'})).body,{visible:false});

// ---- Deleting an account takes its event rows with it. ----
env.__events={mode:'on',rewards:true};
db.prepare("UPDATE users SET password_hash='x' WHERE id='b'").run();
const stmts=await (await import('../worker/events.js')).clearEventStmts(env,'b');
await DB.batch(stmts);
assert.equal(db.prepare("SELECT (SELECT COUNT(*) FROM event_scores WHERE user_id='b')+(SELECT COUNT(*) FROM event_claims WHERE user_id='b')+(SELECT COUNT(*) FROM event_prizes WHERE user_id='b') AS n").get().n,0);

console.log('Events checks passed: off by default, rotation, paid packs only, single-count walk, steps, community goal, prize rules, one prize a week, held prizes, single payouts, rewards-off and preview modes.');
