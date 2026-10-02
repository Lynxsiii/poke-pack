// XY Black Star Promos: a promo set whose cards sit in the XY sets' files (ids like "xy5-xyp003", so saves
// and product lists keep working) plus its own file (data/xyp.json, "xyp-xyp001"), but are listed, counted and
// sold under "xyp", never under the set whose box carries them. Modelled on scripts/test-mep.mjs.
//
// Until the sets exist (the set builders add data/<set>.json, b6 adds XYP_PROMOS to PLAYABLE_SETS and
// data/xyp.json) the first two parts run on a fixture; the third runs on the real data once XYP_PROMOS is playable.
// Run: node scripts/test-xyp.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {ALL_SETS,PLAYABLE_SETS,SET_BY_ID,XYP_PROMOS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers} from '../js/catalog.js';
import {PROMO_HOMES,PROMO_HOME_LIKE,homeSetId,inHomeSet,isMepCardId,isXypCardId,promoHomeOf,dexId,kitCopyCount} from '../js/card-home.js';
import {ownedPerSet} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rules --------------------------------------------------------------------------------
for(const id of ['xy1-xyp001','xy5-xyp003','xy10-xyp120','xy0-xyp007','dc1-xyp005','g1-xyp010','xy12-xyp067a'])
  assert.ok(isXypCardId(id)&&homeSetId(id)==='xyp'&&!isMepCardId(id),`${id} is an XY black star promo`);
for(const id of ['xy5-12','xy5-12a','xy5-xy12','xy12-99','xyp-xyp001x','sm5-smp101','mcd14-1','xytk6a-3','g1-RC5','energy-fairy-xy','xy5'])
  assert.ok(!isXypCardId(id),`${id} is not filed in another set's data under xyp`);
assert.equal(homeSetId('xyp-xyp001'),'xyp','the promos in the set own file count through their prefix');
assert.equal(homeSetId('xy5-12'),'xy5');assert.equal(homeSetId('g1-RC5'),'g1');assert.equal(homeSetId('xytk6a-3'),'xytk6a');
assert.equal(homeSetId('me5-mep055'),'mep','the ME rule still holds');
assert.ok(inHomeSet('xy5-xyp003','xyp')&&!inHomeSet('xy5-xyp003','xy5'));
assert.equal(promoHomeOf('me1-mep009-pc'),'mep');assert.equal(promoHomeOf('xy5-xyp003'),'xyp');assert.equal(promoHomeOf('sv1-1'),'');
assert.ok(['bwp','mep','xyp'].every(k=>k in PROMO_HOMES),'the ME, XY and BW promo homes are all there (other eras add theirs)');
assert.ok(PROMO_HOME_LIKE.includes('me%-mep%')&&PROMO_HOME_LIKE.includes('xy%-xyp%'));

// ---- The set --------------------------------------------------------------------------------------
const xyp=XYP_PROMOS;
assert.equal(xyp.id,'xyp');
assert.ok(xyp.promoSet&&!xyp.wrappers.length&&!xyp.slots.length&&xyp.packSize===0,'it sells no boosters');
assert.equal(xyp.promoPrefix,'XY ');
assert.ok(xyp.era==='XY'&&xyp.edition==='XY');
assert.ok(xyp.viewOf.includes('xyp')&&xyp.viewOf.includes('xy1')&&xyp.viewOf.includes('g1')&&xyp.viewOf.includes('dc1')&&xyp.viewOf.includes('xy0'),'it reads every XY file, its own included');
assert.equal(xyp.dataFile,'data/xyp.json');
assert.ok(hasCardData(xyp));
assert.ok(`${xyp.name} Master`.length<=32,'the mastery title fits');

// Cards come out of the lists loaded for dataSetsOf(set): a promo set keeps only its own, a main set none of them.
const card=(id,number,extra={})=>({id,name:'x',number,rarity:'Common',...extra});
const lists=[
  [card('xy5-1','1'),card('xy5-xyp030','xyp030',{rarity:'Promo',promo:true}),card('xy5-xyp003','xyp003',{rarity:'Promo',promo:true}),card('xy5-60a','60a',{promo:true,rarity:'Rare Holo'})],
  [card('xy1-xyp067a','xyp067a',{rarity:'Promo',promo:true}),card('xy1-2','2')],
  [card('xyp-xyp005','xyp005',{rarity:'Promo',promo:true}),card('xyp-xyp100','xyp100',{rarity:'Promo',promo:true})],
  [card('energy-fire-xy','—')],
];
const own=homeCards(xyp,lists);
assert.deepEqual(own.map(c=>c.id),['xy5-xyp003','xyp-xyp005','xy5-xyp030','xy1-xyp067a','xyp-xyp100'],'promo-number order, "67a" after 67, Energy left out');
assert.deepEqual(homeCards({id:'xy5'},[lists[0]]).map(c=>c.id),['xy5-1','xy5-60a'],'a main set keeps its own cards, box-only reprints stay, black star promos go');
assert.deepEqual(homeCards({id:'sm5'},[[card('sm5-smp101','smp101'),card('sm5-1','1')]]).map(c=>c.id),['sm5-smp101','sm5-1'],'older eras are untouched');
assert.deepEqual(homeCards({id:'mep'},[[card('me5-mep055','mep055'),card('me5-1','1'),card('xy5-xyp003','xyp003')]]).map(c=>c.id),['me5-mep055'],'the ME promo set keeps only ME promos');

