/**
 * List the faces the ex-gold-star holo family draws, as JSON, for make_ex_gold_star_maps.py.
 *
 * Usage (from the repo root): node .claude/skills/card-textures/scripts/fam/ex-gold-star/list_cards.mjs > /tmp/gs-cards.json
 *
 * Every card of data/*.json goes through the site's foilLook() rewrite, then the family's own claims() and its list of
 * faces with a map (js/fam/ex-gold-star.js). With `--all` it lists every Gold Star (the refractor stars too, which the
 * family leaves to ex-delta-holon). Read-only: writes nothing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const all = process.argv.includes("--all");
const ex = await import(`${ROOT}/js/ex-foil.js`);

const foilLook = (c) => (c.foilAs && !c.reverse ? { ...c, rarity: c.foilAs } : c);
const out = [];
for (const file of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json")).sort()) {
  let data;
  try {
    data = JSON.parse(readFileSync(`${ROOT}/data/${file}`, "utf8"));
  } catch {
    continue;
  }
  for (const raw of Array.isArray(data) ? data : data.cards || []) {
    if (!raw?.id) continue;
    const card = foilLook({ ...raw, reverse: false });
    if (!ex.isEx(card) || !` ${ex.exPattern(card)} `.includes(" ex-star ")) continue;
    const refractor = ` ${ex.exPattern(card)} `.includes(" ex-refractor ");
    if (refractor && !all) continue;
    out.push({ id: card.id, set: card.id.split("-")[0], image: card.image, name: card.name, refractor });
  }
}
console.log(JSON.stringify(out, null, 1));
