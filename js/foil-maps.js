/**
 * Per-card foil data for tcgFace(): where the physical card is foil, and the
 * clear textured coats printed over it.
 *
 * - `foilMap` (and the RGB channels, `foilMapR/G/B`) are Pokémon TCG Live's
 *   per-card foil maps: white where the card is foil, black where it is not.
 *   They stop the shine at the Pokémon, the text and the 30th Celebration
 *   Pikachu stamp exactly. `etchMap` is the etched texture on SIR, Futuristic
 *   and RGB prints; `etchMapH/V` split it by line direction, and `etchAngle`
 *   draws that direction as a grey (the Paldean Fates shinies).
 *   `reverseMap` is the same for the card's reverse holo print.
 *   The card-textures skill's scripts/fetch_foil_maps.py writes all of these
 *   into data/<set>.json.
 * - `stampPos` / `stampSize` place the 30th Celebration stamp on cards with no
 *   foil map (the Classic Collection), so the foil can go around it
 *   (scripts/ship_stamp.py in the same skill).
 * - A "cast and cure" coat is a holographic pattern pressed into UV varnish.
 *   It shines over plain ink as well as foil, so it gets its own layer,
 *   `.cure`, masked by the card rather than the foil map: star glints on the
 *   30th Celebration Double Rares, firework rings on the Pikachu Rares.
 *
 * Shared with the card-textures lab so the lab draws what the site draws.
 */

import { isSm, smGxMap, smPattern, smReverseFinish, smSafeMap, SM_FULL_ART, SM_ETCHED } from "./sm-foil.js?v=9";

import { isXy, xyMap, xyPattern, xyReverseExtras, xyReverseFinish, XY_FULL_ART, XY_ETCHED } from "./xy-foil.js?v=5";

import { isBw, bwEtched, bwMap, bwPattern, bwReverseExtras, bwReverseFinish, BW_FULL_ART } from "./bw-foil.js?v=8";

import { isDp, dpEtched, dpMap, dpPattern, dpReverseExtras, dpReverseFinish, DP_FULL_ART } from "./dp-foil.js?v=3";

import { isEx, exEtched, exMap, exPattern, exReverseExtras, exReverseFinish, exReversePattern } from "./ex-foil.js?v=10";
import { isWotc, wotcLegendaryExtras, wotcMap, wotcPattern, wotcReverseFinish, WOTC_FULL_ART } from "./wotc-foil.js?v=6";
import { specialInk, specialReverseMap } from "./wotc-special.js?v=3";
import { famExtras } from "./holo-fam.js?v=118";
import { HIT_RARITIES } from "./engine.js";

export { isSm, smPattern, isXy, xyPattern, isBw, bwPattern, isDp, dpPattern, isEx, exPattern, isWotc, wotcPattern };

export function cureOf(card) {
  if (card?.rarity === "Pikachu Rare") return "rings";
  // SouthernCross is TCG Live's name for the Double Rare star coat. Only cards
  // with a foil map are confirmed to carry it (every Double Rare in the
  // Mega ex era is not). Tera ex Double Rares print SV_ULTRA etched foil
  // instead and carry no coat.
  if (card?.rarity === "Double Rare" && card.foilMap && !(card.subtypes || []).includes("Tera")) return "stars";
  return "";
}

/**
 * Whether a cosmos promo prints the "pixel" (retro) cosmos foil rather than
 * the smooth one: every English cosmos promo since Tinkaton SVP 140
 * (September 2024) and every Mega Evolution-era one does (the card-textures
 * skill, reference/promos.md). A `variant` naming "Pixel" settles it either
 * way; otherwise the promo number or the set decides.
 */
export function pixelCosmos(card) {
  const variant = String(card?.variant || "");
  if (/pixel/i.test(variant)) return true;
  if (/smooth|hd cosmos/i.test(variant)) return false;
  const set = String(card?.id || "").split("-")[0];
  if (/^me\d/.test(set) || ["sv8pt5", "sv9", "sv10", "zsv10pt5", "rsv10pt5"].includes(set)) return true;
  const svp = /^svp(\d+)/i.exec(String(card?.number || ""));
  return Boolean(svp && Number(svp[1]) >= 140);
}

/**
 * Full-art finishes are foil edge to edge, so a print TCG Live has no map for
 * (the Mega Evolution sets, Black Bolt and White Flare, the ME Black Star
 * promos) takes an all-white map and the same recipe as the mapped prints.
 * Without it the card fell to the older no-map recipe in realism.css, which
 * stretches an op-art ring texture over the whole card.
 */
