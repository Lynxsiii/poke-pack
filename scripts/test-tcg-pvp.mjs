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

await check("the migration files hold the Worker's DDL", async () => {
  const sql = ["0038_tcg_matches.sql", "0039_tcg_rematch_queue.sql"].map((f) => readFileSync(new URL(`../worker/migrations/${f}`, import.meta.url), "utf8")).join("\n").replace(/\s+/g, " ");
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
  // The flip comes first: its winner chooses who goes first before any hand is dealt.
  const flipWinner = stateOf(matchId).flipWinner;
  assert.deepEqual(r.body.match.toMove, [flipWinner]);
  for (const [user, seat] of [["ann", 0], ["bob", 1]]) {
    const g = await api(user, `/api/tcg/matches/${matchId}`);
    assert.equal(g.body.view.players[seat].hand.length, 0, "no hands before the order is chosen");
    assert.deepEqual(g.body.legal.map((a) => a.type), seat === flipWinner ? ["order", "order"] : []);
  }
  const loser = ["ann", "bob"][1 - flipWinner];
  assert.equal((await api(loser, `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "order", first: true } })).status, 400, "only the flip's winner chooses");
  const o = await api(["ann", "bob"][flipWinner], `/api/tcg/matches/${matchId}/action`, "POST", { action: { type: "order", first: true } });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.deepEqual(rowOf(matchId).to_move, "0,1");
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
  // The flip's winner already chose to go first (the test above).
  let row = rowOf(matchId);
  let r;
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
  const flipWinner = stateOf(id).flipWinner;
  const o = await api(["ann", "bob"][flipWinner], `/api/tcg/matches/${id}/action`, "POST", { action: { type: "order", first: true } });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  for (const [user, seat] of [["ann", 0], ["bob", 1]]) {
    const state = stateOf(id);
    const r = await api(user, `/api/tcg/matches/${id}/action`, "POST", { action: botAction(state, seat, defs) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
};

await check("concede: the other player wins", async () => {
  const id = await startMatch();
  await placeBoth(id);
  const r = await api("ann", `/api/tcg/matches/${id}/concede`, "POST", { since: 3 });
  assert.equal(r.status, 200);
  assert.equal(r.body.match.status, "over");
  assert.equal(r.body.match.winner, 1);
  assert.equal(r.body.match.reason, "concede");
  assert.ok(r.body.steps.at(-1).events.some((e) => e.t === "over" && e.p === 1));
  const bob = await api("bob", `/api/tcg/matches/${id}?since=3`);
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
  const b = await startMatch(); // the flip's winner never chooses who goes first
  const c = await api("ann", "/api/tcg/challenge", "POST", { to: "bob", deck: deckFor("ann", "standard", 9) }); // never answered
  clock += TCG_TIMING.CHALLENGE_MS + 1000;
  const n = await maintainTcg(env, clock);
  assert.ok(n >= 3, `settled ${n}`);
  assert.equal(rowOf(a).status, "over");
  assert.equal(rowOf(a).reason, "timeout");
  assert.equal(rowOf(b).status, "over");
  assert.equal(rowOf(b).reason, "timeout");
  assert.equal(rowOf(b).winner, 1 - stateOf(b).flipWinner);
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
  const w = stateOf(id).flipWinner;
  await api(["ann", "bob"][w], `/api/tcg/matches/${id}/action`, "POST", { action: { type: "order", first: true } });
  const s = stateOf(id);
  const [a, b] = await Promise.all([
    api("ann", `/api/tcg/matches/${id}/action`, "POST", { action: botAction(s, 0, defs), since: 0 }),
    api("bob", `/api/tcg/matches/${id}/action`, "POST", { action: botAction(s, 1, defs), since: 0 }),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const row = rowOf(id);
  assert.equal(row.seq, 3);
  assert.equal(JSON.parse(row.state).phase, "main", "both placed, the game began");
  const later = a.body.seq === 3 ? a : b;
  assert.equal(later.body.steps.length, 3, "the later one hears every step since 0");
});

// ---- Rematch -----------------------------------------------------------------------
const finished = async () => {
  const id = await startMatch();
  await placeBoth(id);
  const r = await api("ann", `/api/tcg/matches/${id}/concede`, "POST", { since: 3 });
  assert.equal(r.body.match.status, "over");
  return id;
};
const rematch = (user, id, verb = "", body) => {
  const get = body === undefined && !verb;
  return api(user, `/api/tcg/matches/${id}/rematch${verb ? `/${verb}` : ""}`, get ? "GET" : "POST", get ? undefined : (body ?? {}));
};
const endLive = async () => {
  // Concede whatever is still going between the test players, so the live-match cap doesn't get in the way.
  for (const row of db.prepare("SELECT id, p0 FROM tcg_matches WHERE status IN ('open', 'active')").all()) {
    db.prepare("UPDATE tcg_matches SET status = 'over', reason = 'concede', ended_at = ? WHERE id = ?").run(clock, row.id);
  }
};

await check("rematch: one offers, the other accepts, a new match with the same decks and a fresh flip", async () => {
  await endLive();
  const id = await finished();
  const old = rowOf(id);
  let r = await rematch("bob", id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rematch.status, "");
  assert.equal(r.body.rematch.here, false, "ann hasn't looked at the finished table");
  r = await rematch("bob", id, "", {});
  assert.equal(r.status, 409, "no offer to someone who isn't there");
  r = await rematch("ann", id);
  assert.equal(r.body.rematch.here, true, "bob is at the table");
  assert.equal((await rematch("cat", id)).status, 404, "a stranger can't see it");
  r = await rematch("ann", id, "", {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rematch.status, "open");
  assert.equal(r.body.rematch.mine, true);
  assert.ok(r.body.rematch.deadline > clock && r.body.rematch.deadline <= clock + TCG_TIMING.REMATCH_MS);
  r = await rematch("bob", id);
  assert.equal(r.body.rematch.status, "open");
  assert.equal(r.body.rematch.mine, false, "bob sees ann's offer");
  r = await rematch("bob", id, "", {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rematch.status, "accepted");
  const next = r.body.rematch.next;
  assert.match(next, /^[a-f0-9]{20}$/);
  assert.equal((await rematch("ann", id)).body.rematch.next, next, "ann's page hears it and goes to the new table");
  assert.equal((await rematch("ann", id, "", {})).body.rematch.next, next, "a late press joins the same match");
  const row = rowOf(next);
  assert.equal(row.status, "active");
  assert.equal(row.p0, old.p0);
  assert.equal(row.p1, old.p1);
  assert.equal(row.deck0, old.deck0, "same decks");
  assert.equal(row.deck1, old.deck1);
  assert.equal(row.format, old.format);
  assert.equal(row.log, "[]");
  const state = stateOf(next);
  assert.equal(state.dealt, false, "a fresh flip: its winner chooses before the deal");
  assert.equal(row.to_move, String(state.flipWinner));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tcg_matches WHERE id = ?").get(next).n, 1);
  assert.equal((await rematch("ann", next)).body.playing, true, "no rematch of a match still going");
  for (const u of ["ann", "bob"]) assert.ok(Object.values(ownedOf(u)).every((n) => n === 2), "nothing was paid");
});

await check("rematch: swapping deck, the format holds, call off, decline", async () => {
  await endLive();
  const id = await finished();
  await rematch("ann", id);
  await rematch("bob", id);
  let r = await rematch("ann", id, "", { deck: deckFor("ann", "unlimited") });
  assert.equal(r.status, 400, "a rematch keeps the format");
  const stolen = deckFor("ann", "standard", 11);
  const some = Object.keys(stolen.cards).find((c) => !c.startsWith("energy-"));
  r = await rematch("ann", id, "", { deck: { ...stolen, cards: { ...stolen.cards, [some]: 3 } } });
  assert.equal(r.status, 400, "the deck is checked against what ann owns");
  const swap = deckFor("ann", "standard", 11);
  r = await rematch("ann", id, "", { deck: swap });
  assert.equal(r.body.rematch.status, "open");
  r = await rematch("ann", id, "decline");
  assert.equal(r.body.rematch.status, "cancelled", "ann called her offer off");
  r = await rematch("bob", id, "", {});
  assert.equal(r.body.rematch.status, "open", "an offer can be made again");
  assert.equal(r.body.rematch.mine, true);
  r = await rematch("ann", id, "decline");
  assert.equal(r.body.rematch.status, "declined");
  r = await rematch("bob", id);
  assert.equal(r.body.rematch.status, "declined", "bob hears no");
  r = await rematch("bob", id, "", {});
  assert.equal(r.status, 409, "turned down stays turned down");
  // A swapped deck goes into the new match.
  const id2 = await finished();
  await rematch("bob", id2);
  await rematch("ann", id2, "", { deck: swap });
  r = await rematch("bob", id2, "", {});
  assert.equal(r.body.rematch.status, "accepted", JSON.stringify(r.body));
  assert.deepEqual(JSON.parse(rowOf(r.body.rematch.next).deck0), swap.cards);
  assert.equal(rowOf(r.body.rematch.next).deck0_name, swap.name);
});

await check("rematch: an offer expires after a few minutes, or when either player leaves", async () => {
  await endLive();
  const id = await finished();
  await rematch("ann", id);
  await rematch("bob", id);
  await rematch("ann", id, "", {});
  // Both stay at the table, polling, until the offer runs out.
  for (let t = 0; t <= TCG_TIMING.REMATCH_MS; t += 20_000) {
    clock += 20_000;
    await rematch("ann", id);
    await rematch("bob", id);
  }
  let r = await rematch("bob", id);
  assert.equal(r.body.rematch.status, "expired");
  r = await rematch("bob", id, "", {});
  assert.equal(r.body.rematch.status, "open", "a new offer after one ran out");
  r = await rematch("ann", id, "leave");
  assert.equal(r.body.rematch.status, "left");
  assert.equal(r.body.rematch.mine, true, "ann is the one who left");
  r = await rematch("bob", id);
  assert.equal(r.body.rematch.status, "left", "bob sees ann left");
  assert.equal(r.body.rematch.mine, false);
  assert.equal(r.body.rematch.here, false);
  assert.equal((await rematch("bob", id, "", {})).status, 409);
  assert.equal((await rematch("ann", id, "", {})).status, 409, "leaving closes it for both");

  // The one who offered stops polling (closed the tab): the offer goes.
  const id2 = await finished();
  await rematch("ann", id2);
  await rematch("bob", id2);
  await rematch("bob", id2, "", {});
  clock += TCG_TIMING.PRESENCE_MS - 5000;
  assert.equal((await rematch("ann", id2)).body.rematch.status, "open");
  clock += 10_000;
  r = await rematch("ann", id2);
  assert.equal(r.body.rematch.status, "left", "bob stopped reading the table");
  assert.equal((await rematch("ann", id2, "", {})).status, 409);

  // Scheduled maintenance closes offers nobody reads.
  const id3 = await finished();
  await rematch("ann", id3);
  await rematch("bob", id3);
  await rematch("ann", id3, "", {});
  clock += TCG_TIMING.REMATCH_MS + 1000;
  await maintainTcg(env, clock);
  assert.equal(db.prepare("SELECT status FROM tcg_rematches WHERE match_id = ?").get(id3).status, "expired");

  // The one who offered sold a card from their deck: accepting calls it off.
  const id4 = await finished();
  await rematch("ann", id4);
  await rematch("bob", id4);
  await rematch("ann", id4, "", {});
  const sold = Object.keys(JSON.parse(rowOf(id4).deck0)).find((c) => !c.startsWith("energy-"));
  db.prepare("DELETE FROM cards WHERE user_id = 'ann' AND card_id = ?").run(sold);
  r = await rematch("bob", id4, "", {});
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(db.prepare("SELECT status FROM tcg_rematches WHERE match_id = ?").get(id4).status, "cancelled");
  giveSet("ann");

  // Long after the match, there's no rematch.
  const id5 = await finished();
  clock += TCG_TIMING.REMATCH_WINDOW_MS + 1000;
  await rematch("ann", id5);
  await rematch("bob", id5);
  assert.equal((await rematch("ann", id5, "", {})).status, 409);
});

// ---- Quick match queue ---------------------------------------------------------------
const queue = (user, body) => api(user, "/api/tcg/queue", body ? "POST" : "GET", body);
const unqueue = (user) => api(user, "/api/tcg/queue/cancel", "POST", {});

await check("queue: two players in the same format are paired and both go to the table", async () => {
  await endLive();
  let r = await queue("ann", { deck: deckFor("ann", "standard", 3) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.queue.format, "standard");
  assert.equal(r.body.queue.match, null);
  r = await queue("bob");
  assert.equal(r.body.queue, null, "bob isn't queued");
  assert.equal(r.body.waiting.standard, 1, "one trainer is looking for a Standard match");
  r = await queue("ann");
  assert.equal(r.body.queue.match, null, "still waiting");
  // cat isn't ann's friend: the queue pairs strangers.
  r = await queue("cat", { deck: deckFor("cat", "standard", 5) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.queue.match;
  assert.match(id, /^[a-f0-9]{20}$/, "paired on joining");
  assert.equal((await queue("ann")).body.queue.match, id, "ann's page hears it");
  const row = rowOf(id);
  assert.equal(row.status, "active");
  assert.equal(row.p0, "ann", "the one who waited longest");
  assert.equal(row.p1, "cat");
  assert.deepEqual(JSON.parse(row.deck0), deckFor("ann", "standard", 3).cards);
  const state = stateOf(id);
  assert.equal(row.to_move, String(state.flipWinner), "the flip comes first");
  const g = await api("cat", `/api/tcg/matches/${id}`);
  assert.equal(g.status, 200);
  assert.deepEqual(Object.keys(g.body.match.them).sort(), ["handle", "name"], "only the public name and handle");
  assert.equal(g.body.match.them.handle, "ann");
  assert.equal((await api("bob", `/api/tcg/matches/${id}`)).status, 404);
  // Cancelling after the pairing leaves the match standing.
  r = await unqueue("ann");
  assert.equal(r.body.queue.match, id);
  assert.equal(rowOf(id).status, "active");
  assert.equal((await queue("bob")).body.waiting.standard ?? 0, 0, "nobody left waiting");
  // Once that match is over the pairing is old news: the page isn't sent back to it.
  await api("cat", `/api/tcg/matches/${id}/concede`, "POST", {});
  assert.equal(rowOf(id).status, "over");
  assert.equal((await queue("cat")).body.queue, null);
});

await check("queue: other formats aren't paired, cancel, and a page that stops polling loses its place", async () => {
  await endLive();
  db.prepare("DELETE FROM tcg_queue").run();
  let r = await queue("ann", { deck: deckFor("ann", "expanded", 3) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.queue.format, "expanded");
  r = await queue("bob", { deck: deckFor("bob", "unlimited", 3) });
  assert.equal(r.body.queue.match, null, "Unlimited doesn't meet Expanded");
  r = await queue("cat", { deck: deckFor("cat", "standard", 3) });
  assert.equal(r.body.queue.match, null, "nor Standard");
  assert.deepEqual(r.body.waiting, { expanded: 1, unlimited: 1 });
  r = await unqueue("ann");
  assert.equal(r.body.queue, null, "ann let her place go");
  r = await queue("cat");
  assert.equal(r.body.waiting.expanded ?? 0, 0);
  // Decks are checked the same way a challenge's are.
  const deck = deckFor("ann", "standard", 3);
  const some = Object.keys(deck.cards).find((c) => !c.startsWith("energy-"));
  assert.equal((await queue("ann", { deck: { ...deck, cards: { ...deck.cards, [some]: 3 } } })).status, 400);
  assert.equal((await queue("ann", { deck: { ...deck, format: "half" } })).status, 400);
  assert.equal((await queue("ann", {})).status, 400);
  // bob's page stops polling; cat keeps polling. Then ann queues Unlimited: bob is stale, so no pairing.
  clock += TCG_TIMING.PRESENCE_MS / 2;
  await queue("cat");
  clock += TCG_TIMING.PRESENCE_MS / 2 + 1000;
  r = await queue("ann", { deck: deckFor("ann", "unlimited", 3) });
  assert.equal(r.body.queue.match, null, "bob's stale place isn't paired");
  r = await queue("bob");
  assert.equal(r.body.expired, true, "bob's place ran out");
  assert.equal(r.body.queue, null);
  assert.ok(!db.prepare("SELECT 1 FROM tcg_queue WHERE user_id = 'bob'").get());
  // Scheduled maintenance drops places nobody reads.
  clock += TCG_TIMING.PRESENCE_MS + 1000;
  await maintainTcg(env, clock);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tcg_queue").get().n, 0);
  // A queued player who sold a card from their deck is dropped when someone comes to pair.
  await queue("ann", { deck: deckFor("ann", "standard", 3) });
  db.prepare("DELETE FROM cards WHERE user_id = 'ann' AND card_id = ?").run(some);
  r = await queue("cat", { deck: deckFor("cat", "standard", 3) });
  assert.equal(r.body.queue.match, null);
  assert.ok(!db.prepare("SELECT 1 FROM tcg_queue WHERE user_id = 'ann'").get(), "ann's place went with her deck");
  giveSet("ann");
  await unqueue("cat");
});

await check("queue: three at once make one match, never two for the same player", async () => {
  await endLive();
  db.prepare("DELETE FROM tcg_queue").run();
  const rs = await Promise.all(["ann", "bob", "cat"].map((u, i) => queue(u, { deck: deckFor(u, "standard", 3 + i) })));
  for (const r of rs) assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const u of ["ann", "bob", "cat"]) await queue(u);
  const made = db.prepare("SELECT * FROM tcg_matches WHERE status = 'active'").all();
  assert.equal(made.length, 1, "one pair, one left waiting");
  const paired = [made[0].p0, made[0].p1];
  assert.notEqual(paired[0], paired[1]);
  const left = ["ann", "bob", "cat"].find((u) => !paired.includes(u));
  assert.equal((await queue(left)).body.queue.match, null);
  for (const u of paired) assert.equal((await queue(u)).body.queue.match, made[0].id);
  await unqueue(left);
});

Date.now = realNow;
console.log(results.join("\n"));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
