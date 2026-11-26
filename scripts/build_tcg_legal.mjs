#!/usr/bin/env node
/**
 * Builds data/tcg/legal.json: the regulation mark each print carries, and which Trainer and
 * Special Energy texts have a print legal in Standard or Expanded (js/tcg/formats.js reads both).
 *
 *   node scripts/build_tcg_legal.mjs [cacheDir]
 *
 * Marks come from two sources, per card:
 *   1. github.com/PokemonTCG/pokemon-tcg-data (cards/en/<set>.json `regulationMark`), whose ids match ours;
 *   2. TCGdex (api.tcgdex.net/v2/en/cards?regulationMark=X), matched by set and number.
 * Where both have the card and disagree, the older (earlier-rotating) mark wins: the safer reading.
 * Where neither has it, the set's own mark is used if every card of the set that is known carries the
 * same one, or the fallback below; otherwise the print has no mark (not legal in Standard).
 *
 * Shape:
 *   { asOf, marks: { "<setId>": { "<key>": "H" } },   ("_" a set's default; "-" Sword & Shield era or later, mark unknown)
 *     reprints: { standard: { "<name>": [key] }, expanded: { ... } },
 *     notes: { "<setId>": "why its marks are what they are" } }
 * A reprint key is js/tcg/formats.js reprintKeys: a hash of the print's text (data/tcg/trainers.json)
 * or of what the game reads it to do. Run after scripts/build_tcg_trainers.mjs.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { defineCard } from "../js/tcg/cards.js";
import { deckName, printProblem, reprintKeys } from "../js/tcg/formats.js";

const OUT = "data/tcg/legal.json";
const CACHE = process.argv[2] || "";
const PTCG = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/";
const TCGDEX = "https://api.tcgdex.net/v2/en/cards?regulationMark=";
const MARKS = ["D", "E", "F", "G", "H", "I", "J"];

// Our set id -> TCGdex set id.
const TCGDEX_SET = {
  swsh35: "swsh3.5", swsh45: "swsh4.5", swsh12pt5: "swsh12.5", pgo: "swsh10.5", cel25: "cel25",
  sv3pt5: "sv03.5", sv4pt5: "sv04.5", sv6pt5: "sv06.5", sv8pt5: "sv08.5", sv10: "sv10", rsv10pt5: "sv10.5w", zsv10pt5: "sv10.5b",
  me1: "me01", me2: "me02", me2pt5: "me02.5", me3: "me03", me4: "me04", me5: "me05", me55: "30th", me6: "me06",
  mcd23: "2023sv", mcd24: "2024sv", svp: "svp", swshp: "swshp", mep: "mep",
};
for (let i = 1; i <= 12; i += 1) TCGDEX_SET[`swsh${i}`] = `swsh${i}`;
for (let i = 1; i <= 9; i += 1) TCGDEX_SET[`sv${i}`] = `sv0${i}`;
// Set codes on stamped prints filed under another set ("sv9-jtg004").
const CODE_SET = { jtg: "sv09", dri: "sv10", tef: "sv05", wht: "sv10.5w", blk: "sv10.5b", meg: "me01", pfl: "me02", asc: "me02.5", por: "me03", cri: "me04" };

// The sets this game files from the Sword & Shield era on: only these carry marks.
const MARKED = (meta) => ["sword-shield", "scarlet-violet", "mega-evolution"].includes(meta.series) || /^(mcd2[3-9]|tot2\d)$/.test(meta.id);
// Where no source has the card. Each is the safer reading of what the sources below say.
const FALLBACK = {
  me6: ["J", "Delta Reign (November 6, 2026): every card carries J (Bulbapedia's 2026-27 Standard list; a release guide). Neither card source has its marks yet."],
  mcd23: ["G", "McDonald's Collection 2023: rotated with G (Bulbapedia 2026-27 Standard format)."],
  mcd24: ["H", "McDonald's Collection 2024: legal in 2026-27 Standard (Bulbapedia)."],
  mcd26: ["J", "McDonald's Collection 2026: legal in 2026-27 Standard (Bulbapedia); mark not in either card source."],
  tot23: ["G", "Trick or Trade 2023: reprints of G-era cards; no source lists the marks, so counted as rotated."],
  tot24: ["G", "Trick or Trade 2024: no source lists the marks, so counted as rotated (safer reading)."],
};

const cached = async (name, url) => {
  const file = CACHE && `${CACHE}/${name.replace(/[^a-z0-9.-]/gi, "_")}`;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(url);
  const body = res.ok ? await res.json() : null;
  if (file) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(body));
  }
  return body;
};

const num = (s) => {
  const m = String(s).match(/^([A-Za-z]*)0*(\d+)$/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : String(s).toUpperCase();
};

// TCGdex: "<set>|<number>" -> mark.
const dex = new Map();
for (const mark of MARKS) {
  for (const c of (await cached(`tcgdex-${mark}.json`, TCGDEX + mark)) || []) {
    const at = c.id.lastIndexOf("-");
    dex.set(`${c.id.slice(0, at)}|${num(c.localId)}`, mark);
  }
}

/** Where TCGdex files one of our prints: [set, number] or null. */
function dexKey(setId, key) {
  const k = key.split("-")[0];
  let m;
  if ((m = k.match(/^svp(\d+)$/))) return ["svp", num(m[1])];
  if ((m = k.match(/^swshp(\d+)$/))) return ["swshp", `SWSH${Number(m[1])}`];
  if ((m = k.match(/^mep(\d+)$/))) return ["mep", num(m[1])];
  if ((m = k.match(/^([a-z]{3})(\d+)$/)) && CODE_SET[m[1]]) return [CODE_SET[m[1]], num(m[2])];
  if ((m = k.match(/^TG(\d+)$/))) return [`${TCGDEX_SET[setId]}tg`, `TG${Number(m[1])}`];
  if ((m = k.match(/^GG(\d+)$/))) return ["swsh12.5gg", `GG${Number(m[1])}`];
  if ((m = k.match(/^SV(\d+)$/)) && setId === "swsh45") return ["swsh4.5sv", `SV${Number(m[1])}`];
  if (/^\d+$/.test(k) && TCGDEX_SET[setId]) return [TCGDEX_SET[setId], num(k)];
  return null;
}

