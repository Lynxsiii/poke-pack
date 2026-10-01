// BW Black Star Promos: a promo set whose cards sit in the Black & White sets' files (ids like "bw5-bwp003", so saves
// and product lists keep working) plus its own file (data/bwp.json, "bwp-bwp001"), but are listed, counted and
// sold under "bwp", never under the set whose box carries them. Modelled on scripts/test-bwp.mjs.
//
// Until the sets exist (the set builders add data/<set>.json, the promo builder adds BWP_PROMOS to PLAYABLE_SETS and
// data/bwp.json) the first two parts run on a fixture; the third runs on the real data once BWP_PROMOS is playable.
// Run: node scripts/test-bwp.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {ALL_SETS,PLAYABLE_SETS,SET_BY_ID,BWP_PROMOS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers} from '../js/catalog.js';
import {PROMO_HOMES,PROMO_HOME_LIKE,homeSetId,inHomeSet,isMepCardId,isXypCardId,isBwpCardId,promoHomeOf} from '../js/card-home.js';
import {ownedPerSet} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rules --------------------------------------------------------------------------------
for(const id of ['bw1-bwp001','bw5-bwp003','bw10-bwp101','dv1-bwp012','bw11-bwp098','bw7-bwp067a'])
  assert.ok(isBwpCardId(id)&&homeSetId(id)==='bwp'&&!isMepCardId(id)&&!isXypCardId(id),`${id} is a BW black star promo`);
for(const id of ['bw5-12','bw5-12a','bw5-bw12','bw12-99','bwp-bwp001x','sm5-smp101','mcd11-1','bwtk5a-3','bw11-RC5','energy-fire-bw','bw5','xy5-xyp003','dv1-12','xyp-xyp001'])
  assert.ok(!isBwpCardId(id),`${id} is not filed in another set's data under bwp`);
assert.equal(homeSetId('bwp-bwp001'),'bwp','the promos in the set own file count through their prefix');
assert.equal(homeSetId('bw5-12'),'bw5');assert.equal(homeSetId('bw11-RC5'),'bw11');assert.equal(homeSetId('bwtk5a-3'),'bwtk5a');assert.equal(homeSetId('dv1-bwp012'),'bwp');
assert.equal(homeSetId('xy5-xyp003'),'xyp','the XY rule still holds');
assert.equal(homeSetId('me5-mep055'),'mep','the ME rule still holds');
assert.ok(inHomeSet('bw5-bwp003','bwp')&&!inHomeSet('bw5-bwp003','bw5'));
assert.equal(promoHomeOf('me1-mep009-pc'),'mep');assert.equal(promoHomeOf('bw5-bwp003'),'bwp');assert.equal(promoHomeOf('xy5-xyp003'),'xyp');assert.equal(promoHomeOf('sv1-1'),'');
assert.deepEqual(Object.keys(PROMO_HOMES).sort(),['bwp','mep','xyp']);
assert.ok(PROMO_HOME_LIKE.includes('me%-mep%')&&PROMO_HOME_LIKE.includes('bw%-bwp%')&&PROMO_HOME_LIKE.includes('dv1-bwp%'));

// ---- The set --------------------------------------------------------------------------------------
const bwp=BWP_PROMOS;
assert.equal(bwp.id,'bwp');
assert.ok(bwp.promoSet&&!bwp.wrappers.length&&!bwp.slots.length&&bwp.packSize===0,'it sells no boosters');
assert.equal(bwp.promoPrefix,'BW ');
assert.ok(bwp.era==='Black & White'&&bwp.edition==='Black & White');
assert.ok(bwp.viewOf.includes('bwp')&&bwp.viewOf.includes('bw1')&&bwp.viewOf.includes('bw11')&&bwp.viewOf.includes('dv1'),'it reads every Black & White file, Dragon Vault and its own included');
assert.equal(bwp.dataFile,'data/bwp.json');
assert.ok(hasCardData(bwp));
assert.ok(`${bwp.name} Master`.length<=32,'the mastery title fits');