// ---- Fixture: two XY sets and the promo set, played through the Worker ----------------------------------------
const real=PLAYABLE_SETS.includes(xyp);
if(!real){
  const base={edition:'XY',era:'XY',released:'February 4, 2015',live:true,packSize:10,cost:4,cardBack:'assets/cards/shared/card-back.webp',blurb:'x',oddsLine:'x',lede:'x',slots:[],heroIds:[],wrappers:[]};
  const xy5={...base,id:'xy5',tcgId:'xy5',name:'Primal Clash',dataFile:'data/xy5.json',totalCount:2,printedTotal:2};
  const promoSet={...xyp,totalCount:4};
  for(const set of [xy5,promoSet]){PLAYABLE_SETS.push(set);ALL_SETS.push(set);SET_BY_ID[set.id]=set;}
  const files={
    'data/xy5.json':[card('xy5-1','1',{market:1}),card('xy5-2','2',{market:0.5}),card('xy5-xyp003','xyp003',{rarity:'Promo',promo:true,printedNumber:'XY 003',market:5}),card('xy5-xyp030','xyp030',{rarity:'Promo',promo:true,printedNumber:'XY 030',market:2})],
    'data/xyp.json':[card('xyp-xyp005','xyp005',{rarity:'Promo',promo:true,printedNumber:'XY 005',market:3}),card('xyp-xyp100','xyp100',{rarity:'Promo',promo:true,printedNumber:'XY 100',market:4})],
  };
  const found=dataSetsOf(SET_BY_ID.xyp).map(s=>s.id);
  assert.ok(found.includes('xy5')&&found[found.length-1]==='xyp','dataSetsOf names the XY files it can find, and its own last');
  assert.deepEqual(homeCards(SET_BY_ID.xyp,dataSetsOf(SET_BY_ID.xyp).map(s=>files[s.dataFile]).filter(Boolean)).map(c=>c.id),['xy5-xyp003','xyp-xyp005','xy5-xyp030','xyp-xyp100']);
  assert.deepEqual(homeCards(SET_BY_ID.xy5,[files['data/xy5.json']]).map(c=>c.id),['xy5-1','xy5-2'],'the dex holds no black star promo');

  // Counting.
  const owned={'xy5-1':1,'xy5-xyp003':2,'xyp-xyp005':1,'xy5-xyp030':1};
  const per=ownedPerSet(owned);
  assert.equal(per.get('xy5'),1,'Primal Clash counts its own card only');
  assert.equal(per.get('xyp'),3,'the three promos count under xyp');
  const ctx=achievementContext({collection:owned},{cards:Object.keys(owned).map(id=>({id,name:'x',rarity:'Promo'}))});
  assert.equal(ctx.setOwned('xyp'),3);assert.equal(ctx.setOwned('xy5'),1);
  assert.ok(ctx.promoOwned>=0);

  // The Worker.
  const {db,env}=createTestDb();
  const assets=env.ASSETS.fetch;
  env.ASSETS.fetch=async request=>{
    const path=new URL(request.url).pathname.slice(1);
    return files[path]?new Response(JSON.stringify(files[path]),{headers:{'content-type':'application/json'}}):assets(request);
  };
  const session=seedPlayer(db,{coins:1000});
  const request=requester(worker,env,session);
  const give=(id,qty)=>db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)').run('test',id,qty);
  const qty=id=>db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test',id)?.qty;
  give('xy5-1',3);give('xy5-xyp003',3);give('xy5-xyp030',1);give('xyp-xyp005',2);give('xyp-xyp100',1);
  let res=await request('/api/me');
  assert.equal(res.status,200);
  for(const [id,n] of [['xy5-1',3],['xy5-xyp003',3],['xy5-xyp030',1],['xyp-xyp005',2],['xyp-xyp100',1]]) assert.equal(res.body.save.collection[id],n,`${id} keeps its count`);

  // Primal Clash sells its own spares and leaves the promos alone.
  res=await request('/api/cards/sell-duplicates','POST',{setId:'xy5'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2,'two spare Primal Clash copies');
  assert.equal(qty('xy5-1'),1);assert.equal(qty('xy5-xyp003'),3,'a promo is not sold with Primal Clash');
  // XY Black Star Promos sells the promos' spares, whichever file holds them.
  res=await request('/api/cards/sell-duplicates','POST',{setId:'xyp'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2+1,'spares: xyp003 x2 (xy5 file) and xyp005 x1 (its own file)');
  assert.equal(qty('xy5-xyp003'),1);assert.equal(qty('xyp-xyp005'),1);assert.equal(qty('xyp-xyp100'),1);assert.equal(qty('xy5-1'),1);
  assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'xyp'})).status,400,'nothing left to sell');
  // Selling a promo by its box id still works, and so does one from the set's own file.
  res=await request('/api/cards/sell','POST',{cardId:'xy5-xyp003'});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty('xy5-xyp003'),undefined);
  res=await request('/api/cards/sell','POST',{cardId:'xyp-xyp100'});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty('xyp-xyp100'),undefined);
  // And a Mega Evolution set's promos are still sold with the ME promo set, not with this one (LIKE patterns do not cross).
  give('me5-mep055',3);
  res=await request('/api/cards/sell-duplicates','POST',{setId:'xyp'});
  assert.equal(res.status,400);assert.equal(qty('me5-mep055'),3);
}

