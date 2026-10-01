// Nintendo Black Star Promos (NP001-NP040, 2003-2007): a promo set whose cards sit in the EX sets' and POP Series' files (ids like
// "ex1-np012", "pop2-np003", so saves and product lists keep working) plus its own file (data/np.json: "np-np001"), but are listed,
// counted and sold under "np", never under the set whose box carries them. Modelled on scripts/test-dpp.mjs.
//
// Until the set exists the first two parts run on a fixture; the third runs on the real data once NP_PROMOS is playable.
// Run: node scripts/test-np.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {ALL_SETS,PLAYABLE_SETS,SET_BY_ID,NP_PROMOS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers} from '../js/catalog.js';
import {ripPack} from '../js/engine.js';
import {PROMO_HOMES,PROMO_HOME_LIKE,homeSetId,inHomeSet,isMepCardId,isXypCardId,isBwpCardId,isDppCardId,isHspCardId,isNpCardId,promoHomeOf} from '../js/card-home.js';
import {ownedPerSet} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rules --------------------------------------------------------------------------------
for(const id of ['ex1-np012','ex2-np013','ex16-np040','pop1-np001','pop5-np030','ex10-np020'])
  assert.ok(isNpCardId(id)&&homeSetId(id)==='np'&&!isDppCardId(id)&&!isHspCardId(id)&&!isBwpCardId(id)&&!isXypCardId(id)&&!isMepCardId(id),`${id} is a Nintendo black star promo`);
for(const id of ['ex1-1','ex10-A','ex10-EXCL','ex16-108','pop1-3','pop5-17','np-np001x','np-np','ex1-np','ex1-npx1','extk1a-np01','dp1-np01','dp1-dpp01','hgss1-np01','sm1-np01','swsh1-np012','pop6-np001','pop9-np001','np','dpp-dpp01','ex1-dpp01','energy-fire-dp','xy5-xyp003','bw5-bwp003'])
  assert.ok(!isNpCardId(id),`${id} is not filed in another set's data under np`);
assert.equal(homeSetId('np-np001'),'np','the promos in the set own file count through their prefix');
assert.equal(homeSetId('ex1-1'),'ex1');assert.equal(homeSetId('ex10-A'),'ex10');assert.equal(homeSetId('pop3-4'),'pop3');assert.equal(homeSetId('extk1a-4'),'extk1a');
assert.equal(homeSetId('dp1-dpp01'),'dpp','the DP rule still holds');assert.equal(homeSetId('hgss2-hsp10'),'hsp','the HGSS rule still holds');
assert.equal(homeSetId('bw5-bwp003'),'bwp','the BW rule still holds');assert.equal(homeSetId('xy5-xyp003'),'xyp','the XY rule still holds');assert.equal(homeSetId('me5-mep055'),'mep','the ME rule still holds');
assert.ok(inHomeSet('ex1-np012','np')&&!inHomeSet('ex1-np012','ex1')&&inHomeSet('pop2-np003','np')&&!inHomeSet('pop2-np003','pop2')&&inHomeSet('ex1-1','ex1'));
assert.equal(promoHomeOf('ex12-np027'),'np');assert.equal(promoHomeOf('pl2-dpp42'),'dpp');assert.equal(promoHomeOf('sv1-1'),'');
assert.ok(['np','dpp','hsp','bwp','mep','xyp'].every(k=>k in PROMO_HOMES));
for(const like of ['ex%-np%','pop%-np%','dp%-dpp%','hgss%-hsp%','bw%-bwp%','me%-mep%']) assert.ok(PROMO_HOME_LIKE.includes(like),`${like} is in PROMO_HOME_LIKE`);

