import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/index.js';
import {playerLevel,playerXp,resetXpSchemaCache} from '../worker/xp.js';
import {CURVE,LEVEL_CAP,computeXp,levelFromXp,xpForLevel,xpSummary,xpToNext} from '../js/xp.js';
import {levelCoins,levelPayout} from '../js/levels.js';
// Server side of XP and levels: the curve, XP derived from the save, the stored
// high-water mark, POST /api/levels/claim (once, parallel-safe, capped), the new
// table-counted counters, the profile level, reset and deletion. Runs the real
// Worker against in-memory sqlite, like test-quests-backend.mjs.
// Run: node scripts/test-xp.mjs
const DAY=86_400_000;
const MAX_COINS=1_000_000;
const db=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).sort()) {
  db.exec(readFileSync(new URL('../worker/migrations/'+file,import.meta.url),'utf8'));
}
// D1 runs a batch as one transaction. The in-memory stand-in runs statements one
// by one, so batches take turns here: two claims then cannot interleave between
// the swap and the statements that hang off it through changes().
let lock=Promise.resolve();
const sqlLog=[];
const DB={
  exec:async sql=>{db.exec(sql);return {};},
  prepare(sql) { sqlLog.push(sql);let params=[];const statement={
    bind(...values){assert.ok(values.length<=100,'D1 allows at most 100 bound parameters');params=values;return statement;},
    async all(){return {results:db.prepare(sql).all(...params)};},
    async first(column){const r=db.prepare(sql).get(...params);return column?r?.[column]:r || null;},
    async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  };return statement;},
  batch(statements){
    const run=lock.then(async()=>{const out=[];for(const s of statements)out.push(await s.run());return out;});
    lock=run.catch(()=>{});
    return run;
  },
};
// gear.json can be made to fail, or to lack one gift the levels hand out (the Worker caches the first good copy).
const OMIT='swshb-toolkit-2023-sleeves';
let gearFeed='down';
const served=gifts=>gifts.filter(g=>g.id!==OMIT);
const env={DB,SITE_ORIGIN:'https://poke-pack.rip',ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/data/'))return new Response('',{status:404});
  if(path==='/data/gear.json'){
    if(gearFeed==='down')return new Response('',{status:503});
    const gear=JSON.parse(readFileSync(new URL('..'+path,import.meta.url),'utf8'));
    delete gear.sleeves[OMIT];
    return new Response(JSON.stringify(gear),{headers:{'content-type':'application/json'}});
  }
  try{return new Response(readFileSync(new URL('..'+path,import.meta.url)),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}
}}};

