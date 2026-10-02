/**
 * Holo family dp-reverse: DP-era reverse holos.
 *
 * Scope: every Diamond & Pearl, Platinum, HeartGold SoulSilver and Call of Legends reverse holo face (the Mirror):
 * the printed face inside the yellow border, minus the picture (art window, evolution circle, a Special Energy's
 * picture). NOT the Call of Legends basic-Energy Crosshatch (col1 88-95, `dp-rev-cross`) and not a basic Energy of
 * another set: those stay on the era look (dp.css), the Crosshatch pattern is not re-researched here.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-reverse` (every rule in css/holo/fam/dp-reverse.css is scoped to it), and one custom property, `--dpr-mask`:
 * the card's own foil mask (assets/foil/fam/dp-reverse/<frame>-<layout>.webp, drawn from the site's own scans by
 * scripts/fam/dp-reverse/make_masks.py: white where the real reverse is foil, transparent over the picture and the
 * matte yellow border). `base` is foilExtras()'s own result. `card` has been through foilLook(). Never import
 * js/foil-maps.js from here (it waits on this module).
 */
import { isDp, dpFrame } from "../dp-foil.js?v=3";

/** The mask's layout name (make_masks.py layout_of(): the SP frame has its own). */
function layout(card) {
  const subs = card.subtypes || [];
  if (subs.includes("SP")) return "sp";
  if (card.supertype === "Trainer") return "trainer";
  if (card.supertype === "Energy" || card.energy) return subs.includes("Special") ? "senergy" : "energy";
  return subs.includes("Stage 1") || subs.includes("Stage 2") || card.evolvesFrom ? "stage" : "basic";
}

/** Whether a card face is this family's: a DP-generation reverse that has a Mirror mask (no basic Energy). */
export function claims(card) {
  // SP reverses keep the era look after review #1 (2026-10-02): the sp mask put foil on the owner-portrait disc.
  return Boolean(card) && Boolean(card.reverse) && isDp(card) && layout(card) !== "energy" && layout(card) !== "sp";
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const map = `assets/foil/fam/dp-reverse/${dpFrame(card)}-${layout(card)}.webp`;
  return { classes: "fam-dp-reverse", style: `--dpr-mask:url('${url(map)}')`, cure: false };
}