const FULL_ART = new Set(["Illustration Rare", "Special Illustration Rare", "Ultra Rare", "Hyper Rare", "Mega Hyper Rare"]);
const FULL_MAP = "assets/foil/maps/full.webp";
// The etched full arts (TCG Live's ETCHED masks: Special Illustration Rare,
// full-art Ultra Rare, gold Hyper Rare) are engraved edge to edge; their
// recipes cut the foil to the etch and light the lines (celebration.css,
// sv-fullart.css). Where TCG Live has no etch map, the card carries one
// drawn from its own art (`etchMap` + `etchDrawn`, make_card_etch.py); the
// shared engraving tile below is only the fallback for a print nobody has
// drawn yet.
const ETCHED = new Set(["Special Illustration Rare", "Ultra Rare", "Hyper Rare", "Mega Hyper Rare"]);
const ETCH_TILE = "assets/foil/sir-etch.webp";
// Sword & Shield prints that are foil edge to edge (css/holo/swsh.css). TCG
// Live has maps for nearly all of them; the ones it lacks (Crown Zenith's
// Galarian Gallery, a handful of others) take the all-white map, and the
// etched ones the engraving tile, as the SV full arts do. The Classic
// Collection (Celebrations) is a window holo with no map and stays as it is.
const SWSH_FULL_ART = new Set([
  "Rare Holo V", "Rare Holo VMAX", "Rare Holo VSTAR", "Rare Ultra", "Rare Rainbow", "Rare Secret",
  "Radiant Rare", "Trainer Gallery Rare Holo",
]);
const SWSH_ETCHED = new Set([
  "Rare Holo VMAX", "Rare Holo VSTAR", "Rare Ultra", "Rare Rainbow", "Rare Secret", "Trainer Gallery Rare Holo",
]);

/** Classic Collection reprints: the rule-box cards got full-card foil originally. */
const CLASSIC_FULL_FOIL = /(^Shining |(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND|★)$)/i;

/**
 * A Sword & Shield era print: the numbered sets, the special sets, the
 * promos, and a Sword & Shield card reprinted in a later product (Trick or
 * Trade 2023's Lost Origin ghosts), which carries `era: "swsh"` itself.
 */
export function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/**
 * Sword & Shield finishes (css/holo/swsh.css and swsh-fullart.css). Each
 * rides on the older class the Classic engine keys on, plus its own
 * `swsh-*` class; the finish is read from the rarity, the V / VMAX / VSTAR
 * subtype and the sub-gallery (`gallery`: tg, gg, sv, cc), the way TCG Live
 * files them.
 */
export function swshPattern(card) {
  const subs = card.subtypes || [];
  const is = (sub) => subs.includes(sub);
  const trainer = card.supertype === "Trainer";
  if (card.gallery === "cc") {
    // No TCG Live map. Photos (Charizard 4/102 in its "Confetti Holofoil"
    // slab, Blastoise 2/102, Venusaur 15/102): the confetti covers the whole
    // card face, frame and text box included, not only the window.
    return `foil-holo swsh-holo swsh-classic${CLASSIC_FULL_FOIL.test(card.name || "") ? " swsh-classic-full" : ""}`;
  }
  // Celebrations 001-025: every card is foil over the whole face inside the
  // yellow frame (Lugia 022, Lunala 015 photos), a soft pearl sheen rather
  // than the brushed window holo, whatever Live's map says.
  if (String(card.id || "").startsWith("cel25-") && (card.rarity === "Rare" || card.rarity === "Rare Holo")) {
    return "foil-holo swsh-holo swsh-cel";
  }
  if (card.gallery === "sv" && card.rarity !== "Rare Secret") {
    // Shining Fates' two golds (Eternatus V SV121, VMAX SV122) are numbered
    // in the Shiny Vault but are gold secret rares, not shinies. The
    // shinies are drawn by css/holo/shiny-vault.css (`sf-shiny`, the "Shiny
    // and promo holos" thread), not by the era's V and VMAX recipes: they
    // carry no swsh-* class, so nothing in swsh.css touches them.
    if (is("VMAX")) return "foil-ex sf-shiny sf-vmax";
    if (is("V")) return "foil-ex sf-shiny sf-v";
    return "foil-holo sf-shiny";
  }
  switch (card.rarity) {
    case "Rare Secret":
      // Crown Zenith's showcase Pikachu (160) is a full-colour etched art,
      // not a gold: poke-holo.simey.me draws it as a rainbow rare, the glitter
      // foil under the printed colour (2026-09-29).
      if (card.id === "swsh12pt5-160") return "foil-ir swsh-rainbow";
      return "foil-gold swsh-gold";
    case "Rare Rainbow":
      return "foil-ir swsh-rainbow";
    case "Rare Ultra":
      if (trainer) return "foil-ultra swsh-tfa";
      // An alternate-art VMAX or VSTAR filed "Rare Ultra": the Japanese SAR / CSR prints (VSTAR Universe, VMAX Climax). The
      // English data files the same stock as "Rare Rainbow" (Moonbreon swsh7-215), so they ride its alt-art recipe
      // (js/fam/swsh-rainbow.js `srb-alt`); until 2026-11-27 no family claimed this branch and the Japanese ones fell to the
      // shared hatch tile (Noah: "it's just wavy lines").
      if (is("VMAX") || is("VSTAR")) return "foil-ir swsh-rainbow swsh-alt";
      return "foil-ultra swsh-vfa";
    case "Rare Holo VMAX":
      return "foil-ultra swsh-vmax";
    case "Rare Holo VSTAR":
      return "foil-ultra swsh-vstar";
    case "Rare Holo V":
      // A V with a Live etch map is a full art (the alternate-art Black Star
      // promos such as Charizard V SWSH260, filed as "Rare Holo V" by
      // foilAs): the regular V has no etch and takes the streak tile.
      if (card.etchMap) return "foil-ultra swsh-vfa";
      return "foil-ex swsh-v";
    case "Amazing Rare":
      return "foil-holo swsh-amazing";
    case "Radiant Rare":
      return "foil-holo swsh-radiant";
    case "Trainer Gallery Rare Holo":
      return "foil-ex swsh-tg";
    case "Rare Holo":
      return "foil-holo swsh-holo";
    default:
      break;
  }
  // Outside Celebrations (handled above) the plain Rare is not foil at all.
  if (card.rarity === "Rare") return "foil-none";
  return "";
}

