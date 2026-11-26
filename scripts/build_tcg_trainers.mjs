#!/usr/bin/env node
/**
 * Builds data/tcg/trainers.json: what each Trainer card and each Special Energy
 * card says. Our card files carry the name and picture but not the text, and the
 * game needs the text.
 *
 * Source: github.com/PokemonTCG/pokemon-tcg-data (cards/en/<set>.json), whose
 * card ids match ours. Run after adding a set:
 *
 *   node scripts/build_tcg_trainers.mjs
 *
 * Shape (the same text is printed on many cards, so it is stored once):
 *   { texts: ["Heal 30 damage from 1 of your Pokémon.", ...],
 *     cards: { "<setId>": { "<card id after the dash>": index into texts } } }
 * The lines every Trainer of a kind shares ("You may play only 1 Supporter card
 * during your turn.") are left out: the engine knows those rules by the card's kind.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const SRC = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/";
const OUT = "data/tcg/trainers.json";

const BOILERPLATE = [
  /^You may play only 1 Supporter card during your turn/i,
  /^You may play any number of Item cards during your turn/i,
  /^You can play only one Supporter card each turn/i,
  /^You may play as many Item cards as you like during your turn/i,
  /^This (?:card|Stadium) stays in play when you play it/i,
  /^You may play only 1 Stadium card during your turn/i,
  /^Attach a Pokémon Tool to 1 of your Pokémon that doesn't already have a Pokémon Tool attached/i,
  /^You may attach any number of Pokémon Tools to your Pokémon during your turn/i,
  /^You may play only 1 ACE SPEC card/i,
  /^You can't have more than 1 ACE SPEC card in your deck/i,
];
const textOf = (card) => (card.rules || []).map((r) => r.replace(/\s+/g, " ").trim()).filter((r) => r && !BOILERPLATE.some((b) => b.test(r))).join(" ");

/** Trainers, and Energy that isn't basic (Special Energy says what it does in its rules text). */
const wanted = (c) => c.supertype === "Trainer" || (c.supertype === "Energy" && !(c.subtypes || []).includes("Basic"));

const cache = new Map();
async function source(setId) {
  if (cache.has(setId)) return cache.get(setId);
  const res = await fetch(`${SRC}${setId}.json`);
  const cards = res.ok ? await res.json() : null;
  cache.set(setId, cards);
  return cards;
}

// A fallback for our prints the source files under another id: the newest text under that name.
const byName = new Map();
{
  const sets = await (await fetch(SRC.replace("cards/en/", "sets/en.json"))).json();
  sets.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
  for (let i = 0; i < sets.length; i += 12) {
    const batch = await Promise.all(sets.slice(i, i + 12).map((s) => source(s.id)));
    for (const cards of batch) for (const c of cards || []) if (wanted(c) && textOf(c)) byName.set(c.name, c);
  }
}

const texts = [];
const at = new Map();
const cards = {};
const report = [];
let total = 0;
for (const setId of readdirSync("data").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))) {
  let ours;
  try {
    ours = JSON.parse(readFileSync(`data/${setId}.json`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(ours) || !ours[0]?.supertype) continue;
  const trainers = ours.filter(wanted);
  if (!trainers.length) continue;
  const theirs = new Map(((await source(setId)) || []).map((c) => [c.id, c]));
  const set = {};
  const missing = [];
  for (const card of trainers) {
    let hit = theirs.get(card.id);
    if (!hit || hit.name !== card.name || !textOf(hit)) hit = byName.get(card.name);
    const text = hit ? textOf(hit) : "";
    if (!text) {
      missing.push(card.name);
      continue;
    }
    if (!at.has(text)) {
      at.set(text, texts.length);
      texts.push(text);
    }
    set[card.id.slice(setId.length + 1)] = at.get(text);
    total += 1;
  }
  if (Object.keys(set).length) cards[setId] = set;
  if (missing.length) report.push(`${setId}: ${missing.length} of ${trainers.length} Trainers without text: ${missing.slice(0, 5).join(", ")}`);
}

writeFileSync(OUT, JSON.stringify({ texts, cards }));
console.log(`${total} Trainers and Special Energy, ${texts.length} different texts -> ${OUT}`);
for (const line of report) console.log(line);