// Cards come out of the lists loaded for dataSetsOf(set): a promo set keeps only its own, a main set none of them.
const card=(id,number,extra={})=>({id,name:'x',number,rarity:'Common',...extra});
const lists=[
  [card('bw5-1','1'),card('bw5-bwp030','bwp030',{rarity:'Promo',promo:true}),card('bw5-bwp003','bwp003',{rarity:'Promo',promo:true}),card('bw5-60a','60a',{promo:true,rarity:'Rare Holo'})],
  [card('bw1-bwp067a','bwp067a',{rarity:'Promo',promo:true}),card('bw1-2','2')],
  [card('bwp-bwp005','bwp005',{rarity:'Promo',promo:true}),card('bwp-bwp100','bwp100',{rarity:'Promo',promo:true})],
  [card('energy-fire-bw','—')],
];
const own=homeCards(bwp,lists);
assert.deepEqual(own.map(c=>c.id),['bw5-bwp003','bwp-bwp005','bw5-bwp030','bw1-bwp067a','bwp-bwp100'],'promo-number order, "67a" after 67, Energy left out');
assert.deepEqual(homeCards({id:'bw5'},[lists[0]]).map(c=>c.id),['bw5-1','bw5-60a'],'a main set keeps its own cards, box-only reprints stay, black star promos go');
assert.deepEqual(homeCards({id:'sm5'},[[card('sm5-smp101','smp101'),card('sm5-1','1')]]).map(c=>c.id),['sm5-smp101','sm5-1'],'older eras are untouched');
assert.deepEqual(homeCards({id:'mep'},[[card('me5-mep055','mep055'),card('me5-1','1'),card('bw5-bwp003','bwp003')]]).map(c=>c.id),['me5-mep055'],'the ME promo set keeps only ME promos');

// ---- Fixture: two Black & White sets and the promo set, played through the Worker ----------------------------------------
const real=PLAYABLE_SETS.includes(bwp);
if(!real){
  const base={edition:'Black & White',era:'Black & White',released:'May 9, 2012',live:true,packSize:10,cost:4,cardBack:'assets/cards/shared/card-back.webp',blurb:'x',oddsLine:'x',lede:'x',slots:[],heroIds:[],wrappers:[]};
  const bw5={...base,id:'bw5',tcgId:'bw5',name:'Dark Explorers',dataFile:'data/bw5.json',totalCount:2,printedTotal:2};
  const promoSet={...bwp,totalCount:4};
  for(const set of [bw5,promoSet]){PLAYABLE_SETS.push(set);ALL_SETS.push(set);SET_BY_ID[set.id]=set;}
  const files={
    'data/bw5.json':[card('bw5-1','1',{market:1}),card('bw5-2','2',{market:0.5}),card('bw5-bwp003','bwp003',{rarity:'Promo',promo:true,printedNumber:'BW 003',market:5}),card('bw5-bwp030','bwp030',{rarity:'Promo',promo:true,printedNumber:'BW 030',market:2})],
    'data/bwp.json':[card('bwp-bwp005','bwp005',{rarity:'Promo',promo:true,printedNumber:'BW 005',market:3}),card('bwp-bwp100','bwp100',{rarity:'Promo',promo:true,printedNumber:'BW 100',market:4})],
  };
  const found=dataSetsOf(SET_BY_ID.bwp).map(s=>s.id);
  assert.ok(found.includes('bw5')&&found[found.length-1]==='bwp','dataSetsOf names the Black & White files it can find, and its own last');
  assert.deepEqual(homeCards(SET_BY_ID.bwp,dataSetsOf(SET_BY_ID.bwp).map(s=>files[s.dataFile]).filter(Boolean)).map(c=>c.id),['bw5-bwp003','bwp-bwp005','bw5-bwp030','bwp-bwp100']);
  assert.deepEqual(homeCards(SET_BY_ID.bw5,[files['data/bw5.json']]).map(c=>c.id),['bw5-1','bw5-2'],'the dex holds no black star promo');

  // Counting.
  const owned={'bw5-1':1,'bw5-bwp003':2,'bwp-bwp005':1,'bw5-bwp030':1};
  const per=ownedPerSet(owned);
  assert.equal(per.get('bw5'),1,'Dark Explorers counts its own card only');
  assert.equal(per.get('bwp'),3,'the three promos count under bwp');
  const ctx=achievementContext({collection:owned},{cards:Object.keys(owned).map(id=>({id,name:'x',rarity:'Promo'}))});
  assert.equal(ctx.setOwned('bwp'),3);assert.equal(ctx.setOwned('bw5'),1);
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
  give('bw5-1',3);give('bw5-bwp003',3);give('bw5-bwp030',1);give('bwp-bwp005',2);give('bwp-bwp100',1);
  let res=await request('/api/me');
  assert.equal(res.status,200);
  for(const [id,n] of [['bw5-1',3],['bw5-bwp003',3],['bw5-bwp030',1],['bwp-bwp005',2],['bwp-bwp100',1]]) assert.equal(res.body.save.collection[id],n,`${id} keeps its count`);

  // Dark Explorers sells its own spares and leaves the promos alone.
  res=await request('/api/cards/sell-duplicates','POST',{setId:'bw5'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2,'two spare Dark Explorers copies');
  assert.equal(qty('bw5-1'),1);assert.equal(qty('bw5-bwp003'),3,'a promo is not sold with Dark Explorers');
  // BW Black Star Promos sells the promos' spares, whichever file holds them.
  res=await request('/api/cards/sell-duplicates','POST',{setId:'bwp'});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.copies,2+1,'spares: bwp003 x2 (bw5 file) and bwp005 x1 (its own file)');
  assert.equal(qty('bw5-bwp003'),1);assert.equal(qty('bwp-bwp005'),1);assert.equal(qty('bwp-bwp100'),1);assert.equal(qty('bw5-1'),1);
  assert.equal((await request('/api/cards/sell-duplicates','POST',{setId:'bwp'})).status,400,'nothing left to sell');
  // Selling a promo by its box id still works, and so does one from the set's own file.
  res=await request('/api/cards/sell','POST',{cardId:'bw5-bwp003'});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty('bw5-bwp003'),undefined);
  res=await request('/api/cards/sell','POST',{cardId:'bwp-bwp100'});
  assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(qty('bwp-bwp100'),undefined);
  // And a Mega Evolution set's promos are still sold with the ME promo set, not with this one (LIKE patterns do not cross).
  give('me5-mep055',3);
  res=await request('/api/cards/sell-duplicates','POST',{setId:'bwp'});
  assert.equal(res.status,400);assert.equal(qty('me5-mep055'),3);
}