/** A stable 0..1 pair per card, so tiled glitter never lines up the same way twice. */
function seed(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000];
}

const SV_REVERSE_TYPES = new Set([
  "grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless",
]);

/**
 * The standard reverse holo of a Scarlet & Violet or Mega Evolution print
 * (css/holo/sv-reverse.css). TCG Live's reverse maps show three kinds:
 * - the SV "cobblestone": pebbles, the type's symbol and a big type badge,
 *   the same picture on every card of a type in every SV set, so one pattern
 *   per type ships in assets/foil/sv-reverse/ (Trainers get Poké Balls,
 *   Special Energy is foil only in its text box);
 * - a plain mirror on Ancient and Future cards, and on every Mega Evolution
 *   reverse.
 * Promos, Prismatic's Poké Ball and Master Ball prints (`pattern`) and
 * older sets keep their own. So does any reverse with a kind of
 * its own: `kind` is the one the site resolved (the card's `reverseKind`,
 * else its set's `reverseFoil`), such as Poké Ball, Master Ball or Shrouded
 * Fable's chain; "cosmos" means none.
 */
export function reverseFinish(card, kind = card?.reverseKind) {
  if (!card?.reverse || card.foilAs || card.pattern || (kind && kind !== "cosmos")) return "";
  const set = String(card.id || "").split("-")[0];
  const sv = /^sv\d/.test(set);
  // Sword & Shield's chevron sheet (assets/foil/swsh-reverse/, one per type,
  // scripts/make_swsh_reverse.py in the card-textures skill).
  // Sun & Moon's reverse (js/sm-foil.js).
  if (isSm(card)) return smReverseFinish(card);
  // XY's reverse (js/xy-foil.js).
  if (isXy(card)) return xyReverseFinish(card);
  // Black & White's reverse (js/bw-foil.js).
  if (isBw(card)) return bwReverseFinish(card);
  // The Diamond & Pearl generation's Mirror reverse (js/dp-foil.js).
  if (isDp(card)) return dpReverseFinish(card);
  // The EX generation's reverse holos, a family per set (js/ex-foil.js).
  if (isEx(card)) return exReverseFinish(card);
  // The Wizards of the Coast generation's reverse: Legendary Collection's fireworks, the e-Card refractor (js/wotc-foil.js).
  if (isWotc(card)) return wotcReverseFinish(card);
  if (isSwsh(card)) {
    if (card.supertype === "Trainer") return "swsh-trainer";
    if (card.supertype === "Energy" || card.energy) return "";
    const type = String(card.types?.[0] || "").toLowerCase();
    return SV_REVERSE_TYPES.has(type) ? `swsh-${type}` : "";
  }
  if (!sv && !(/^me\d/.test(set) && set !== "me55")) return "";
  const subtypes = card.subtypes || [];
  if (!sv || subtypes.includes("Ancient") || subtypes.includes("Future")) return "mirror";
  if (card.supertype === "Trainer") return "trainer";
  if (card.supertype === "Energy") return subtypes.includes("Special") ? "special-energy" : "";
  const type = String(card.types?.[0] || "").toLowerCase();
  return SV_REVERSE_TYPES.has(type) ? type : "";
}

