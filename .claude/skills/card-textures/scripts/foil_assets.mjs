// Does every picture a holo face asks for exist? A map, mask or tile that is missing does not error on the site: the
// layer just paints nothing (or the whole card), which is how a finish "stops working" without anyone touching it.
//   node .claude/skills/card-textures/scripts/foil_assets.mjs          # prints each missing file once, exit 1 if any
// Walks every foil face the way foil_census.mjs does, asks the site's own foilExtras (era and family code included)
// for its classes and custom properties, and checks every assets/ path in the answer against the checkout.
// Step 3 of the general holo system (2026-11-25): the maps a card needs are known from code, so check them by code.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = process.env.ROOT || fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "");
const fm = await import(`${ROOT}/js/foil-maps.js`);
const { SET_BY_ID } = await import(`${ROOT}/js/catalog.js`);
const SKIP = new Set(["box-contents", "gear", "mastery-gifts", "patch-notes", "prices", "products", "pullrates", "sealed", "search-index", "set-accents", "tcgplayer-ids"]);
const REV_R = new Set(["Common", "Uncommon", "Rare", "Rare Holo"]);
const missing = new Map();
let faces = 0, paths = 0;
const seen = new Map();
const check = (text, id) => {
  for (const m of String(text).matchAll(/\/?(assets\/[^"')\s,?]+)/g)) {
    paths += 1;
    if (!seen.has(m[1])) seen.set(m[1], existsSync(`${ROOT}/${m[1]}`));
    if (!seen.get(m[1])) missing.set(m[1], [...(missing.get(m[1]) || []), id]);
  }
};
const walk = (o, id) => {
  if (typeof o === "string") check(o, id);
  else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v, id);
};
for (const f of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json"))) {
  const setId = f.replace(/\.json$/, "");
  if (SKIP.has(setId)) continue;
  let d; try { d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8")); } catch { continue; }
  for (const raw of Array.isArray(d) ? d : d.cards || []) {
    if (!raw?.id) continue;
    for (const reverse of REV_R.has(raw.rarity) && !raw.foilAs ? [false, true] : [false]) {
      const c = fm.foilLook({ ...raw, reverse });
      const set = SET_BY_ID[setId] || Object.values(SET_BY_ID).find((x) => String(raw.id).startsWith(`${x.id}-`));
      let ex;
      try { ex = fm.foilExtras(c, (p) => p, fm.reverseKindOf(c, set)); } catch (e) { console.log(`error ${raw.id}: ${e.message}`); continue; }
      faces += 1;
      walk(ex, raw.id + (reverse ? " (reverse)" : ""));
    }
  }
}
for (const [p, ids] of missing) console.log(`missing ${p}  (${ids.length} faces, e.g. ${ids[0]})`);
console.error(`${faces} faces, ${paths} asset references, ${seen.size} files, ${missing.size} missing`);
process.exit(missing.size ? 1 : 0);