const now=Date.now();
function addUser(id,handle,sid,coins=25) {
  db.prepare('INSERT INTO users(id,name,handle,password_hash,color,created_at,last_played) VALUES(?,?,?,?,?,?,?)').run(id,handle,handle,'unused','gold',now-30*DAY,now);
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(sid,id,now,now+3650*DAY);
  db.prepare('INSERT INTO profiles(user_id,coins,granted,created_at,binder) VALUES(?,?,?,?,?)').run(id,coins,coins,now-30*DAY,'[]');
}
/** A veteran: 500 packs, 150 cards, quests, hits, battles, two claimed achievements. About 9000 XP, level 25. */
function addVeteran(id,handle,sid,coins=25) {
  addUser(id,handle,sid,coins);
  db.prepare('UPDATE profiles SET packs_opened = 500, claimed = ? WHERE user_id = ?').run(JSON.stringify(['first-pack','ten-packs']),id);
  const card=db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)');
  for(let n=1;n<=150;n++) card.run(id,`me5-${n}`,1);
  const stat=db.prepare('INSERT INTO player_stats(user_id,key,value) VALUES(?,?,?)');
  for(const [key,value] of Object.entries({hitsPulled:100,questsClaimed:50,chests:5,battles:20,battleWins:5,sealed:10,bonus:100,_backfilled:1})) stat.run(id,key,value);
}
async function request(path,method='GET',body,sid) {
  const res=await worker.fetch(new Request('https://poke-pack.rip'+path,{method,headers:{'content-type':'application/json',origin:'https://poke-pack.rip',...(sid?{cookie:'pp_sid='+sid}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:res.status,body:await res.json()};
}
const meRes=async sid=>(await request('/api/me','GET',undefined,sid)).body;
const me=async sid=>(await meRes(sid)).save;
const claim=(sid,body)=>request('/api/levels/claim','POST',body,sid);
const coinsOf=id=>db.prepare('SELECT coins FROM profiles WHERE user_id=?').get(id).coins;
const row=id=>{const r=db.prepare('SELECT xp,claimed_level AS claimed FROM player_xp WHERE user_id=?').get(id);return r&&{...r};};
const gearOf=id=>Object.fromEntries(db.prepare('SELECT kind,item_id,qty FROM user_gear WHERE user_id=?').all(id).map(r=>[`${r.kind}:${r.item_id}`,r.qty]));
const gearKeys=gear=>gear.map(g=>`${g.kind}:${g.id}`);

// ---- The curve and the payout table ----
{
  assert.equal(CURVE,15);
  assert.equal(xpForLevel(1),0);
  assert.equal(xpForLevel(2),15);
  assert.equal(xpForLevel(5),240);
  assert.equal(xpForLevel(10),1215);
  assert.equal(xpForLevel(100),147_015);
  assert.equal(xpForLevel(LEVEL_CAP+50),147_015,'the cap holds');
  for(let lv=1;lv<=LEVEL_CAP;lv++) {
    assert.equal(levelFromXp(xpForLevel(lv)).level,lv,`level ${lv} starts at its own XP`);
    if(lv>1) assert.equal(levelFromXp(xpForLevel(lv)-1).level,lv-1,`one XP short of ${lv}`);
    if(lv<LEVEL_CAP) assert.equal(xpToNext(lv),xpForLevel(lv+1)-xpForLevel(lv));
  }
  assert.equal(levelFromXp(10**9).level,LEVEL_CAP);
  assert.ok(levelFromXp(10**9).maxed);
  assert.equal(levelCoins(1),0);
  assert.equal(levelCoins(2),24);
  assert.equal(levelCoins(5),30+250);
  const all=levelPayout(2,LEVEL_CAP);
  assert.ok(all.coins>50_000&&all.coins<80_000,`a whole career pays ${all.coins}`);
  assert.equal(levelPayout(1,1).coins,0,'level 1 pays nothing');
}

// ---- A veteran starts at their real level; nothing is paid until they claim ----
addVeteran('vet','vetone','sid-vet',500);
let vetBefore;
{
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_xp').get().n,0,'no row before the first read');
  const body=await meRes('sid-vet');
  const save=body.save;
  const expected=computeXp(save);
  assert.equal(save.xp.total,expected.total,'derived XP matches computeXp');
  assert.equal(save.xp.xp,expected.total);
  assert.equal(save.xp.banked,0);
  assert.ok(expected.total>=8000&&expected.total<=11000,`about 9000 XP, got ${expected.total}`);
  assert.equal(save.xp.level,levelFromXp(expected.total).level);
  assert.ok(save.xp.level>=20,`a veteran starts high: level ${save.xp.level}`);
  assert.deepEqual(Object.keys(save.xp.parts.reduce((o,p)=>({...o,[p.id]:1}),{})).slice(0,3),['packs','hits','unique']);
  assert.equal(save.xp.parts.find(p=>p.id==='packs').xp,5000);
  assert.equal(save.xp.parts.find(p=>p.id==='unique').xp,300);
  assert.equal(save.xp.claimedLevel,1);
  assert.deepEqual(save.xp.claimable,Array.from({length:save.xp.level-1},(_,i)=>i+2));
  const payout=levelPayout(2,save.xp.level);
  assert.equal(save.xp.pending.coins,payout.coins);
  assert.equal(save.xp.pending.levels,save.xp.claimable.length);
  assert.deepEqual(gearKeys(save.xp.pending.gear),gearKeys(payout.gear));
  assert.ok(save.xp.pending.gear.length>=2,'sleeve at 10 and coin at 15 wait for the veteran');
  assert.equal(coinsOf('vet'),500,'nothing is paid by reading');
  assert.deepEqual(gearOf('vet'),{},'no gear is handed out by reading');
  assert.deepEqual(row('vet'),{xp:expected.total,claimed:1});
  // Level and total XP ride on the user object and the public profile.
  assert.equal(body.user.level,save.xp.level);
  assert.equal(body.user.xp,expected.total);
  vetBefore=save.xp;
}

// ---- Public profile level ----
{
  const profile=(await request('/api/u/vetone')).body;
  assert.equal(profile.user.level,vetBefore.level);
  assert.equal(profile.user.xp,vetBefore.total);
  addUser('ghost','ghostuser','sid-ghost');
  const ghost=(await request('/api/u/ghostuser')).body;
  assert.equal(ghost.user.level,1,'a brand new trainer is level 1');
  assert.equal(ghost.user.xp,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_xp WHERE user_id='ghost'").get().n,1,'the first view of a row-less trainer works their level out once');
  assert.equal(await playerLevel(env,'ghost'),1);
  // A veteran nobody has loaded yet does not read as level 1 on their profile.
  addVeteran('lone','loneone','sid-lone');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_xp WHERE user_id='lone'").get().n,0);
  const lone=(await request('/api/u/loneone')).body;
  assert.ok(lone.user.level>=20,`a veteran's profile shows level ${lone.user.level}`);
  assert.equal(lone.user.xp,db.prepare("SELECT xp FROM player_xp WHERE user_id='lone'").get().xp);
  assert.equal((await request('/api/u/loneone')).body.user.level,lone.user.level,'the second view reads the stored mark');
  assert.equal(await playerLevel(env,'vet'),vetBefore.level);
  assert.deepEqual(await playerXp(env,'vet'),{xp:vetBefore.total,level:vetBefore.level});
  assert.equal((await playerXp(env,'no-row-yet',{loadSave:async()=>({xp:{total:240,level:5}})})).level,5,'a row-less player is worked out once when a loader is given');
  assert.equal(await playerLevel(env,'nobody-at-all'),1);
}

// ---- The high-water mark: selling cards never costs a level ----
{
  db.prepare("DELETE FROM cards WHERE user_id='vet' AND card_id IN (SELECT card_id FROM cards WHERE user_id='vet' LIMIT 100)").run();
  const save=await me('sid-vet');
  assert.equal(computeXp(save).total,vetBefore.total-200,'derived XP did fall: 100 cards fewer');
  assert.equal(save.xp.total,vetBefore.total,'the stored mark holds');
  assert.equal(save.xp.level,vetBefore.level);
  assert.equal(save.xp.banked,200);
  assert.equal(row('vet').xp,vetBefore.total);
  assert.equal(xpSummary(save,0).total,vetBefore.total-200,'without a floor the same save is worth less');
  // Restoring the cards does not double count: the mark is a max, not a sum.
  const card=db.prepare('INSERT OR IGNORE INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)');
  for(let n=1;n<=150;n++) card.run('vet',`me5-${n}`,1);
  assert.equal((await me('sid-vet')).xp.total,vetBefore.total);
}

// ---- The claim: pays once, ignores the body, grants gear, adds to the wallet ----
{
  assert.equal((await claim(undefined)).status,401,'sign in first');
  // gear.json is down: the claim must not advance past gifts it cannot hand over.
  const down=await claim('sid-vet');
  assert.equal(down.status,503,JSON.stringify(down.body));
  assert.equal(coinsOf('vet'),500);
  assert.equal(row('vet').claimed,1,'nothing was claimed');
  assert.deepEqual(gearOf('vet'),{});
  // Back up, but the catalogue lacks one gift: that id is skipped, the rest is paid.
  gearFeed='partial';
  const forged={level:100,levels:[2,100],coins:999_999,claimedLevel:1,paid:{coins:999_999},gear:[{kind:'sleeve',id:'me-pikachu-30-etb-sleeves'}]};
  const first=await claim('sid-vet',forged);
  assert.equal(first.status,200,JSON.stringify(first.body));
  const expected=levelPayout(2,vetBefore.level);
  assert.deepEqual(first.body.paid.levels,vetBefore.claimable,'a forged body changes nothing');
  assert.equal(first.body.paid.coins,expected.coins);
  assert.deepEqual(gearKeys(first.body.paid.gear),gearKeys(served(expected.gear)));
  assert.ok(expected.gear.some(g=>g.id===OMIT)&&!first.body.paid.gear.some(g=>g.id===OMIT),'an id the loaded catalogue lacks is skipped');
  assert.equal(coinsOf('vet'),500+expected.coins);
  assert.equal(db.prepare("SELECT granted FROM profiles WHERE user_id='vet'").get().granted,500+expected.coins,'paid coins count as granted, like quest claims');
  assert.equal(first.body.save.coins,500+expected.coins);
  assert.equal(first.body.save.xp.claimedLevel,vetBefore.level);
  assert.deepEqual(first.body.save.xp.claimable,[]);
  assert.equal(first.body.save.xp.pending.levels,0);
  assert.equal(first.body.save.xp.pending.coins,0);
  const gear=gearOf('vet');
  for(const item of served(expected.gear)) assert.equal(gear[`${item.kind}:${item.id}`],1,`${item.id} granted once`);
  assert.equal(Object.keys(gear).length,served(expected.gear).length);
  assert.ok(first.body.save.gear.sleeves['psv-toolkit-2024-teal']>0,'the level 10 sleeve shows in save.gear');
  assert.deepEqual(row('vet'),{xp:vetBefore.total,claimed:vetBefore.level});

  // Again: nothing more is owed, nothing moves.
  const second=await claim('sid-vet');
  assert.equal(second.status,200);
  assert.deepEqual(second.body.paid,{levels:[],coins:0,gear:[]});
  assert.equal(coinsOf('vet'),500+expected.coins);
  assert.deepEqual(gearOf('vet'),gear);

  // Gaining XP opens only the new levels.
  db.prepare("UPDATE profiles SET packs_opened = packs_opened + 200 WHERE user_id='vet'").run();
  const grown=await me('sid-vet');
  assert.ok(grown.xp.level>vetBefore.level);
  assert.deepEqual(grown.xp.claimable,Array.from({length:grown.xp.level-vetBefore.level},(_,i)=>vetBefore.level+1+i));
  const more=await claim('sid-vet');
  const extra=levelPayout(vetBefore.level+1,grown.xp.level);
  assert.deepEqual(more.body.paid.levels,grown.xp.claimable);
  assert.equal(more.body.paid.coins,extra.coins);
  assert.equal(coinsOf('vet'),500+expected.coins+extra.coins);
  assert.deepEqual((await claim('sid-vet')).body.paid.levels,[]);
}

// ---- Parallel claims pay once ----
{
  addVeteran('par','parallel','sid-par',100);
  const level=(await me('sid-par')).xp;
  const expected=levelPayout(2,level.level);
  const results=await Promise.all(Array.from({length:8},()=>claim('sid-par')));
  for(const r of results) assert.equal(r.status,200,JSON.stringify(r.body));
  const winners=results.filter(r=>r.body.paid.levels.length);
  assert.equal(winners.length,1,'exactly one request is paid');
  assert.equal(winners[0].body.paid.coins,expected.coins);
  for(const r of results.filter(r=>!r.body.paid.levels.length)) assert.deepEqual(r.body.paid,{levels:[],coins:0,gear:[]});
  assert.equal(coinsOf('par'),100+expected.coins,'the wallet got one payout');
  const gear=gearOf('par');
  for(const item of served(expected.gear)) assert.equal(gear[`${item.kind}:${item.id}`],1,'each gift once');
  assert.equal(row('par').claimed,level.level);
}

// ---- Coins stop at the wallet cap ----
{
  addVeteran('rich','richone','sid-rich',MAX_COINS-10);
  const pending=(await me('sid-rich')).xp.pending.coins;
  assert.ok(pending>10);
  const out=await claim('sid-rich');
  assert.equal(out.status,200);
  assert.equal(coinsOf('rich'),MAX_COINS,'coins are capped like quest and achievement claims');
  assert.ok(out.body.paid.levels.length>0);
  assert.equal(out.body.paid.coins,10,'paid.coins is what was credited, not what the levels were worth');
  assert.equal(db.prepare("SELECT granted FROM profiles WHERE user_id='rich'").get().granted,MAX_COINS-10+10,'granted counts only the credit');
  assert.equal((await claim('sid-rich')).body.paid.levels.length,0);
}

// ---- A wallet already over the cap is never lowered ----
{
  addVeteran('whale','whaleone','sid-whale',MAX_COINS+500_000);
  db.prepare("UPDATE profiles SET granted = 7 WHERE user_id='whale'").run();
  const out=await claim('sid-whale');
  assert.equal(out.status,200,JSON.stringify(out.body));
  assert.ok(out.body.paid.levels.length>0,'the levels are still claimed');
  assert.equal(coinsOf('whale'),MAX_COINS+500_000,'coins above the cap stay as they were');
  assert.equal(out.body.paid.coins,0);
  assert.equal(db.prepare("SELECT granted FROM profiles WHERE user_id='whale'").get().granted,7,'nothing credited, nothing granted');
  assert.equal(out.body.save.coins,MAX_COINS+500_000);
  assert.ok(Object.keys(gearOf('whale')).length>0,'gifts are still handed over');
}

// ---- Counters counted from the casino and grading tables ----
{
  addUser('gam','gambler','sid-gam',25);
  addUser('opp','opponent','sid-opp',25);
  // Seed only: these tables guard their own writes with triggers that expect real cards.
  for(const t of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('coinflips','jackpots','jackpot_entries')").all()) db.exec(`DROP TRIGGER ${t.name}`);
  const flip=db.prepare('INSERT INTO coinflips(id,host_id,request_id,status,bot,host_stake,host_value,guest_id,guest_stake,guest_value,winner,created_at,expires_at,flipped_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const at=now-DAY;
  const done=(id,host,guest,winner,flipped=at,bot=0)=>flip.run(id,host,`r-${id}`,'done',bot,'[]',100,guest,'[]',100,winner,flipped-5,flipped+DAY,flipped);
  done('f1','gam','house','host',at,1);   // against the house: not counted
  done('f2','gam','opp','guest');         // played, lost
  done('f3','opp','gam','guest');         // played as guest, won
  done('f4','opp','gam','host');          // played as guest, lost
  done('f7','gam','opp','host',now-60*DAY); // before the account started: not counted
  done('f8','opp','house','host');        // not theirs
  flip.run('f5','gam','r-f5','open',0,'[]',100,null,null,null,null,at,at+DAY*2,null);
  flip.run('f6','gam','r-f6','cancelled',0,'[]',100,null,null,null,null,at,at+DAY*2,null);
  const pot=db.prepare('INSERT INTO jackpots(id,host_id,request_id,status,max_players,min_value,winner_seat,created_at,expires_at,drawn_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const entry=db.prepare('INSERT INTO jackpot_entries(jackpot_id,seat,user_id,bot,bot_persona,stake,value,created_at) VALUES(?,?,?,?,?,?,?,?)');
  pot.run('p1','opp','rp1','done',3,100,1,at,at+DAY,at);
  entry.run('p1',0,'opp',0,null,'[]',100,at);entry.run('p1',1,'gam',0,null,'[]',100,at);entry.run('p1',2,null,1,'bot-a','[]',90,at);
  pot.run('p2','gam','rp2','done',3,100,1,at,at+DAY,at);
  entry.run('p2',0,'gam',0,null,'[]',100,at);entry.run('p2',1,'opp',0,null,'[]',100,at);
  pot.run('p4','gam','rp4','done',3,100,0,at,at+DAY,at); // one human and two bots: not counted
  entry.run('p4',0,'gam',0,null,'[]',100,at);entry.run('p4',1,null,1,'bot-a','[]',90,at);entry.run('p4',2,null,1,'bot-b','[]',90,at);
  pot.run('p3','gam','rp3','open',3,100,null,at,at+DAY*2,null);
  entry.run('p3',0,'gam',0,null,'[]',100,at);
  const grade=db.prepare("INSERT INTO graded_cards(user_id,card_id,reverse,grade,band,fee_cents,request_id,status,created_at) VALUES(?,?,0,?,'me',541,?,?,?)");
  grade.run('gam','me5-87',10,'g1','slabbed',at);
  grade.run('gam','me5-88',10,'g2','sold',at);
  grade.run('gam','me5-89',9,'g3','cracked',at);
  grade.run('gam','me5-90',8,'g4','slabbed',at);
  grade.run('opp','me5-91',10,'g5','slabbed',at);
  grade.run('gam','me5-92',10,'won:77','slabbed',at); // won in a casino game, not graded by this player
  grade.run('gam','me5-93',10,'g7','cracked',at);     // cracked: a regrade would count it twice
  const save=await me('sid-gam');
  const c=save.stats.counters;
  assert.equal(c.casinoPlayed,5,'3 flips against people and 2 pots with two humans; the house flip and the bot pot do not count');
  assert.equal(c.casinoWon,2,'one flip and one pot');
  assert.equal(c.graded,3,'slabbed and sold; not cracked, not won in the casino');
  assert.equal(c.gemMint,2);
  const parts=Object.fromEntries(save.xp.parts.map(p=>[p.id,p]));
  assert.equal(parts.casino.xp,5*15+2*30);
  assert.equal(parts.grading.xp,3*25+2*100);
  const opp=(await me('sid-opp')).stats.counters;
  assert.equal(opp.casinoPlayed,5,'flips f2, f3, f4 (not the house flip f8, not the pre-account f7) and pots p1, p2');
  assert.equal(opp.graded,1);
  for(const key of ['casinoPlayed','casinoWon','graded','gemMint']) assert.equal(typeof save.stats.counters[key],'number');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND (name LIKE '%xp%' OR sql LIKE '%player_xp%')").get().n,0,'no trigger is put on any table');
  // The counters read the account's start by subquery, in the same round as everything else.
  const casinoSql=sqlLog.filter(q=>q.includes('FROM coinflips')&&q.includes('guest_id != \'house\''));
  assert.ok(casinoSql.length>0&&casinoSql.every(q=>q.includes('SELECT created_at FROM profiles')),'no separate read of the profile for the start date');
  // A fresh account sees zeros, never missing keys.
  const fresh=(await me('sid-ghost')).stats.counters;
  assert.deepEqual([fresh.casinoPlayed,fresh.casinoWon,fresh.graded,fresh.gemMint],[0,0,0,0]);
}

// ---- Reset clears the row; casino history from before it is not counted again ----
{
  db.prepare("DELETE FROM coinflips WHERE status='open'").run();
  db.prepare("DELETE FROM jackpots WHERE status='open'").run();
  db.prepare("DELETE FROM jackpot_entries WHERE jackpot_id='p3'").run();
  assert.equal(row('vet').claimed>1,true);
  const out=await request('/api/me/reset','POST',{},'sid-vet');
  assert.equal(out.status,200,JSON.stringify(out.body));
  assert.equal(out.body.save.xp.level,1);
  assert.equal(out.body.save.xp.claimedLevel,1,'the claimed level starts over');
  assert.equal(out.body.save.coins,25);
  assert.ok(row('vet').xp<=computeXp(out.body.save).total,'the mark restarted from the wiped save');
  assert.equal((await meRes('sid-vet')).user.level,1);
  assert.deepEqual(gearOf('vet'),{},'gear went with the reset');

  const gam=await request('/api/me/reset','POST',{},'sid-gam');
  assert.equal(gam.status,200,JSON.stringify(gam.body));
  const c=gam.body.save.stats.counters;
  assert.deepEqual([c.casinoPlayed,c.casinoWon,c.graded,c.gemMint],[0,0,0,0],'games played before the reset are not counted again');
  assert.equal(gam.body.save.xp.total,0);
}

// ---- Account deletion removes the row; the table is made on demand ----
{
  const signup=await request('/api/auth/signup','POST',{name:'Goner',handle:'goneone',password:'hunter22'});
  assert.equal(signup.status,201,JSON.stringify(signup.body));
  assert.equal(signup.body.user.level,1);
  const id=signup.body.user.id;
  assert.ok(row(id),'the first read made a row');
  const cookie=db.prepare('SELECT id FROM sessions WHERE user_id=?').get(id).id;
  const gone=await request('/api/auth/delete','POST',{password:'hunter22'},cookie);
  assert.equal(gone.status,200,JSON.stringify(gone.body));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_xp WHERE user_id=?').get(id).n,0);

  db.exec('DROP TABLE player_xp');
  resetXpSchemaCache();
  const save=await me('sid-par');
  assert.ok(save.xp&&save.xp.level>=20,'missing table is created on demand');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='player_xp'").get().n,1);
  assert.equal(row('par').claimed,1,'a new table starts every player at nothing claimed');
}

console.log('XP checks passed: curve, derived XP, veteran start, high-water mark, claim once, parallel claims, forged body, coin cap, gear, new counters, profile level, reset, deletion, lazy schema.');
