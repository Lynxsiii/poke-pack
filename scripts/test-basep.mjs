// Wizards Black Star Promos (basep) and Best of Game (bp): the Wizards promo sets. basep's cards sit in the Wizards of the Coast
// sets' files when a theme deck, a starter or gift set or the Southern Islands folder held them (ids like "base2-basep01",
// "neo1-basep22", "ecard3-basep30", so saves and product lists keep working) plus its own file (data/basep.json: "basep-basep09"), but are
// listed, counted and sold under "basep", never under the set whose box carries them. Best of Game is its own set with no product
// (data/bp.json: "bp-bp01"). Modelled on scripts/test-dpp.mjs.
//
// Until the sets exist the first two parts run on a fixture; the third runs on the real data once BASEP_PROMOS / BP_PROMOS
// are playable. Run: node scripts/test-basep.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {ALL_SETS,PLAYABLE_SETS,SET_BY_ID,BASEP_PROMOS,BP_PROMOS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers} from '../js/catalog.js';
import {PROMO_HOMES,PROMO_HOME_LIKE,homeSetId,inHomeSet,isMepCardId,isXypCardId,isBwpCardId,isDppCardId,isHspCardId,isBasepCardId,isBpCardId,promoHomeOf} from '../js/card-home.js';
import {ownedPerSet} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rules --------------------------------------------------------------------------------
for(const id of ['base1-basep01','base2-basep01','base3-basep01','base4-basep08','base5-basep18','gym1-basep20','gym2-basep30','neo1-basep22','neo2-basep33','si1-basep40','neo3-basep45','neo4-basep50','ecard1-basep50','ecard2-basep51','ecard3-basep53'])
  assert.ok(isBasepCardId(id)&&homeSetId(id)==='basep'&&!isBpCardId(id)&&!isDppCardId(id)&&!isHspCardId(id)&&!isBwpCardId(id)&&!isXypCardId(id)&&!isMepCardId(id),`${id} is a Wizards black star promo`);
for(const id of ['base1-bp01','neo4-bp09','ecard3-bp03'])
  assert.ok(isBpCardId(id)&&homeSetId(id)==='bp'&&!isBasepCardId(id),`${id} is a Best of Game card filed in another set`);
for(const id of ['base1-4','base1-97','base6-110','neo3-65','neo4-113','ecard2-H8','ecard2-149','si1-1','basep-basep001x','basep-basep','base1-basep','base1-basepx1','base1-bp','dp1-basep01','dpp-basep01','bw5-basep01','basep','bp','energy-fire','xy5-xyp003','bw5-bwp003','dp1-dpp01','hgss1-hsp01'])
  assert.ok(!isBasepCardId(id)&&!isBpCardId(id),`${id} is not filed in another set's data under basep or bp`);
assert.equal(homeSetId('basep-basep01'),'basep','the promos in the set own file count through their prefix');
assert.equal(homeSetId('bp-bp01'),'bp');
assert.equal(homeSetId('base1-4'),'base1');assert.equal(homeSetId('neo3-65'),'neo3');assert.equal(homeSetId('ecard2-H8'),'ecard2');assert.equal(homeSetId('si1-1'),'si1');assert.equal(homeSetId('base6-110'),'base6');
assert.equal(homeSetId('bw5-bwp003'),'bwp','the BW rule still holds');
assert.equal(homeSetId('xy5-xyp003'),'xyp','the XY rule still holds');
assert.equal(homeSetId('me5-mep055'),'mep','the ME rule still holds');
assert.equal(homeSetId('dp1-dpp01'),'dpp','the DP rule still holds');
assert.equal(homeSetId('col1-hsp24'),'hsp','the HGSS rule still holds');
assert.ok(inHomeSet('base2-basep01','basep')&&!inHomeSet('base2-basep01','base2')&&inHomeSet('base2-1','base2')&&inHomeSet('bp-bp01','bp'));
assert.equal(promoHomeOf('neo1-basep22'),'basep');assert.equal(promoHomeOf('bw5-bwp003'),'bwp');assert.equal(promoHomeOf('sv1-1'),'');
assert.ok(['basep','bp','dpp','hsp','bwp','mep','xyp'].every(k=>k in PROMO_HOMES));
for(const like of ['base_-basep%','gym_-basep%','neo_-basep%','si1-basep%','ecard_-basep%','base_-bp%','dp%-dpp%','bw%-bwp%','me%-mep%']) assert.ok(PROMO_HOME_LIKE.includes(like),`${like} is in PROMO_HOME_LIKE`);

