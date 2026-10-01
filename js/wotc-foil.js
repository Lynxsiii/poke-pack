/**
 * Wizards of the Coast generation finishes (1999-2003): which class string a card of the generation draws with.
 *
 * One era id, `wotc`, covers the whole generation because the frame never changes in kind (the Pokémon-yellow border,
 * the art window, the expansion symbol bottom right) and the holo is always the art window's, from Base Set (January
 * 1999) to Skyridge (May 2003): base1 Base Set, base2 Jungle, base3 Fossil, base4 Base Set 2, base5 Team Rocket, gym1
 * Gym Heroes, gym2 Gym Challenge, neo1 Neo Genesis, neo2 Neo Discovery, si1 Southern Islands, neo3 Neo Revelation, neo4
 * Neo Destiny, base6 Legendary Collection, ecard1 Expedition Base Set, ecard2 Aquapolis, ecard3 Skyridge, the promo set
 * `basep` (Wizards Black Star Promos, 1-53) and `bp` (Best of Game, 1-9). Split out of foil-maps.js like js/dp-foil.js so
 * the finish threads can tune it without touching the shared file. The recipes live in css/holo/wotc.css (the cosmos /
 * starlight window holo and the plain Rare), wotc-ecard.css (the e-Card holo and reverse and the Crystal Pokémon) and
 * wotc-special.css (Shining Pokémon, the Legendary Collection reverse, Southern Islands if it foils); every class below
 * starts from the older class the Classic engine keys on (`foil-holo`) and adds its own `wotc-*` class, the way
 * js/dp-foil.js does.
 *
 * ENGLISH UNLIMITED PRINTS ONLY. 1st Edition, Shadowless and the Base Set "1999-2000 copyright" runs are NOT separate
 * cards here: the site deals the Unlimited print (the retail pack most people opened; TCGplayer group 604 for Base Set,
 * pkmn.gg's standard prints), so `base1-4` is one Charizard, not four. The stamp ("Edition 1"), the missing drop shadow and
 * the thinner font are print-run facts the finish agents do not draw. (research: wotc-pack-structure.md "Edition prints",
 * second-source-check.md, base1.md "What the print runs look like".)
 *
 * The rarity words are pkmn.gg's, read from its pages on 2026-10-01 (https://www.pkmn.gg/series/<series>/<slug>; slugs in
 * SCAFFOLD-NOTES). The era keeps "Rare Holo" apart from "Rare" like XY, BW and DP (scripts/build_set.py `era` list):
 *   Common, Uncommon, Rare (NOT foil: the non-holo twin of a holo, and every other plain rare),
 *   Rare Holo      (the art-window holo, every set; 1-16 in base1, H1-H32 in ecard2 and ecard3, 1-32 in ecard1; includes
 *                   Neo Genesis's Metal Energy 19, Neo Destiny's Miracle Energy 16 and Team Rocket's Rainbow Energy 17),
 *   Rare Shining   (neo3 65-66, neo4 106-113: pkmn.gg's own word, the same one Shining Legends uses; 2 + 8 cards),
 *   Rare Secret    (base5 83 Dark Raichu; ecard2 148-150 and ecard3 145-150, the Crystal Pokémon, which a set file moves to
 *                   "Rare Crystal" with rarityOverrides so the pools can tell them from a secret),
 *   Promo          (basep, bp),
 *   "None"         (base1's six basic Energy 97-102, si1's eighteen cards: no rarity symbol).
 * pkmn.gg counts per rarity: base1 RH16 R16 U32 C32 None6; base2 RH16 R16 U16 C16; base3 RH15 R15 U16 C16; base4 RH20 R20 U41
 * C49; base5 RH17 R17 U24 C24 RS1; gym1 RH19 R23 U42 C48; gym2 RH20 R21 U42 C49; neo1 RH19 R16 U35 C41; neo2 RH17 R19 U19 C20;
 * neo3 RH14 R13 U17 C20 Shining2; neo4 RH16 R19 U37 C33 Shining8; base6 RH19 R19 U36 C36; ecard1 RH32 R40 U38 C55; ecard2 RH32 R48
 * U48 C52 RS3; ecard3 RH32 R35 U36 C73 RS6; basep Promo54 (1-53 and the #900 jumbo); bp Promo9; si1 none18. The basic Energy of
 * gym1, gym2, neo1, base4, ecard1 are "Common" on pkmn.gg with subtype Basic: build_set files them as "Energy" for the era.
 *
 * Finish vocabulary, from the research (/mnt/project-files/every-era/wotc/research/wotc-pack-structure.md "Foil types in plain
 * words" and second-source-check.md "Foil words"; the sources are Bulbapedia's Holofoil page, the set pages and PSA's set
 * registry articles 9582, 9581, 9498, 9458, 10154):
 *  - Rare Holo, base1 base2 base3: STARLIGHT holofoil, "starbursts of different sizes spread across the image, with a slightly
 *    blurry appearance"; art window only, frame and text flat. Base Set 2 on: COSMOS holofoil, "dots and circles of different
 *    sizes". One class here, `foil-holo wotc-cosmos`; the three oldest sets also carry `wotc-starlight` so the finish agent can
 *    draw them differently without a new hook (Bulbapedia, Holofoil; one source family: medium).
 *  - e-Card Rare Holo (ecard1-3): the same art-window holo on the e-reader frame (the dot-code strip along the bottom stays flat).
 *    `foil-holo wotc-ecard`.
 *  - Reverse holo, e-Card sets: "plain 'refractor' holofoil" (Bulbapedia Expedition) / "more like a mirror ... a reflection of
 *    the card color" (PSA 9581), over everything except the art. `rev-mirror era-wotc wotc-rev`. Expedition reverses the holos
 *    and the rares' non-holo twins; Aquapolis and Skyridge do not reverse the H1-H32 holos.
 *  - Reverse holo, Legendary Collection (new in base6): foil over the whole card EXCEPT the art window, "a fireworks-like pattern"
 *    (Bulbapedia) / "unique wheel design" (PSA 9581). `rev-mirror era-wotc wotc-rev wotc-rev-legendary`. NONE before base6.
 *  - Crystal Pokémon (ecard2 148-150, ecard3 145-150): "Crystal Type" in red under the art and a coloured highlight reflecting
 *    its Energy types (Bulbapedia Crystal_Pokemon; PSA 9721/9747). Neither source describes the foil itself: photo work. Built as a
 *    whole-card refractor-like holo, `foil-holo wotc-crystal` (the brief's description; LOW confidence on the look).
 *  - Shining Pokémon (neo3, neo4): "glossy metallic look" on the Pokémon only, the background NOT holo ("Non Holofoil background",
 *    Bulbapedia Neo Destiny; PSA 9498 "only the Pokemon (and not the background) in foil material", PSA 9458 "special reflective
 *    coating"). Not a star or cosmos pattern. `foil-holo wotc-shining`.
 *  - Dark Raichu (base5 83, "Rare Secret"): printed on the holo sheet, a cosmos holo like the other Rocket holos.
 *  - Promos: basep is non-holo except 9 Mew, 10 Meowth, 11 Eevee, 13 Venusaur (disputed), 15 Cool Porygon, 17 Dark Persian and 24
 *    _____'s Pikachu (cosmos) and 34 Entei and 35 Pichu (reverse); the First Movie promos 2-5 carry a gold foil STAMP but are not
 *    holo. bp: reverse holo on 1, 2, 3, 8, 9; plain on 4-7; the gold "Winner" stamp on the Winner prints. A promo draws its
 *    finish from the data: `holo: true` (cosmos) or `reverse: true` (the reverse finish) per card (cardFlags in the set file);
 *    anything else is flat. (wotc-promo-claims.md; two sources: Pokumon API + pkmn.gg variantMap, which agree except #13.)
 *  - Southern Islands: pkmn.gg lists cards 1, 4, 7, 11, 14, 17 as "Reverse Holofoil" and the other twelve as "Normal" (one
 *    labelling source, LOW confidence, no photo): the cards are flat `foil-none` until a finish agent decides. si1 is a fixed
 *    18-card collection, not a pack, so there is no reverse slot to deal: if the finish is real it is a print finish.
 *
 * TCG Live foil maps: see the WOTC block of .claude/skills/card-textures/scripts/fetch_foil_maps.py (probed 2026-10-01 on
 * cdn.malie.io, .../cards/png/en/<key>/<key>_en_<nnn>_std.foil.png, curl -I, 001-165, known holo numbers base1 004 Charizard, neo1
 * 009 Lugia, ecard1 001 Alakazam and every key the brief names). `wotcMap(card)` below is the finish agents' hook for DRAWN masks
 * (the art window of a Rare Holo, the figure of a Shining, the face of a Crystal) or fetched ones if the probe found any.
 *
 * The card's `era: "wotc"` (set by build_products.py for the promos and the reprints, from the set's `era`) lets a later product's
 * reprint take the era's finish through its `foilAs`; the numbered sets are recognised by id.
 */

