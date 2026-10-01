// Cart checkout and the sealed collection (worker/orders.js), on the
// transactional D1 stand-in: the charge happens exactly once, opening now and
// opening later give the same thing, and a request that dies anywhere resumes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {planChunks,resetOrdersSchemaCache} from '../worker/orders.js';
import {PLAYABLE_SETS,findOffer} from '../js/catalog.js';
import {ORDER_LIMITS,lineCents,newRequestId,packsInOffer} from '../js/orders-rules.js';
import {activeQuests} from '../js/quests.js';
import {isHit} from '../js/engine.js';
import {productGear,rollGear} from '../js/gear.js';
import {createTestDb,seedPlayer,requester} from './lib/d1-test-db.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const sealed=read('sealed.json'),products=read('products.json'),boxContents=read('box-contents.json'),gearCatalog=read('gear.json');
const offerOf=(setId,productId)=>findOffer(sealed[setId],products[setId],productId);
const cents=n=>Math.round(n*100);
const BOX={setId:'me5',productId:'boosterBox'};      // 36 packs, nothing else
const ETB={setId:'me1',productId:'eliteTrainerBox'};  // 9 packs, a promo, 40 Energy, a sleeve and a coin
const BB={setId:'sm10',productId:'buildBattleBox'};   // 4 packs, a prerelease promo, a dealt deck
const DECK={setId:'me55',productId:'deck-espeon'};    // no packs, a promo
for(const p of [BOX,ETB,BB,DECK]) assert.ok(offerOf(p.setId,p.productId),`${p.setId}/${p.productId} is sold`);
assert.equal(packsInOffer(offerOf(BOX.setId,BOX.productId)),36);
assert.equal(packsInOffer(offerOf(ETB.setId,ETB.productId)),9);
assert.equal(packsInOffer(offerOf(BB.setId,BB.productId)),4);
assert.equal(packsInOffer(offerOf(DECK.setId,DECK.productId)),0);
assert.ok(boxContents['me1/eliteTrainerBox']?.spread&&boxContents['sm10/buildBattleBox']?.recipe,'the parity products have box contents');
assert.ok(productGear(gearCatalog,ETB.setId,ETB.productId),'the ETB hands out gear');
const priceOf=p=>offerOf(p.setId,p.productId).price;
const line=(p,qty,mode)=>({...p,qty,mode});

const {db,env,crash,DB}=createTestDb();
const req=requester(worker,env,null);
const as=session=>(path,method,body)=>req(path,method,body,session);