/**
 * Extra classes and inline custom properties for a card face. `url` turns a
 * repo path into an absolute URL (see assetUrl() in app.js for why).
 * `reverseKind` is reverseKindOf() in app.js, for reverseFinish().
 * The older eras' holo families (js/holo-fam.js, the 2026-10-01 remaster) add
 * their own classes and properties after the era's: a property they set comes
 * later in the style attribute, so it wins.
 */
export function foilExtras(card, url, reverseKind) {
  const era = eraFoilExtras(card, url, reverseKind);
  const fam = famExtras(card, url, era);
  if (!fam) return era;
  return {
    classes: [era.classes, fam.classes].filter(Boolean).join(" "),
    style: [era.style, fam.style].filter(Boolean).join(";"),
    cure: Boolean(era.cure || fam.cure),
  };
}

/** The era modules' extras for a face (everything but the holo families; the era tests assert on these). */
export function eraFoilExtras(card, url, reverseKind) {
  // The maps describe the holo print; a reverse holo is foil everywhere else,
  // in the reverse's own pattern: TCG Live's map of the reverse print where
  // it ships (`reverseMap`: Prismatic Evolutions prints its reverses with Tera
  // crystals and a type symbol worked into the foil), else the SV one.
  if (card.reverse) {
    if (card.reverseMap) {
      return { classes: "has-rev-map", style: `--rev-map:url('${url(card.reverseMap)}')`, cure: false };
    }
    const finish = reverseFinish(card, reverseKind);
    if (finish === "mirror") return { classes: "rev-mirror", style: "", cure: false };
    // XY: the plain mirror, with the era's hooks for css/holo/xy.css.
    if (finish === "xy") return { classes: "rev-mirror era-xy xy-rev", style: "", cure: false };
    // XY's reverse: one tile per type (assets/foil/xy-reverse/, css/holo/xy.css).
    if (finish.startsWith("xy-")) return xyReverseExtras(card, url, finish);
    // Black & White: the plain mirror of bw1, the Energy-symbol tile per type of the rest (css/holo/bw.css).
    if (finish.startsWith("bw-")) return bwReverseExtras(card, url, finish);
    // Diamond & Pearl generation: the Mirror pattern, the whole card but the art window (css/holo/dp.css).
    if (finish === "dp") return dpReverseExtras(card, url);
    // EX generation: the Mirror of the first four sets, the art-box patterns after them; one family class per set (css/holo/ex.css).
    if (finish === "ex") return exReverseExtras(card, url);
    // Wizards of the Coast: the e-Card refractor and the promo reverses, and Legendary Collection's fireworks (css/holo/wotc-ecard.css, wotc-special.css).
    if (finish === "wotc") return { classes: "rev-mirror era-wotc wotc-rev", style: "", cure: false };
    if (finish === "wotc-ecard") return { classes: "rev-mirror era-wotc wotc-rev wotc-rev-ecard", style: "", cure: false };
    // The reverse promos of basep and bp: one drawn frame mask each (js/wotc-special.js, css/holo/wotc-special.css).
    if (finish.startsWith("wotc-promo-")) {
      return { classes: `rev-mirror era-wotc wotc-rev-promo wotc-rev-${finish.slice(11)}`, style: `--foil-map:url('${url(specialReverseMap(finish))}')`, cure: false };
    }
    if (finish === "wotc-legendary") return wotcLegendaryExtras(card, url);
    if (!finish) return { classes: "", style: "", cure: false };
    if (finish.startsWith("sm-")) {
      const type = finish.slice(3);
      const energy = card.supertype === "Energy" || card.energy;
      // An Energy's foil is the whole field, so its symbols come as a repeating cell
      // (make_sm_energy_reverse.py); a Pokémon's are the one-piece tile.
      const tile = energy ? `assets/foil/sm-reverse/energy-${type}.webp` : "";
      return {
        classes: `rev-sv rev-sm rev-${type}${energy ? " rev-energy" : ""}`,
        style: `--rev-pattern:url('${url(`assets/foil/sm-reverse/${type}.webp`)}')${tile ? `;--energy-tile:url('${url(tile)}')` : ""}`,
        cure: false,
      };
    }
    if (finish.startsWith("swsh-")) {
      const type = finish.slice(5);
      return {
        classes: `rev-sv rev-swsh rev-${type}`,
        style: `--rev-pattern:url('${url(`assets/foil/swsh-reverse/${type}.webp`)}')`,
        cure: false,
      };
    }
    return {
      classes: `rev-sv rev-${finish}`,
      style: `--rev-pattern:url('${url(`assets/foil/sv-reverse/${finish}.webp`)}')`,
      cure: false,
    };
  }
  const classes = [];
  const vars = [];
  const add = (cls, name, path) => {
    if (cls) classes.push(cls);
    vars.push(`${name}:url('${url(path)}')`);
  };
  const swsh = isSwsh(card);
  const sm = isSm(card);
  const xy = isXy(card);
  const bw = isBw(card);
  const dp = isDp(card);
  const ex = isEx(card);
  const wotc = isWotc(card);
  if (card.foilMap) add("has-foil-map", "--foil-map", (sm && smGxMap(card)) || card.foilMap);
  else if (FULL_ART.has(card.rarity) || (swsh && SWSH_FULL_ART.has(card.rarity) && card.gallery !== "cc") || (sm && SM_FULL_ART.has(card.rarity))) {
    add("has-foil-map", "--foil-map", FULL_MAP);
  } else if (sm && smSafeMap(card)) {
    // A GX or Prism Star with no map of its own takes the text-safe median.
    add("has-foil-map", "--foil-map", smGxMap(card) || smSafeMap(card));
  } else if (xy && XY_FULL_ART.has(card.rarity)) {
    add("has-foil-map", "--foil-map", FULL_MAP);
  } else if (xy && xyMap(card)) {
    // The finish agents return a TCG Live map (fetch_foil_maps.py) or a drawn window / frame mask.
    add("has-foil-map", "--foil-map", xyMap(card));
  } else if (bw && BW_FULL_ART.has(card.rarity)) {
    add("has-foil-map", "--foil-map", FULL_MAP);
  } else if (bw && bwMap(card)) {
    // The finish agents return a TCG Live map (fetch_foil_maps.py) or a drawn window / frame mask.
    add("has-foil-map", "--foil-map", bwMap(card));
  } else if (dp && DP_FULL_ART.has(card.rarity)) {
    add("has-foil-map", "--foil-map", FULL_MAP);
  } else if (dp && dpMap(card)) {
    // TCG Live has no maps for this generation: the finish agents return a drawn window / frame mask.
    add("has-foil-map", "--foil-map", dpMap(card));
  } else if (ex && exMap(card)) {
    // TCG Live has no maps for this generation either: a drawn window / frame / Pokémon mask.
    add("has-foil-map", "--foil-map", exMap(card));
  } else if (wotc && WOTC_FULL_ART.has(card.rarity)) {
    add("has-foil-map", "--foil-map", FULL_MAP);
  } else if (wotc && wotcMap(card)) {
    // The finish agents return a drawn window / figure mask (TCG Live has no maps for this generation).
    add("has-foil-map", "--foil-map", wotcMap(card));
    if (specialInk(card)) add("", "--ws-ink", specialInk(card));
  }
  if (card.foilMapR && card.foilMapB) {
    add("has-foil-rgb", "--foil-map-r", card.foilMapR);
    add("", "--foil-map-b", card.foilMapB);
  }
  if (card.etchMap) {
    add("has-etch-map", "--etch-map", card.etchMap);
    // Drawn from the card's own art because Live has no etch for it
    // (scripts/make_card_etch.py): the SIR recipe keeps the flat background
    // weight the tile had, since the print's foil map is the white fallback.
    if (card.etchDrawn) classes.push("has-etch-drawn");
  } else if (ETCHED.has(card.rarity) || (swsh && SWSH_ETCHED.has(card.rarity) && card.gallery !== "cc") || (sm && SM_ETCHED.has(card.rarity)) || (xy && XY_ETCHED.has(card.rarity)) || (bw && bwEtched(card)) || (dp && dpEtched(card)) || (ex && exEtched(card))) {
    add("has-etch-tile", "--etch-tile", ETCH_TILE);
  }
  // A gold print's soft engraving (the etch blurred a little, soften_etch.py):
  // the dark line art without the hatch aliasing into speckle.
  if (card.etchSoft) add("", "--etch-soft", card.etchSoft);
  if (card.etchMapH && card.etchMapV) {
    add("has-etch-bins", "--etch-map-h", card.etchMapH);
    add("", "--etch-map-v", card.etchMapV);
  }
  if (card.etchAngle) add("has-etch-angle", "--etch-angle", card.etchAngle);
  // TCG Live's etch at its native size as a luminance texture (Shining
  // Fates' Shiny Vault, shiny-vault.css): the fingerprint rings drawn as an
  // image, not a mask, so they need their dark ground.
  if (card.etchHd) add("has-etch-hd", "--etch-hd", card.etchHd);
  if (card.stampPos && card.stampSize && !card.foilMap) {
    classes.push("has-stamp");
    vars.push(`--stamp-pos:${card.stampPos}`, `--stamp-size:${card.stampSize}`);
  }
  const cure = cureOf(card);
  if (cure) classes.push(`cure-${cure}`);
  // Future and Ancient frames print a halftone panel in the text box, and
  // their holo prints foil it too (css/holo/sv-rare.css).
  if (card.foilMap && (card.subtypes || []).some((s) => s === "Future" || s === "Ancient")) {
    classes.push("frame-paradox");
  }
  // Scarlet & Violet prints (sv*, and Black Bolt / White Flare's zsv/rsv):
  // finishes the Mega Evolution era prints differently key off this, such as
  // the Double Rare streaks (css/holo/sv-double-rare.css).
  if (/^[zrj]?sv\d/.test(String(card.id || ""))) classes.push("era-sv");
  // Mega Evolution prints (me1-me5, me2pt5; not the 30th Celebration, me55): the same finishes as
  // Scarlet & Violet's with their own retune (css/holo/me-finishes.css, sv-double-rare.css).
  if (/^j?me\d(pt5)?[a-z]?-/.test(String(card.id || ""))) classes.push("era-me");
  // Sword & Shield prints (css/holo/swsh.css): the numbered sets, Champion's
  // Path, Shining Fates, Celebrations, Pokémon GO, Crown Zenith, the promos.
  if (card.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card.id || ""))) classes.push("era-swsh");
  // Sun & Moon prints (css/holo/sm.css and its siblings): the numbered sets,
  // Shiny Vault, Detective Pikachu, the promos.
  if (sm) classes.push("era-sm");
  // XY prints (css/holo/xy.css and its siblings): the numbered sets, Generations,
  // Double Crisis, the promos, McDonald's 2014-16, the Trainer Kits.
  if (xy) classes.push("era-xy");
  // Black & White prints (css/holo/bw.css and its siblings): the numbered sets,
  // Dragon Vault, the promos, McDonald's 2011 and 2012, the Trainer Kits.
  if (bw) classes.push("era-bw");
  // Diamond & Pearl generation prints (css/holo/dp.css and its siblings): dp1-dp7, Platinum, HeartGold &
  // SoulSilver, Call of Legends, the dpp and hsp promos, POP 6-9, the Trainer Kits.
  if (dp) classes.push("era-dp");
  // EX generation prints (css/holo/ex.css and its siblings): ex1-ex16, the np promos, POP Series 1-5, the Trainer Kits.
  if (ex) classes.push("era-ex");
  // Wizards of the Coast prints (css/holo/wotc.css and its siblings): Base Set to Skyridge, Southern Islands, basep and bp.
  if (wotc) classes.push("era-wotc");
  // Tiled or galaxy textures start somewhere different on every card.
  if (cure || ["Classic Collection", "Cosmos", "Confetti"].includes(card.rarity) || ETCHED.has(card.rarity) || swsh || sm || xy || bw || dp || ex || wotc) {
    const [x, y] = seed(card.id);
    vars.push(`--seed-x:${x}`, `--seed-y:${y}`);
  }
  // Cosmos promos since late 2024 print the pixel cosmos (css/holo/promos.css).
  if (card.rarity === "Cosmos" && pixelCosmos(card)) classes.push("cosmos-pixel");
  return { classes: classes.join(" "), style: vars.join(";"), cure: Boolean(cure) };
}

