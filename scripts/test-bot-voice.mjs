import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { llmReady, replyLine, voiceLines, statFacts } from '../worker/llm.js';
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
let generated = null, posted = true, stamps = 0;
const answer = vm.runInNewContext(source.slice(start, end) + '\nanswerHuman', {
  llmReady: () => true, MAX_HUMAN_CALLS_PER_TICK: 3, HUMAN_REPLY_GAP_MS: 0,
  HUMAN_REPLY_WINDOW_MS: 60000, HUMAN_REPLY_CHANCE: 1, ROSTER: [],
  claimHumanCall: () => true, replyLine: async () => generated,
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
