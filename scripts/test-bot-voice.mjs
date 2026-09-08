import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { IDENTITIES, affinity } from '../worker/personalities.js';
import { safeIdleLine, llmReady, replyLine, voiceLines, statFacts } from '../worker/llm.js';
const persona = { name: 'Test', handle: 'tester' };
assert.equal(llmReady({}), false);
assert.equal(await replyLine({}, persona, 'visitor', 'hi'), null);
assert.deepEqual(statFacts({ packsOpened: 2, coins: 100, collection: { a: 11 } }), [null, 100, 11]);
let requests = [];
let responses = [];
globalThis.fetch = async (_, options) => {
  requests.push(JSON.parse(options.body));
  const [status, content] = responses.shift();
  return new Response(JSON.stringify(status === 200 ? { choices: [{ message: { content } }] } : { error: 'test unavailable' }), { status });
};
const env = { NVIDIA_API_KEY: 'test-only' };
responses = [[200, 'Test: another pack for the binder']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), 'another pack for the binder');
responses = [[503, ''], [200, 'still chasing umbreon']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), 'still chasing umbreon');
assert.notEqual(requests.at(-1).model, requests.at(-2).model);
assert.equal(requests.at(-2).model, 'nvidia/nemotron-3-super-120b-a12b');
assert.deepEqual(requests.at(-2).chat_template_kwargs, {thinking:false,enable_thinking:false});
responses = [[200, ''], [200, 'which set are you opening?']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), 'which set are you opening?');
assert.notEqual(requests.at(-1).model, requests.at(-2).model);
responses = [[410, ''], [200, 'which artwork are you chasing?']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), 'which artwork are you chasing?');
assert.notEqual(requests.at(-1).model, requests.at(-2).model);
responses = [[401, '']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), null);
responses = [[200, 'opened 99999 packs']];
assert.equal(await replyLine(env, persona, 'visitor', 'hi'), null);
responses = [[200, 'one more pack\none more pack\nstill chasing umbreon']];
assert.deepEqual(await voiceLines(env, persona), ['one more pack', 'still chasing umbreon']);
responses = [[200, 'still chasing umbreon']];
await replyLine(env, persona, 'visitor', 'hi', { facts: [null, 100, 11] });
assert.match(requests.at(-1).messages[0].content, /coins: 100/);
assert.doesNotMatch(requests.at(-1).messages[0].content, /packs opened: 100/);
// Exercise the actual reply orchestration without posting to the live lounge.
const source = readFileSync(new URL('../worker/bots.js', import.meta.url), 'utf8');
const start = source.indexOf('async function answerHuman(');
const end = source.indexOf('\nasync function react(', start);
let generated = null, posted = true, stamps = 0, replyOptions;
const answer = vm.runInNewContext(source.slice(start, end) + '\nanswerHuman', {
  llmReady: () => true, MAX_HUMAN_CALLS_PER_TICK: 3, HUMAN_REPLY_GAP_MS: 0,
  HUMAN_REPLY_WINDOW_MS: 60000, HUMAN_REPLY_CHANCE: 1, ROSTER: [{name:'Ada',handle:'adawrites'}, {name:'Riley',handle:'rileyxo'}],
  claimHumanCall: () => true, replyLine: async (...args) => { replyOptions = args.at(-1); return generated; },
  readRecent: () => [], factsFor: () => [], stale: () => false,
  say: async () => posted, Date, Math, Set,
});
const dbEnv = { DB: { prepare: () => ({ bind: () => ({ run: async () => { stamps++; } }) }) } };
const now = Date.now();
const chat = [{ id: 7, at: now, body: 'hi', user: { handle: 'visitor' } }];
const ctx = { humanCalls: 0, deadline: now + 60000, answered: new Set(), said: new Set() };
const row = {};
assert.equal(await answer(dbEnv, null, row, persona, '', chat, now, ctx), false);
assert.equal(stamps, 0);
generated = 'good luck with the next pack'; posted = false;
assert.equal(await answer(dbEnv, null, row, persona, '', chat, now, ctx), false);
assert.equal(stamps, 0);
posted = true;
assert.equal(await answer(dbEnv, null, row, persona, '', chat, now, ctx), true);
assert.equal(stamps, 1);
assert.equal(await answer(dbEnv, null, {}, persona, '', chat, now, ctx), false);
console.log('Bot checks passed: missing key, cleanup, fallback, bad key, invented counts, deduplication, stat labels, failed-post retry, shared acknowledgement.');

