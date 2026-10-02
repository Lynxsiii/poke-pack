// List every EX reverse-eligible card face of ex5-ex16 that has an art-window map (the family's maps are drawn for them),
// with its scan and its art window (exWindow() in js/ex-foil.js), as JSON for make_ex_reverse_maps.py.
//
//   node .claude/skills/card-textures/scripts/fam/ex-reverse/list_cards.mjs <out.json>
//
// Reverse-eligible: Common, Uncommon, Rare, Rare Holo. A Pokémon-ex frame and a basic Energy have no window and are left out.
// Read-only over the repo; writes only <out.json>.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../../../../..");
const ex = await import(`${ROOT}/js/ex-foil.js`);
const out = [];
for (const f of readdirSync(`${ROOT}/data`).filter((f) => /^ex(5|6|7|8|9|1[0-6])\.json$/.test(f)).sort()) {
  const d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8"));
  for (const c of Array.isArray(d) ? d : d.cards || []) {
    if (!c?.id || !/^(Common|Uncommon|Rare|Rare Holo)$/.test(c.rarity)) continue;
    const win = ex.exWindow(c);
    if (!win) continue;
    out.push({ id: c.id, name: c.name, set: f.replace(".json", ""), rarity: c.rarity, supertype: c.supertype,
      subtypes: c.subtypes || [], image: c.image, map: win });
  }
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`${out.length} faces`);