import { ecardMap } from "./wotc-ecard-maps.js?v=2";
import { specialMap, specialPattern, specialReverseFinish } from "./wotc-special.js?v=3";

/** A Wizards of the Coast generation print: the numbered sets, Southern Islands, the promo sets. */
export function isWotc(card) {
  return card?.era === "wotc" || /^(?:base\d|gym\d|neo\d|si1|ecard\d|basep|bp)(?:-|$)/.test(String(card?.id || ""));
}

/** Prints that are foil edge to edge. None in this generation (a Crystal Pokémon's foil is drawn, see wotcMap). */
export const WOTC_FULL_ART = new Set();

/** The e-Card sets: the e-reader frame and its refractor reverse. */
function isEcard(card) {
  return /^ecard\d/.test(String(card?.id || ""));
}

/** Base Set, Jungle, Fossil and Legendary Collection: Starlight holofoil, not cosmos (Bulbapedia Holofoil: Cosmos for Base Set 2 on; Collexy: Legendary Collection is Starlight too). */
function isStarlight(card) {
  return /^base[1236]-/.test(String(card?.id || ""));
}

/** The e-Card Crystal Pokémon: pkmn.gg's "Rare Secret" 148-150 / 145-150, or the "Rare Crystal" a set file moves them to. */
export function isCrystal(card) {
  if (card?.rarity === "Rare Crystal") return true;
  if (card?.rarity !== "Rare Secret") return false;
  const m = /^ecard([23])-(\d+)$/.exec(String(card?.id || ""));
  return Boolean(m) && Number(m[2]) >= (m[1] === "2" ? 148 : 145);
}