responses = [[200, 'noted']];
assert.equal(await replyLine(env, persona, 'visitor', 'what packs do you like?', {human:true}), null);
responses = [[200, 'dragonite artwork is my favourite. which set are you opening?']];
assert.ok(await replyLine(env, {...persona,...IDENTITIES.adawrites}, 'visitor', 'ada, sorry', {human:true, context:[{speaker:'visitor',body:'which pokemon do you collect?'}]}));
assert.match(requests.at(-1).messages[1].content, /which pokemon do you collect/);
assert.match(requests.at(-1).messages[0].content, /Dragonite/);
assert.equal(Object.keys(IDENTITIES).length,24);
assert.equal(affinity(IDENTITIES.adawrites,{name:'Mega Dragonite ex',types:['Dragon']}),3);
assert.equal(affinity(IDENTITIES.adawrites,{name:'Dratini',types:['Dragon']}),2);
assert.equal(affinity(IDENTITIES.adawrites,{name:'Charizard ex',types:['Fire']}),0);
const question = [{id:10,at:now,body:'Ada, which pokemon do you collect?',user:{handle:'visitor'}}, {id:11,at:now,body:'sorry typo',user:{handle:'visitor'}}];
const fresh = {humanCalls:0,deadline:now+60000,answered:new Set(),said:new Set()};
assert.equal(await answer(dbEnv,null,{}, {name:'Riley',handle:'rileyxo'},'',question,now,fresh),false);
assert.equal(await answer(dbEnv,null,{}, {name:'Ada',handle:'adawrites'},'',question,now,fresh),true);
assert.equal(replyOptions.context.length,2);
assert.match(replyOptions.context[0].body,/which pokemon/);
console.log('Identity, empty-reply rejection, conversation context and named-recipient checks passed.');
// Verify existing profiles are rebuilt from owned cards, with favourites first.
const identityStart = source.indexOf('let identityCatalog;');
const identityEnd = source.indexOf('async function showcaseBest(', identityStart);
const sync = vm.runInNewContext(source.slice(identityStart, identityEnd) + '\nsyncIdentity', {
  BOT_SETS:['test'], Request, Map, Number, JSON, affinity, SHOWCASE_MAX:6, HOUR:3600000,
  sellValue:card=>card.price || 0,
});
let profilePatch;
const identityEnv = {...dbEnv, ASSETS:{fetch:async()=>new Response(JSON.stringify([
  {id:'owned-favourite',name:'Dratini',types:['Dragon'],price:0.1},
  {id:'owned-hit',name:'Charizard ex',types:['Fire'],price:200},
  {id:'unowned',name:'Dragonite',types:['Dragon'],price:100},
]))}};
const identityCall = async (_,opts) => opts.method === 'PATCH'
  ? (profilePatch=opts.body,{status:200})
  : {status:200,body:{save:{collection:{'owned-favourite':1,'owned-hit':1}}}};
await sync(identityEnv,identityCall,{}, {...IDENTITIES.adawrites,avatar:'149',color:'dragon',banner:'aurora:dragon+ocean'},'',{});
assert.equal(profilePatch.showcase[0].id,'owned-favourite');
assert.equal(profilePatch.showcase.length,1);
assert.deepEqual(Array.from(profilePatch.binderPages),[0]);
assert.match(profilePatch.bio,/dragonite/);
console.log('Existing-profile migration preserves ownership and prioritizes favourite-family commons.');

responses = [[200, "traded a duplicate for a missing reverse holo"]];
assert.equal(await replyLine(env,persona,"visitor","hi"),null);
console.log("Impossible trade claim rejected.");

assert.equal(safeIdleLine("another sylveon vmax alt art and zero umbreons"),false);
assert.equal(safeIdleLine("i said i opened forty packs"),false);
assert.equal(safeIdleLine("which eevee evolution has your favourite artwork?"),true);
responses=[[200,'every time']];
assert.equal(await replyLine(env,persona,'Riley','which card art do you prefer?'),null);
console.log('Stock reaction and invented idle-pull checks passed.');
// Bot conversations may continue for two replies, without fallback catchphrases.
let threadDepth=0, generatedReply='the umbreon silhouette works better for me. what do you like about sylveon?', sentDepth;
const reactStart=source.indexOf('async function react(');
const reactEnd=source.indexOf('\nasync function answerDm(',reactStart);
const react=vm.runInNewContext(source.slice(reactStart,reactEnd)+'\nreact',{
  ROSTER:[{name:'Riley',handle:'rileyxo'}],REACT_WINDOW_MS:60000,REACT_GAP_MS:0,REACT_CHANCE:1,
  claimCall:()=>true,replyLine:async()=>generatedReply,readRecent:()=>[],factsFor:()=>[],
  say:async(...args)=>{sentDepth=args.at(-1);return true;},Date,Math,Set,
});
const reactEnv={DB:{prepare:()=>({bind:()=>({first:async()=>({last_chat_kind:'react',reply_depth:threadDepth}),run:async()=>({})})})}};
const room=[{id:55,at:now,body:'which eevee artwork is your favourite?',user:{name:'Riley',handle:'rileyxo'}}];
const conversationCtx={said:new Set()};
assert.equal(await react(reactEnv,null,{},persona,'',room,now,conversationCtx),true);
assert.equal(sentDepth,1);
assert.equal(await react(reactEnv,null,{},persona,'',room,now,conversationCtx),false);
threadDepth=2;
assert.equal(await react(reactEnv,null,{},persona,'',room,now,{said:new Set()}),false);
threadDepth=0;generatedReply=null;
assert.equal(await react(reactEnv,null,{},persona,'',room,now,{said:new Set()}),false);
console.log('Bot conversation context, duplicate prevention, depth limit and failure silence passed.');
