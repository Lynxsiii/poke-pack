// Pure checks of the stake picker's fill logic (js/stake-picker.js): autoFill, fillTo and
// parseAmount. No Worker, no DOM. Run: node scripts/test-stake-picker.mjs
import assert from "node:assert/strict";
import { autoFill, fillTo, parseAmount } from "../js/stake-picker.js";
import { matchWindow } from "../js/casino-rules.js";

const card = (id, value, owned) => ({ id, name: id, number: id, value, owned });
const cents = (n) => Math.round(n * 100);
const sum = (entries, picked) => [...picked].reduce((s, [id, q]) => s + cents(entries.find((e) => e.id === id).value) * q, 0);
const copies = (picked) => [...picked.values()].reduce((n, q) => n + q, 0);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ---- parseAmount: what a thumb can type -------------------------------------
eq(parseAmount("50"), 5000, "plain");
eq(parseAmount(" 20 "), 2000, "padded");
eq(parseAmount("1,234.5"), 123450, "thousands and one decimal");
eq(parseAmount("0.05"), 5, "small");
eq(parseAmount(".5"), 50, "leading dot");
eq(parseAmount("12."), 1200, "trailing dot");
eq(parseAmount("✦ 50"), 5000, "the mark never counts");
eq(parseAmount("2.004"), 200, "rounds to whole cents");
eq(parseAmount(""), null, "blank");
eq(parseAmount("abc"), null, "junk");
eq(parseAmount("5 0 0"), 50000, "inner spaces are ignored");
eq(parseAmount("1e3"), null, "no exponents");
eq(parseAmount("-5"), null, "no negatives");
eq(parseAmount("1.2.3"), null, "two dots");
eq(parseAmount("99999999999999999999"), null, "absurd sizes are junk, not Infinity");

// ---- autoFill: kept contract ------------------------------------------------
{
  const e = [card("a", 10, 3), card("b", 1, 40), card("c", 0.5, 10)];
  const r = autoFill(e, 2500, 2400, 2600, (x) => x.owned);
  ok(r.ok && r.total === sum(e, r.picked), "autoFill reaches a window it can");
  eq(r.picked.get("a"), 2, "biggest cards first");
  const none = autoFill(e, 1000000, 990000, 1010000, (x) => x.owned);
  ok(!none.ok && none.total === 3000 + 4000 + 500, "autoFill that falls short takes everything it can");
  const capped = autoFill(e, 5000, 4900, 5100, (x) => x.owned, 1);
  ok(capped.picked.size === 1, "maxCards stops a fifth different card (here the second)");
}

// ---- fillTo: exact reach ----------------------------------------------------
{
  const e = [card("a", 10, 5), card("b", 5, 5), card("c", 1, 5)];
  const r = fillTo(e, cents(50));
  ok(r.ok, "50 is reachable");
  eq(r.total, sum(e, r.picked), "the total is the picked cards");
  ok(r.total <= matchWindow(5000).max && r.total >= matchWindow(5000).min, "within the coinflip tolerance");
  eq(r.reach, r.total, "no slabs: reach is the cards");
  const exact = fillTo([card("x", 25, 4)], cents(50));
  eq([exact.total, exact.ok, copies(exact.picked)], [5000, true, 2], "exact: two 25s");
}

// ---- fillTo: short reach ----------------------------------------------------
{
  const e = [card("a", 10, 2), card("b", 4.5, 1)];
  const r = fillTo(e, cents(500));
  eq([r.ok, r.total], [false, 2450], "short: everything is taken and it is not ok");
  eq(r.source, "all", "short fills fall back to every copy");
  const nothing = fillTo([], cents(50));
  eq([nothing.ok, nothing.total, nothing.source, nothing.picked.size], [false, 0, "none", 0], "no cards at all");
}

