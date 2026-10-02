/**
 * Print every card face js/fam/xy-ex-mega.js claims, one line per face: "<id>\t<image path>" (the id as the data
 * has it). The mask generators read this list (make_ink_masks.py).
 *
 *   node .claude/skills/card-textures/scripts/fam/xy-ex-mega/list_claimed.mjs > ids.tsv
 */
import { readFileSync, readdirSync } from "node:fs";
const ROOT = process.env.ROOT || new URL("../../../../../../", import.meta.url).pathname;
const mod = await import(`${ROOT}js/fam/xy-ex-mega.js`);
const look = (c) => (c.foilAs ? { ...c, rarity: c.foilAs } : c);
for (const f of readdirSync(`${ROOT}data`).filter((f) => f.endsWith(".json"))) {
  let d;
  try { d = JSON.parse(readFileSync(`${ROOT}data/${f}`, "utf8")); } catch { continue; }
  for (const raw of Array.isArray(d) ? d : d.cards || []) {
    if (raw?.id && mod.claims(look({ ...raw, reverse: false }))) console.log(`${raw.id}\t${raw.image}`);
  }
}
