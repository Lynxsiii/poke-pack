// DP and HGSS Black Star Promos: two promo sets whose cards sit in the Diamond & Pearl / Platinum / HeartGold & SoulSilver
// sets' files (ids like "dp1-dpp01", "pl2-dpp42", "hgss2-hsp10", "col1-hsp24", so saves and product lists keep working) plus
// their own files (data/dpp.json, data/hsp.json: "dpp-dpp05", "hsp-hsp01"), but are listed, counted and sold under "dpp" /
// "hsp", never under the set whose box carries them. Modelled on scripts/test-bwp.mjs.
//
// Until the sets exist the first two parts run on a fixture; the third runs on the real data once DPP_PROMOS / HSP_PROMOS
// are playable. Run: node scripts/test-dpp.mjs   (Node 22+)
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {ripPack} from '../js/engine.js';
import {ALL_SETS,PLAYABLE_SETS,SET_BY_ID,BASIC_ENERGY,DPP_PROMOS,HSP_PROMOS,dataSetsOf,getSet,hasCardData,homeCards,promoOffers} from '../js/catalog.js';
import {PROMO_HOMES,PROMO_HOME_LIKE,homeSetId,inHomeSet,isMepCardId,isXypCardId,isBwpCardId,isDppCardId,isHspCardId,promoHomeOf} from '../js/card-home.js';
import {ownedPerSet} from '../js/titles.js';
import {achievementContext} from '../js/achievements.js';
import {createTestDb,requester,seedPlayer} from './lib/d1-test-db.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

// ---- The id rules --------------------------------------------------------------------------------
for(const id of ['dp1-dpp01','dp7-dpp34','pl1-dpp35','pl2-dpp42','pl4-dpp56'])
  assert.ok(isDppCardId(id)&&homeSetId(id)==='dpp'&&!isHspCardId(id)&&!isBwpCardId(id)&&!isXypCardId(id)&&!isMepCardId(id),`${id} is a DP black star promo`);
for(const id of ['hgss1-hsp01','hgss2-hsp10','hgss3-hsp18','hgss4-hsp25','col1-hsp24'])
  assert.ok(isHspCardId(id)&&homeSetId(id)==='hsp'&&!isDppCardId(id)&&!isBwpCardId(id),`${id} is an HGSS black star promo`);
for(const id of ['dp1-1','dp1-123','pl2-RT1','dp7-SH1','hgss1-ONE','hgss2-90','col1-SL1','dpp-dpp001x','hsp-hsp01x','dp1-dpp','dp1-dppx1','hgss1-dpp01','dp1-hsp01','pl1-hsp01','bw5-dpp01','dpp','energy-fire-dp','dptk3a-1','hgsstk4a-1','pop6-1','xy5-xyp003','bw5-bwp003'])
  assert.ok(!isDppCardId(id)&&!isHspCardId(id),`${id} is not filed in another set's data under dpp or hsp`);
assert.equal(homeSetId('dpp-dpp01'),'dpp','the promos in the set own file count through their prefix');
assert.equal(homeSetId('hsp-hsp01'),'hsp');
assert.equal(homeSetId('dp1-1'),'dp1');assert.equal(homeSetId('hgss1-ONE'),'hgss1');assert.equal(homeSetId('col1-SL1'),'col1');assert.equal(homeSetId('dptk3a-1'),'dptk3a');assert.equal(homeSetId('pl4-AR1'),'pl4');
assert.equal(homeSetId('bw5-bwp003'),'bwp','the BW rule still holds');
assert.equal(homeSetId('xy5-xyp003'),'xyp','the XY rule still holds');
assert.equal(homeSetId('me5-mep055'),'mep','the ME rule still holds');
assert.ok(inHomeSet('dp1-dpp01','dpp')&&!inHomeSet('dp1-dpp01','dp1')&&inHomeSet('col1-hsp24','hsp')&&!inHomeSet('col1-hsp24','col1')&&inHomeSet('col1-1','col1'));
assert.equal(promoHomeOf('pl2-dpp42'),'dpp');assert.equal(promoHomeOf('hgss2-hsp10'),'hsp');assert.equal(promoHomeOf('bw5-bwp003'),'bwp');assert.equal(promoHomeOf('sv1-1'),'');
assert.ok(['dpp','hsp','bwp','mep','xyp'].every(k=>k in PROMO_HOMES));
for(const like of ['dp%-dpp%','pl%-dpp%','hgss%-hsp%','col1-hsp%','bw%-bwp%','me%-mep%']) assert.ok(PROMO_HOME_LIKE.includes(like),`${like} is in PROMO_HOME_LIKE`);

