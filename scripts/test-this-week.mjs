// Checks Home's "This week": what leads and what follows (js/this-week.js), the
// price movers the Worker picks (worker/movers.js), and that every patch note
// carries a kind.
//
//   node scripts/test-this-week.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { weekOf, rangeWords } from "../js/this-week.js";
import { cardFromText, handleMovers, pickMovers } from "../worker/movers.js";
import { getSet } from "../js/catalog.js";
import { agoWords, smallImage } from "../js/live-rips.js";
import { handleLiveRips, ripFromRow } from "../worker/live-rips.js";

const root = new URL("..", import.meta.url);
const notes = JSON.parse(readFileSync(new URL("data/patch-notes.json", root), "utf8"));

// Every note says what kind it is; a big one is never a fix, and a link is a path on the site.
for (const note of notes) {
  assert.ok(["new", "better", "fix"].includes(note.kind), `${note.id}: kind is ${note.kind}`);
  if (note.big != null) {
    assert.ok([1, 2, 3].includes(note.big), `${note.id}: big is ${note.big}`);
    assert.notEqual(note.kind, "fix", `${note.id}: a fix can't be big`);
  }
  if (note.link != null) {
    assert.match(note.link, /^\/[a-z0-9/-]*$/, `${note.id}: link ${note.link}`);
    assert.ok(note.linkLabel, `${note.id}: a link needs its words`);
  }
}

// The week: the heaviest big update leads, the rest follow, fixes are only counted.
const at = (day) => new Date(`${day}T12:00:00`).getTime();
const sample = [
  { id: "f", date: "2026-03-10", kind: "fix", title: "A fix" },
  { id: "a", date: "2026-03-10", kind: "new", big: 1, title: "Small feature" },
  { id: "b", date: "2026-03-09", kind: "new", big: 3, title: "Headline" },
  { id: "c", date: "2026-03-08", kind: "better", title: "Tidier page" },
  { id: "d", date: "2026-03-05", kind: "new", big: 2, title: "Second" },
  { id: "old", date: "2026-02-20", kind: "new", big: 3, title: "Last month" },
];
const week = weekOf(sample, at("2026-03-10"));
assert.equal(week.from, "2026-03-04");
assert.equal(week.lead.id, "b");
assert.deepEqual(week.more.map((n) => n.id), ["d", "a"]);
assert.equal(week.added, 1);
assert.equal(week.fixes, 1);
assert.ok(week.leadInWeek);
// A quiet week: the newest big update still leads, marked as not from this week.
const quiet = weekOf(sample, at("2026-04-01"));
assert.equal(quiet.lead.id, "a");
assert.equal(quiet.leadInWeek, false);
assert.equal(quiet.more.length, 0);
assert.equal(weekOf([], at("2026-04-01")).lead, null);
assert.equal(rangeWords("2026-11-22", "2026-11-28"), "Nov 22 to 28");
assert.equal(rangeWords("2026-11-28", "2026-12-04"), "Nov 28 to Dec 4");

// A card cut out of a set file's text, whatever sits around it.
const text = JSON.stringify([
  { id: "zz1-1", name: "First", attacks: [{ name: "Hit {hard}", text: 'Says "hi" \\ }' }] },
  { id: "zz1-10", name: "Tenth", number: "10", imageSmall: "assets/cards/zz1/10-sm.webp" },
]);
assert.equal(cardFromText(text, "zz1-1").name, "First");
assert.equal(cardFromText(text, "zz1-10").name, "Tenth");
assert.equal(cardFromText(text, "zz1-100"), null);
assert.equal(cardFromText(JSON.stringify([{ id: "zz1-1", name: "First" }], null, 2), "zz1-1").name, "First");

// No card twice, two a set at most, junk dropped.
const picked = pickMovers(
  [
    { set_id: "me1", id: "me1-1", now: 20, was: 10 },
    { set_id: "mep", id: "me1-1", now: 20, was: 10 },
    { set_id: "me1", id: "me1-2", now: 18, was: 10 },
    { set_id: "me1", id: "me1-3", now: 17, was: 10 },
    { set_id: "sv8", id: "sv8-5", now: 15, was: 10 },
    { set_id: "sv8", id: 'bad"id', now: 15, was: 10 },
    { set_id: "sv8", id: "sv8-6", now: 15, was: null },
  ],
  8
);
assert.deepEqual(picked.map((r) => r.id), ["me1-1", "me1-2", "sv8-5"]);
assert.equal(picked[0].pct, 100);

// The route, on a real SQLite: last week's prices beside today's.
const db = new DatabaseSync(":memory:");
const DB = {
  prepare(sql) {
    let params = [];
    const st = {
      bind: (...values) => ((params = values), st),
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => (db.prepare(sql).run(...params), { success: true, meta: {} }),
    };
    return st;
  },
  batch: async (list) => Promise.all(list.map((st) => st.run())),
};
const env = {
  DB,
  ASSETS: {
    fetch: async (request) => {
      try {
        return new Response(readFileSync(new URL(`.${new URL(request.url).pathname}`, root)));
      } catch {
        return new Response("", { status: 404 });
      }
    },
  },
};
const url = new URL("https://poke-pack.rip/api/prices/movers");
const call = async () => (await handleMovers(new Request(url), env, url, getSet)).json();
const empty = await call();
assert.deepEqual([empty.up, empty.down], [[], []], "no prices recorded, nothing to show");