const older = (a, b) => (!a ? b : !b ? a : MARKS.indexOf(a) <= MARKS.indexOf(b) ? a : b);

const metas = Object.fromEntries(readdirSync("data/sets").filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`data/sets/${f}`, "utf8"))]));
const trainers = JSON.parse(readFileSync("data/tcg/trainers.json", "utf8"));
const marks = {};
const notes = {};
const all = [];
let both = 0, disagree = 0, onlyOne = 0, none = 0;
for (const [setId, meta] of Object.entries(metas)) {
  let cards;
  try {
    cards = JSON.parse(readFileSync(`data/${setId}.json`, "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(cards)) continue;
  for (const card of cards) all.push({ setId, card });
  if (!MARKED(meta)) continue;
  const ptcg = new Map(((await cached(`ptcg-${setId}.json`, `${PTCG}${setId}.json`)) || []).map((c) => [c.id, c.regulationMark || ""]));
  const out = {};
  const unknown = [];
  for (const card of cards) {
    const key = card.id.slice(setId.length + 1);
    if (card.rarity === "Classic Collection" || /^cc\d/.test(key)) continue;
    const baseId = card.base || card.id;
    const baseKey = baseId.slice(baseId.indexOf("-") + 1);
    const a = ptcg.get(baseId) || "";
    const at = dexKey(setId, baseKey);
    const b = (at && dex.get(`${at[0]}|${at[1]}`)) || "";
    if (a && b) both += 1;
    else if (a || b) onlyOne += 1;
    if (a && b && a !== b) {
      disagree += 1;
      console.log(`  ${card.id} ${card.name}: pokemon-tcg-data ${a}, TCGdex ${b}`);
    }
    const mark = older(a, b);
    if (mark) out[key] = mark;
    else unknown.push(key);
  }
  const seen = new Set(Object.values(out));
  const fallback = FALLBACK[setId];
  if (unknown.length) {
    if (fallback) {
      out._ = fallback[0];
      notes[setId] = fallback[1];
    } else if (seen.size === 1 && !/p$/.test(setId)) {
      out._ = [...seen][0];
      notes[setId] = `${unknown.length} print(s) with no mark in either source take the set's only mark, ${out._}.`;
    } else {
      none += unknown.length;
      // "-": printed in the Sword & Shield era or later (so legal in Expanded), mark unknown (so not in Standard).
      for (const key of unknown) out[key] = "-";
      notes[setId] = `${unknown.length} print(s) with no mark in either source: legal in Expanded, not counted as Standard legal (${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? ", ..." : ""}).`;
    }
  }
  if (Object.keys(out).length) marks[setId] = out;
}

// Trainer and Special Energy texts with a print legal by itself in each format (Handbook 4.1.3).
const reprints = { standard: {}, expanded: {} };
for (const { setId, card } of all) {
  if (card.supertype !== "Trainer" && !(card.supertype === "Energy" && !(card.subtypes || []).includes("Basic"))) continue;
  const key = card.id.slice(setId.length + 1);
  const text = trainers.texts[trainers.cards?.[setId]?.[key]];
  if (!text) continue;
  const def = { ...defineCard(card, undefined, text, trainers.lines), mark: marks[setId]?.[key] ?? marks[setId]?._ ?? "" };
  for (const format of Object.keys(reprints)) {
    if (printProblem(def, format)) continue;
    const list = (reprints[format][deckName(card.name)] ||= []);
    for (const k of reprintKeys(def)) if (!list.includes(k)) list.push(k);
  }
}
for (const f of Object.values(reprints)) for (const list of Object.values(f)) list.sort();

const asOf = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ asOf, marks, reprints, notes })}\n`);
console.log(`${OUT}: marks for ${Object.values(marks).reduce((n, s) => n + Object.keys(s).length, 0)} prints in ${Object.keys(marks).length} sets`);
console.log(`  both sources ${both}, one source ${onlyOne}, disagreeing ${disagree} (older mark kept), no mark ${none}`);
console.log(`  reprint names: Standard ${Object.keys(reprints.standard).length}, Expanded ${Object.keys(reprints.expanded).length}`);
for (const [set, note] of Object.entries(notes)) console.log(`  ${set}: ${note}`);