/* ---- The finish classifier ------------------------------------------------------------------------------------------
 * Which finish a card face is drawn in: one copy, called by the app (tcgFace in js/app.js), the foil lab and the census
 * (.claude/skills/card-textures/). Until 2026-11-25 each of the three held its own copy and they had drifted apart (the
 * lab drew McDonald's confetti holos, Costco's galaxy reverses and metal cards with no foil at all).
 * `set` is the card's set entry from js/catalog.js (allFoil, reverseFoil); pass undefined when there is none. */

const CLASSIC_FULL_FOIL_NAME = /(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND)$/i;

function isExPrint(card) {
  return Boolean(card?.subtypes?.some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(card?.name || ""));
}

function isTeraFoil(card) {
  return Boolean(card?.foilMap) && (card.subtypes || []).includes("Tera") &&
    (card.rarity === "Double Rare" || card.rarity === "Ultra Rare");
}

export function hasEvoCircle(card) {
  const subs = card?.subtypes || [];
  return subs.includes("Stage 1") || subs.includes("Stage 2") || Boolean(card?.evolvesFrom);
}

/** Sets like 30th Celebration print every card in the pack as a holo. */
function isAllFoil(card, set) {
  return Boolean(set?.allFoil) && !card.energy && card.supertype !== "Energy";
}