const me1 = JSON.parse(readFileSync(new URL("data/me1.json", root), "utf8"));
const [riser, faller, penny, steady, glitch] = me1;
const day = (back) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
const put = (setId, back, cards) =>
  db.prepare("INSERT INTO price_days (set_id, day, prices, recorded_at) VALUES (?, ?, ?, 0)").run(setId, day(back), JSON.stringify({ cards, sealed: {} }));
put("me1", 8, { [riser.id]: 10, [faller.id]: 40, [penny.id]: 0.1, [steady.id]: 20, [glitch.id]: 5 });
put("me1", 3, { [riser.id]: 12, [faller.id]: 35, [penny.id]: 0.3, [steady.id]: 20, [glitch.id]: 5 });
put("me1", 0, { [riser.id]: 15, [faller.id]: 30, [penny.id]: 0.5, [steady.id]: 20.5, [glitch.id]: 90 });
const out = await call();
assert.deepEqual(out.up.map((c) => c.id), [riser.id], "only the real riser: not the penny card, the steady one or the mislisted one");
assert.deepEqual(out.down.map((c) => c.id), [faller.id]);
assert.equal(out.up[0].name, riser.name);
assert.equal(out.up[0].setName, getSet("me1").name);
assert.equal(out.up[0].pct, 50);
assert.equal(out.up[0].was, 10);
assert.ok(out.up[0].img.endsWith(".webp"));
assert.equal(out.day, day(0));
assert.equal(out.since, day(8));

// Live rips: a feed row becomes a handle and a card, and nothing else.
const feedRow = (over = {}) => ({
  id: 7,
  kind: "pulls",
  created_at: 1000,
  handle: "misty",
  feed_share: 1,
  tester: 0,
  payload: JSON.stringify({
    name: "Real Name",
    handle: "old_handle",
    discordId: "123456789",
    cards: [{ id: "me1-1", name: "Bulbasaur", rarity: "Common", price: 120, image: "assets/cards/me1/1.webp", set: "Mega Evolution" }, { id: "me1-2", name: "Ivysaur", price: 101 }],
    more: 2,
  }),
  ...over,
});
const rip = ripFromRow(feedRow());
assert.deepEqual(rip, {
  id: 7,
  kind: "pull",
  handle: "misty",
  at: 1000,
  card: { id: "me1-1", name: "Bulbasaur", rarity: "Common", set: "Mega Evolution", price: 120, image: "assets/cards/me1/1.webp" },
  more: 3,
});
assert.ok(!JSON.stringify(rip).includes("Real Name") && !JSON.stringify(rip).includes("123456789"), "a name or a Discord id got out");
assert.equal(ripFromRow(feedRow({ feed_share: 0 })), null, "sharing turned off");
assert.equal(ripFromRow(feedRow({ tester: 1 })), null, "a test account");
assert.equal(ripFromRow(feedRow({ payload: "{" })), null);
const black = ripFromRow(feedRow({ kind: "blacklabel", payload: JSON.stringify({ handle: "misty", card: { id: "me1-1", name: "Bulbasaur", price: 120, slab: 900 } }) }));
assert.equal(black.kind, "blacklabel");
assert.equal(black.card.price, 900);

db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, handle TEXT, tester INTEGER NOT NULL DEFAULT 0)");
const ripsUrl = new URL("https://poke-pack.rip/api/rips/live");
DB.exec = async (sql) => (db.exec(sql), {});
DB.prepare = ((prepare) => (sql) => {
  const st = prepare(sql);
  st.first = async () => (await st.all()).results[0] || null;
  return st;
})(DB.prepare);
const liveRips = async () => (await (await handleLiveRips(new Request(ripsUrl), env, ripsUrl)).json()).rips;
assert.deepEqual(await liveRips(), [], "no pulls yet");
db.exec("INSERT INTO users (id, name, handle) VALUES ('a', 'A', 'misty'), ('b', 'B', 'brock')");
db.exec("UPDATE users SET feed_share = 0 WHERE id = 'b'");
const feed = db.prepare("INSERT INTO discord_feed (kind, user_id, payload, created_at) VALUES ('pulls', ?, ?, ?)");
feed.run("a", feedRow().payload, Date.now() - 60_000);
feed.run("b", feedRow().payload, Date.now() - 30_000);
feed.run("a", feedRow().payload, Date.now() - 30 * 86_400_000);
const shown = await liveRips();
assert.equal(shown.length, 1, "only the sharing trainer's pull from this week");
assert.equal(shown[0].handle, "misty");

assert.equal(agoWords(0, 30_000), "now");
assert.equal(agoWords(0, 5 * 60_000), "5m");
assert.equal(agoWords(0, 3 * 3_600_000), "3h");
assert.equal(agoWords(0, 2 * 86_400_000), "2d");
assert.equal(smallImage("assets/cards/me1/1.webp"), "assets/cards/me1/1-sm.webp");
assert.equal(smallImage("assets/cards/me1/1-sm.webp"), "assets/cards/me1/1-sm.webp");
assert.equal(smallImage("https://x.test/a.png"), "https://x.test/a.png");

console.log("this week: ok");
