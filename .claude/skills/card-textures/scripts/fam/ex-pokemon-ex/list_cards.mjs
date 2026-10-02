/**
 * List the faces the ex-pokemon-ex holo family claims, as JSON, for make_ex_pokemon_ex_maps.py.
 *
 * Usage (from the repo root): node .claude/skills/card-textures/scripts/fam/ex-pokemon-ex/list_cards.mjs > /tmp/cards.json
 *
 * Every card of data/*.json goes through the site's foilLook() rewrite (a promo takes its foilAs rarity), then the family's
 * own claims() (js/fam/ex-pokemon-ex.js) decides. Per face it prints what the map generator needs, read from the site's
 * own EX module (js/ex-foil.js) so the two never disagree:
 *   id, set, image   the scan the map is registered to;
 *   stage            true when the frame prints the evolution ring (exExLayout: Stage 1/2 or an evolvesFrom);
 *   windowOnly       true for the yellow-bordered np001/np002 promos (the era's map is the art window alone);
 *   cracked          true for the cracked-ice prints (exPattern has ex-cracked-ice).
 * Read-only: writes nothing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const fam = await import(`${ROOT}/js/fam/ex-pokemon-ex.js`);
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
    if (!fam.claims(card)) continue;
    const pattern = ` ${ex.exPattern(card)} `;
    const map = ex.exMap(card) || "";
    out.push({
      id: card.id,
      set: card.id.split("-")[0],
      image: card.image,
      name: card.name,
      stage: /Stage [12]/.test((card.subtypes || []).join(" ")) || Boolean(card.evolvesFrom),
      windowOnly: map.includes("/win-"),
      cracked: pattern.includes(" ex-cracked-ice "),
    });
  }
}
console.log(JSON.stringify(out, null, 1));
