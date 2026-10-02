/**
 * Holo family dp-prime: Prime (HeartGold & SoulSilver).
 *
 * Scope: every `dp-prime` print that has a drawn map (the 26 numbered Primes of hgss1-hgss4 and the HGSS promos 07-09).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-dp-prime` (every rule in css/holo/fam/dp-prime.css is scoped to it), the family's own custom properties
 * (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` for the extra
 * `.cure` layer (the gold foil lettering). `base` is foilExtras()'s own result for the same face. `card` has been
 * through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * Maps (assets/foil/fam/dp-prime/, scripts/fam/dp-prime/make_prime_maps.py): `<id>-zones-v1.webp` is the frame (alpha 1 =
 * bare mirror foil band, 0.59 = white ink over foil: spikes and plates), `<id>-gold-v1.webp` the gold foil (name lettering,
 * evolution-portrait ring, gold HP slash), `glitter-v1.webp` the shared fleck field and `twinkle-v1.webp` the on/off blobs.
 */
import { isDp, dpPattern } from "../dp-foil.js?v=3";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

// The faces that have a map. A Prime without one is not claimed and keeps the era's look.
const MAPPED = new Set("hgss1-105 hgss1-106 hgss1-107 hgss1-108 hgss1-109 hgss1-110 hgss1-hsp07 hgss1-hsp08 hgss1-hsp09 hgss2-84 hgss2-85 hgss2-86 hgss2-87 hgss2-88 hgss2-89 hgss3-81 hgss3-82 hgss3-83 hgss3-84 hgss3-85 hgss3-86 hgss4-91 hgss4-92 hgss4-93 hgss4-94 hgss4-95 hgss4-96 hgss4-97 hgss4-98".split(" "));

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isDp(card) && has(dpPattern(card), "dp-prime") && MAPPED.has(String(card.id));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const dir = "assets/foil/fam/dp-prime/";
  const style = [
    `--pm-zones:url('${url(`${dir}${id}-zones-v1.webp`)}')`,
    `--pm-gold:url('${url(`${dir}${id}-gold-v1.webp`)}')`,
    `--pm-glitter:url('${url(`${dir}glitter-v1.webp`)}')`,
    `--pm-twinkle:url('${url(`${dir}twinkle-v1.webp`)}')`,
  ].join(";");
  return { classes: "fam-dp-prime", style, cure: true };
}