// ---- The sets -------------------------------------------------------------------------------------
const CONFIGS=[
  {set:DPP_PROMOS,id:'dpp',prefix:'DP ',tag:'dpp',era:'Diamond & Pearl',homes:['dp1','dp7','pl1','pl2','pl4'],viewHas:['dp1','dp2','dp3','dp4','dp5','dp6','dp7','pl1','pl2','pl3','pl4'],
   home:'pl2',homeB:'dp1',nums:{a:'03',b:'42',c:'05',d:'56'},viewNotOther:['hgss1','col1','bw1']},
  {set:HSP_PROMOS,id:'hsp',prefix:'HGSS ',tag:'hsp',era:'HeartGold & SoulSilver',homes:['hgss1','hgss2','hgss3','hgss4','col1'],viewHas:['hgss1','hgss2','hgss3','hgss4','col1'],
   home:'hgss2',homeB:'col1',nums:{a:'10',b:'24',c:'01',d:'18'},viewNotOther:['dp1','pl1','bw1']},
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
assert.ok(!DPP_PROMOS.viewOf.some(v=>/^hgss|^col/.test(v))&&!HSP_PROMOS.viewOf.some(v=>/^dp\d|^pl/.test(v)),'the two promo sets read different files');

// Cards come out of the lists loaded for dataSetsOf(set): a promo set keeps only its own, a main set none of them.
const card=(id,number,extra={})=>({id,name:'x',number,rarity:'Common',...extra});
{
  const dpLists=[
    [card('dp1-1','1'),card('dp1-dpp20','dpp20',{rarity:'Promo',promo:true}),card('dp1-dpp03','dpp03',{rarity:'Promo',promo:true}),card('dp1-60a','60a',{promo:true,rarity:'Rare Holo'})],
    [card('pl2-dpp42','dpp42',{rarity:'Promo',promo:true}),card('pl2-2','2')],
    [card('dpp-dpp05','dpp05',{rarity:'Promo',promo:true}),card('dpp-dpp56','dpp56',{rarity:'Promo',promo:true})],
    [card('energy-fire-dp','—')],
  ];
  const own=homeCards(DPP_PROMOS,dpLists);
  assert.deepEqual(own.map(c=>c.id),['dp1-dpp03','dpp-dpp05','dp1-dpp20','pl2-dpp42','dpp-dpp56'],'promo-number order, Energy left out');
  assert.deepEqual(homeCards({id:'dp1'},[dpLists[0]]).map(c=>c.id),['dp1-1','dp1-60a'],'a main set keeps its own cards, box-only reprints stay, black star promos go');
  assert.deepEqual(homeCards({id:'pl2'},[dpLists[1]]).map(c=>c.id),['pl2-2']);
  assert.deepEqual(homeCards({id:'bwp'},[[card('bw5-bwp003','bwp003'),card('dp1-dpp03','dpp03')]]).map(c=>c.id),['bw5-bwp003'],'the BW promo set ignores DP promos');
  assert.deepEqual(homeCards({id:'hsp'},[[card('hgss2-hsp10','hsp10'),card('dp1-dpp03','dpp03'),card('hgss2-1','1')]]).map(c=>c.id),['hgss2-hsp10'],'the HGSS promo set keeps only HGSS promos');
  assert.deepEqual(homeCards({id:'sm5'},[[card('sm5-smp101','smp101'),card('sm5-1','1')]]).map(c=>c.id),['sm5-smp101','sm5-1'],'older eras are untouched');
  const hgLists=[
    [card('hgss2-hsp10','hsp10',{rarity:'Promo',promo:true}),card('hgss2-1','1')],
    [card('col1-hsp24','hsp24',{rarity:'Promo',promo:true}),card('col1-SL1','SL1',{rarity:'Rare Shiny Legendary'})],
    [card('hsp-hsp01','hsp01',{rarity:'Promo',promo:true}),card('hsp-hsp18','hsp18',{rarity:'Promo',promo:true})],
  ];
  assert.deepEqual(homeCards(HSP_PROMOS,hgLists).map(c=>c.id),['hsp-hsp01','hgss2-hsp10','hsp-hsp18','col1-hsp24']);
  assert.deepEqual(homeCards({id:'col1'},[hgLists[1]]).map(c=>c.id),['col1-SL1']);
}

// ---- Fixture: sets of each promo home and the promo set, played through the Worker ---------------------------------
for(const cfg of CONFIGS){
  const promoSetDef=cfg.set;
  const real=PLAYABLE_SETS.includes(promoSetDef);
  if(real) continue;
  const base={edition:cfg.era,era:cfg.era,released:'May 23, 2007',live:true,packSize:10,cost:4,cardBack:'assets/cards/shared/card-back.webp',blurb:'x',oddsLine:'x',lede:'x',slots:[],heroIds:[],wrappers:[]};
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
  give('me5-mep055',3);give('bw5-bwp003',3);give(t==='dpp'?'hgss2-hsp10':'pl2-dpp42',3);
  res=await request('/api/cards/sell-duplicates','POST',{setId:t});
  assert.equal(res.status,400);assert.equal(qty('me5-mep055'),3);assert.equal(qty('bw5-bwp003'),3);
  assert.equal(qty(t==='dpp'?'hgss2-hsp10':'pl2-dpp42'),3,'DP and HGSS promos do not cross');
}

// ---- The real sets, once they are playable ------------------------------------------------------------------
for(const cfg of CONFIGS){
  const s=cfg.set;
  if(!PLAYABLE_SETS.includes(s)) continue;
  const t=cfg.tag;
  const files=Object.fromEntries(dataSetsOf(s).map(x=>[x.id,read(x.dataFile??`data/${x.id}.json`)]));
  const promos=homeCards(s,Object.values(files));
  // totalCount counts the home sets' promos too: it can be checked exactly only when every set file is there (a branch of its own has
  // just the promo set's file), and is an upper bound until then.
  const complete=s.viewOf.every(v=>files[v]);
  if(complete) assert.equal(promos.length,s.totalCount,`${t}: totalCount is every black star promo in the files`);
  else assert.ok(promos.length<=s.totalCount,`${t}: totalCount (${s.totalCount}) is at least the ${promos.length} promos found`);
  assert.equal(new Set(promos.map(c=>c.id)).size,promos.length,'ids are unique');
  const nums=promos.map(c=>c.printedNumber);
  assert.equal(new Set(nums).size,nums.length,`${t}: no promo number is built twice (${nums.filter((n,i)=>nums.indexOf(n)!==i).join(', ')})`);
  for(const c of promos){
    assert.ok(c.promo&&c.rarity==='Promo',`${c.id} is a promo`);
    assert.match(c.printedNumber,new RegExp(`^${cfg.prefix}\\d{2}[a-z]?$`),`${c.id} prints its number`);
    assert.ok(existsSync(new URL(c.image,root)),`${c.id} has its scan`);
  }
  const order=promos.map(c=>Number(new RegExp(`^${t}(\\d+)`).exec(c.number)[1]));
  assert.deepEqual(order,[...order].sort((x,y)=>x-y),'listed in promo-number order');
  // A hero is a promo of one of the home sets' files; where that set is not built yet (a branch on its own) it only has to be a well-formed id.
  for(const id of s.heroIds){
    const home=id.split('-')[0];
    if(files[home]) assert.ok(promos.some(c=>c.id===id),`${id} is a promo`);
    else assert.ok(s.viewOf.includes(home)&&new RegExp(`^${home}-${t}\\d{2}$`).test(id),`${id} names a promo of ${home}`);
  }
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

// ---- POP Series 6-9 and the four Trainer Kit half decks (d5) --------------------------------------------
{
  const sealed=read('data/sealed.json'),prod=read('data/products.json'),boxes=read('data/box-contents.json');
  const pools=(id)=>read(`data/${id}.json`);
  for(const [id,size,rate] of [['pop6',2,1],['pop7',2,0.1],['pop8',3,0.165],['pop9',3,0.165]]){
    const set=getSet(id),cards=pools(id);
    assert.ok(PLAYABLE_SETS.includes(set)&&set.era==='Diamond & Pearl'&&set.packSize===size,`${id} is playable`);
    assert.equal(cards.length,17);assert.equal(set.totalCount,17);assert.equal(set.printedTotal,17);
    assert.equal(cards.filter(c=>c.rarity==='Rare').length,5,`${id}: five Rares`);
    assert.ok(cards.every(c=>c.image&&c.imageSmall&&existsSync(new URL(c.image,root))&&existsSync(new URL(c.imageSmall,root))&&c.market>0),`${id}: scans and prices`);
    assert.ok(cards.every(c=>!c.promo&&c.rarity!=='Promo'),`${id}: pack cards`);
    assert.equal(set.cost,sealed[id].boosterPack,`${id}: sealed pack matches the cost`);
    assert.equal(set.wrappers.length,1);assert.ok(existsSync(new URL(set.wrappers[0].art,root))&&existsSync(new URL(set.wrappers[0].artFallback,root)),`${id}: wrapper art`);
    assert.ok(cards.some(c=>c.id===set.wrappers[0].cardId),`${id}: wrapper card`);
    for(const hero of set.heroIds) assert.ok(cards.some(c=>c.id===hero),`${id}: hero ${hero}`);
    assert.equal(!!set.energyPrint,size===3,`${id}: Energy print only on the three-card packs`);
    const N=3000,pool=[...cards,...BASIC_ENERGY];let rares=0;
    for(let i=0;i<N;i++){
      const pack=ripPack(set,pool);
      assert.equal(pack.length,size,`${id}: ${size} cards a pack`);assert.equal(new Set(pack.map(c=>c.id)).size,size);
      if(size===3) assert.equal(pack.filter(c=>c.energy&&c.energyPrint==='dp').length,1,`${id}: one DP Energy`);
      assert.ok(pack.every(c=>c.energy||c.id.startsWith(id+'-')),`${id}: only its own cards and Energy`);
      rares+=pack.filter(c=>c.rarity==='Rare').length;
    }
    assert.ok(Math.abs(rares/N-rate)<Math.max(0.04,rate*0.2),`${id}: rare rate ${rares/N} vs ${rate}`);
  }
  assert.ok(Math.abs(read('data/pop6.json').length)===17);
  for(const [id,total,holoNo,energyKind] of [['dptk3a',12,4,'Water'],['dptk3b',11,3,'Fighting'],['hgsstk4a',30,30,'Water'],['hgsstk4b',30,30,'Lightning']]){
    const set=getSet(id),cards=pools(id);
    assert.ok(PLAYABLE_SETS.includes(set)&&set.promoSet&&set.packSize===0&&set.wrappers.length===0,`${id} sells no boosters`);
    assert.equal(cards.length,total,`${id}: ${total} cards`);assert.equal(set.totalCount,total);
    assert.ok(cards.every(c=>c.era==='dp'&&c.rarity==='Promo'&&c.market>0&&existsSync(new URL(c.image,root))),`${id}: dp promos with scans and prices`);
    const holos=cards.filter(c=>c.holo);
    assert.deepEqual(holos.map(c=>c.number),[String(holoNo)],`${id}: one holo`);
    assert.ok(holos[0].promo&&holos[0].foilAs==='Rare Holo');
    for(const hero of set.heroIds) assert.ok(cards.some(c=>c.id===hero));
    assert.ok(cards.some(c=>c.name===`${energyKind} Energy`),`${id}: its Energy`);
    const kit=promoOffers(prod[id]);
    assert.equal(kit.length,1,`${id}: the kit product`);assert.equal(kit[0].packs,0);assert.deepEqual(kit[0].promos,[`${id}-${holoNo}`]);
    assert.ok(prod[id][0].price>0&&prod[id][0].priceSource,`${id}: a sourced price`);
    const row=boxes[`${id}/${kit[0].id}`];
    assert.ok(row,`${id}: kit contents row`);
    const other=id.endsWith('a')?id.slice(0,-1)+'b':id.slice(0,-1)+'a';
    const want=total+read(`data/${other}.json`).length-1;
    assert.equal(row.cards.length,want,`${id}: the kit deals both halves beside its own promo`);
    assert.ok(row.cards.every(([c,n])=>n===1&&c!==`${id}-${holoNo}`&&new RegExp(`^${id.slice(0,-1)}[ab]-\\d+$`).test(c)),`${id}: only kit cards, one each`);
  }
  assert.equal(prod.dptk3a[0].id,prod.dptk3b[0].id);assert.equal(prod.hgsstk4a[0].id,prod.hgsstk4b[0].id,'one kit product on both half decks');
}

const realCount=CONFIGS.filter(c=>PLAYABLE_SETS.includes(c.set)).length;
console.log(`DPP checks passed (${realCount===2?'real data':realCount?'one real, one fixture':'fixture'}): ids, home table, homeCards, counting${realCount===2?', totals':', Worker sales'}.`);
