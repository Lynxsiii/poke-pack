/**
 * Holo family bw-ex-ace: Black & White Pokémon-EX and ACE SPEC.
 *
 * Scope: every `bw-ex` and `bw-ace` print.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-ex-ace` (every rule in css/holo/fam/bw-ex-ace.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Whether a card face is this family's: a Black & White regular-art Pokémon-EX (`bw-ex`) or ACE SPEC (`bw-ace`) print. */
export function claims(card) {
  if (!card || card.reverse || !isBw(card)) return false;
  const pattern = bwPattern(card);
  return has(pattern, "bw-ex") || has(pattern, "bw-ace");
}

/**
 * The three promo EX data/bw10.json has no foilMap for (BWP081 Thundurus-EX, BWP082 Deoxys-EX, BWP083 Lugia-EX) would draw on the generic
 * median map (bwExSafeMap), which counts most of their art ground as Pokémon: a timid, nearly plain card. TCG Live does carry their maps
 * (bwbsp 081 to 083); scripts/fam/bw-ex-ace/make_promo_maps.py converts them into assets/foil/fam/bw-ex-ace/map-<id>.webp. Their art is
 * no regular print's (SIFT: 7 to 13 inliers against 800+ for a true match), so no regular print's map fits them. Every other promo EX
 * (bw4-bwp036/037/038, bw6-bwp045/046/047, bw8-bwp061/062/063) already has its own map in its data record.
 */
const OWN_MAP = new Set(["bw10-bwp081", "bw10-bwp082", "bw10-bwp083"]);

/**
 * The ACE SPEC Trainers' light masks (scripts/fam/bw-ex-ace/make_ace_masks.py): each print's TCG Live map times a ramp of its
 * scan's luminance, so the coloured dashes light the silver border and the art ground but not the dark ink over the foil
 * (the black name pill, Crystal Wall's black ground, Master Ball's dark swirl), as on the real cards. A print without one
 * falls back to its map in the sheet (--bxa-ace-mask defaults to --foil-map).
 */
const ACE_MASK = new Set([
  "bw7-137", "bw7-138", "bw7-139", "bw7-140", "bw8-128", "bw8-129", "bw8-130", "bw9-107", "bw9-108",
  "bw10-92", "bw10-93", "bw10-94", "bw10-95",
]);

/**
 * Every Pokémon-EX face has its own pillar mask, exp-<id>.webp (scripts/fam/bw-ex-ace/make_ex_pillar_masks.py), set as
 * --bxa-pmask: the pillar's mask adds it to itself four times so the light blazes through the inked ground, and fed the bare
 * map that boost also lit what the map inks inside the Pokémon (Kyogre-EX's body, Victini-EX's and Mew-EX's irises, Darkrai-EX's
 * claw). The mask is the map with the small foil islands inside the silhouette removed, the haze reaching into a body faded,
 * a margin kept from the Pokémon, a few hand-drawn bodies cut out and a lightly inked ground lifted. A face missing here keeps
 * its map (the sheet's default).
 */
const PILLAR_MASK = new Set([
  "bw4-5", "bw4-22", "bw4-38", "bw4-51", "bw4-54", "bw4-82", "bw4-bwp036", "bw4-bwp037", "bw4-bwp038", "bw5-13", "bw5-26",
  "bw5-38", "bw5-54", "bw5-63", "bw5-90", "bw6-22", "bw6-46", "bw6-71", "bw6-81", "bw6-85", "bw6-92", "bw6-bwp045",
  "bw6-bwp046", "bw6-bwp047", "bw7-9", "bw7-49", "bw7-67", "bw7-89", "bw7-101", "bw7-103", "bw8-14", "bw8-18", "bw8-25",
  "bw8-48", "bw8-93", "bw8-95", "bw8-96", "bw8-108", "bw8-bwp061", "bw8-bwp062", "bw8-bwp063", "bw9-13", "bw9-38",
  "bw9-53", "bw9-85", "bw9-86", "bw9-98", "bw10-9", "bw10-11", "bw10-30", "bw10-60", "bw10-65", "bw10-66", "bw10-bwp081",
  "bw10-bwp082", "bw10-bwp083", "bw11-24", "bw11-29", "bw11-44", "bw11-45", "bw11-52", "bw11-54", "bw11-77", "bw11-82",
  "bw11-88", "bw11-100", "bw11-101", "bw11-102",
]);

/** Fetch a per-card mask as soon as the face is built, so the first tilt does not show the card before its mask has loaded. */
const fetched = new Set();
function preload(href) {
  if (fetched.has(href) || typeof Image === "undefined") return;
  fetched.add(href);
  const img = new Image();
  img.crossOrigin = "anonymous"; // a mask image is a CORS fetch: a plain image load of the same URL would leave the mask unusable
  img.decoding = "async";
  img.src = href;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const parts = [];
  if (!card.foilMap && OWN_MAP.has(card.id)) parts.push(`--foil-map:url('${url(`assets/foil/fam/bw-ex-ace/map-${card.id.split("-")[1]}.webp`)}')`);
  const pattern = bwPattern(card);
  let mask = "";
  if (ACE_MASK.has(card.id) && has(pattern, "bw-ace")) {
    mask = url(`assets/foil/fam/bw-ex-ace/ace-${card.id}.webp`);
    parts.push(`--bxa-ace-mask:url('${mask}')`);
  } else if (PILLAR_MASK.has(card.id) && has(pattern, "bw-ex")) {
    mask = url(`assets/foil/fam/bw-ex-ace/exp-${card.id}.webp`);
    parts.push(`--bxa-pmask:url('${mask}')`);
  }
  if (mask) preload(mask);
  return { classes: "fam-bw-ex-ace", style: parts.join(";"), cure: false };
}