/**
 * The drawn foil map of a Wizards of the Coast print, or "" for none (the generic engine then decides). foilExtras() adds
 * `has-foil-map` when it returns a path. Empty until the finish agents draw window masks (or TCG Live maps exist: see the header).
 */
export function wotcMap(card) {
  // The e-Card sets' art window and the Crystal Pokémon's window-minus-figure (js/wotc-ecard-maps.js, finish agent j2).
  const ecard = ecardMap(card);
  if (ecard) return ecard;
  // Shining Pokémon figures and the First Movie stamp (js/wotc-special.js, finish agent j3).
  const special = specialMap(card);
  if (special) return special;
  // j1: the window holos of Base Set to Neo Destiny, Legendary Collection and the cosmos promos (css/holo/wotc.css).
  const win = wotcWindowMap(card);
  if (win) return win;
  return "";
}

/** The art-window masks of the three frames (assets/foil/wotc-win/, scripts/make_wotc_window_masks.py): one Pokémon window fits every set. */
export const WOTC_WIN = "assets/foil/wotc-win/";
export function wotcLayout(card) {
  if (card?.energy || card?.supertype === "Energy") return "energy";
  if (card?.supertype === "Trainer") return "trainer";
  return "pokemon";
}

/**
 * The per-card foil map of a window holo that wotc.css draws (assets/foil/wotc-spark/<set>/<n>-v1.webp, drawn by
 * scripts/make_wotc_spark_maps.py from the sparkle the card's own scan shows; a crop of the art window, placed by the
 * layout's `--wotc-map-size/-pos`), else "". The scans of the holos are scans of the real foil: a Pokémon, which is ink over
 * it, carries none, and a card's map is full on the stars and flecks and faint over the sky between them.
 */
