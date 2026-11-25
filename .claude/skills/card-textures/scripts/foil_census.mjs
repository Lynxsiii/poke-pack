// Every holo face the site draws, with its finish classes and the holo family that claims it.
//   node .claude/skills/card-textures/scripts/foil_census.mjs > census.json   (ROOT=<checkout> for another tree)
// The finish of each face comes from the site's own classifier (js/foil-maps.js "The finish classifier"), the same
// code the app runs.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = process.env.ROOT || fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "");
const fm = await import(`${ROOT}/js/foil-maps.js`);
const reg = await import(`${ROOT}/js/holo-fam.js`);
const { SET_BY_ID } = await import(`${ROOT}/js/catalog.js`);
const mods = await Promise.all(reg.FAMILIES.map(([n, v]) => import(`${ROOT}/js/fam/${n}.js?v=${v}`).then((m) => [n, m])));
const { isBw, isDp, isSm, isSwsh, isWotc, isXy, foilLook, foilClass, foilPattern, reverseKindOf } = fm;
const isExEra = fm.isEx;
let setId = "";
const era = (c) => isSwsh(c) ? "swsh" : isSm(c) ? "sm" : isXy(c) ? "xy" : isBw(c) ? "bw" : isDp(c) ? "dp" : isExEra(c) ? "ex" : isWotc(c) ? "wotc" : /^me/.test(c.id) ? "me" : /^[zr]?sv/.test(c.id) ? "sv" : "other";
const url = (p) => p;
const out = [];
const SKIP = new Set(["box-contents", "gear", "mastery-gifts", "patch-notes", "prices", "products", "pullrates", "sealed", "search-index", "set-accents", "tcgplayer-ids"]);
const REV_R = new Set(["Common", "Uncommon", "Rare", "Rare Holo"]);
for (const f of readdirSync(`${ROOT}/data`).filter((f) => f.endsWith(".json"))) {
  setId = f.replace(/\.json$/, "");
  if (SKIP.has(setId)) continue;
  let d; try { d = JSON.parse(readFileSync(`${ROOT}/data/${f}`, "utf8")); } catch { continue; }
  const cards = Array.isArray(d) ? d : d.cards || [];
  for (const raw of cards) {
    if (!raw?.id) continue;
    const faces = [false];
    if (REV_R.has(raw.rarity) && !raw.foilAs) faces.push(true);
    for (const reverse of faces) {
      const c = foilLook({ ...raw, reverse });
      const set = SET_BY_ID[setId] || Object.values(SET_BY_ID).find((x) => String(raw.id).startsWith(`${x.id}-`));
      const fc = foilClass(c, set);
      const pattern = foilPattern(c, set);
      const kind = reverseKindOf(c, set);
      let ex; try { ex = fm.foilExtras(c, url, kind); } catch (e) { ex = { classes: "ERR " + e.message }; }
      let family = "";
      for (const [n, m] of mods) { try { if (m.famExtras?.(c, url, fm.eraFoilExtras(c, url, kind))) { family = n; break; } } catch {} }
      // The app paints the pattern classes and the family's classes even when foilClass is "" (a "Promo" with a WotC
      // pattern, Southern Islands' family foil), so keep a face with a real pattern or a claiming family.
      const none = !pattern || pattern === "foil-none";
      if (none && !family && (!fc || !reverse)) continue;
      out.push({ id: raw.id, set: setId, n: raw.number, name: raw.name, rarity: c.rarity, reverseKind: kind, sub: (raw.subtypes || []).join("/"), era: era(c), reverse, pattern, classes: ex.classes, family, img: raw.image });
    }
  }
}
process.stdout.write(JSON.stringify(out));
