/**
 * Holo family swsh-sf-shiny (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-swsh-sf): Shining
 * Fates' Shiny Vault (swsh45 SV001-SV120), the faces swshPattern() in js/foil-maps.js files as `sf-shiny`:
 * 104 baby Rare Shiny (`foil-holo sf-shiny`) and 16 shiny V / VMAX (`foil-ex sf-shiny sf-v|sf-vmax`). The two gold
 * Rare Secrets SV121-SV122 stay with swsh-gold.
 *
 * The real card: the foil is grey mirror silver cut with TCG Live's herringbone / zig-zag maze etch (the data's etch
 * maps), never paper white; lit, a broad rainbow ray crosses it near the light. A baby is foil in the art window (the
 * Live foil map: stars cut out, the Pokémon at about half); a V / VMAX is foil over the whole face. The data's maps are
 * right for the V / VMAX; a baby also gets
 * `sfs-bg` and `--sfs-bg`, a background-only map drawn from its scan (2026-11-28: the Pokémon stays clean). Classes:
 *   fam-swsh-sf-shiny  every claimed face (css/holo/fam/swsh-sf-shiny.css scopes every rule to it).
 *   sfs-v              the V / VMAX: lighter ground (the foil carries the whole card), a softer band.
 * Research and what changed: .claude/skills/card-textures/reference/fam-swsh-sf-shiny.md.
 */

const BG = "assets/foil/fam/swsh-sf-shiny/bg";

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** Whether a card face is this family's: swshPattern()'s `card.gallery === "sv"` branch, minus the gold secrets. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!isSwsh(card) || (card.foilAs && card.era !== "swsh")) return false;
  return card.gallery === "sv" && card.rarity !== "Rare Secret";
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const v = card.rarity === "Rare Holo V" || card.rarity === "Rare Holo VMAX";
  if (v) return { classes: "fam-swsh-sf-shiny sfs-v", style: "", cure: false };
  // A baby's silver is the art window's background only: a per-card map drawn from the scan (the window's paper
  // white that reaches its edge, times Live's map; scripts/fam/swsh-sf-shiny/make_bg_maps.py), so the grey silver,
  // the ray and the sparkle stay off the Pokémon.
  // The Japanese scans are photos of the foil print: the silver is already grey in them, so a lighter ground.
  const photo = String(card.id || "").startsWith("js4a-") ? " sfs-photo" : "";
  return { classes: `fam-swsh-sf-shiny sfs-bg${photo}`, style: `--sfs-bg:url('${url(`${BG}/${card.id}-v1.webp`)}')`, cure: false };
}
