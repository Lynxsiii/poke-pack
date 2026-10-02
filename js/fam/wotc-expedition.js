/**
 * Holo family wotc-expedition: Expedition (ecard1) holos and the e-Card reverse.
 *
 * Scope: ecard1 Rare Holo (`wotc-ecard`) and the e-Card reverse holo of all three e-Card sets (ecard1, ecard2, ecard3).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-wotc-expedition` (every rule in css/holo/fam/wotc-expedition.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What the faces get (research, photos and sheets: /mnt/project-files/holo-remaster/wotc-expedition/; the family note:
 * .claude/skills/card-textures/reference/fam-wotc-expedition.md):
 * - Expedition Rare Holo (ecard1 1-32), class `exp-holo`: its own foil map as `--foil-map`
 *   (assets/foil/fam/wotc-expedition/holo-ecard1-<n>-v1.webp, scripts/fam/wotc-expedition/make_holo_maps.py): alpha = where the
 *   print is foil (the window background the holo print drops or thins to bare foil, plus the ladder marks, the 13 strip
 *   slots and the gold e logo; the Pokemon cut out), RGB = the scan's own cosmos dots and clusters, lit by the CSS.
 * - e-Card reverse (ecard1-ecard3), class `exp-rev`: the whole face but the art window, bottom strip included (the layout
 *   masks are picked in the CSS from foil-trainer / foil-energy; Basic Energy adds `exp-basic`, whose art runs down to the
 *   strip).
 * - The reverse of an Expedition Rare Holo also gets `exp-twin` and `--exp-scan` / `--exp-scan-sm`: the real reverse print
 *   shows the non-holo twin's art in its window (Charizard 6 = 40's aurora), not the holo's starfield, so the CSS swaps the
 *   face's picture for the holo frame with the twin's window (make_rev_scans.py).
 */
import { isWotc, wotcPattern } from "../wotc-foil.js?v=6";

const set = (card) => String(card?.id || "").split("-")[0];
const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/wotc-expedition/";

/** The Expedition Rare Holos (ecard1 1-32): every one has a drawn map and a reverse face with its twin's window. */
const holoNumber = (card) => {
  const m = /^ecard1-(\d+)$/.exec(String(card?.id || ""));
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 32 && card.rarity === "Rare Holo" ? n : 0;
};

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && isWotc(card) && ((!card.reverse && set(card) === "ecard1" && has(wotcPattern(card), "wotc-ecard")) || (card.reverse && /^ecard[123]$/.test(set(card))));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const n = holoNumber(card);
  if (card.reverse) {
    const basic = card.supertype === "Energy" && (card.subtypes || []).includes("Basic");
    if (!n) return { classes: `fam-wotc-expedition exp-rev${basic ? " exp-basic" : ""}`, style: "", cure: false };
    return {
      classes: "fam-wotc-expedition exp-rev exp-twin",
      style: `--exp-scan:url('${url(`${DIR}rev-scan-ecard1-${n}-v1.webp`)}');--exp-scan-sm:url('${url(`${DIR}rev-scan-ecard1-${n}-sm-v1.webp`)}')`,
      cure: false,
    };
  }
  if (!n) return { classes: "fam-wotc-expedition", style: "", cure: false };
  return { classes: "fam-wotc-expedition exp-holo", style: `--foil-map:url('${url(`${DIR}holo-ecard1-${n}-v1.webp`)}')`, cure: false };
}