// ---- fillTo: duplicates first -------------------------------------------------
{
  // Own 3 of a (30 each) and 1 of b (60). 60 is reached from duplicates alone (2 spare copies of a).
  const e = [card("a", 30, 3), card("b", 60, 1)];
  const r = fillTo(e, cents(60));
  eq(r.source, "dupes", "duplicates cover it");
  eq([r.picked.get("a"), r.picked.has("b")], [2, false], "the single copy stays home");
  // 90 needs the single b copy: duplicates alone give 60, so it falls back to every copy.
  const more = fillTo(e, cents(90));
  eq(more.source, "all", "dupes fall short, so single copies join");
  ok(more.ok && more.total >= matchWindow(9000).min, "and the amount is reached");
  // A card owned once is never taken while duplicates suffice.
  const lone = fillTo([card("d", 10, 1), card("e", 1, 20)], cents(10));
  ok(!lone.picked.has("d") && lone.picked.get("e") === 10 && lone.source === "dupes", "spare copies of a cheap card beat a single dear one");
}

// ---- fillTo: slabs held -------------------------------------------------------
{
  const e = [card("a", 10, 10)];
  const r = fillTo(e, cents(50), { held: cents(30) });
  eq([r.total, r.reach, r.ok], [2000, 5000, true], "slabs count toward the amount");
  const over = fillTo(e, cents(20), { held: cents(30) });
  eq([over.picked.size, over.total, over.reach, over.ok], [0, 0, 3000, false], "slabs above the amount: no cards, outside the window");
  const within = fillTo(e, cents(30), { held: cents(30) });
  eq([within.picked.size, within.ok], [0, true], "slabs exactly the amount: no cards needed");
}

// ---- fillTo: the match window ---------------------------------------------------
{
  const e = [card("a", 7, 20)];
  const win = { min: cents(98), max: cents(102) };
  const r = fillTo(e, cents(100), { window: win });
  ok(r.ok && r.total >= win.min && r.total <= win.max, "match mode lands inside the host's window");
  eq(r.total % 700, 0, "built from whole copies");
  const tight = fillTo([card("t", 50, 4)], cents(100), { window: { min: cents(99), max: cents(101) } });
  eq([tight.ok, tight.total], [true, 10000], "a tight window is hit exactly when it can be");
  const miss = fillTo([card("t", 60, 4)], cents(100), { window: { min: cents(99), max: cents(101) } });
  ok(!miss.ok, "a window the cards cannot hit is reported as missed");
  ok(miss.total <= cents(101), "and never overshoots the window's top");
  // Free mode never goes above the tolerance.
  const free = fillTo([card("g", 3, 100)], cents(50));
  ok(free.total <= matchWindow(5000).max, "free mode stays under target + tolerance");
}

// ---- fillTo: caps -------------------------------------------------------------
{
  // 150 different 1-coin cards but only 100 may be in a stake.
  const many = Array.from({ length: 150 }, (_, i) => card(`m${i}`, 1, 1));
  const r = fillTo(many, cents(150), { maxCards: 100 });
  eq(r.picked.size, 100, "at most maxCards different cards");
  ok(!r.ok && r.total === 10000, "and it says it fell short");
  // One card, 9999 copies per card at most.
  const stack = [card("s", 1, 50000)];
  const q = fillTo(stack, cents(20000), { maxQty: 9999 });
  eq(q.picked.get("s"), 9999, "at most maxQty copies of one card");
  ok(!q.ok, "a stack bigger than the cap falls short");
  // Copies in the whole stake.
  const mix = [card("p", 1, 9999), card("q", 1, 9999), card("r", 1, 9999)];
  const c = fillTo(mix, cents(20000), { maxCopies: 12000 });
  eq(copies(c.picked), 12000, "at most maxCopies copies in all");
  // Huge amounts stay instant and do not loop per copy.
  const t0 = Date.now();
  fillTo([card("z", 0.01, 9999)], cents(1e9));
  ok(Date.now() - t0 < 200, "a huge ask is one step per card");
}

console.log(`Stake picker fill checks passed: ${checks} assertions (parseAmount, autoFill, fillTo: exact, short, duplicates first, slabs held, match window, caps).`);
