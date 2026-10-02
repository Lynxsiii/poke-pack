// List every card face the ex-cosmos-holo family draws (js/fam/ex-cosmos-holo.js claims it and no earlier family in
// js/holo-fam.js does), with its scan, its era window map (exMap() in js/ex-foil.js) and its EX pattern classes, as
// JSON for make_ex_cosmos_maps.py.
//
//   node .claude/skills/card-textures/scripts/fam/ex-cosmos-holo/list_cards.mjs <out.json>
//
// Read-only over the repo; writes only <out.json>.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../../../..");
const ex = await import(`${ROOT}/js/ex-foil.js`);
const reg = await import(`${ROOT}/js/holo-fam.js`);
const mods = await Promise.all(reg.FAMILIES.map(([n]) => import(`${ROOT}/js/fam/${n}.js`).then((m) => [n, m])));
const out = [];
for (const f of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json")).sort()) {
  let d;
  try { d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8")); } catch { continue; }
  const cards = Array.isArray(d) ? d : d.cards || [];
  for (const raw of cards) {
    if (!raw?.id) continue;
    // foilLook(): a promo draws as its foilAs rarity
    const c = raw.foilAs ? { ...raw, rarity: raw.foilAs, reverse: false } : { ...raw, reverse: false };
    let first = null;
    for (const [n, m] of mods) { if (m.claims?.(c)) { first = n; break; } }
    if (first !== "ex-cosmos-holo") continue;
    out.push({ id: c.id, name: c.name, file: f, rarity: raw.rarity, foilAs: raw.foilAs || "", supertype: c.supertype,
      image: c.image, pattern: ex.exPattern(c), map: ex.exMap(c) });
  }
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`${out.length} faces`);
