import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {droughtFromLog} from '../worker/stats.js';
import {
  activeQuests,activeChests,chestFor,questPeriods,periodEnds,streakFromDays,
  DAILY_POOL,WEEKLY_POOL,MONTHLY_QUESTS,QUESTS,
} from '../js/quests.js';
// Runs the real Worker against in-memory sqlite, like test-profile-pages.mjs.
// The clock is Date.now, which the Worker reads, so days can pass in a test.
const DAY=86_400_000;
const realNow=Date.now();
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { let params=[];const statement={
    bind(...values){assert.ok(values.length<=100,'D1 allows at most 100 bound parameters');params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;},
};
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};

let clock=Date.UTC(2026,8,30,12);
Date.now=()=>clock;
const setDay=(y,m,d,h=12)=>{clock=Date.UTC(y,m,d,h);};

function addUser(id,handle,sid,coins=25) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,handle,handle,'unused','gold',realNow,realNow);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(sid,id,realNow,realNow+3650*DAY);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id,coins,coins,realNow,'[]');
}
addUser('test','questtester','sid-test',5000);
addUser('other','otherguy','sid-other');
addUser('legacy','legacyguy','sid-legacy');
async function request(path,method='GET',body,sid='sid-test') {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(sid?{cookie:'pp_sid='+sid}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
const me=async(sid)=>(await request('/api/me','GET',undefined,sid)).body.save;
const coins=(id='test')=>db.prepare('SELECT coins FROM profiles WHERE user_id=?').get(id).coins;
const count=(table,id='test')=>db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`).get(id).n;
const iso=ms=>new Date(ms).toISOString().slice(0,10);
/** Make a quest finishable: packs come from pack_log, everything else from quest_events. */
function satisfy(row,at=clock) {
  if(row.kind==='packs') {
    for(let i=0;i<row.goal;i++) db.prepare('INSERT INTO pack_log(user_id,set_id,wrapper_id,cost,cards,at) VALUES(?,?,?,?,?,?)').run('test','me5','w',0,'[]',at);
  } else db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('test',row.kind,row.goal,at);
}

// ---- Pure rules: pools, periods, chests, streak walker ----
{
  assert.equal(new Set(QUESTS.map(row=>row.id)).size,QUESTS.length,'quest ids are unique');
  assert.ok(DAILY_POOL.length>=14&&WEEKLY_POOL.length>=10&&MONTHLY_QUESTS.length===3);
  for(const id of ['daily-bonus','daily-rip','daily-five','daily-spares','weekly-bonus','weekly-packs','weekly-spares']) assert.ok(QUESTS.some(row=>row.id===id),`${id} is kept`);
  const wed=Date.UTC(2026,8,30,12);
  assert.deepEqual(questPeriods(wed),{daily:Date.UTC(2026,8,30),weekly:Date.UTC(2026,8,28),monthly:Date.UTC(2026,8,1)});
  assert.equal(questPeriods(Date.UTC(2026,9,1,0,0,0)).monthly,Date.UTC(2026,9,1),'the first is a month start');
  assert.equal(questPeriods(Date.UTC(2026,8,30,23,59,59)).monthly,Date.UTC(2026,8,1));
  assert.equal(new Date(questPeriods(Date.UTC(2026,9,4)).weekly).getUTCDay(),1,'weeks start on Monday');
  assert.equal(periodEnds(questPeriods(wed)).monthly,Date.UTC(2026,9,1));
  assert.equal(periodEnds(questPeriods(Date.UTC(2026,11,15))).monthly,Date.UTC(2027,0,1),'December rolls into January');

  // Deterministic: the same period always gives the same list, on any machine.
  const a=activeQuests(questPeriods(wed)),b=activeQuests(questPeriods(wed+3600_000));
  assert.deepEqual(a,b);
  const lists=new Set();
  for(let d=0;d<28;d++) {
    const day=activeQuests(questPeriods(Date.UTC(2026,8,1+d,9)));
    assert.equal(day.daily[0].id,'daily-bonus','Clock in is always first');
    assert.equal(day.daily.length,5);
    assert.equal(day.weekly.length,4);
    assert.equal(day.monthly.length,3);
    assert.equal(new Set(day.daily.map(r=>r.kind)).size,5,'a day never repeats a kind');
    assert.equal(new Set(day.weekly.map(r=>r.kind)).size,4,'a week never repeats a kind');
    const dailyCoins=day.daily.reduce((n,r)=>n+r.coins,0);
    assert.ok(dailyCoins<300,`a day pays ${dailyCoins}`);
    const chest=activeChests(day);
    assert.ok(chest.daily.coins<=Math.round(dailyCoins*0.3)&&chest.daily.coins>=Math.round(dailyCoins*0.2),'a chest is about a quarter of its quests');
    lists.add(day.daily.map(r=>r.id).join());
  }
  assert.ok(lists.size>=15,'the daily list rotates');
  // A week keeps one weekly list from Monday to Sunday.
  const monday=activeQuests(questPeriods(Date.UTC(2026,8,28,0))).weekly.map(r=>r.id).join();
  for(let d=0;d<7;d++) assert.equal(activeQuests(questPeriods(Date.UTC(2026,8,28+d,20))).weekly.map(r=>r.id).join(),monday);
  const weeklyCoins=activeQuests(questPeriods(wed)).weekly.reduce((n,r)=>n+r.coins,0);
  assert.ok(weeklyCoins>=250&&weeklyCoins<=650,`weeklies pay ${weeklyCoins}`);
  const monthlyCoins=MONTHLY_QUESTS.reduce((n,r)=>n+r.coins,0);
  assert.ok(monthlyCoins+chestFor('monthly',MONTHLY_QUESTS).coins>=1000&&monthlyCoins+chestFor('monthly',MONTHLY_QUESTS).coins<=2000);
  assert.equal(streakFromDays([10,9,8],10),3);
  assert.equal(streakFromDays([9,8],10),2,'yesterday keeps a streak alive');
  assert.equal(streakFromDays([8,7],10),0,'a missed day breaks it');
  assert.equal(streakFromDays([10,9,7,6,5],10),2);
}

// ---- Lazy schema: the quest tables can be missing and are made on demand ----
{
  db.exec('DROP TABLE quest_events;DROP TABLE quest_claims;DROP TABLE player_stats;');
  const save=await me();
  assert.ok(!save.quests.unavailable,'missing tables are created on demand');
  for(const table of ['player_stats','quest_events','quest_claims']) assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name=?").get(table).n,1,table);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE '%quest%'").get().n,0,'no trigger is put on the battle tables');
}

// ---- The old bug: a claim wiped every event and claim the player had ----
{
  // Find a day whose list has a sold quest and a packs quest, so progress can be watched across a claim.
  let day=0;
  const has=(list,kind)=>list.some(r=>r.kind===kind);
  while(day<60) {
    const list=activeQuests(questPeriods(Date.UTC(2026,8,30+day,12))).daily;
    if(has(list,'sold')&&has(list,'packs')) break;
    day++;
  }
  assert.ok(day<60,'the pools produce such a day');
  clock=Date.UTC(2026,8,30+day,12);
  db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-1',9,0);
  db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-2',9,0);
  let response=await request('/api/cards/sell-duplicates','POST',{setId:'me5'});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.copies,16);
  response=await request('/api/packs/rip','POST',{setId:'me5'});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal((await request('/api/daily','POST')).status,200);
  let save=await me();
  const today=activeQuests(save.quests.periods).daily;
  const sold=today.find(r=>r.kind==='sold'),packs=today.find(r=>r.kind==='packs');
  assert.deepEqual(save.quests.active.daily,today.map(r=>r.id),'client and Worker pick the same list');
  assert.equal(save.quests.progress[sold.id],16);
  assert.equal(save.quests.progress[packs.id],1);
  assert.equal(save.quests.progress['daily-bonus'],1);
  const events=count('quest_events');
  assert.ok(events>=3);

  // Claim Clock in; everything else must stay exactly as it was.
  const before=coins();
  response=await request('/api/quests/claim','POST',{id:'daily-bonus'});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.coins,25);
  assert.equal(coins(),before+25);
  assert.equal(count('quest_events'),events,'a claim does not delete events');
  save=await me();
  assert.equal(save.quests.progress[sold.id],16,'other quests keep their progress');
  assert.equal(save.quests.progress[packs.id],1);
  assert.deepEqual(save.quests.claimed,['daily-bonus']);
  // Twice is refused and pays nothing; the old bug let a claim repeat.
  assert.equal((await request('/api/quests/claim','POST',{id:'daily-bonus'})).status,400);
  assert.equal(coins(),before+25);
  assert.equal(count('quest_claims'),1);
  // A pack quest can be claimed once, not once per claim of something else.
  if(packs.goal<=1) {
    assert.equal((await request('/api/quests/claim','POST',{id:packs.id})).status,200);
    assert.equal((await request('/api/quests/claim','POST',{id:packs.id})).status,400,'daily pack quest cannot be claimed twice');
    assert.equal((await request('/api/quests/claim','POST',{id:'daily-bonus'})).status,400);
  }
  // Not complete, not active, and unknown are all 400 and pay nothing.
  const idle=today.find(r=>r.goal>save.quests.progress[r.id]);
  if(idle) assert.equal((await request('/api/quests/claim','POST',{id:idle.id})).status,400);
  const inactive=DAILY_POOL.find(r=>!today.includes(r));
  assert.equal((await request('/api/quests/claim','POST',{id:inactive.id})).status,400,'an inactive quest cannot be claimed');
  assert.equal((await request('/api/quests/claim','POST',{id:'nope'})).status,400);
  assert.equal((await request('/api/quests/claim','POST',{id:'daily-bonus'},null)).status,401);
  assert.equal((await request('/api/quests/claim','POST',{id:'chest-daily'})).status,400,'a chest stays shut until every quest is claimed');
  // Pruning is safe: it never touches this month, and does touch the very old.
  db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('test','sold',1,clock-41*DAY);
  db.prepare('INSERT INTO quest_claims(user_id,quest_id,period_start,claimed_at) VALUES(?,?,?,?)').run('test','ancient',clock-500*DAY,clock-500*DAY);
  const keep=db.prepare('SELECT COUNT(*) AS n FROM quest_events WHERE user_id=? AND at>=?').get('test',clock-40*DAY).n;
  const other=db.prepare('SELECT COUNT(*) AS n FROM quest_claims WHERE user_id=? AND claimed_at>=?').get('test',clock-400*DAY).n;
  save=await me();
  const next=today.find(r=>r.id!=='daily-bonus'&&!save.quests.claimed.includes(r.id)&&r.goal<=save.quests.progress[r.id]);
  if(next) {
    assert.equal((await request('/api/quests/claim','POST',{id:next.id})).status,200);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_claims WHERE user_id=? AND quest_id='ancient'").get('test').n,0,'claims over 400 days old are pruned');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quest_events WHERE user_id=? AND at<?').get('test',clock-40*DAY).n,0,'events over 40 days old are pruned');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quest_events WHERE user_id=? AND at>=?').get('test',clock-40*DAY).n,keep);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM quest_claims WHERE user_id=? AND claimed_at>=?').get('test',clock-400*DAY).n>=other);
  }
}

// ---- Chests: every active quest of a period unlocks that period's chest, once ----
{
  db.exec("DELETE FROM quest_claims;DELETE FROM quest_events;DELETE FROM pack_log;");
  setDay(2026,10,10); // a Tuesday in November: fresh day, week and month
  let save=await me();
  const active=activeQuests(save.quests.periods);
  const chests=activeChests(active);
  assert.deepEqual(save.quests.chests,{daily:false,weekly:false,monthly:false});
  assert.deepEqual(save.quests.chestCoins,{daily:chests.daily.coins,weekly:chests.weekly.coins,monthly:chests.monthly.coins});
  for(const period of ['daily','weekly','monthly']) {
    const rows=active[period];
    rows.forEach(row=>satisfy(row));
    for(let i=0;i<rows.length;i++) {
      // Locked until the last quest is claimed.
      const shut=await request('/api/quests/claim','POST',{id:chests[period].id});
      assert.equal(shut.status,400,`${period} chest shut with ${i} of ${rows.length} claimed`);
      const paid=coins();
      const res=await request('/api/quests/claim','POST',{id:rows[i].id});
      assert.equal(res.status,200,JSON.stringify(res.body));
      assert.equal(coins(),paid+rows[i].coins);
      assert.equal(res.body.chest,false);
    }
    save=await me();
    assert.equal(save.quests.chests[period],true,`${period} chest unlocked`);
    assert.ok(!save.quests.claimed.includes(chests[period].id),'unlocked is not opened');
    const paid=coins();
    const res=await request('/api/quests/claim','POST',{id:chests[period].id});
    assert.equal(res.status,200,JSON.stringify(res.body));
    assert.equal(res.body.chest,true);
    assert.equal(res.body.coins,chests[period].coins);
    assert.equal(coins(),paid+chests[period].coins);
    assert.equal((await request('/api/quests/claim','POST',{id:chests[period].id})).status,400,`${period} chest opens once`);
    assert.equal(coins(),paid+chests[period].coins);
    save=await me();
    assert.ok(save.quests.claimed.includes(chests[period].id));
  }
  assert.equal(save.stats.counters.chests,3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_claims WHERE quest_id LIKE 'chest-%'").get().n,3,'chests are ordinary claim rows');
  // Next day: a new daily list and a closed daily chest, but the week and month chests stay opened.
  setDay(2026,10,11);
  save=await me();
  assert.equal(save.quests.chests.daily,false);
  assert.ok(!save.quests.claimed.includes('chest-daily'));
  assert.ok(save.quests.claimed.includes('chest-weekly')&&save.quests.claimed.includes('chest-monthly'));
  assert.equal((await request('/api/quests/claim','POST',{id:'chest-weekly'})).status,400,'a weekly chest does not reopen mid-week');
}

// ---- Monthly period ----
{
  db.exec("DELETE FROM quest_claims;DELETE FROM quest_events;DELETE FROM pack_log;");
  setDay(2026,9,2); // Friday 2 October
  for(let i=0;i<10;i++) db.prepare('INSERT INTO pack_log(user_id,set_id,wrapper_id,cost,cards,at) VALUES(?,?,?,?,?,?)').run('test','me5','w',0,'[]',clock);
  db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('test','hits',40,clock);
  setDay(2026,9,20); // a later week of the same month
  let save=await me();
  assert.equal(save.quests.periods.monthly,Date.UTC(2026,9,1));
  assert.equal(save.quests.progress['monthly-packs'],10,'the month remembers earlier weeks');
  assert.equal(save.quests.progress['monthly-hits'],40);
  for(const row of activeQuests(save.quests.periods).weekly) if(row.kind==='packs') assert.equal(save.quests.progress[row.id],0,'the week does not');
  assert.equal((await request('/api/quests/claim','POST',{id:'monthly-hits'})).status,200);
  assert.equal((await request('/api/quests/claim','POST',{id:'monthly-hits'})).status,400);
  setDay(2026,10,1,0); // midnight opens November
  save=await me();
  assert.equal(save.quests.periods.monthly,Date.UTC(2026,10,1));
  assert.equal(save.quests.progress['monthly-packs'],0);
  assert.equal(save.quests.progress['monthly-hits'],0);
  assert.ok(!save.quests.claimed.includes('monthly-hits'),'a new month starts unclaimed');
  db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('test','hits',40,clock);
  assert.equal((await request('/api/quests/claim','POST',{id:'monthly-hits'})).status,200,'and can be claimed again');
}

// ---- Streak across UTC days ----
{
  db.exec("DELETE FROM quest_claims;DELETE FROM quest_events;DELETE FROM pack_log;DELETE FROM player_stats;");
  db.prepare('UPDATE profiles SET last_daily=NULL WHERE user_id=?').run('test');
  setDay(2026,11,10,12);
  // Three earlier days of claims, planted with their own periods.
  for(const back of [3,2,1]) {
    const at=clock-back*DAY;
    const start=Date.UTC(new Date(at).getUTCFullYear(),new Date(at).getUTCMonth(),new Date(at).getUTCDate());
    db.prepare('INSERT INTO quest_claims(user_id,quest_id,period_start,claimed_at) VALUES(?,?,?,?)').run('test','daily-bonus',start,at);
  }
  assert.equal((await me()).quests.streak,0,'nothing is stored until a claim');
  assert.equal((await request('/api/daily','POST')).status,200);
  let res=await request('/api/quests/claim','POST',{id:'daily-bonus'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.save.quests.streak,4,'three planted days plus today');
  assert.equal(res.body.save.quests.streakBest,4);
  assert.equal(res.body.save.stats.counters.streak,4,'mirrored into counters');
  assert.equal(res.body.save.stats.counters.streakBest,4);
  // Claiming again the same day does not extend it.
  clock+=3600_000*2;
  let save=await me();
  assert.equal(save.quests.streak,4);
  // Skip to the next day without a claim: the streak is still alive.
  setDay(2026,11,11,12);
  save=await me();
  assert.equal(save.quests.streak,4,'a streak survives until a whole day passes');
  // Miss a whole day: it is gone, the best stays.
  setDay(2026,11,12,12);
  save=await me();
  assert.equal(save.quests.streak,0);
  assert.equal(save.quests.streakBest,4);
  assert.equal(save.stats.counters.streak,0);
  assert.equal((await request('/api/daily','POST')).status,200);
  res=await request('/api/quests/claim','POST',{id:'daily-bonus'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.save.quests.streak,1,'a new run starts at one');
  assert.equal(res.body.save.quests.streakBest,4);
  // Consecutive days carry on.
  setDay(2026,11,13,9);
  assert.equal((await request('/api/daily','POST')).status,200);
  res=await request('/api/quests/claim','POST',{id:'daily-bonus'});
  assert.equal(res.body.save.quests.streak,2);
}

// ---- Counters ----
{
  db.exec("DELETE FROM quest_claims;DELETE FROM quest_events;DELETE FROM pack_log;DELETE FROM player_stats;DELETE FROM cards;");
  db.prepare("UPDATE profiles SET coins=5000,last_daily=NULL,packs_since_hit=0 WHERE user_id='test'").run();
  db.prepare('INSERT INTO friends(from_id,to_id,status,created_at) VALUES(?,?,?,?)').run('test','other','accepted',clock);
  db.prepare('INSERT INTO friends(from_id,to_id,status,created_at) VALUES(?,?,?,?)').run('other','test','accepted',clock);
  setDay(2027,0,5,12);
  let save=await me();
  for(const key of ['sold','bonus','sealed','battles','battleWins','questsClaimed','hitsPulled','maxDrought','streak','streakBest']) assert.equal(save.stats.counters[key],0,`${key} starts at zero`);
  assert.deepEqual(save.stats.setPacks,{});
  assert.equal(save.stats.friends,1);
  assert.ok(!Object.keys(save.stats.counters).some(key=>key.startsWith('_')),'bookkeeping keys stay private');

  // Selling: one copy, then a set's duplicates.
  db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-1',3,0);
  db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,?)').run('test','me5-2',1,0);
  let res=await request('/api/cards/sell','POST',{cardId:'me5-1'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.save.stats.counters.sold,1);
  res=await request('/api/cards/sell','POST',{cardId:'me5-2'});
  assert.equal(res.body.save.stats.counters.sold,2,'the last copy counts as sold too');
  res=await request('/api/cards/sell-duplicates','POST',{setId:'me5'});
  assert.equal(res.body.copies,1);
  assert.equal(res.body.save.stats.counters.sold,3);
  // Hourly bonus.
  res=await request('/api/daily','POST');
  assert.equal(res.body.save.stats.counters.bonus,1);
  assert.equal((await request('/api/daily','POST')).status,400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_stats WHERE user_id='test' AND key='bonus'").get().n,1);
  // Rips: hits, drought and set packs follow pack_log.
  for(let i=0;i<12;i++) {
    res=await request('/api/packs/rip','POST',{setId:'me5'});
    assert.equal(res.status,200,JSON.stringify(res.body));
  }
  save=res.body.save;
  const log=db.prepare('SELECT cards FROM pack_log WHERE user_id=? ORDER BY at,id').all('test');
  const truth=droughtFromLog(log);
  assert.equal(save.stats.counters.hitsPulled,truth.hits,'hitsPulled matches the log');
  assert.equal(save.stats.counters.maxDrought,truth.maxDrought,'maxDrought matches the log');
  assert.equal(save.stats.setPacks.me5,12);
  assert.equal(save.stats.counters.hitsPulled,db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM quest_events WHERE user_id='test' AND kind='hits'").get().n,'hits events agree');
  const newCards=db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM quest_events WHERE user_id='test' AND kind='newcards'").get().n;
  assert.ok(newCards>0);
  // Sealed: one product is one sealed event, however many packs.
  res=await request('/api/sealed/open','POST',{setId:'me5',product:'eliteTrainerBox'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.save.stats.counters.sealed,1);
  assert.equal(db.prepare("SELECT SUM(amount) AS n FROM quest_events WHERE user_id='test' AND kind='sealed'").get().n,1);
  assert.equal(res.body.save.stats.setPacks.me5,12+res.body.packs.length);
  const log2=db.prepare('SELECT cards FROM pack_log WHERE user_id=? ORDER BY at,id').all('test');
  assert.equal(res.body.save.stats.counters.maxDrought,droughtFromLog(log2).maxDrought);
  assert.equal(res.body.save.stats.counters.hitsPulled,droughtFromLog(log2).hits);
  // Quests claimed.
  db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('test','bonus',1,clock);
  res=await request('/api/quests/claim','POST',{id:'daily-bonus'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.save.stats.counters.questsClaimed,1);

  // Battles are counted at read time from the battle tables; a bot seat is never counted.
  const later=realNow+3600_000;
  // Seat 0 is `test`; seat 1 is a free bot, or `partner` when given. Rows are inserted the way test-battles.mjs does.
  function settle(id,winners,{partner=null,at=clock}={}) {
    db.prepare("INSERT INTO battles(id,host_id,request_id,status,settings,lineup,plan,entry_cost,created_at,expires_at) VALUES(?,?,?,'lobby',?,'[]','[]',1,?,?)").run(id,'test','r-'+id,JSON.stringify({players:2}),realNow,later);
    db.prepare("INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)").run(id,0,'test','test','Quest Tester','questtester','gold',0);
    if(partner) db.prepare("INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)").run(id,1,partner,partner,'Other','otherguy','gold',0);
    else db.prepare("INSERT INTO battle_seats(battle_id,seat,user_id,payer_id,name,handle,color,bot) VALUES(?,?,?,?,?,?,?,?)").run(id,1,null,'free','Sparky','bot:sparky','gold',1);
    db.prepare("UPDATE battles SET status='running',starts_at=?,ends_at=?,round_ms=1000,outcomes='[]',result=? WHERE id=?").run(at-2000,at-1,JSON.stringify({winners,scores:[],allocations:[]}),id);
    db.prepare('INSERT INTO battle_settlements(battle_id,at) VALUES(?,?)').run(id,at);
  }
  settle('b1',[0]);
  save=await me();
  assert.equal(save.stats.counters.battles,1);
  assert.equal(save.stats.counters.battleWins,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_events WHERE user_id='test' AND kind='battles'").get().n,1);
  settle('b2',[1]);
  save=await me();
  assert.equal(save.stats.counters.battles,2);
  assert.equal(save.stats.counters.battleWins,1,'losing to the bot is not a win');
  assert.equal(count('quest_events','other'),0,'nobody else is credited');
  settle('b3',[]);
  save=await me();
  assert.equal(save.stats.counters.battles,3,'a shared pot counts as played, not won');
  assert.equal(save.stats.counters.battleWins,1);
  const todays=activeQuests(save.quests.periods);
  for(const row of todays.daily.concat(todays.weekly)) {
    if(row.kind==='battles') assert.equal(save.quests.progress[row.id],3);
    if(row.kind==='battleWins') assert.equal(save.quests.progress[row.id],1);
  }

  // Reading again counts nothing twice; only new settlements are added.
  const events=count('quest_events');
  save=await me();save=await me();
  assert.equal(save.stats.counters.battles,3);
  assert.equal(count('quest_events'),events,'a battle is counted once');
  // Two humans in one battle: each is credited by their own seat.
  settle('b4',[1],{partner:'other'});
  save=await me();
  assert.equal(save.stats.counters.battles,4);
  assert.equal(save.stats.counters.battleWins,1,'seat 1 won, and that was not test');
  const otherSave=await me('sid-other');
  assert.equal(otherSave.stats.counters.battles,1);
  assert.equal(otherSave.stats.counters.battleWins,1);
  assert.equal((await me('sid-other')).stats.counters.battles,1,'and once for them too');
  // A battle from long ago counts for the lifetime counters but not for any current period.
  settle('b5',[0],{at:clock-50*DAY});
  save=await me();
  assert.equal(save.stats.counters.battles,5);
  assert.equal(save.stats.counters.battleWins,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_events WHERE user_id='test' AND kind='battles' AND at<?").get(clock-40*DAY).n,0);
  // A claim reads battles too, so a finished battle is never "not complete yet".
  settle('b6',[0]);
  const fresh=db.prepare("SELECT COUNT(*) AS n FROM quest_events WHERE user_id='test' AND kind='battles'").get().n;
  await request('/api/quests/claim','POST',{id:'nope'});
  const claimTry=activeQuests(questPeriods()).monthly[0];
  await request('/api/quests/claim','POST',{id:claimTry.id});
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM quest_events WHERE user_id='test' AND kind='battles'").get().n,fresh+1,'a claim syncs battles first');
}

// ---- Old accounts: counters are backfilled once from pack_log ----
{
  const cards=(hit)=>JSON.stringify([{id:'me5-1',reverse:false,rarity:'Common'},...(hit?[{id:'me5-9',reverse:false,rarity:'Ultra Rare'},{id:'me5-8',reverse:true,rarity:'Ultra Rare'}]:[])]);
  const plan=[false,false,true,false,false,false,true,true,false];
  plan.forEach((hit,i)=>db.prepare('INSERT INTO pack_log(user_id,set_id,wrapper_id,cost,cards,at) VALUES(?,?,?,?,?,?)').run('legacy',i<7?'me5':'me4','w',1,cards(hit),clock-(plan.length-i)*1000));
  assert.equal(count('player_stats','legacy'),0);
  const save=await me('sid-legacy');
  assert.equal(save.stats.counters.hitsPulled,3,'reverse copies are not hits');
  assert.equal(save.stats.counters.maxDrought,3,'longest run of packs without a hit');
  assert.deepEqual(save.stats.setPacks,{me5:7,me4:2});
  // Once only: another pack later must not be counted twice.
  const first=count('player_stats','legacy');
  await me('sid-legacy');
  assert.equal(count('player_stats','legacy'),first);
  db.prepare('UPDATE profiles SET coins=100,packs_since_hit=1 WHERE user_id=?').run('legacy');
  const res=await request('/api/packs/rip','POST',{setId:'me5'},'sid-legacy');
  assert.equal(res.status,200,JSON.stringify(res.body));
  const truth=droughtFromLog(db.prepare('SELECT cards FROM pack_log WHERE user_id=? ORDER BY at,id').all('legacy'));
  assert.equal(res.body.save.stats.counters.hitsPulled,truth.hits,'the backfill does not double count the first rip');
  assert.equal(res.body.save.stats.setPacks.me5,8);
}

// ---- Achievement claims still work with the richer context ----
{
  db.prepare('UPDATE profiles SET coins=100 WHERE user_id=?').run('test');
  await request('/api/packs/rip','POST',{setId:'me5'});
  const res=await request('/api/achievements/claim','POST',{all:true});
  assert.ok(res.status===200||res.status===400,JSON.stringify(res.body));
  if(res.status===200) assert.ok(Array.isArray(res.body.claimed)&&res.body.save.stats,'claim returns the save with stats');
  assert.equal((await request('/api/achievements/claim','POST',{id:'nope'})).status,400);
}

// ---- Reset clears everything the remaster added ----
{
  db.prepare('INSERT OR IGNORE INTO quest_claims(user_id,quest_id,period_start,claimed_at) VALUES(?,?,?,?)').run('test','daily-bonus',questPeriods().daily,clock);
  assert.ok(count('player_stats')>0&&count('quest_events')>0);
  const res=await request('/api/me/reset','POST');
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(count('quest_events'),0);
  assert.equal(count('quest_claims'),0);
  const visible=db.prepare("SELECT key,value FROM player_stats WHERE user_id='test' AND key NOT LIKE '\\_%' ESCAPE '\\' AND value!=0").all();
  assert.deepEqual(visible,[],'no counter survives a reset');
  for(const [key,value] of Object.entries(res.body.save.stats.counters)) assert.equal(value,0,key);
  assert.deepEqual(res.body.save.stats.setPacks,{});
  assert.deepEqual(res.body.save.quests.claimed,[]);
  assert.equal(res.body.save.quests.streak,0);
  assert.equal(res.body.save.quests.streakBest,0);
  assert.equal(db.prepare("SELECT value FROM player_stats WHERE user_id='other' AND key='battles'").get().value,1,'other players are untouched');
}

// ---- Mastery banners and the public profile ----
{
  const banner=id=>db.prepare('SELECT banner FROM users WHERE id=?').get(id).banner;
  const before=banner('test');
  assert.equal((await request('/api/me','PATCH',{banner:'mastery:me5'},null)).status,401);
  let res=await request('/api/me','PATCH',{banner:'mastery:me5'});
  assert.equal(res.status,403,'a banner needs its mastery');
  assert.equal(banner('test'),before);
  res=await request('/api/me','PATCH',{banner:'mastery:nonexistent'});
  assert.equal(res.status,400);
  res=await request('/api/me','PATCH',{banner:'mastery:'});
  assert.ok(res.status===400,'an empty mastery banner is refused');
  assert.deepEqual((await request('/api/u/questtester','GET',null,null)).body.masteries,[]);

  db.prepare('UPDATE profiles SET claimed=? WHERE user_id=?').run(JSON.stringify(['set-me5-master','set-nosuch-master','hourly']),'test');
  assert.equal((await request('/api/me','PATCH',{banner:'mastery:me4'})).status,403,'only the claimed set');
  res=await request('/api/me','PATCH',{banner:'mastery:me5'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(banner('test'),'mastery:me5','stored as given');
  // Other edits keep it, and another player cannot borrow it.
  assert.equal((await request('/api/me','PATCH',{bio:'still here'})).status,200);
  assert.equal(banner('test'),'mastery:me5');
  assert.equal((await request('/api/me','PATCH',{banner:'mastery:me5'},'sid-other')).status,403);
  assert.equal((await request('/api/me','PATCH',{banner:'darkrai'},'sid-other')).status,200,'ordinary banners are unchanged');
  const profile=(await request('/api/u/questtester','GET',null,null)).body;
  assert.deepEqual(profile.masteries,['me5'],'masteries list only real sets');
  assert.deepEqual((await request('/api/u/otherguy','GET',null,null)).body.masteries,[]);
  // Resetting drops the masteries and the banner that needed them.
  assert.equal((await request('/api/me/reset','POST')).status,200);
  assert.notEqual(banner('test'),'mastery:me5');
  assert.deepEqual((await request('/api/u/questtester','GET',null,null)).body.masteries,[]);
}

// ---- Deleting an account takes the new rows with it ----
{
  db.prepare('INSERT INTO player_stats(user_id,key,value) VALUES(?,?,?)').run('other','sold',4);
  db.prepare('INSERT INTO quest_events(user_id,kind,amount,at) VALUES(?,?,?,?)').run('other','sold',4,clock);
  db.prepare('INSERT INTO quest_claims(user_id,quest_id,period_start,claimed_at) VALUES(?,?,?,?)').run('other','daily-bonus',questPeriods().daily,clock);
  // The password is not verifiable in this harness, so only the cascade is checked here.
  db.prepare('DELETE FROM sessions WHERE user_id=?').run('other');
  db.prepare('DELETE FROM profiles WHERE user_id=?').run('other');
  db.prepare('DELETE FROM users WHERE id=?').run('other');
  for(const table of ['player_stats','quest_events','quest_claims']) assert.equal(count(table,'other'),0,`${table} cascades`);
}

// ---- Odd or missing battle tables never break a save ----
{
  db.exec('DROP TABLE battle_settlements;');
  let res=await request('/api/me');
  assert.equal(res.status,200);
  assert.equal(res.body.save.stats.counters.battles,0,'reset cleared it, and nothing is invented');
  db.exec('DROP TABLE battle_seats;DROP TABLE battles;');
  res=await request('/api/me');
  assert.equal(res.status,200,'no battle tables at all');
  assert.equal((await request('/api/packs/rip','POST',{setId:'me5'})).status,200);
}

console.log('Quest backend checks passed: pools and periods, lazy schema, no double claims, chests, streak, monthly, counters, battle stats, backfill, reset, masteries.');