/**
 * Promo cards are printed in another rarity's finish: `foilAs` names it, and the card is drawn with that rarity's
 * recipe. "Cosmos" is the galaxy holo; "Frame" foils only the frame, like a reverse; "Reverse Cosmos" puts the galaxy
 * there; "Metal" is a brass card; "Poke Ball" a Poké Ball pattern reverse.
 */
export function foilLook(card) {
  if (!card?.foilAs || card.reverse) return card;
  if (card.foilAs === "Frame") return { ...card, rarity: "Common", reverse: true, reverseKind: "cosmos" };
  if (card.foilAs === "Reverse Cosmos") return { ...card, rarity: "Common", reverse: true, reverseKind: "galaxy" };
  // A Poké Ball pattern print, like Black Bolt's reverses (the Victini
  // Illustration Collection's Victini).
  if (card.foilAs === "Poke Ball") return { ...card, rarity: "Rare", reverse: true, reverseKind: "pokeball" };
  return { ...card, rarity: card.foilAs };
}

export function reverseKindOf(card, set) {
  // Prismatic Evolutions files its pattern prints as cards of their own.
  if (card?.pattern) return card.pattern;
  if (!card?.reverse) return "";
  if (card.reverseKind) return card.reverseKind === "cosmos" ? "" : card.reverseKind;
  return set?.reverseFoil || "";
}

