#!/usr/bin/env node
/**
 * Adds `lines` to data/tcg/trainers.json: for each Stage 1 Pokémon name, the
 * names it evolves from. Rare Candy puts a Stage 2 straight onto a Basic
 * Pokémon, and a Stage 2 card names only its Stage 1, so the game needs the step
 * in between (js/tcg/cards.js turns it into `roots` on each Stage 2).
 *
 * Built from our own card files, no network. Run after adding a set, and after
 * scripts/build_tcg_trainers.mjs (which keeps the lines it finds already there):
 *
 *   node scripts/build_tcg_lines.mjs
 *
 * Shape: { ..., lines: { "Kirlia": ["Ralts"], ... } }
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const OUT = "data/tcg/trainers.json";
const lines = new Map();
for (const file of readdirSync("data").filter((f) => f.endsWith(".json"))) {
  let list;
  try {
    list = JSON.parse(readFileSync(`data/${file}`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(list) || !list[0]?.supertype) continue;
  for (const card of list) {
    if (card.supertype !== "Pokémon" || !(card.subtypes || []).includes("Stage 1") || !card.evolvesFrom || card.evolvesFrom === card.name) continue;
    if (!lines.has(card.name)) lines.set(card.name, new Set());
    lines.get(card.name).add(card.evolvesFrom);
  }
}
const data = JSON.parse(readFileSync(OUT, "utf8"));
data.lines = Object.fromEntries([...lines].sort(([a], [b]) => a.localeCompare(b)).map(([name, from]) => [name, [...from].sort()]));
writeFileSync(OUT, JSON.stringify(data));
console.log(`${lines.size} Stage 1 names -> ${OUT} (lines)`);