function wotcWindowMap(card) {
  if (isEcard(card) || isCrystal(card) || card?.rarity === "Rare Shining") return "";
  if (!/\bwotc-cosmos\b/.test(wotcPattern(card))) return "";
  const [set, num] = String(card.id || "").split("-");
  return set && num ? `assets/foil/wotc-spark/${set}/${num}-v1.webp` : "";
}

/**
 * The finish of a Wizards of the Coast print, read from its rarity. An empty string means the generic engine decides;
 * "foil-none" means the card is not foil (the plain Rare, the common, the flat promo).
 */
export function wotcPattern(card) {
  const special = specialPattern(card); // Shining, First Movie stamp (js/wotc-special.js, finish agent j3)
  if (special !== null) return special;
  if (isCrystal(card)) return "foil-holo wotc-crystal";
  switch (card.rarity) {
    case "Rare Shining":
      return "foil-holo wotc-shining";
    case "Rare Secret":
      // Dark Raichu (base5 83) sits on the holo sheet: a cosmos holo.
      return `foil-holo ${isEcard(card) ? "wotc-ecard" : "wotc-cosmos"}`;
    case "Rare Holo":
      if (isEcard(card)) return "foil-holo wotc-ecard";
      return `foil-holo wotc-cosmos${isStarlight(card) ? " wotc-starlight" : ""}`;
    case "Rare":
      // The plain Rare is not foil at all (the non-holo twin of a holo, and every other rare).
      return "foil-none";
    case "Promo":
      // basep and bp: a flat card unless the data says holo / reverse (cardFlags `holo` / `reverse`, from the finish table in
      // wotc-promo-claims.md). The gold stamps (First Movie, Winner) are the finish agents' mask job.
      return card.holo ? "foil-holo wotc-cosmos" : card.reverse ? "" : "foil-none";
    case "Common":
    case "Uncommon":
    case "Energy":
    case "None":
      return card.holo ? "foil-holo wotc-cosmos" : "";
    default:
      return "";
  }
}

/**
 * The reverse holo of a Wizards of the Coast print: the Legendary Collection's fireworks ("wotc-legendary", the whole card but the
 * art window) or the e-Card refractor / any promo's reverse ("wotc"). foil-maps.js turns the string into
 * `rev-mirror era-wotc wotc-rev` (+ ` wotc-rev-legendary`), which css/holo/wotc-ecard.css and wotc-special.css style. No reverse
 * exists before base6 (wotc-pack-structure.md).
 */
export function wotcReverseFinish(card) {
  if (isEcard(card)) return "wotc-ecard"; // the e-Card mirror (css/holo/wotc-ecard.css), finish agent j2
  const promo = specialReverseFinish(card); // basep / bp reverse promos (js/wotc-special.js, finish agent j3)
  if (promo) return promo;
  return /^base6-/.test(String(card?.id || "")) ? "wotc-legendary" : "wotc";
}

/**
 * `rev-mirror era-wotc wotc-rev wotc-rev-legendary` plus the two images css/holo/wotc.css masks the fireworks with: the burst sheet
 * (assets/foil/wotc-rev/fireworks-v1.webp, scripts/make_wotc_fireworks.py) as `--wotc-fw`, and the layout's art window
 * (assets/foil/wotc-win/, scripts/make_wotc_window_masks.py) as `--wotc-win`, which the reverse leaves matte.
 */
export function wotcLegendaryExtras(card, url) {
  return {
    classes: "rev-mirror era-wotc wotc-rev wotc-rev-legendary",
    style: `--wotc-fw:url('${url("assets/foil/wotc-rev/fireworks-v1.webp")}');--wotc-win:url('${url(`${WOTC_WIN}${wotcLayout(card)}-v1.webp`)}')`,
    cure: false,
  };
}
