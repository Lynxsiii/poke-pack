/* The card game between two players (worker/tcg.js): challenges, decks checked
   against what each player owns, a whole match played through the API with the
   Worker as the only referee, hidden information, concede, the turn clock and
   the scheduled maintenance. Runs the real Worker on the D1 stand-in (Node 22+):
   node scripts/test-tcg-pvp.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";
import { TCG_DDL, TCG_TIMING, maintainTcg, owing } from "../worker/tcg.js";
import { createDefs, FREE_ENERGY } from "../js/tcg/cards.js";
import { botAction } from "../js/tcg/bot.js";
import { buildDeck, checkDeck } from "../js/tcg/decks.js";
import { createTestDb, seedPlayer, requester } from "./lib/d1-test-db.mjs";

const results = [];
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    failed++;
    results.push(`FAIL  ${name}\n      ${String(err?.stack || err).split("\n").slice(0, 14).join("\n      ")}`);
  }
}

// Card rules the way the page builds them, for building decks and choosing moves (the bot plays both seats).
const me5 = JSON.parse(readFileSync(new URL("../data/me5.json", import.meta.url), "utf8"));
const byId = new Map(me5.map((c) => [c.id, c]));
for (const e of FREE_ENERGY) byId.set(e.id, { id: e.id, name: `${e.type} Energy`, supertype: "Energy", subtypes: ["Basic"], energy: true });
const rules = JSON.parse(readFileSync(new URL("../data/tcg/rules.json", import.meta.url), "utf8"));
const trainers = JSON.parse(readFileSync(new URL("../data/tcg/trainers.json", import.meta.url), "utf8"));
const legal = JSON.parse(readFileSync(new URL("../data/tcg/legal.json", import.meta.url), "utf8"));
const defs = createDefs((id) => byId.get(id), rules, trainers, legal);

const { db, env } = createTestDb();
const req = requester(worker, env, null);
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

const player = (id) => {
  seedPlayer(db, { id, session: id });
  db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(clock + 400 * 86400000, id);
};
const giveSet = (user) => {
  for (const c of me5) db.prepare("INSERT OR REPLACE INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,2,0)").run(user, c.id);
};
const befriend = async (a, b) => {
  await req("/api/friends", "GET", null, a); // makes the friends table
  for (const [x, y] of [[a, b], [b, a]]) db.prepare("INSERT OR REPLACE INTO friends(from_id,to_id,status,created_at) VALUES(?,?,'accepted',?)").run(x, y, clock);
};
const api = (user, path, method = "GET", body) => req(path, method, body, user);
const ownedOf = (user) => Object.fromEntries(db.prepare("SELECT card_id, qty FROM cards WHERE user_id = ?").all(user).map((r) => [r.card_id, r.qty]));
const deckFor = (user, format = "standard", seed = 1) => {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pool = Object.entries(ownedOf(user)).map(([id, n]) => ({ def: defs(id), owned: n })).filter((p) => p.def);
  const built = buildDeck(pool, format, { rand });
  const deck = { name: `${user} deck`, format, cards: built.cards };
  assert.ok(checkDeck(deck, ownedOf(user), defs).ok, "the test deck is legal");
  return deck;
};
const rowOf = (id) => db.prepare("SELECT * FROM tcg_matches WHERE id = ?").get(id);
const stateOf = (id) => JSON.parse(rowOf(id).state);

for (const id of ["ann", "bob", "cat"]) {
  player(id);
  giveSet(id);
}
await befriend("ann", "bob");

let matchId = "";

await check("the migration file holds the Worker's DDL", async () => {
  const sql = readFileSync(new URL("../worker/migrations/0038_tcg_matches.sql", import.meta.url), "utf8").replace(/\s+/g, " ");
  for (const stmt of TCG_DDL) assert.ok(sql.includes(stmt.replace(/\s+/g, " ")), stmt.slice(0, 60));
});

await check("challenges: friends only, decks checked against what you own", async () => {
  const deck = deckFor("ann");
  let r = await api("ann", "/api/tcg/challenge", "POST", { to: "cat", deck });
  assert.equal(r.status, 403, "cat isn't a friend");
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "nobody", deck });
  assert.equal(r.status, 404);
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "ann", deck });
  assert.equal(r.status, 400);
  const stolen = { ...deck, cards: { ...deck.cards } };
  const someId = Object.keys(stolen.cards).find((id) => !id.startsWith("energy-"));
  stolen.cards[someId] = 3; // more copies than owned (and than the Half deck allows)
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: stolen });
  assert.equal(r.status, 400);
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: { ...deck, cards: { "sv1-001": 1, ...deck.cards } } });
  assert.equal(r.status, 400, "a card ann doesn't own");
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: { ...deck, format: "half" } });
  assert.equal(r.status, 400, "the old Half deck is not a format any more");
  assert.match(r.body.error, /Standard, Expanded or Unlimited/);
  // A card she owns but that rotated out of Standard (Scarlet & Violet, regulation mark G) is refused there.
  db.prepare("INSERT OR REPLACE INTO cards(user_id,card_id,qty,reverse_qty) VALUES(?,?,2,0)").run("ann", "sv1-1");
  const energy = Object.keys(deck.cards).find((id) => id.startsWith("energy-"));
  const rotated = { ...deck, cards: { ...deck.cards, [energy]: deck.cards[energy] - 1, "sv1-1": 1 } };
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: rotated });
  assert.equal(r.status, 400, "a rotated card in a Standard deck");
  assert.match(r.body.error, /Pineco isn't legal in Standard: regulation mark G rotated out/);
  db.prepare("DELETE FROM cards WHERE user_id = ? AND card_id = ?").run("ann", "sv1-1");
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "@Bob", deck });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.match.status, "open");
  assert.equal(r.body.match.them.handle, "bob");
  matchId = r.body.match.id;
  r = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck });
  assert.equal(r.status, 400, "one open challenge between two players");
  const list = await api("bob", "/api/tcg/matches");
  assert.equal(list.body.incoming.length, 1);
  assert.equal(list.body.incoming[0].them.handle, "ann");
  assert.equal((await api("ann", "/api/tcg/matches")).body.outgoing.length, 1);
  r = await api("cat", `/api/tcg/matches/${matchId}`);
  assert.equal(r.status, 404, "a stranger can't read it");
  r = await api("ann", `/api/tcg/matches/${matchId}/accept`, "POST", { deck });
  assert.equal(r.status, 403, "the challenger can't accept");
  r = await api("bob", `/api/tcg/matches/${matchId}/accept`, "POST", { deck: deckFor("bob", "unlimited") });
  assert.equal(r.status, 400, "the format must match");
});

await check("accept starts the match: each player sees only their side", async () => {
  const r = await api("bob", `/api/tcg/matches/${matchId}/accept`, "POST", { deck: deckFor("bob", "standard", 7) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.match.status, "active");
  assert.deepEqual(r.body.match.toMove, [0, 1]);
  for (const [user, seat] of [["ann", 0], ["bob", 1]]) {
    const g = await api(user, `/api/tcg/matches/${matchId}`);
    assert.equal(g.status, 200);
    const { view, legal, match } = g.body;
    assert.equal(match.seat, seat);
    assert.equal(view.seed, undefined);
    assert.equal(view.rng, undefined);
    assert.equal(typeof view.players[1 - seat].hand, "number");
    assert.equal(typeof view.players[seat].deck, "number");
    assert.equal(view.players[seat].hand.length, 7);
    const full = stateOf(matchId);
    for (const uid of full.players[1 - seat].hand) assert.equal(view.cards[uid], undefined, "their hand stays hidden");
    for (const uid of full.players[seat].deck) assert.equal(view.cards[uid], undefined, "your deck stays hidden");
    assert.ok(legal.length && legal.every((a) => a.type === "place" && a.player === seat));
    assert.equal(view.players[0].name, "@ann");
    assert.equal(view.players[1].name, "@bob");
  }
});

await check("the referee refuses moves out of turn and moves for the other player", async () => {
  let r = await api("ann", `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "end" } });
  assert.equal(r.status, 400, "can't end a turn during setup");
  assert.ok(r.body.error);
  r = await api("ann", `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "place", active: "b1", bench: [] } });
  assert.equal(r.status, 400, "ann can't place bob's card");
  r = await api("cat", `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "end" } });
  assert.equal(r.status, 404);
});

await check("a whole match through the API, both clients kept in step by events", async () => {
  const seen = { ann: 0, bob: 0 };
  const views = { ann: null, bob: null };
  const kinds = new Set();
  let moves = 0;
  let row = rowOf(matchId);
  // Who flips first decides; the winner of the flip chooses to go first.
  const state0 = stateOf(matchId);
  const winner = ["ann", "bob"][state0.flipWinner];
  let r = await api(winner, `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "order", first: true }, since: seen[winner] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  while (row.status === "active" && moves < 2000) {
    const state = JSON.parse(row.state);
    const seat = owing(state)[0];
    const user = ["ann", "bob"][seat];
    const action = botAction(state, seat, defs);
    assert.ok(action, "the bot has a move");
    r = await api(user, `/api/tcg/matches/${matchId}/action`, "POST", { action, since: seen[user] });
    assert.equal(r.status, 200, `${moves}: ${JSON.stringify(action)} -> ${JSON.stringify(r.body).slice(0, 300)}`);
    assert.ok(r.body.steps.length >= 1);
    assert.deepEqual(r.body.steps.map((s) => s.seq), Array.from({ length: r.body.steps.length }, (_, i) => seen[user] + i + 1), "steps in order from where the client was");
    for (const step of r.body.steps) step.events.forEach((e) => kinds.add(e.t));
    seen[user] = r.body.steps.at(-1).seq;
    views[user] = r.body.steps.at(-1).view;
    // The other player polls now and then, the way the page does.
    if (moves % 7 === 0) {
      const other = user === "ann" ? "bob" : "ann";
      for (;;) {
        const p = await api(other, `/api/tcg/matches/${matchId}?since=${seen[other]}`);
        assert.equal(p.status, 200);
        if (!p.body.steps.length) break;
        assert.equal(p.body.steps[0].seq, seen[other] + 1);
        seen[other] = p.body.steps.at(-1).seq;
        views[other] = p.body.steps.at(-1).view;
      }
      const full = await api(other, `/api/tcg/matches/${matchId}`);
      assert.deepEqual(views[other], full.body.view, "replayed steps end on the same view as a fresh read");
    }
    moves++;
    row = rowOf(matchId);
  }
  assert.equal(row.status, "over", `finished in ${moves} moves`);
  assert.ok(["prizes", "bench", "deck", "tie"].includes(row.reason), row.reason);
  assert.ok(kinds.has("attack") && kinds.has("turn") && kinds.has("draw"), [...kinds].join(","));
  const end = await api("ann", `/api/tcg/matches/${matchId}`);
  assert.equal(end.body.view.phase, "over");
  assert.equal(end.body.match.status, "over");
  assert.equal(end.body.match.winner, row.winner);
  const after = await api("bob", `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "end" } });
  assert.equal(after.status, 409, "no moves after the end");
  // Nothing was paid: both still own exactly the set they were given.
  for (const u of ["ann", "bob"]) assert.ok(Object.values(ownedOf(u)).every((n) => n === 2));
  results.push(`      (match took ${moves} moves, ${row.reason}, winner seat ${row.winner})`);
});

const startMatch = async (a = "ann", b = "bob") => {
  const c = await api(a, "/api/tcg/challenge", "POST", { to: b, deck: deckFor(a, "standard", 3) });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const r = await api(b, `/api/tcg/matches/${c.body.match.id}/accept`, "POST", { deck: deckFor(b, "standard", 5) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c.body.match.id;
};
const placeBoth = async (id) => {
  for (const [user, seat] of [["ann", 0], ["bob", 1]]) {
    const state = stateOf(id);
    const r = await api(user, `/api/tcg/matches/${id}/action`, "POST", { action: botAction(state, seat, defs) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
};

await check("concede: the other player wins", async () => {
  const id = await startMatch();
  await placeBoth(id);
  const r = await api("ann", `/api/tcg/matches/${id}/concede`, "POST", { since: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.match.status, "over");
  assert.equal(r.body.match.winner, 1);
  assert.equal(r.body.match.reason, "concede");
  assert.ok(r.body.steps.at(-1).events.some((e) => e.t === "over" && e.p === 1));
  const bob = await api("bob", `/api/tcg/matches/${id}?since=2`);
  assert.equal(bob.body.steps.length, 1, "bob hears it on his next poll");
  assert.equal(bob.body.steps[0].action.type, "concede");
});

await check("the clock: running out of time loses, settled on read", async () => {
  const id = await startMatch();
  await placeBoth(id);
  const state = stateOf(id);
  const mover = owing(state)[0];
  const r0 = await api("ann", `/api/tcg/matches/${id}`);
  assert.ok(r0.body.match.deadline > clock && r0.body.match.deadline <= clock + TCG_TIMING.DECISION_MS);
  clock += TCG_TIMING.DECISION_MS - 1000;
  assert.equal((await api("bob", `/api/tcg/matches/${id}`)).body.match.status, "active", "not yet");
  clock += 2000;
  const r = await api(["bob", "ann"][mover], `/api/tcg/matches/${id}?since=2`);
  assert.equal(r.body.match.status, "over");
  assert.equal(r.body.match.reason, "timeout");
  assert.equal(r.body.match.winner, 1 - mover);
  assert.equal(r.body.steps.at(-1).action.type, "concede");
  assert.equal(r.body.steps.at(-1).action.player, mover);
});

await check("the clock: scheduled maintenance settles matches nobody reads, and setup no-shows", async () => {
  const a = await startMatch();
  await placeBoth(a);
  const b = await startMatch(); // nobody places
  const c = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: deckFor("ann", "standard", 9) }); // never answered
  clock += TCG_TIMING.CHALLENGE_MS + 1000;
  const n = await maintainTcg(env, clock);
  assert.ok(n >= 3, `settled ${n}`);
  assert.equal(rowOf(a).status, "over");
  assert.equal(rowOf(a).reason, "timeout");
  assert.equal(rowOf(b).status, "over");
  assert.equal(rowOf(b).reason, "abandoned");
  assert.equal(rowOf(b).winner, null);
  assert.equal(rowOf(c.body.match.id).status, "expired");
  const list = await api("bob", "/api/tcg/matches");
  assert.equal(list.body.incoming.length, 0);
  assert.equal(list.body.live.length, 0);
  assert.ok(list.body.recent.length >= 3);
});

await check("decline, cancel, and a challenger who sold their cards", async () => {
  let c = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: deckFor("ann") });
  let r = await api("ann", `/api/tcg/matches/${c.body.match.id}/decline`, "POST", {});
  assert.equal(r.status, 403);
  r = await api("bob", `/api/tcg/matches/${c.body.match.id}/decline`, "POST", {});
  assert.equal(r.body.match.status, "declined");
  c = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: deckFor("ann") });
  r = await api("ann", `/api/tcg/matches/${c.body.match.id}/cancel`, "POST", {});
  assert.equal(r.body.match.status, "cancelled");
  const deck = deckFor("ann");
  c = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck });
  const sold = Object.keys(deck.cards).find((id) => !id.startsWith("energy-"));
  db.prepare("DELETE FROM cards WHERE user_id = 'ann' AND card_id = ?").run(sold);
  r = await api("bob", `/api/tcg/matches/${c.body.match.id}/accept`, "POST", { deck: deckFor("bob") });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(rowOf(c.body.match.id).status, "cancelled");
  giveSet("ann");
});

await check("two moves at once: one lands, the other is judged on top of it", async () => {
  const id = await startMatch();
  const s = stateOf(id);
  const [a, b] = await Promise.all([
    api("ann", `/api/tcg/matches/${id}/action`, "POST", { action: botAction(s, 0, defs), since: 0 }),
    api("bob", `/api/tcg/matches/${id}/action`, "POST", { action: botAction(s, 1, defs), since: 0 }),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const row = rowOf(id);
  assert.equal(row.seq, 2);
  assert.equal(JSON.parse(row.state).phase, "main", "both placed, the game began");
  const later = a.body.seq === 2 ? a : b;
  assert.equal(later.body.steps.length, 2, "the later one hears both steps");
});

Date.now = realNow;
console.log(results.join("\n"));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
