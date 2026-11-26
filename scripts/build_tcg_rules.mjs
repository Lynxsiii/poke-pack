#!/usr/bin/env node
/**
 * Builds data/tcg/rules.json: the play facts our card files don't carry
 * (weakness, resistance, retreat cost, prizes given up when Knocked Out).
 *
 * Source: github.com/PokemonTCG/pokemon-tcg-data (cards/en/<set>.json), whose
 * card ids match ours. Run after adding a set:
 *
 *   node scripts/build_tcg_rules.mjs            every set under data/
 *   node scripts/build_tcg_rules.mjs me6 sv10   only these (merged into the file)
 *
 * Shape, kept small because the match screen loads it in one go:
 *   { "<setId>": { "<card id after the dash>": [weakness, resistance, retreat, prizes] } }
 *   weakness / resistance  "Fire×2", "Fighting-30", or "" for none
 *   retreat                number of Energy
 *   prizes                 left out when 1
 * Trailing empty values are trimmed, so a card with nothing to say is [].
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/";
const OUT = "data/tcg/rules.json";
const only = process.argv.slice(2);

const out = existsSync(OUT) && only.length ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const report = [];

function prizesOf(card) {
  for (const rule of card.rules || []) {
    const m = rule.match(/takes? (\d) Prize cards/i);
    if (m) return Number(m[1]);
  }
  return 1;
}

function row(card) {
  const side = (list) => (list?.[0] ? `${list[0].type}${list[0].value || ""}` : "");
  const r = [side(card.weaknesses), side(card.resistances), card.convertedRetreatCost ?? (card.retreatCost || []).length, prizesOf(card)];
  if (r[3] === 1) r.pop();
  while (r.length && (r[r.length - 1] === "" || r[r.length - 1] === 0)) r.pop();
  return r;
}

// Every source card by what it does, for our prints the source lists under another id
// (promos, stamped and patterned variants, trainer kits): same name, HP and attacks.
// Curly and straight apostrophes count as one ("Hound’s Fang" on our promo, "Hound's Fang" at the source).
const print = (c) => `${c.name}|${c.hp || ""}|${(c.attacks || []).map((a) => a.name).join(",")}`.replace(/[‘’]/g, "'");
const byPrint = new Map();
const cache = new Map();
async function source(setId) {
  if (cache.has(setId)) return cache.get(setId);
  const res = await fetch(`${SRC}${setId}.json`);
  const cards = res.ok ? await res.json() : null;
  cache.set(setId, cards);
  return cards;
}
{
  const sets = await (await fetch(SRC.replace("cards/en/", "sets/en.json"))).json();
  for (let i = 0; i < sets.length; i += 12) {
    const batch = await Promise.all(sets.slice(i, i + 12).map((s) => source(s.id)));
    for (const cards of batch) for (const c of cards || []) if (c.supertype === "Pokémon" && !byPrint.has(print(c))) byPrint.set(print(c), c);
  }
}

const files = readdirSync("data").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
for (const setId of files) {
  if (only.length && !only.includes(setId)) continue;
  let ours;
  try {
    ours = JSON.parse(readFileSync(`data/${setId}.json`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(ours) || !ours[0]?.supertype) continue;
  const pokemon = ours.filter((c) => c.supertype === "Pokémon");
  if (!pokemon.length) continue;
  const theirs = new Map(((await source(setId)) || []).map((c) => [c.id, c]));
  const set = {};
  let missing = 0;
  const names = [];
  for (const card of pokemon) {
    if (!card.id.startsWith(`${setId}-`)) report.push(`${card.id}: id does not start with its file's set id`);
    let hit = theirs.get(card.id);
    if (!hit || hit.name !== card.name) hit = byPrint.get(print(card));
    if (!hit) {
      missing += 1;
      names.push(`${card.id} ${card.name}`);
      continue;
    }
    set[card.id.slice(setId.length + 1)] = row(hit);
  }
  out[setId] = set;
  if (missing) report.push(`${setId}: ${missing} of ${pokemon.length} Pokémon not matched: ${names.slice(0, 6).join(", ")}`);
}

writeFileSync(OUT, JSON.stringify(out));
console.log(`${Object.keys(out).length} sets, ${Object.values(out).reduce((n, s) => n + Object.keys(s).length, 0)} cards -> ${OUT}`);
for (const line of report) console.log(line);
