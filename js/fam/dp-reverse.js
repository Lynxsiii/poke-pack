/**
 * Holo family dp-reverse: DP-era reverse holos.
 *
 * Scope: every Diamond & Pearl, Platinum, HeartGold SoulSilver and Call of Legends reverse holo face (the Mirror):
 * the printed face inside the yellow border, minus the picture (art window, evolution circle, a Special Energy's
 * picture, the Pokemon SP owner portrait), and the Call of Legends basic Energy 88-95 (the Crosshatch: a fine
 * diagonal glint lattice over the whole face but the white ENERGY bar, `dpr-cross`, mask hgss-energy-v2). NOT claimed:
 * a basic Energy of any other set (dp1 123-130, hgss1 115-122: never dealt as a reverse; they stay on the era look).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-reverse` (every rule in css/holo/fam/dp-reverse.css is scoped to it), and the custom property `--dpr-mask`:
 * the card's own foil mask (assets/foil/fam/dp-reverse/<frame>-<layout>.webp, drawn from the site's own scans by
 * scripts/fam/dp-reverse/make_masks.py: white where the real reverse is foil, transparent over the picture and the
 * matte yellow border; the live masks are immutable, a changed one gets a new name, like hgss-energy-v2). The Crosshatch also gets
 * `--dpr-glints` and `--dpr-hatch` (scripts/fam/dp-reverse/make_glints.py). `base` is foilExtras()'s own result. `card` has been through foilLook(). Never import
 * js/foil-maps.js from here (it waits on this module).
 */
import { isDp, dpFrame } from "../dp-foil.js?v=3";

/** The sets a reverse holo is dealt from (isDp also matches dpp, hsp, POP 6-9 and the kits, which are never reverse). */
const DEALT_SET = /^(dp[1-7]|pl[1-4]|hgss[1-4]|col1)-/;

/** The mask's layout name (make_masks.py layout_of(): the SP frame has its own). */
function layout(card) {
  const subs = card.subtypes || [];
  if (subs.includes("SP")) return "sp";
  if (card.supertype === "Trainer") return "trainer";
  if (card.supertype === "Energy" || card.energy) return subs.includes("Special") ? "senergy" : "energy";
  return subs.includes("Stage 1") || subs.includes("Stage 2") || card.evolvesFrom ? "stage" : "basic";
}

/** Call of Legends' Energy Masters (col1 88-95, reverse-only): the Crosshatch. */
const cross = (card) => /^col1-(8[89]|9[0-5])$/.test(String(card.id || "")) && layout(card) === "energy";

/** Whether a card face is this family's: a DP-generation reverse that has a mask (no basic Energy but the Crosshatch). */
export function claims(card) {
  // SP reverses were off after review #1 (the sp mask put foil on the owner portrait); the portrait is a matte hole in dp-sp.webp now.
  return Boolean(card) && Boolean(card.reverse) && isDp(card) && DEALT_SET.test(String(card.id || "")) && (layout(card) !== "energy" || cross(card));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  if (cross(card)) {
    // hgss-energy.webp (the whole face) is live and immutable; -v2 leaves the white ENERGY bar matte.
    const mask = "assets/foil/fam/dp-reverse/hgss-energy-v2.webp";
    const glints = "assets/foil/fam/dp-reverse/glints-v1.webp";
    const hatch = "assets/foil/fam/dp-reverse/hatch-v1.webp";
    return {
      classes: "fam-dp-reverse dpr-cross",
      style: `--dpr-mask:url('${url(mask)}');--dpr-glints:url('${url(glints)}');--dpr-hatch:url('${url(hatch)}')`,
      cure: false,
    };
  }
  const map = `assets/foil/fam/dp-reverse/${dpFrame(card)}-${layout(card)}.webp`;
  return { classes: "fam-dp-reverse", style: `--dpr-mask:url('${url(map)}')`, cure: false };
}