// ---- The real set, once it is playable --------------------------------------------------------------------
if(real){
  const files=Object.fromEntries(dataSetsOf(bwp).map(s=>[s.id,read(s.dataFile??`data/${s.id}.json`)]));
  const promos=homeCards(bwp,Object.values(files));
  assert.equal(promos.length,bwp.totalCount,'totalCount is every BW black star promo in the Black & White files');
  assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
  for(const c of promos){
    assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
    assert.match(c.printedNumber,/^BW \d{3}[a-z]?$/,`${c.id} prints its BW number`);
    assert.ok(existsSync(new URL(c.image,root)),`${c.id} has its scan`);
  }
  const order=promos.map(c=>Number(/^bwp(\d+)/.exec(c.number)[1]));
  assert.deepEqual(order,[...order].sort((a,b)=>a-b),'listed in promo-number order');
  for(const id of bwp.heroIds) assert.ok(promos.some(c=>c.id===id),`${id} is a promo`);
  for(const [setId,list] of Object.entries(files)){
    if(setId==='bwp') continue;
    const set=getSet(setId);
    const dex=homeCards(set,[list]);
    assert.ok(dex.every(c=>!isBwpCardId(c.id)),`${setId}: no BW promo in its dex`);
    assert.equal(dex.length,set.totalCount,`${setId}: totalCount is its own ${dex.length} cards`);
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
    for(const offer of promoOffers(list)) for(const id of offer.promos) if(isBwpCardId(id)) assert.ok(files[setId]?.some(c=>c.id===id)||setId==='bwp',`${setId}/${offer.id}: ${id} is in data/${setId}.json`);
  }
}

console.log(`BWP checks passed (${real?'real data':'fixture'}): ids, home table, homeCards, counting${real?', totals':', Worker sales'}.`);
