// Every holo face the site draws, with its finish classes and the holo family that claims it.
//   node .claude/skills/card-textures/scripts/foil_census.mjs > census.json   (ROOT=<checkout> for another tree)
// NOTE: foilLook/foilClass/foilPattern below are a copy of js/app.js's (the lab holds a third copy); keep them in step until the
// classifier moves into one shared module.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = process.env.ROOT || fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "");
const fm = await import(`${ROOT}/js/foil-maps.js`);
const { HIT_RARITIES } = await import(`${ROOT}/js/engine.js`);
const reg = await import(`${ROOT}/js/holo-fam.js`);
const mods = await Promise.all(reg.FAMILIES.map(([n, v]) => import(`${ROOT}/js/fam/${n}.js?v=${v}`).then((m) => [n, m])));
const { isBw, isDp, isSm, isSwsh, isWotc, isXy, bwPattern, dpPattern, exPattern, smPattern, swshPattern, wotcPattern, xyPattern } = fm;
const isExEra = fm.isEx;
const CLASSIC_FULL_FOIL = /(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND)$/i;
const isEx = (c) => (c.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(c.name || "");
const hasEvo = (c) => (c.subtypes || []).some((s) => s === "Stage 1" || s === "Stage 2") || Boolean(c.evolvesFrom);
const ALL_FOIL = new Set(["me55"]);
let setId = "";
const allFoil = (c) => ALL_FOIL.has(setId) && !c.energy && c.supertype !== "Energy";
function foilLook(card) {
  if (!card?.foilAs || card.reverse) return card;
  if (card.foilAs === "Frame") return { ...card, rarity: "Common", reverse: true, reverseKind: "cosmos" };
  if (card.foilAs === "Reverse Cosmos") return { ...card, rarity: "Common", reverse: true, reverseKind: "galaxy" };
  if (card.foilAs === "Poke Ball") return { ...card, rarity: "Rare", reverse: true, reverseKind: "pokeball" };
  return { ...card, rarity: card.foilAs };
}
function foilClass(c) {
  if (c.reverse || c.pattern) return "rare-glow";
  if (isSwsh(c) && (!c.foilAs || c.era === "swsh") && swshPattern(c) === "foil-none") return "";
  if (isSm(c) && (!c.foilAs || c.era === "sm") && smPattern(c) === "foil-none") return "";
  if (isXy(c) && (!c.foilAs || c.era === "xy")) { const xy = xyPattern(c); if (xy === "foil-none") return ""; if (xy.includes("xy-rc")) return "holo"; }
  if (isBw(c) && (!c.foilAs || c.era === "bw")) { const bw = bwPattern(c); if (bw === "foil-none") return ""; if (bw.includes("bw-rc") || bw.includes("bw-vault")) return "holo"; }
  if (isDp(c) && (!c.foilAs || c.era === "dp")) { if (dpPattern(c) === "foil-none") return ""; }
  if (isExEra(c) && (!c.foilAs || c.era === "ex")) { const ex = exPattern(c); if (ex === "foil-none") return ""; if (/\bex-(energy|unown|kit)\b/.test(ex)) return "holo"; }
  if (isWotc(c) && (!c.foilAs || c.era === "wotc")) { if (wotcPattern(c) === "foil-none") return ""; }
  if (HIT_RARITIES.has(c.rarity) || ["Rare", "Rare Holo", "Pikachu Rare", "Cosmos", "Metal", "Confetti"].includes(c.rarity) || allFoil(c)) return "holo";
  return "";
}
function foilPattern(c) {
  if (c.reverse) return c.reverseKind && c.reverseKind !== "cosmos" ? `foil-reverse foil-rev-${c.reverseKind}` : "foil-reverse";
  const r = c.rarity;
  if (c.pattern) return `foil-reverse foil-rev-${c.pattern} foil-prism`;
  if (isSwsh(c) && (!c.foilAs || c.era === "swsh") && swshPattern(c)) return swshPattern(c);
  if (isSm(c) && (!c.foilAs || c.era === "sm") && smPattern(c)) return smPattern(c);
  if (isXy(c) && (!c.foilAs || c.era === "xy") && xyPattern(c)) return xyPattern(c);
  if (isBw(c) && (!c.foilAs || c.era === "bw") && bwPattern(c)) return bwPattern(c);
  if (isDp(c) && (!c.foilAs || c.era === "dp") && dpPattern(c)) return dpPattern(c);
  if (isExEra(c) && (!c.foilAs || c.era === "ex") && exPattern(c)) return exPattern(c);
  if (isWotc(c) && (!c.foilAs || c.era === "wotc") && wotcPattern(c)) return wotcPattern(c);
  if (r === "Shiny Ultra Rare") return "foil-ultra foil-shiny";
  if (r === "Shiny Rare") return "foil-holo foil-shiny";
  if (c.finish === "scodix") return "foil-gold foil-scodix";
  if (r === "Mega Hyper Rare" || r === "Hyper Rare") return "foil-gold";
  if (c.foilMap && (c.subtypes || []).includes("Tera") && (r === "Double Rare" || r === "Ultra Rare")) return r === "Ultra Rare" ? "foil-ultra foil-tera" : "foil-ex foil-tera";
  if (r === "Special Illustration Rare") return "foil-sir";
  if (r === "Illustration Rare") return "foil-ir";
  if (r === "Ultra Rare") return "foil-ultra";
  if (r === "Mega Attack Rare") return "foil-mega-attack";
  if (r === "Black White Rare") return "foil-bwr";
  if (r === "Futuristic Rare") return "foil-future";
  if (r === "RGB Rare") return "foil-future foil-rgb";
  if (r === "Classic Collection") return `${CLASSIC_FULL_FOIL.test(c.name || "") ? "foil-ultra" : "foil-holo"} foil-classic`;
  if (r === "Pikachu Rare") return "foil-holo foil-pikachu";
  if (r === "Cosmos") return "foil-holo foil-cosmos";
  if (r === "Metal") return "foil-metal";
  if (r === "Confetti") return "foil-holo foil-confetti";
  if (r === "ACE SPEC Rare") return c.foilMap ? "foil-holo foil-acespec" : "foil-holo";
  if (isEx(c) && (HIT_RARITIES.has(r) || r === "Rare")) return c.foilMap && r === "Double Rare" ? "foil-ex foil-sunpillar" : "foil-ex";
  if (c.supertype === "Trainer" && HIT_RARITIES.has(r)) return "foil-ex";
  if (r === "Rare" && c.foilMap) return "foil-holo foil-svholo";
  if (HIT_RARITIES.has(r) || r === "Rare") return "foil-holo";
  if (allFoil(c)) return c.foilMap ? "foil-holo foil-rainbow" : "foil-holo";
  return "foil-none";
}
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
      const fc = foilClass(c);
      const pattern = foilPattern(c);
      let ex; try { ex = fm.foilExtras(c, url, c.reverseKind || ""); } catch (e) { ex = { classes: "ERR " + e.message }; }
      let family = "";
      for (const [n, m] of mods) { try { if (m.famExtras?.(c, url, fm.eraFoilExtras(c, url, c.reverseKind || ""))) { family = n; break; } } catch {} }
      // The app paints the pattern classes and the family's classes even when foilClass is "" (a "Promo" with a WotC
      // pattern, Southern Islands' family foil), so keep a face with a real pattern or a claiming family.
      const none = !pattern || pattern === "foil-none";
      if (none && !family && (!fc || !reverse)) continue;
      out.push({ id: raw.id, set: setId, n: raw.number, name: raw.name, rarity: c.rarity, sub: (raw.subtypes || []).join("/"), era: era(c), reverse, pattern, classes: ex.classes, family, img: raw.image });
    }
  }
}
process.stdout.write(JSON.stringify(out));