// ---- The sets -------------------------------------------------------------------------------------
const WIZARDS=['base1','base2','base3','base4','base5','gym1','gym2','neo1','neo2','si1','neo3','neo4','base6','ecard1','ecard2','ecard3'];
const CONFIGS=[
  {set:BASEP_PROMOS,id:'basep',prefix:'Promo ',tag:'basep',era:'Wizards of the Coast',homes:['base2','neo1'],viewHas:WIZARDS,
   home:'base2',homeB:'neo1',nums:{a:'03',b:'22',c:'05',d:'53'},viewNotOther:['dp1','bw1','xy1']},
];
for(const cfg of CONFIGS){
  const s=cfg.set;
  assert.equal(s.id,cfg.id);
  assert.ok(s.promoSet&&!s.wrappers.length&&!s.slots.length&&s.packSize===0,`${cfg.id}: it sells no boosters`);
  assert.equal(s.promoPrefix,cfg.prefix);
  assert.ok(s.era===cfg.era&&s.edition===cfg.era);
  for(const v of [...cfg.viewHas,cfg.id]) assert.ok(s.viewOf.includes(v),`${cfg.id}: views ${v}`);
  for(const v of cfg.viewNotOther) assert.ok(!s.viewOf.includes(v),`${cfg.id}: does not view ${v}`);
  assert.equal(s.dataFile,`data/${cfg.id}.json`);
  assert.ok(hasCardData(s));
}
assert.deepEqual(BP_PROMOS.viewOf,['bp'],'Best of Game reads only its own file: no product carries a Best of Game card');
assert.ok(BP_PROMOS.promoSet&&!BP_PROMOS.slots.length&&BP_PROMOS.packSize===0&&BP_PROMOS.promoPrefix==='BoG '&&BP_PROMOS.dataFile==='data/bp.json'&&hasCardData(BP_PROMOS));
assert.ok(!BASEP_PROMOS.viewOf.some(v=>/^(dp|pl|hgss|col|bw|xy|sm|swsh|sv|me)\d|^bp$/.test(v)),'basep reads only Wizards files');

// Cards come out of the lists loaded for dataSetsOf(set): a promo set keeps only its own, a main set none of them.
const card=(id,number,extra={})=>({id,name:'x',number,rarity:'Common',...extra});
{
  const lists=[
    [card('base2-1','1',{rarity:'Rare Holo'}),card('base2-basep20','basep20',{rarity:'Promo',promo:true}),card('base2-basep03','basep03',{rarity:'Promo',promo:true}),card('base2-60a','60a',{promo:true,rarity:'Rare Holo'})],
    [card('neo1-basep22','basep22',{rarity:'Promo',promo:true}),card('neo1-2','2')],
    [card('basep-basep05','basep05',{rarity:'Promo',promo:true}),card('basep-basep53','basep53',{rarity:'Promo',promo:true})],
    [card('base1-97','97',{rarity:'Energy'})],
  ];
  const own=homeCards(BASEP_PROMOS,lists);
  assert.deepEqual(own.map(c=>c.id),['base2-basep03','basep-basep05','base2-basep20','neo1-basep22','basep-basep53'],'promo-number order, the sets\' own cards left out');
  assert.deepEqual(homeCards({id:'base2'},[lists[0]]).map(c=>c.id),['base2-1','base2-60a'],'a main set keeps its own cards, box-only reprints stay, black star promos go');
  assert.deepEqual(homeCards({id:'neo1'},[lists[1]]).map(c=>c.id),['neo1-2']);
  assert.deepEqual(homeCards({id:'bwp'},[[card('bw5-bwp003','bwp003'),card('base2-basep03','basep03')]]).map(c=>c.id),['bw5-bwp003'],'the BW promo set ignores Wizards promos');
  assert.deepEqual(homeCards({id:'dpp'},[[card('dp1-dpp03','dpp03'),card('base2-basep03','basep03')]]).map(c=>c.id),['dp1-dpp03'],'the DP promo set ignores Wizards promos');
  assert.deepEqual(homeCards(BASEP_PROMOS,[[card('dp1-dpp03','dpp03'),card('bw5-bwp003','bwp003')]]).map(c=>c.id),[],'basep keeps only Wizards promos');
  assert.deepEqual(homeCards({id:'sm5'},[[card('sm5-smp101','smp101'),card('sm5-1','1')]]).map(c=>c.id),['sm5-smp101','sm5-1'],'older eras are untouched');
  assert.deepEqual(homeCards(BP_PROMOS,[[card('bp-bp03','bp03',{rarity:'Promo',promo:true}),card('bp-bp01','bp01',{rarity:'Promo',promo:true}),card('basep-basep01','basep01')]]).map(c=>c.id),['bp-bp01','bp-bp03'],'Best of Game: its own file, in order');
}