// ---- The sets -------------------------------------------------------------------------------------
const CONFIGS=[
  {set:NP_PROMOS,id:'np',prefix:'NP ',tag:'np',era:'EX',homes:['ex1','ex2','ex16','pop1','pop5'],viewHas:['ex1','ex2','ex3','ex4','ex5','ex6','ex7','ex8','ex9','ex10','ex11','ex12','ex13','ex14','ex15','ex16','pop1','pop2','pop3','pop4','pop5'],
   home:'ex2',homeB:'pop1',nums:{a:'013',b:'001',c:'005',d:'040'},viewNotOther:['dp1','pl1','bw1','hgss1']},
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
assert.ok(!NP_PROMOS.viewOf.some(v=>/^dp\d|^pl|^hgss|^col|^bw|^xy/.test(v)),'np reads only EX-era files');

// Cards come out of the lists loaded for dataSetsOf(set): a promo set keeps only its own, a main set none of them.
const card=(id,number,extra={})=>({id,name:'x',number,rarity:'Common',...extra});
{
  const exLists=[
    [card('ex1-1','1'),card('ex1-np012','np012',{rarity:'Promo',promo:true}),card('ex1-np013','np013',{rarity:'Promo',promo:true}),card('ex1-104','104',{rarity:'Energy'})],
    [card('pop2-np003','np003',{rarity:'Promo',promo:true}),card('pop2-1','1',{rarity:'Rare'})],
    [card('np-np001','np001',{rarity:'Promo',promo:true}),card('np-np040','np040',{rarity:'Promo',promo:true})],
    [card('energy-fire-dp','—')],
  ];
  const own=homeCards(NP_PROMOS,exLists);
  assert.deepEqual(own.map(c=>c.id),['np-np001','pop2-np003','ex1-np012','ex1-np013','np-np040'],'promo-number order, Energy and set cards left out');
  assert.deepEqual(homeCards({id:'ex1'},[exLists[0]]).map(c=>c.id),['ex1-1','ex1-104'],'a main set keeps its own cards (its own Energy too), black star promos go');
  assert.deepEqual(homeCards({id:'pop2'},[exLists[1]]).map(c=>c.id),['pop2-1']);
  assert.deepEqual(homeCards({id:'dpp'},[[card('dp1-dpp03','dpp03'),card('ex1-np012','np012')]]).map(c=>c.id),['dp1-dpp03'],'the DP promo set ignores EX promos');
  assert.deepEqual(homeCards({id:'np'},[[card('dp1-dpp03','dpp03'),card('ex1-np012','np012'),card('ex1-1','1')]]).map(c=>c.id),['ex1-np012'],'the NP promo set keeps only NP promos');
  assert.deepEqual(homeCards({id:'sm5'},[[card('sm5-smp101','smp101'),card('sm5-1','1')]]).map(c=>c.id),['sm5-smp101','sm5-1'],'older eras are untouched');
}

// ---- Fixture: sets of each promo home and the promo set, played through the Worker ---------------------------------
for(const cfg of CONFIGS){
  const promoSetDef=cfg.set;
  const real=PLAYABLE_SETS.includes(promoSetDef);
  if(real) continue;
  const base={edition:cfg.era,era:cfg.era,released:'June 18, 2003',live:true,packSize:9,cost:4,cardBack:'assets/cards/shared/card-back.webp',blurb:'x',oddsLine:'x',lede:'x',slots:[],heroIds:[],wrappers:[]};
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
  give('me5-mep055',3);give('bw5-bwp003',3);give('pl2-dpp42',3);
  res=await request('/api/cards/sell-duplicates','POST',{setId:t});
  assert.equal(res.status,400);assert.equal(qty('me5-mep055'),3);assert.equal(qty('bw5-bwp003'),3);
  assert.equal(qty('pl2-dpp42'),3,'DP promos do not cross');
}

// ---- The real sets, once they are playable ------------------------------------------------------------------
for(const cfg of CONFIGS){
  const s=cfg.set;
  if(!PLAYABLE_SETS.includes(s)) continue;
  const t=cfg.tag;
  const files=Object.fromEntries(dataSetsOf(s).map(x=>[x.id,read(x.dataFile??`data/${x.id}.json`)]));
  const promos=homeCards(s,Object.values(files));
  assert.equal(promos.length,s.totalCount,`${t}: totalCount is every black star promo in the files`);
  assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
  const printed=promos.map(c=>c.printedNumber);
  assert.equal(new Set(printed).size,printed.length,`${t}: no promo number is built twice (${printed.filter((n,i)=>printed.indexOf(n)!==i).join(', ')})`);
  for(const c of promos){
    assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
    assert.match(c.printedNumber,new RegExp(`^${cfg.prefix}\\d{2,3}[a-z]?$`),`${c.id} prints its number`);
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

// ---- np's own file, POP Series 1-5 and the four EX Trainer Kit half decks (e5) ---------------------------------------
{
  const sealed=read('data/sealed.json'),prod=read('data/products.json'),boxes=read('data/box-contents.json');
  const np=read('data/np.json');
  // data/np.json: the 24 promos no EX set's product claims; the six with no TCGplayer price anywhere are not built.
  assert.equal(np.length,24,'np.json holds 24 promos');
  const nums=np.map(c=>Number(c.number.slice(2)));
  assert.deepEqual(nums,[1,2,3,4,5,8,9,10,11,14,15,16,17,18,19,21,22,24,25,26,29,30,35,40],'the home-only promos');
  for(const n of [6,7,23,27,28,36]) assert.ok(!nums.includes(n),`NP${n} has no price anywhere and is not built`);
  const holo=new Set([1,2,5,16,17,18,19,29,30,35,40]),rev=new Set([3,8,10]);
  for(const c of np){
    const n=Number(c.number.slice(2));
    assert.equal(c.id,`np-${c.number}`);assert.match(c.number,/^np\d{3}$/);assert.equal(c.printedNumber,`NP ${String(n).padStart(3,'0')}`);
    assert.equal(c.era,'ex');assert.ok(c.market>0,`${c.id}: priced`);
    assert.equal(c.foilAs==='Rare Holo',holo.has(n),`${c.id}: cosmos holo only on the listed promos`);
    assert.equal(!!c.reverse,rev.has(n),`${c.id}: reverse holo only on the e-League prizes`);
  }
  const events=prod.np;
  assert.equal(events.length,24);
  for(const e of events){
    assert.equal(e.kind,'event');assert.equal(e.packs,0);assert.equal(e.promos.length,1);assert.ok(np.some(c=>c.id===e.promos[0]),`${e.id}: its card is built`);assert.ok(e.price>0);
    if(e.priceDerived) assert.ok(e.priceSource,`${e.id}: a hand price names its source`);
  }
  assert.equal(events.find(e=>e.id==='event-np005').price,1500);
  assert.equal(NP_PROMOS.released,'October 1, 2003');
  // POP Series 1-5: two cards a pack, the Rare on its own position, no foil, no Energy.
  for(const [n,at,cost] of [[1,2,100.08],[2,2,149.69],[3,1,169.68],[4,1,171.94],[5,1,2290]]){
    const id=`pop${n}`,set=getSet(id),cards=read(`data/${id}.json`);
    assert.ok(PLAYABLE_SETS.includes(set)&&set.era==='EX'&&set.edition==='EX'&&set.packSize===2&&!set.promoSet,`${id} is a playable EX set`);
    assert.equal(cards.length,17);assert.equal(set.totalCount,17);assert.equal(set.printedTotal,17);
    assert.equal(cards.filter(c=>c.rarity==='Rare').length,n<=3?7:6,`${id}: Rares`);
    assert.equal(cards.filter(c=>c.rarity==='Uncommon').length,5);
    assert.ok(cards.every(c=>c.image&&c.imageSmall&&existsSync(new URL(c.image,root))&&existsSync(new URL(c.imageSmall,root))),`${id}: scans`);
    const unpriced=cards.filter(c=>!(c.market>0)).map(c=>c.id);
    assert.deepEqual(unpriced,n===5?['pop5-16','pop5-17']:[],`${id}: only the two POP 5 Gold Stars have no price anywhere`);
    assert.equal(set.cost,cost);assert.equal(sealed[id].boosterPack,cost);
    assert.equal(set.wrappers.length,1);assert.ok(existsSync(new URL(set.wrappers[0].art,root))&&existsSync(new URL(set.wrappers[0].artFallback,root)),`${id}: wrapper art`);
    assert.ok(cards.some(c=>c.id===set.wrappers[0].cardId),`${id}: wrapper card`);
    for(const hero of set.heroIds) assert.ok(cards.some(c=>c.id===hero),`${id}: hero ${hero}`);
    assert.ok(!set.energyPrint);
    const N=4000;let rares=0;const atRare=[0,0];
    for(let i=0;i<N;i++){
      const pack=ripPack(set,cards);
      assert.equal(pack.length,2,`${id}: two cards a pack`);assert.equal(new Set(pack.map(c=>c.id)).size,2);
      assert.ok(pack.every(c=>c.id.startsWith(id+'-')&&!c.promo),`${id}: only its own cards`);
      pack.forEach((c,k)=>{if(c.rarity==='Rare'){rares++;atRare[k]++;}});
    }
    assert.ok(Math.abs(rares/N-0.1)<0.03,`${id}: rare rate ${rares/N}`);
    assert.equal(atRare[at===2?0:1],0,`${id}: the Rare is never in card ${at===2?1:2}`);assert.ok(atRare[at-1]>0);
  }
  // The four half decks and the two kit products.
  for(const [id,total,holoNo,energyKind,productId] of [['extk1a',10,4,'Fire','ex-trainer-kit-latias-latios'],['extk1b',10,2,'Lightning','ex-trainer-kit-latias-latios'],['extk2a',12,6,'Lightning','ex-trainer-kit-2-plusle-minun'],['extk2b',12,6,'Fire','ex-trainer-kit-2-plusle-minun']]){
    const set=getSet(id),cards=read(`data/${id}.json`);
    assert.ok(PLAYABLE_SETS.includes(set)&&set.promoSet&&set.packSize===0&&set.wrappers.length===0&&set.era==='EX',`${id} sells no boosters`);
    assert.equal(cards.length,total,`${id}: ${total} cards`);assert.equal(set.totalCount,total);
    assert.ok(cards.every(c=>c.era==='ex'&&c.rarity==='Promo'&&c.market>0&&existsSync(new URL(c.image,root))&&existsSync(new URL(c.imageSmall,root))),`${id}: ex kit cards with scans and prices`);
    const holos=cards.filter(c=>c.holo);
    assert.deepEqual(holos.map(c=>c.number),[String(holoNo)],`${id}: one holo`);assert.ok(holos[0].promo&&holos[0].foilAs==='Rare Holo');
    for(const hero of set.heroIds) assert.ok(cards.some(c=>c.id===hero));
    assert.ok(cards.some(c=>c.name===`${energyKind} Energy`),`${id}: its Energy`);
    const kit=promoOffers(prod[id]);
    assert.equal(kit.length,1);assert.equal(kit[0].packs,0);assert.deepEqual(kit[0].promos,[`${id}-${holoNo}`]);assert.equal(kit[0].id,productId);
    assert.ok(prod[id][0].price>0&&prod[id][0].priceSource,`${id}: a sourced price`);
    const row=boxes[`${id}/${productId}`];
    assert.ok(row,`${id}: kit contents row`);
    const other=id.endsWith('a')?id.slice(0,-1)+'b':id.slice(0,-1)+'a';
    assert.equal(row.cards.length,total+read(`data/${other}.json`).length-1,`${id}: both halves beside its own promo`);
    assert.ok(row.cards.every(([c,n])=>n===1&&c!==`${id}-${holoNo}`&&new RegExp(`^${id.slice(0,-1)}[ab]-\\d+$`).test(c)),`${id}: only kit cards, one each`);
  }
  assert.equal(prod.extk1a[0].price,prod.extk1b[0].price);assert.equal(prod.extk2a[0].price,prod.extk2b[0].price,'one kit product on both half decks');
}

const realCount=CONFIGS.filter(c=>PLAYABLE_SETS.includes(c.set)).length;
console.log(`NP checks passed (${realCount?'real data':'fixture'}): ids, home table, homeCards, counting${realCount?', totals':', Worker sales'}.`);