// ---- Row helpers ----------------------------------------------------------------
const profile=id=>db.prepare('SELECT coins,packs_opened,pulls,packs_since_hit FROM profiles WHERE user_id=?').get(id);
const coinsCents=id=>cents(profile(id).coins);
const owned=id=>Object.fromEntries(db.prepare('SELECT card_id,qty FROM cards WHERE user_id=?').all(id).map(r=>[r.card_id,r.qty]));
const ownedReverse=id=>Object.fromEntries(db.prepare('SELECT card_id,reverse_qty FROM cards WHERE user_id=?').all(id).map(r=>[r.card_id,r.reverse_qty]));
const vaultRows=id=>db.prepare('SELECT set_id,product_id,qty FROM sealed_vault WHERE user_id=? ORDER BY set_id,product_id').all(id).map(r=>({...r}));
const count=(sql,...args)=>db.prepare(sql).get(...args).n;
const packLog=id=>db.prepare('SELECT cost,set_id,wrapper_id FROM pack_log WHERE user_id=? ORDER BY id').all(id);
const counter=(id,key)=>db.prepare('SELECT value FROM player_stats WHERE user_id=? AND key=?').get(id,key)?.value||0;
const events=(id,kind)=>db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM quest_events WHERE user_id=? AND kind=?').get(id,kind).n;
const gearQty=(id,kind,item)=>db.prepare('SELECT qty FROM user_gear WHERE user_id=? AND kind=? AND item_id=?').get(id,kind,item)?.qty||0;
const snapshot=id=>({
  coins:coinsCents(id),profile:profile(id),owned:owned(id),reverse:ownedReverse(id),vault:vaultRows(id),
  orders:count('SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id=?',id),
  log:count('SELECT COUNT(*) AS n FROM pack_log WHERE user_id=?',id),
  history:count('SELECT COUNT(*) AS n FROM history WHERE user_id=?',id),
  sealed:counter(id,'sealed'),sealedEvents:events(id,'sealed'),
  gear:db.prepare('SELECT kind,item_id,qty FROM user_gear WHERE user_id=? ORDER BY kind,item_id').all(id).map(r=>({...r})),
});
const unchanged=(id,before,why)=>{
  const now=snapshot(id);
  for(const key of Object.keys(before)) assert.deepEqual(now[key],before[key],`${why}: ${key} unchanged`);
};
// Every copy an opening hands out: pulls, promos and box cards in their copies.
function adds(opened) {
  const qty={},rev={};
  for(const box of opened.boxes) {
    for(const c of box.promos) qty[c.id]=(qty[c.id]||0)+1;
    for(const c of box.boxCards) qty[c.id]=(qty[c.id]||0)+c.n;
    for(const pack of box.packs) for(const c of pack.cards){qty[c.id]=(qty[c.id]||0)+1;if(c.reverse)rev[c.id]=(rev[c.id]||0)+1;}
  }
  return {qty,rev};
}
// The collection grew by exactly what the opening shows, once.
function assertCredited(id,before,opened,why) {
  const {qty,rev}=adds(opened);
  const after=owned(id),afterRev=ownedReverse(id);
  const ids=new Set([...Object.keys(after),...Object.keys(before.owned)]);
  for(const card of ids) {
    assert.equal(after[card]||0,(before.owned[card]||0)+(qty[card]||0),`${why}: ${card} copies`);
    assert.equal(afterRev[card]||0,(before.reverse[card]||0)+(rev[card]||0),`${why}: ${card} reverse copies`);
  }
}
// wasNew: the first copy across the whole order (promos, then box cards, then packs, box by box), and only if not owned before.
function assertWasNew(opened,ownedBefore,why) {
  const seen=new Set(Object.keys(ownedBefore).filter(id=>ownedBefore[id]>0));
  const check=(id,wasNew)=>{assert.equal(wasNew,!seen.has(id),`${why}: wasNew of ${id}`);seen.add(id);};
  for(const box of opened.boxes) {
    for(const c of box.promos) check(c.id,c.wasNew);
    for(const c of box.boxCards) check(c.id,c.wasNew);
    for(const pack of box.packs) for(const c of pack.cards) check(c.id,c.wasNew);
  }
}
// pack_log: each product's packs, in order, cost shares summing to its price in cents.
function assertPackLog(id,logBefore,opened,why) {
  const rows=packLog(id).slice(logBefore);
  assert.equal(rows.length,opened.totals.packs,`${why}: one pack_log row per pack`);
  let at=0;
  for(const box of opened.boxes) {
    const mine=rows.slice(at,at+box.packs.length);
    at+=box.packs.length;
    if(!box.packs.length) continue;
    assert.equal(mine.reduce((sum,row)=>sum+cents(row.cost),0),cents(box.price),`${why}: ${box.productId} shares sum to its price`);
    mine.forEach((row,i)=>{assert.equal(row.wrapper_id,box.packs[i].wrapperId);assert.equal(row.set_id,box.packs[i].setId);});
  }
}
function assertTotals(opened,why) {
  const packs=opened.boxes.flatMap(b=>b.packs);
  const pulls=packs.flatMap(p=>p.cards);
  assert.equal(opened.totals.products,opened.boxes.length,why);
  assert.equal(opened.totals.packs,packs.length,why);
  assert.equal(opened.totals.cards,pulls.length+opened.boxes.reduce((s,b)=>s+b.promos.length,0),why);
  assert.equal(opened.totals.reverses,pulls.filter(c=>c.reverse).length,why);
  assert.equal(opened.totals.newCards,pulls.filter(c=>c.wasNew).length+opened.boxes.flatMap(b=>b.promos).filter(c=>c.wasNew).length,why);
}
const hitsIn=(opened,catalog)=>opened.boxes.flatMap(b=>b.packs).flatMap(p=>p.cards).filter(c=>isHit({...catalog(c.id),reverse:c.reverse})).length;
const cardCache=new Map();
function catalogCard(id) {
  if(cardCache.has(id)) return cardCache.get(id);
  const setId=PLAYABLE_SETS.map(s=>s.id).filter(s=>id.startsWith(s+'-')).sort((a,b)=>b.length-a.length)[0];
  const set=PLAYABLE_SETS.find(s=>s.id===setId);
  const card=set?JSON.parse(readFileSync(new URL('../'+set.dataFile.replace(/^\//,''),import.meta.url),'utf8')).find(c=>c.id===id):null;
  cardCache.set(id,card||{});
  return card||{};
}

// ---- Signed out, empty, validation ------------------------------------------------
assert.equal((await req('/api/vault','GET')).status,401);
assert.equal((await req('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,1,'keep')]})).status,401);
assert.equal((await req('/api/vault/open','POST',{requestId:newRequestId(),items:[{...BOX,qty:1}]})).status,401);
assert.equal((await req('/api/orders/'+newRequestId(),'GET')).status,401);

const A=seedPlayer(db,{id:'a',coins:25});
const a=as(A);
let r=await a('/api/vault','GET');
assert.equal(r.status,200,JSON.stringify(r.body));
assert.deepEqual(r.body,{items:[],kept:0});
r=await a('/api/me','GET');
assert.equal(r.body.save.vaultKept,0,'the save carries the kept count');
assert.equal((await a('/api/orders/'+newRequestId(),'GET')).status,404,'an unknown order');
assert.equal((await a('/api/orders/bad id','GET')).status,404);

const before0=snapshot('a');
const bad=async (body,status,match,why)=>{
  const res=await a('/api/cart/checkout','POST',body);
  assert.equal(res.status,status,`${why}: ${JSON.stringify(res.body)}`);
  if(match) assert.match(res.body.error,match,why);
  return res;
};
await bad({lines:[line(BOX,1,'keep')]},400,/request id/,'a missing request id');
await bad({requestId:'short',lines:[line(BOX,1,'keep')]},400,/request id/,'a malformed request id');
await bad({requestId:newRequestId(),lines:[]},400,/empty/,'an empty cart');
await bad({requestId:newRequestId(),lines:[line(BOX,1,'later')]},400,/open now or keep/,'a bad mode');
await bad({requestId:newRequestId(),lines:[line(BOX,0,'keep')]},400,null,'a zero quantity');
await bad({requestId:newRequestId(),lines:[line(BOX,ORDER_LIMITS.maxQtyPerLine+1,'keep')]},400,/up to 99/,'over the per-line cap');
await bad({requestId:newRequestId(),lines:[line(BOX,60,'keep'),line(BOX,60,'keep')]},400,/up to 99/,'merged duplicates over the per-line cap');
await bad({requestId:newRequestId(),lines:[line(BOX,99,'keep'),line(BOX,99,'open'),line(ETB,99,'keep')]},400,/250 products/,'over the product cap');
const manyIds=PLAYABLE_SETS.flatMap(s=>Object.keys(sealed[s.id]||{}).filter(k=>k!=='boosterPack'&&offerOf(s.id,k)).map(k=>({setId:s.id,productId:k}))).slice(0,ORDER_LIMITS.maxLines+1);
assert.equal(manyIds.length,ORDER_LIMITS.maxLines+1);
await bad({requestId:newRequestId(),lines:manyIds.map(p=>line(p,1,'keep'))},400,/40 different/,'over the line cap');
r=await bad({requestId:newRequestId(),lines:[line({setId:'me5',productId:'nope'},1,'keep')]},400,/me5\/nope/,'an unknown product names it');
const eventKey=Object.entries(products).filter(([,list])=>Array.isArray(list)).flatMap(([s,list])=>list.filter(p=>p.kind==='event'&&p.price>0&&offerOf(s,p.id)&&PLAYABLE_SETS.some(x=>x.id===s)).map(p=>({setId:s,productId:p.id})))[0];
assert.ok(eventKey,'an event promo to refuse');
r=await bad({requestId:newRequestId(),lines:[line(eventKey,1,'keep')]},400,new RegExp(offerOf(eventKey.setId,eventKey.productId).name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'an event promo is not cart-eligible, by name');
await bad({requestId:newRequestId(),lines:[line(BOX,11,'open')]},400,/360 packs/,'over the pack cap');
r=await bad({requestId:newRequestId(),lines:[line(BOX,1,'open')]},400,/^Not enough coins\.$/,'unaffordable');
unchanged('a',before0,'refused orders write nothing');

// ---- price_changed ---------------------------------------------------------------------
db.prepare('UPDATE profiles SET coins=? WHERE user_id=?').run(100000,'a');
const keepCart=[line(BOX,2,'keep'),line(ETB,1,'keep')];
const keepCents=lineCents(offerOf(BOX.setId,BOX.productId),2)+lineCents(offerOf(ETB.setId,ETB.productId),1);
let before=snapshot('a');
r=await a('/api/cart/checkout','POST',{requestId:newRequestId(),expectedCents:keepCents+1,lines:keepCart});
assert.equal(r.status,409);
assert.equal(r.body.code,'price_changed');
assert.equal(r.body.totalCents,keepCents);
unchanged('a',before,'a price change writes nothing');

// ---- Keep sealed: charged once, lands in the vault ------------------------------------------
const keepId=newRequestId();
r=await a('/api/cart/checkout','POST',{requestId:keepId,expectedCents:keepCents,lines:keepCart});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.opened,null,'nothing opened');
assert.equal(r.body.order.kind,'checkout');
assert.equal(r.body.order.costCents,keepCents);
assert.equal(r.body.order.status,'done');
assert.equal(r.body.order.replayed,false);
assert.equal(r.body.order.requestId,keepId);
assert.equal(coinsCents('a'),before.coins-keepCents,'charged the market price once');
assert.equal(cents(r.body.save.coins),before.coins-keepCents,'the save shows it');
assert.deepEqual(vaultRows('a'),[{set_id:'me1',product_id:'eliteTrainerBox',qty:1},{set_id:'me5',product_id:'boosterBox',qty:2}]);
assert.equal(r.body.vault.kept,3);
assert.equal(r.body.save.vaultKept,3);
assert.deepEqual(r.body.vault.items.map(i=>[i.setId,i.productId,i.qty]).sort(),[['me1','eliteTrainerBox',1],['me5','boosterBox',2]]);
assert.ok(r.body.vault.items.every(i=>i.firstAt>0&&i.lastAt>=i.firstAt));
assert.equal(snapshot('a').log,before.log,'keeping opens no pack');
assert.deepEqual(owned('a'),before.owned,'keeping adds no card');
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_order_chunks"),0,'a pure keep has no phase 2');
const keepBody=r.body;
// The same request again: replayed, not charged, not stocked twice.
r=await a('/api/cart/checkout','POST',{requestId:keepId,expectedCents:keepCents,lines:[...keepCart].reverse()});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.order.replayed,true);
assert.equal(r.body.order.id,keepBody.order.id);
assert.equal(coinsCents('a'),before.coins-keepCents,'a replay is not charged');
assert.equal(r.body.vault.kept,3,'a replay is not stocked twice');
r=await a('/api/orders/'+keepId,'GET');
assert.equal(r.status,200);
assert.deepEqual({...r.body.order,replayed:false},keepBody.order);
// The same id for a different cart, or for a vault open, is refused.
r=await a('/api/cart/checkout','POST',{requestId:keepId,lines:[line(BOX,1,'keep')]});
assert.equal(r.status,409);assert.equal(r.body.code,'request_reused');
r=await a('/api/vault/open','POST',{requestId:keepId,items:[{...BOX,qty:1}]});
assert.equal(r.status,409);assert.equal(r.body.code,'request_reused');
assert.equal(coinsCents('a'),before.coins-keepCents);

// ---- A mixed checkout: open now and keep sealed in one order ----------------------------
const B=seedPlayer(db,{id:'b',coins:100000});
const b=as(B);
const mixed=[line(BOX,1,'open'),line(ETB,2,'open'),line(BB,1,'open'),line(DECK,1,'open'),line(ETB,1,'keep')];
const mixedCents=mixed.reduce((s,l)=>s+lineCents(offerOf(l.setId,l.productId),l.qty),0);
before=snapshot('b');
let saveBefore=(await b('/api/me','GET')).body.save;
const mixedId=newRequestId();
r=await b('/api/cart/checkout','POST',{requestId:mixedId,expectedCents:mixedCents,lines:mixed});
assert.equal(r.status,200,JSON.stringify(r.body));
const mixedBody=r.body;
let opened=r.body.opened;
assert.equal(coinsCents('b'),before.coins-mixedCents,'one charge for the whole cart');
assert.deepEqual(opened.boxes.map(x=>`${x.setId}/${x.productId}`),['me5/boosterBox','me1/eliteTrainerBox','me1/eliteTrainerBox','sm10/buildBattleBox','me55/deck-espeon'],'one box per copy, in line order');
assert.deepEqual(opened.boxes.map(x=>x.packs.length),[36,9,9,4,0]);
assert.ok(opened.boxes.every(x=>x.name&&x.short&&x.noun&&x.price>0));
assert.deepEqual(opened.boxes.map(x=>x.promos.length),[0,1,1,1,1]);
assertTotals(opened,'mixed');
assertCredited('b',before,opened,'mixed');
assertWasNew(opened,before.owned,'mixed');
assertPackLog('b',before.log,opened,'mixed');
assert.equal(profile('b').packs_opened,before.profile.packs_opened+58);
assert.equal(profile('b').pulls,before.profile.pulls+opened.totals.cards,'promos are pulls, box cards are not');
const allPacks=opened.boxes.flatMap(x=>x.packs);
const lastHit=allPacks.findLastIndex(p=>p.cards.some(c=>isHit({...catalogCard(c.id),reverse:c.reverse})));
assert.equal(profile('b').packs_since_hit,lastHit<0?58:allPacks.length-1-lastHit,'packs since the last hit');
assert.equal(opened.totals.hits,hitsIn(opened,catalogCard),'totals.hits counts isHit');
assert.ok(snapshot('b').history<=24,'history keeps 24');
assert.equal(count('SELECT COUNT(*) AS n FROM history WHERE user_id=?','b'),Math.min(24,opened.totals.cards));
assert.deepEqual(vaultRows('b'),[{set_id:'me1',product_id:'eliteTrainerBox',qty:1}]);
assert.equal(r.body.save.vaultKept,1);
// Box contents: the ETB's 40 Energy, the Build & Battle deck to its full size with its promo.
const etbBoxes=opened.boxes.filter(x=>x.productId==='eliteTrainerBox');
for(const x of etbBoxes) assert.equal(x.boxCards.reduce((s,c)=>s+c.n,0),boxContents['me1/eliteTrainerBox'].spread.total);
const bbBox=opened.boxes.find(x=>x.productId==='buildBattleBox');
assert.equal(bbBox.boxCards.reduce((s,c)=>s+c.n,0)+bbBox.promos.length,boxContents['sm10/buildBattleBox'].recipe.total);
// Gear: both ETBs hand theirs out; only the first copy is new.
const etbGear=rollGear(productGear(gearCatalog,ETB.setId,ETB.productId));
assert.deepEqual(etbBoxes[0].gear.map(g=>[g.kind,g.id,g.qty,g.wasNew]).sort(),etbGear.map(g=>[g.kind,g.id,1,true]).sort());
assert.deepEqual(etbBoxes[1].gear.map(g=>[g.kind,g.id,g.qty,g.wasNew]).sort(),etbGear.map(g=>[g.kind,g.id,1,false]).sort());
for(const g of etbGear) assert.equal(gearQty('b',g.kind,g.id),2,`${g.id} twice`);
// Quests and counters: 4 products opened is 4 sealed steps; 58 packs to every pack quest.
assert.equal(counter('b','sealed'),before.sealed+5,'one sealed step per product opened');
assert.equal(events('b','sealed'),before.sealedEvents+5);
assert.equal(counter('b','hitsPulled'),opened.totals.hits);
assert.equal(events('b','newcards'),opened.totals.newCards);
assert.equal(events('b','reverses'),opened.totals.reverses);
const save=r.body.save;
assert.equal(save.stats.counters.sealed,5);
for(const q of [...activeQuests(save.quests.periods).daily,...activeQuests(save.quests.periods).weekly,...activeQuests(save.quests.periods).monthly]) {
  if(q.kind==='packs') assert.equal(save.quests.progress[q.id]-(saveBefore.quests.progress[q.id]||0),58,q.id);
  if(q.kind==='sealed') assert.equal(save.quests.progress[q.id]-(saveBefore.quests.progress[q.id]||0),5,q.id);
}
assert.equal(save.quests.progress['monthly-packs'],58);
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id='b' AND status='done'"),1);
// Replays: the same body, nothing applied twice.
const after1=snapshot('b');
r=await b('/api/cart/checkout','POST',{requestId:mixedId,expectedCents:mixedCents,lines:mixed});
assert.equal(r.status,200);
assert.equal(r.body.order.replayed,true);
assert.deepEqual(r.body.opened,mixedBody.opened,'the replay shows the same opening');
assert.deepEqual({...r.body.order,replayed:false},mixedBody.order);
r=await b('/api/orders/'+mixedId,'GET');
assert.deepEqual(r.body.opened,mixedBody.opened);
unchanged('b',after1,'replays apply nothing');

// ---- The sealed collection: open later --------------------------------------------------
// Player c keeps one of each, then opens them from the vault; the same products opened at checkout
// (player b above) must come out the same shape.
const C=seedPlayer(db,{id:'c',coins:100000});
const c=as(C);
r=await c('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,2,'keep'),line(ETB,2,'keep'),line(BB,1,'keep'),line(DECK,1,'keep')]});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.vault.kept,6);
before=snapshot('c');
saveBefore=(await c('/api/me','GET')).body.save;
const openId=newRequestId();
r=await c('/api/vault/open','POST',{requestId:openId,items:[{...BOX,qty:1},{...ETB,qty:2},{...BB,qty:1},{...DECK,qty:1}]});
assert.equal(r.status,200,JSON.stringify(r.body));
const openBody=r.body;
opened=r.body.opened;
assert.equal(r.body.order.kind,'open');
assert.equal(r.body.order.costCents,0);
assert.equal(coinsCents('c'),before.coins,'opening what you kept costs nothing');
assert.deepEqual(vaultRows('c'),[{set_id:'me5',product_id:'boosterBox',qty:1}],'decremented, empty rows gone');
assert.equal(r.body.vault.kept,1);
assert.equal(r.body.save.vaultKept,1);
assertTotals(opened,'vault');
assertCredited('c',before,opened,'vault');
assertWasNew(opened,before.owned,'vault');
assertPackLog('c',before.log,opened,'vault');
assert.equal(counter('c','sealed'),before.sealed+5);
assert.equal(r.body.save.quests.progress['monthly-packs']-(saveBefore.quests.progress['monthly-packs']||0),58);
// Parity with opening at purchase: same packs, promos, box-card totals and gear rules, product by product.
const shape=x=>({
  product:`${x.setId}/${x.productId}`,packs:x.packs.length,packSets:x.packs.map(p=>p.setId),cardsPerPack:x.packs.map(p=>p.cards.length>=3),
  promos:x.promos.length,boxCards:x.boxCards.reduce((s,c)=>s+c.n,0)+x.promos.length*(x.productId==='buildBattleBox'?1:0),
  gear:x.gear.map(g=>`${g.kind}:${g.id}:${g.qty}`).sort(),price:x.price,keys:Object.keys(x).sort(),
});
assert.deepEqual(opened.boxes.map(shape),mixedBody.opened.boxes.map(shape),'open later gives what open now gives');
for(const g of etbGear) assert.equal(gearQty('c',g.kind,g.id),2);
// Replays and the order route return the same opening; nothing is taken from the vault twice.
const after2=snapshot('c');
r=await c('/api/vault/open','POST',{requestId:openId,items:[{...DECK,qty:1},{...BB,qty:1},{...ETB,qty:2},{...BOX,qty:1}]});
assert.equal(r.status,200);
assert.equal(r.body.order.replayed,true);
assert.deepEqual(r.body.opened,openBody.opened);
unchanged('c',after2,'a vault replay changes nothing');
// Overdraw: more than kept, or something never kept, is refused and changes nothing.
r=await c('/api/vault/open','POST',{requestId:newRequestId(),items:[{...BOX,qty:2}]});
assert.equal(r.status,400);assert.equal(r.body.error,"You don't have that much sealed product.");
r=await c('/api/vault/open','POST',{requestId:newRequestId(),items:[{...ETB,qty:1}]});
assert.equal(r.status,400);assert.equal(r.body.error,"You don't have that much sealed product.");
r=await c('/api/vault/open','POST',{requestId:newRequestId(),items:[]});
assert.equal(r.status,400);
unchanged('c',after2,'a refused vault open changes nothing');
// A race: the vault empties between the check and the batch; CHECK(qty >= 0) refuses it atomically.
crash.tamper(/INSERT INTO sealed_orders/,d=>d.prepare("UPDATE sealed_vault SET qty=0 WHERE user_id='c'").run());
r=await c('/api/vault/open','POST',{requestId:newRequestId(),items:[{...BOX,qty:1}]});
assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(r.body.error,"You don't have that much sealed product.");
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id='c'"),after2.orders,'no order row');
assert.equal(snapshot('c').log,after2.log,'nothing opened');
db.prepare("UPDATE sealed_vault SET qty=1 WHERE user_id='c'").run();
// A product deleted under a request (the row is gone) is refused too, not opened from nothing.
crash.tamper(/INSERT INTO sealed_orders/,d=>d.prepare("DELETE FROM sealed_vault WHERE user_id='c'").run());
r=await c('/api/vault/open','POST',{requestId:newRequestId(),items:[{...BOX,qty:1}]});
assert.equal(r.status,400);
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_vault WHERE user_id='c'"),0,'the guard row rolled back');
assert.equal(snapshot('c').log,after2.log);
db.prepare("INSERT INTO sealed_vault(user_id,set_id,product_id,qty,first_at,last_at) VALUES('c','me5','boosterBox',1,1,1)").run();

// ---- Unaffordable at the last moment: CHECK(coins_after >= 0) refuses it atomically ----------
before=snapshot('c');
crash.tamper(/INSERT INTO sealed_orders/,d=>d.prepare("UPDATE profiles SET coins=1 WHERE user_id='c'").run());
r=await c('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,1,'open'),line(ETB,1,'keep')]});
assert.equal(r.status,400);assert.equal(r.body.error,'Not enough coins.');
assert.equal(coinsCents('c'),100,'never negative, never charged');
assert.equal(snapshot('c').orders,before.orders);
assert.deepEqual(vaultRows('c'),before.vault,'the keep line rolled back with it');
assert.equal(snapshot('c').log,before.log);
db.prepare("UPDATE profiles SET coins=? WHERE user_id='c'").run(100000);

// ---- Double submits: sequential and concurrent pay and credit once -----------------------------
for(const mode of ['sequential','concurrent']) {
  const id=mode[0]+'d';
  const s=seedPlayer(db,{id,coins:50000});
  const u=as(s);
  const cart=[line(ETB,1,'open'),line(BB,1,'open'),line(BOX,1,'keep')];
  const total=cart.reduce((sum,l)=>sum+lineCents(offerOf(l.setId,l.productId),l.qty),0);
  const rid=newRequestId();
  const b0=snapshot(id);
  const body={requestId:rid,expectedCents:total,lines:cart};
  const aborted=DB.stats.rolledBack;
  const [x,y]=mode==='sequential'
    ?[await u('/api/cart/checkout','POST',body),await u('/api/cart/checkout','POST',body)]
    :await Promise.all([u('/api/cart/checkout','POST',body),u('/api/cart/checkout','POST',body)]);
  assert.equal(x.status,200,JSON.stringify(x.body));assert.equal(y.status,200,JSON.stringify(y.body));
  // Concurrent: both rolled and both reached phase 1; the loser's batch hit UNIQUE and rolled back whole.
  if(mode==='concurrent') assert.ok(DB.stats.rolledBack>aborted,'the race really reached the database guard');
  assert.equal(x.body.order.id,y.body.order.id,`${mode}: one order`);
  assert.deepEqual(x.body.opened,y.body.opened,`${mode}: the same opening`);
  assert.deepEqual([x.body.order.replayed,y.body.order.replayed].sort(),[false,true]);
  assert.equal(coinsCents(id),b0.coins-total,`${mode}: charged once`);
  assert.equal(count('SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id=?',id),1);
  assertCredited(id,b0,x.body.opened,`${mode}: credited once`);
  assertPackLog(id,0,x.body.opened,mode);
  assert.deepEqual(vaultRows(id),[{set_id:'me5',product_id:'boosterBox',qty:1}],`${mode}: kept once`);
  assert.equal(counter(id,'sealed'),2);
  // The same for a vault open.
  const vid=newRequestId();
  const v0=snapshot(id);
  const vbody={requestId:vid,items:[{...BOX,qty:1}]};
  const [p,q]=mode==='sequential'
    ?[await u('/api/vault/open','POST',vbody),await u('/api/vault/open','POST',vbody)]
    :await Promise.all([u('/api/vault/open','POST',vbody),u('/api/vault/open','POST',vbody)]);
  assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(q.status,200,JSON.stringify(q.body));
  assert.deepEqual(p.body.opened,q.body.opened);
  assert.deepEqual(vaultRows(id),[],`${mode}: taken from the vault once`);
  assertCredited(id,v0,p.body.opened,`${mode}: vault open credited once`);
  assert.equal(count('SELECT COUNT(*) AS n FROM pack_log WHERE user_id=?',id),v0.log+36);
  assert.equal(counter(id,'sealed'),3);
}
// Two different orders racing for the last coins: one wins, the other is refused, never negative.
{
  const s=seedPlayer(db,{id:'race',coins:priceOf(ETB)+1});
  const u=as(s);
  const [x,y]=await Promise.all([1,2].map(()=>u('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(ETB,1,'open')]})));
  assert.deepEqual([x.status,y.status].sort(),[200,400]);
  assert.equal(coinsCents('race'),100);
  assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id='race'"),1);
  assert.equal(count("SELECT COUNT(*) AS n FROM pack_log WHERE user_id='race'"),9);
}

// ---- A dead isolate: resume after phase 1, between chunks, inside a chunk -------------------
async function crashCase(name,arm,resume) {
  const id='k'+name;
  const s=seedPlayer(db,{id,coins:100000});
  const u=as(s);
  const cart=[line(BOX,3,'open'),line(ETB,1,'open'),line(BB,1,'keep')];
  const total=cart.reduce((sum,l)=>sum+lineCents(offerOf(l.setId,l.productId),l.qty),0);
  const rid=newRequestId();
  const b0=snapshot(id);
  arm();
  const silenced=console.error;console.error=()=>{};
  const first=await u('/api/cart/checkout','POST',{requestId:rid,lines:cart});
  console.error=silenced;
  assert.equal(first.status,500,`${name}: the request died`);
  assert.equal(crash.pending,0,`${name}: the crash fired`);
  crash.revive();
  // What the dead request left: paid and partly applied (or, dead before phase 1, nothing at all).
  const left=db.prepare('SELECT status FROM sealed_orders WHERE user_id=? AND request_id=?').get(id,rid);
  if(name==='p0') {
    assert.equal(left,undefined,`${name}: nothing written`);
    assert.equal(coinsCents(id),b0.coins,`${name}: not charged`);
  } else {
    assert.equal(left.status,'paid',`${name}: the order waits to be finished`);
    assert.equal(coinsCents(id),b0.coins-total,`${name}: charged in phase 1`);
    const row=db.prepare('SELECT id,plan FROM sealed_orders WHERE user_id=? AND request_id=?').get(id,rid);
    assert.ok(count('SELECT COUNT(*) AS n FROM sealed_order_chunks WHERE order_id=?',row.id)<planChunks({id:row.id},JSON.parse(row.plan),id).length,`${name}: not every chunk applied yet`);
  }
  const res=await resume(u,rid,cart);
  assert.equal(res.status,200,`${name}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.order.status,'done');
  assert.equal(coinsCents(id),b0.coins-total,`${name}: charged once`);
  assertCredited(id,b0,res.body.opened,`${name}: credited once`);
  assertPackLog(id,0,res.body.opened,name);
  assertWasNew(res.body.opened,b0.owned,name);
  assert.equal(profile(id).packs_opened,res.body.opened.totals.packs);
  assert.equal(counter(id,'sealed'),4);
  assert.equal(count('SELECT COUNT(*) AS n FROM history WHERE user_id=?',id),24);
  assert.deepEqual(vaultRows(id),[{set_id:'sm10',product_id:'buildBattleBox',qty:1}]);
  assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id=? AND status='done'",id),1);
  // And once more: nothing changes.
  const again=snapshot(id);
  const replay=await u('/api/cart/checkout','POST',{requestId:rid,lines:cart});
  assert.deepEqual(replay.body.opened,res.body.opened);
  unchanged(id,again,`${name}: a later replay`);
  return res;
}
const viaPost=(u,rid,cart)=>u('/api/cart/checkout','POST',{requestId:rid,lines:cart});
const viaGet=(u,rid)=>u('/api/orders/'+rid,'GET');
const viaVault=async (u,rid)=>{assert.equal((await u('/api/vault','GET')).status,200);return u('/api/orders/'+rid,'GET');};
await crashCase('p1post',()=>crash.after(/INSERT INTO sealed_orders/),viaPost);
await crashCase('p1get',()=>crash.after(/INSERT INTO sealed_orders/),viaGet);
await crashCase('p1vault',()=>crash.after(/INSERT INTO sealed_orders/),viaVault);
// The tab that sent it is gone for good: loading the save finishes an order left a while ago.
const viaSave=async (u,rid)=>{
  const fresh=await u('/api/me','GET');
  assert.equal(fresh.status,200);
  assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE request_id=? AND status='paid'",rid),1,'a fresh order is left to its own request');
  db.prepare('UPDATE sealed_orders SET created_at=created_at-60000 WHERE request_id=?').run(rid);
  assert.equal((await u('/api/me','GET')).status,200);
  assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE request_id=? AND status='done'",rid),1,'loading the save finished it');
  return u('/api/orders/'+rid,'GET');
};
await crashCase('p1save',()=>crash.after(/INSERT INTO sealed_orders/),viaSave);
await crashCase('chunksave',()=>crash.after(/INSERT INTO sealed_order_chunks/),viaSave);
await crashCase('chunk',()=>crash.after(/INSERT INTO sealed_order_chunks/),viaPost);
await crashCase('chunkget',()=>crash.before(/INSERT INTO sealed_order_chunks/,{skip:1}),viaGet);
await crashCase('inside',()=>crash.inside(/INSERT INTO sealed_order_chunks/,2,{skip:1}),viaPost);
// Dead before phase 1: nothing was written, and the retry is a fresh, single charge.
await crashCase('p0',()=>crash.before(/INSERT INTO sealed_orders/),viaPost);
// A passing error (the batch committed but the answer was lost, the isolate lives on): the same
// request notices its own order and finishes it, charged and credited once.
for(const [name,arm] of [['lost phase 1',()=>crash.after(/INSERT INTO sealed_orders/,{dies:false})],['lost chunk',()=>crash.after(/INSERT INTO sealed_order_chunks/,{dies:false})]]) {
  const id='t'+name.replace(/\W/g,'');
  const s=seedPlayer(db,{id,coins:100000});
  const u=as(s);
  const b0=snapshot(id);
  arm();
  r=await u('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,2,'open')]});
  assert.equal(r.status,200,`${name}: ${JSON.stringify(r.body)}`);
  assert.equal(crash.pending,0);
  assert.equal(coinsCents(id),b0.coins-2*cents(priceOf(BOX)),`${name}: charged once`);
  assertCredited(id,b0,r.body.opened,`${name}: credited once`);
  assertPackLog(id,0,r.body.opened,name);
}
// The chunk layout really has several chunks for this order (so "between chunks" is between chunks).
{
  const row=db.prepare("SELECT id,plan FROM sealed_orders WHERE user_id='kchunk'").get();
  assert.ok(planChunks({id:row.id},JSON.parse(row.plan),'kchunk').length>=2,'a 3-box order spans chunks');
  assert.equal(count('SELECT COUNT(*) AS n FROM sealed_order_chunks WHERE order_id=?',row.id),planChunks({id:row.id},JSON.parse(row.plan),'kchunk').length);
}
// A dead isolate mid phase 2, then two resumers at once: each chunk still applies once.
{
  const id='kboth';
  const s=seedPlayer(db,{id,coins:100000});
  const u=as(s);
  const cart=[line(BOX,4,'open')];
  const rid=newRequestId();
  const b0=snapshot(id);
  crash.after(/INSERT INTO sealed_order_chunks/);
  const silenced=console.error;console.error=()=>{};
  assert.equal((await u('/api/cart/checkout','POST',{requestId:rid,lines:cart})).status,500);
  console.error=silenced;
  crash.revive();
  const [x,y,z]=await Promise.all([viaGet(u,rid),viaPost(u,rid,cart),u('/api/vault','GET')]);
  assert.equal(x.status,200);assert.equal(y.status,200);assert.equal(z.status,200);
  assert.deepEqual(x.body.opened,y.body.opened);
  assertCredited(id,b0,x.body.opened,'two resumers');
  assertPackLog(id,0,x.body.opened,'two resumers');
  assert.equal(profile(id).packs_opened,144);
  assert.equal(counter(id,'sealed'),4);
}

// ---- The 360-pack cap and the size of a full order -------------------------------------------
{
  const id='big';
  const s=seedPlayer(db,{id,coins:1000000});
  const u=as(s);
  r=await u('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,11,'keep')]});
  assert.equal(r.status,200);
  r=await u('/api/vault/open','POST',{requestId:newRequestId(),items:[{...BOX,qty:11}]});
  assert.equal(r.status,400);assert.match(r.body.error,/360 packs/);
  assert.equal(vaultRows(id)[0].qty,11);
  const b0=snapshot(id);
  DB.stats.maxBatch=0;DB.stats.maxParamBytes=0;
  const batches0=DB.stats.batches;
  const t0=performance.now();
  const rid=newRequestId();
  r=await u('/api/vault/open','POST',{requestId:rid,items:[{...BOX,qty:10}]});
  const ms=performance.now()-t0;
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.opened.totals.packs,360);
  assert.equal(vaultRows(id)[0].qty,1);
  assertCredited(id,b0,r.body.opened,'360 packs');
  assertPackLog(id,0,r.body.opened,'360 packs');
  assert.equal(count('SELECT COUNT(*) AS n FROM history WHERE user_id=?',id),24);
  const row=db.prepare("SELECT id,plan,result FROM sealed_orders WHERE user_id=? AND request_id=?").get(id,rid);
  const chunks=planChunks({id:row.id},JSON.parse(row.plan),id);
  const perChunk=chunks.map(list=>list.length+1);
  console.log(`360 packs from the vault: ${chunks.length} chunks of ${perChunk.join('/')} statements (marker included), `+
    `largest batch ${DB.stats.maxBatch}, ${DB.stats.batches-batches0} batches in the request, largest bound value ${(DB.stats.maxParamBytes/1024).toFixed(0)} KB, `+
    `plan ${(row.plan.length/1024).toFixed(0)} KB + result ${(row.result.length/1024).toFixed(0)} KB, ${ms.toFixed(0)} ms in this stand-in`);
  assert.ok(row.plan.length+row.result.length<1_500_000,'the order row stays well under D1\'s 2 MB row limit');
  assert.ok(DB.stats.maxBatch<=40,'every batch stays small');
  // The same cap through checkout.
  r=await u('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(BOX,10,'open'),line(ETB,1,'open')]});
  assert.equal(r.status,400);assert.match(r.body.error,/360 packs/);
}

// ---- Coins never went negative anywhere ---------------------------------------------------
assert.equal(count('SELECT COUNT(*) AS n FROM profiles WHERE coins < 0'),0);
assert.equal(count('SELECT COUNT(*) AS n FROM sealed_vault WHERE qty <= 0'),0,'no empty vault rows linger');
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE status <> 'done'"),0,'every order finished');

// ---- Another player can't see an order ----------------------------------------------------
assert.equal((await c('/api/orders/'+mixedId,'GET')).status,404);

// ---- Reset wipes the vault and the orders -------------------------------------------------
assert.ok(vaultRows('c').length>0);
r=await c('/api/me/reset','POST',{});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.deepEqual(vaultRows('c'),[]);
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_orders WHERE user_id='c'"),0);
assert.equal(count("SELECT COUNT(*) AS n FROM sealed_order_chunks WHERE order_id NOT IN (SELECT id FROM sealed_orders)"),0,'no chunk markers left behind');
assert.equal(r.body.save.vaultKept,0);
assert.ok(vaultRows('b').length>0,'another player keeps theirs');

// ---- A database from before the migration: the tables come lazily -------------------------
{
  const old=createTestDb({upTo:'0020'});
  assert.equal(old.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='sealed_vault'").get().n,0);
  const s=seedPlayer(old.db,{id:'old',coins:100000});
  const u=(path,method,body)=>requester(worker,old.env,s)(path,method,body);
  // The isolate believes the tables exist (they do in the other database): a missing table is recovered from.
  r=await u('/api/vault','GET');
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(r.body,{items:[],kept:0});
  resetOrdersSchemaCache();
  old.db.exec('DROP TABLE sealed_order_chunks; DROP TABLE sealed_orders; DROP TABLE sealed_vault;');
  r=await u('/api/me','GET');
  assert.equal(r.status,200);
  assert.equal(r.body.save.vaultKept,0,'loadSave makes the tables on its own');
  r=await u('/api/cart/checkout','POST',{requestId:newRequestId(),lines:[line(ETB,1,'open'),line(BOX,1,'keep')]});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.save.vaultKept,1);
  // vaultKept never throws: a broken database is 0, and the save still loads.
  const broken={...old.env,DB:{...old.env.DB,prepare(sql){if(/sealed_vault/.test(sql))throw new Error('boom');return old.env.DB.prepare(sql);}}};
  const silenced=console.error;console.error=()=>{};
  const res=await worker.fetch(new Request('https://poke-pack.rip/api/me',{headers:{cookie:'pp_sid='+s}}),broken);
  console.error=silenced;
  assert.equal(res.status,200);
  assert.equal((await res.json()).save.vaultKept,0);
}

// ---- The existing single "Open box" button still works next to it -------------------------
r=await b('/api/sealed/open','POST',{setId:'me5',product:'boosterBox'});
assert.equal(r.status,200,JSON.stringify(r.body));
assert.equal(r.body.packs.length,36);
assert.equal(r.body.cost,priceOf(BOX));
r=await b('/api/sealed/open','POST',{setId:'me5',product:'nope'});
assert.deepEqual(r,{status:400,body:{error:"That product isn't sold for this set."}});
r=await b('/api/sealed/open','POST',{setId:'zz',product:'boosterBox'});
assert.deepEqual(r,{status:400,body:{error:'Unknown set.'}});

console.log('Order checks passed: validation and limits, price_changed, keep lines in the vault, one charge per order, sequential and concurrent double submits, request_reused, open-later parity (ETB, Build & Battle Box, booster box, deck), wasNew across an order, pack_log shares, history 24, quests and the sealed counter, vault overdraw and races, resume after phase 1 / between and inside chunks / with two resumers, the 360-pack cap, reset, and a database from before the migration.');