// ---- Fixture: sets of each promo home and the promo set, played through the Worker ---------------------------------
for(const cfg of CONFIGS){
  const promoSetDef=cfg.set;
  const real=PLAYABLE_SETS.includes(promoSetDef);
  if(real) continue;
  const base={edition:cfg.era,era:cfg.era,released:'January 9, 1999',live:true,packSize:11,cost:4,cardBack:'assets/cards/shared/card-back.webp',blurb:'x',oddsLine:'x',lede:'x',slots:[],heroIds:[],wrappers:[]};
  const A=cfg.home,B=cfg.homeB,t=cfg.tag;
  const setA={...base,id:A,tcgId:A,name:'Set A',dataFile:`data/${A}.json`,totalCount:2,printedTotal:2};
  const setB={...base,id:B,tcgId:B,name:'Set B',dataFile:`data/${B}.json`,totalCount:1,printedTotal:1};
  const promoSet={...promoSetDef,totalCount:4};
  for(const set of [setA,setB,promoSet]){if(set!==promoSet&&SET_BY_ID[set.id]) continue;PLAYABLE_SETS.push(set);ALL_SETS.push(set);SET_BY_ID[set.id]=set;}
  const {a,b,c,d}=cfg.nums;
  const files={
    [`data/${A}.json`]:[card(`${A}-1`,'1',{market:1}),card(`${A}-2`,'2',{market:0.5}),card(`${A}-${t}${a}`,`${t}${a}`,{rarity:'Promo',promo:true,printedNumber:`${cfg.prefix}${a}`,market:5}),card(`${A}-${t}${d}`,`${t}${d}`,{rarity:'Promo',promo:true,printedNumber:`${cfg.prefix}${d}`,market:2})],
    [`data/${B}.json`]:[card(`${B}-1`,'1',{market:1}),card(`${B}-${t}${b}`,`${t}${b}`,{rarity:'Promo',promo:true,printedNumber:`${cfg.prefix}${b}`,market:3})],
    [`data/${t}.json`]:[card(`${t}-${t}${c}`,`${t}${c}`,{rarity:'Promo',promo:true,printedNumber:`${cfg.prefix}${c}`,market:3})],
  };
  const ids=dataSetsOf(SET_BY_ID[t]).map(s=>s.id);
  assert.ok(ids.includes(A)&&ids.includes(B)&&ids.includes(t),`${t}: dataSetsOf names the files it can find and its own`);
  assert.deepEqual(homeCards(SET_BY_ID[A],[files[`data/${A}.json`]]).map(x=>x.id),[`${A}-1`,`${A}-2`],'the dex holds no black star promo');

  // Counting.
  const owned={[`${A}-1`]:1,[`${A}-${t}${a}`]:2,[`${t}-${t}${c}`]:1,[`${B}-${t}${b}`]:1};
  const per=ownedPerSet(owned);
  assert.equal(per.get(A),1,'the set counts its own card only');
  assert.equal(per.get(t),3,'the three promos count under their promo set');
  const ctx=achievementContext({collection:owned},{cards:Object.keys(owned).map(id=>({id,name:'x',rarity:'Promo'}))});
  assert.equal(ctx.setOwned(t),3);assert.equal(ctx.setOwned(A),1);

  // The Worker.
  const {db,env}=createTestDb();
  const assets=env.ASSETS.fetch;
  env.ASSETS.fetch=async request=>{
    const path=new URL(request.url).pathname.slice(1);
    return files[path]?new Response(JSON.stringify(files[path]),{headers:{'content-type':'application/json'}}):assets(request);
  };
  const session=seedPlayer(db,{coins:1000});
  const request=requester(worker,env,session);
  const give=(id,q)=>db.prepare('INSERT INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,?,0)').run('test',id,q);
  const qty=id=>db.prepare('SELECT qty FROM cards WHERE user_id=? AND card_id=?').get('test',id)?.qty;
  const pa=`${A}-${t}${a}`,pd=`${A}-${t}${d}`,pb=`${B}-${t}${b}`,pc=`${t}-${t}${c}`;
  give(`${A}-1`,3);give(pa,3);give(pd,1);give(pc,2);give(pb,1);
  let res=await request('/api/me');
  assert.equal(res.status,200);
  for(const [id,n] of [[`${A}-1`,3],[pa,3],[pd,1],[pc,2],[pb,1]]) assert.equal(res.body.save.collection[id],n,`${id} keeps its count`);

  // The home set sells its own spares and leaves the promos alone.
  res=await request('/api/cards/sell-duplicates','POST',{setId:A});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2,`two spare ${A} copies`);
  assert.equal(qty(`${A}-1`),1);assert.equal(qty(pa),3,'a promo is not sold with the set whose box carried it');
  // The promo set sells the promos' spares, whichever file holds them.
  res=await request('/api/cards/sell-duplicates','POST',{setId:t});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2+1,'spares: the box-file promo x2 and the own-file promo x1');
  assert.equal(qty(pa),1);assert.equal(qty(pc),1);assert.equal(qty(pb),1);assert.equal(qty(`${A}-1`),1);
  assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:t})).status,400,'nothing left to sell');
  // Selling a promo by its box id still works, and so does one from the set's own file.
  res=await request('/api/cards/sell','POST',{cardId:pa});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty(pa),undefined);
  res=await request('/api/cards/sell','POST',{cardId:pc});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty(pc),undefined);
  // Other eras' promos are sold with their own promo set (LIKE patterns do not cross).
  give('me5-mep055',3);give('bw5-bwp003',3);give('dp1-dpp03',3);
  res=await request('/api/cards/sell-duplicates','POST',{setId:t});
  assert.equal(res.status,400);assert.equal(qty('me5-mep055'),3);assert.equal(qty('bw5-bwp003'),3);
  assert.equal(qty('dp1-dpp03'),3,'DP promos do not cross');
}