// ---- The real set, once it is playable --------------------------------------------------------------------
if(real){
  const files=Object.fromEntries(dataSetsOf(xyp).map(s=>[s.id,read(s.dataFile??`data/${s.id}.json`)]));
  const promos=homeCards(xyp,Object.values(files));
  assert.equal(promos.length,xyp.totalCount,'totalCount is every XY black star promo in the XY files');
  assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
  for(const c of promos){
    assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
    assert.match(c.printedNumber,/^XY \d{3}[a-z]?$/,`${c.id} prints its XY number`);
    assert.ok(existsSync(new URL(c.image,root)),`${c.id} has its scan`);
  }
  const order=promos.map(c=>Number(/^xyp(\d+)/.exec(c.number)[1]));
  assert.deepEqual(order,[...order].sort((a,b)=>a-b),'listed in promo-number order');
  for(const id of xyp.heroIds) assert.ok(promos.some(c=>c.id===id),`${id} is a promo`);
  for(const [setId,list] of Object.entries(files)){
    if(setId==='xyp') continue;
    const set=getSet(setId);
    const dex=homeCards(set,[list]);
    assert.ok(dex.every(c=>!isXypCardId(c.id)),`${setId}: no XY promo in its dex`);
    assert.equal(dex.length,set.totalCount,`${setId}: totalCount is its own ${dex.length} cards`);
  }

  // Own file: one entry per promo number, in XY's own printing, no number built twice across the XY files.
  const numbers=promos.map(c=>c.number);
  assert.equal(new Set(numbers).size,numbers.length,'no promo number is built twice');
  assert.ok(files.xyp.length>0&&files.xyp.every(c=>c.id==='xyp-'+c.number),'the set file holds xyp-xypNNN ids only');
  assert.ok(xyp.heroIds.length>=4,'the set shows four heroes');
  // The pseudo-sets that ship with it: McDonald's 2014-2016 and the eight Trainer Kit half decks.
  for(const id of ['mcd14','mcd15','mcd16']){
    const set=getSet(id);assert.ok(PLAYABLE_SETS.includes(set)&&set.packSize===1,`${id} is playable`);
    assert.equal(read(`data/${id}.json`).length,set.totalCount,`${id}: totalCount`);
  }
  const kitIds=['xytk6a','xytk6b','xytk7a','xytk7b','xytk8a','xytk8b','xytk9a','xytk9b'];
  const boxes=read('data/box-contents.json');
  for(const id of kitIds){
    const set=getSet(id),cards=read(`data/${id}.json`);
    assert.ok(PLAYABLE_SETS.includes(set)&&set.promoSet&&set.packSize===0,`${id} sells no boosters`);
    assert.equal(cards.length,30,`${id}: thirty cards`);assert.equal(set.totalCount,30-kitCopyCount(id),`${id}: each copy listed once (KIT_COPIES)`);
    const kit=promoOffers(read('data/products.json')[id]);
    assert.equal(kit.length,1,`${id} has its kit product`);
    const row=boxes[`${id}/${kit[0].id}`];
    assert.ok(row,`${id}: kit contents row exists`);
    assert.equal(row.cards.reduce((n,[,k])=>n+k,0),59,`${id}: the kit deals 59 cards beside its own promo`);
    assert.ok(row.cards.every(([card,n])=>n>0&&dexId(card)===card&&/^xytk(6|7|8|9)[ab]-\d+$/.test(card)),`${id}: only kit cards, copies dealt as counts of the card`);
  }
  const seen=new Map();
  for(const set of PLAYABLE_SETS){
    if(!hasCardData(set)) continue;
    for(const c of homeCards(set,dataSetsOf(set).map(s=>read(s.dataFile??`data/${s.id}.json`)))){
      if(seen.has(c.id)) assert.fail(`${c.id} is on both ${seen.get(c.id)} and ${set.id}`);
      seen.set(c.id,set.id);
    }
  }
  const products=read('data/products.json');
  for(const [setId,list] of Object.entries(products)){
    if(setId.startsWith('_')) continue;
    for(const offer of promoOffers(list)) for(const id of offer.promos) if(isXypCardId(id)) assert.ok(files[setId]?.some(c=>c.id===id)||setId==='xyp',`${setId}/${offer.id}: ${id} is in data/${setId}.json`);
  }
}

console.log(`XYP checks passed (${real?'real data':'fixture'}): ids, home table, homeCards, counting${real?', totals':', Worker sales'}.`);