export function foilClass(card, set) {
  if (!card) return "";
  if (card.reverse || card.pattern) return "rare-glow";
  // Sword & Shield's plain Rare is not a foil card.
  if (isSwsh(card) && (!card.foilAs || card.era === "swsh") && swshPattern(card) === "foil-none") return "";
  if (isSm(card) && (!card.foilAs || card.era === "sm") && smPattern(card) === "foil-none") return "";
  // XY's plain Rare is not foil either; every Radiant Collection card is (js/xy-foil.js).
  if (isXy(card) && (!card.foilAs || card.era === "xy")) {
    const xy = xyPattern(card);
    if (xy === "foil-none") return "";
    if (xy.includes("xy-rc")) return "holo";
  }
  // Black & White's plain Rare is not foil either; every Radiant Collection card is (js/bw-foil.js).
  if (isBw(card) && (!card.foilAs || card.era === "bw")) {
    const bw = bwPattern(card);
    if (bw === "foil-none") return "";
    if (bw.includes("bw-rc") || bw.includes("bw-vault")) return "holo";
  }
  // The Diamond & Pearl generation's plain Rare is not foil either (js/dp-foil.js).
  if (isDp(card) && (!card.foilAs || card.era === "dp") && dpPattern(card) === "foil-none") return "";
  // The EX generation's plain Rare is not foil either; its holo Energy, Unown Collection and kit holos are (js/ex-foil.js).
  if (isEx(card) && (!card.foilAs || card.era === "ex")) {
    const ex = exPattern(card);
    if (ex === "foil-none") return "";
    if (/\bex-(energy|unown|kit)\b/.test(ex)) return "holo";
  }
  // The Wizards of the Coast generation's plain Rare is not foil either (js/wotc-foil.js).
  if (isWotc(card) && (!card.foilAs || card.era === "wotc") && wotcPattern(card) === "foil-none") return "";
  if (HIT_RARITIES.has(card.rarity) || ["Rare", "Rare Holo", "Pikachu Rare", "Cosmos", "Metal", "Confetti"].includes(card.rarity)) return "holo";
  if (isAllFoil(card, set)) return "holo";
  return "";
}

export function foilLayout(card) {
  if (card.energy || card.supertype === "Energy") return "foil-energy";
  if (card.rarity === "ACE SPEC Rare") return "";
  if (card.supertype === "Trainer") return "foil-trainer";
  if (card.ownerMask) return "foil-owner";
  return hasEvoCircle(card) ? "foil-evo" : "";
}