// ---- The real sets, once they are playable ------------------------------------------------------------------
for(const cfg of [...CONFIGS,{set:BP_PROMOS,tag:'bp',prefix:'BoG '}]){
  const s=cfg.set;
  if(!PLAYABLE_SETS.includes(s)) continue;
  const t=cfg.tag;
  const files=Object.fromEntries(dataSetsOf(s).map(x=>[x.id,read(x.dataFile??`data/${x.id}.json`)]));
  const promos=homeCards(s,Object.values(files));
  assert.equal(promos.length,s.totalCount,`${t}: totalCount is every black star promo in the files`);
  assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
  for(const c of promos){
    assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
    assert.match(c.printedNumber,new RegExp(`^${cfg.prefix}\\d{2}[a-z]?$`),`${c.id} prints its number`);
    assert.ok(existsSync(new URL(c.image,root)),`${c.id} has its scan`);
  }
  const order=promos.map(c=>Number(new RegExp(`^${t}(\\d+)`).exec(c.number)[1]));
  assert.deepEqual(order,[...order].sort((x,y)=>x-y),'listed in promo-number order');
  for(const id of s.heroIds) assert.ok(promos.some(c=>c.id===id),`${id} is a promo`);
  for(const [setId,list] of Object.entries(files)){
    if(setId===t) continue;
    const set=getSet(setId);
    const dex=homeCards(set,[list]);
    assert.ok(dex.every(c=>promoHomeOf(c.id)===''),`${setId}: no promo in its dex`);
    assert.equal(dex.length,set.totalCount,`${setId}: totalCount is its own ${dex.length} cards`);
  }
  const products=read('data/products.json');
  for(const [setId,list] of Object.entries(products)){
    if(setId.startsWith('_')) continue;
    for(const offer of promoOffers(list)) for(const id of offer.promos) if(promoHomeOf(id)===t) assert.ok(files[setId]?.some(c=>c.id===id)||setId===t,`${setId}/${offer.id}: ${id} is in data/${setId}.json`);
  }
}
{
  // No card on two home sets, across every playable set with data.
  const seen=new Map();
  for(const set of PLAYABLE_SETS){
    if(!hasCardData(set)||!existsSync(new URL(set.dataFile??`data/${set.id}.json`,root))) continue;
    for(const c of homeCards(set,dataSetsOf(set).filter(x=>existsSync(new URL(x.dataFile??`data/${x.id}.json`,root))).map(x=>read(x.dataFile??`data/${x.id}.json`)))){
      if(seen.has(c.id)) assert.fail(`${c.id} is on both ${seen.get(c.id)} and ${set.id}`);
      seen.set(c.id,set.id);
    }
  }
}

const realCount=[BASEP_PROMOS,BP_PROMOS].filter(x=>PLAYABLE_SETS.includes(x)).length;
console.log(`BASEP checks passed (${realCount===2?'real data':realCount?'one real, one fixture':'fixture'}): ids, home table, homeCards, counting${realCount===2?', totals':', Worker sales'}.`);