export function foilPattern(card, set) {
  if (!card) return "foil-none";
  // Prismatic Evolutions' Poké Ball and Master Ball prints: the ball reverse,
  // and with the card's foil map TCG Live's RAINBOW / ETCHED recipe on a
  // second class (css/holo/prismatic.css).
  if (card.pattern) return `foil-reverse foil-rev-${card.pattern} foil-prism`;
  if (card.reverse) {
    const kind = reverseKindOf(card, set);
    // The galaxy holo (css/holo/promos.css) on the frame: 151's Costco promos.
    if (kind === "galaxy") return "foil-reverse foil-cosmos";
    return kind ? `foil-reverse foil-rev-${kind}` : "foil-reverse";
  }
  // Sword & Shield era prints (js/foil-maps.js, shared with the lab). A
  // reprint in a later product names its finish through foilAs (foilLook has
  // already made it the rarity here).
  if (isSwsh(card) && (!card.foilAs || card.era === "swsh")) {
    const swsh = swshPattern(card);
    if (swsh) return swsh;
  }
  // Sun & Moon era prints (js/sm-foil.js).
  if (isSm(card) && (!card.foilAs || card.era === "sm")) {
    const sm = smPattern(card);
    if (sm) return sm;
  }
  // XY era prints (js/xy-foil.js).
  if (isXy(card) && (!card.foilAs || card.era === "xy")) {
    const xy = xyPattern(card);
    if (xy) return xy;
  }
  // Black & White era prints (js/bw-foil.js).
  if (isBw(card) && (!card.foilAs || card.era === "bw")) {
    const bw = bwPattern(card);
    if (bw) return bw;
  }
  // Diamond & Pearl generation prints (js/dp-foil.js).
  if (isDp(card) && (!card.foilAs || card.era === "dp")) {
    const dp = dpPattern(card);
    if (dp) return dp;
  }
  // EX generation prints (js/ex-foil.js).
  if (isEx(card) && (!card.foilAs || card.era === "ex")) {
    const ex = exPattern(card);
    if (ex) return ex;
  }
  // Wizards of the Coast generation prints (js/wotc-foil.js).
  if (isWotc(card) && (!card.foilAs || card.era === "wotc")) {
    const wotc = wotcPattern(card);
    if (wotc) return wotc;
  }
  // Paldean Fates (css/holo/shiny-vault.css): the Shiny Vault's silver
  // fingerprint-etched foil, and its gold cards' glitter and raised Scodix.
  if (card.rarity === "Shiny Ultra Rare") return "foil-ultra foil-shiny";
  if (card.rarity === "Shiny Rare") return "foil-holo foil-shiny";
  if (card.finish === "scodix") return "foil-gold foil-scodix";
  if (card.rarity === "Mega Hyper Rare" || card.rarity === "Hyper Rare") return "foil-gold";
  // Tera ex print TCG Live's SV_ULTRA etched foil across the whole card
  // (css/holo/sv-finishes.css). Before the Ultra Rare check, which would
  // otherwise take the full-art Tera cards.
  if (isTeraFoil(card)) return card.rarity === "Ultra Rare" ? "foil-ultra foil-tera" : "foil-ex foil-tera";
  if (card.rarity === "Special Illustration Rare") return "foil-sir";
  if (card.rarity === "Illustration Rare") return "foil-ir";
  // Before the ex check: Ultra Rares are ex cards too, so they'd otherwise
  // share the plain full-art foil instead of getting their own.
  if (card.rarity === "Ultra Rare") return "foil-ultra";
  if (card.rarity === "Mega Attack Rare") return "foil-mega-attack";
  if (card.rarity === "Black White Rare") return "foil-bwr";
  // The 30th Celebration's own finishes (css/holo/celebration.css) ride on a
  // second class, so the Classic engine keeps reading the first one.
  if (card.rarity === "Futuristic Rare") return "foil-future";
  if (card.rarity === "RGB Rare") return "foil-future foil-rgb";
  if (card.rarity === "Classic Collection") {
    return `${CLASSIC_FULL_FOIL_NAME.test(card.name || "") ? "foil-ultra" : "foil-holo"} foil-classic`;
  }
  if (card.rarity === "Pikachu Rare") return "foil-holo foil-pikachu";
  // Collection-box promos (css/holo/promos.css).
  if (card.rarity === "Cosmos") return "foil-holo foil-cosmos";
  // Brass cards like 151's Ultra-Premium Collection Mew ex (css/holo/sv151.css).
  if (card.rarity === "Metal") return "foil-metal";
  // McDonald's Happy Meal holos (css/holo/side-sets.css).
  if (card.rarity === "Confetti") return "foil-holo foil-confetti";
  if (card.rarity === "ACE SPEC Rare") return card.foilMap ? "foil-holo foil-acespec" : "foil-holo";
  // TCG Live's SUN_PILLAR and SV_HOLO recipes need the card's foil map to keep
  // off the Pokémon, so they only replace the older recipes where one ships.
  if (isExPrint(card) && (HIT_RARITIES.has(card.rarity) || card.rarity === "Rare")) {
    return card.foilMap && card.rarity === "Double Rare" ? "foil-ex foil-sunpillar" : "foil-ex";
  }
  if (card.supertype === "Trainer" && HIT_RARITIES.has(card.rarity)) return "foil-ex";
  if (card.rarity === "Rare" && card.foilMap) return "foil-holo foil-svholo";
  if (HIT_RARITIES.has(card.rarity) || card.rarity === "Rare") return "foil-holo";
  if (isAllFoil(card, set)) return card.foilMap ? "foil-holo foil-rainbow" : "foil-holo";
  return "foil-none";
}

/** The `data-finish` of the monochrome printings (their light response differs: css/holo/celebration.css). */
export function dataFinish(card) {
  if (card.rarity === "Black White Rare") return card.name === "Reshiram ex" ? "pearl" : card.name === "Victini" ? "ruby" : "silver";
  if (card.rarity === "RGB Rare") return { R: "red", G: "green", B: "blue" }[card.number] || "";
  return "";
}
