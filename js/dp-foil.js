/**
 * Diamond & Pearl generation finishes (2007-2011): which class string a card of the generation draws with.
 *
 * One era id, `dp`, covers the whole card generation because the frame, the cosmos holo and the
 * mirror reverse never change from Diamond & Pearl (May 2007) to Call of Legends (February 2011):
 * dp1 Diamond & Pearl, dp2 Mysterious Treasures, dp3 Secret Wonders, dp4 Great Encounters, dp5 Majestic
 * Dawn, dp6 Legends Awakened, dp7 Stormfront, pl1 Platinum, pl2 Rising Rivals, pl3 Supreme Victors, pl4
 * Arceus, hgss1 HeartGold & SoulSilver, hgss2 HS Unleashed, hgss3 HS Undaunted, hgss4 HS Triumphant, col1
 * Call of Legends, the promo sets dpp (DP Black Star Promos, Platinum's included) and hsp (HGSS Black Star
 * Promos), POP Series 6-9 and the Trainer Kits (`dptk3a` / `dptk3b` Manaphy and Lucario, `hgsstk4a` /
 * `hgsstk4b` Gyarados and Raichu). Split out of foil-maps.js like js/bw-foil.js so the finish threads can
 * tune it without touching the shared file. The recipes live in css/holo/dp.css (cosmos holo, mirror
 * reverse, plain), dp-special.css (LV.X, Prime, LEGEND, SP) and dp-secret.css (Shining, Rotom, Arceus AR,
 * Shiny Legendaries, Alph Lithograph); every class below starts from the older class the Classic engine
 * keys on (`foil-holo`, `foil-ex`, `foil-ultra`) and adds its own `dp-*` class, the way js/bw-foil.js does.
 *
 * The rarity words are pkmn.gg's, read from its pages on 2026-10-01
 * (https://www.pkmn.gg/series/diamond-pearl/<slug>, /platinum/<slug>, /heartgold-soulsilver/<slug>).
 * Like XY and Black & White the era keeps "Rare Holo" apart from "Rare" (scripts/build_set.py `era` list):
 *   Common, Uncommon, Rare (not foil),
 *   Rare Holo         (cosmos holo on the art window; includes hgss1's Red Gyarados 123),
 *   Rare Holo LV.X    (dp1 3, dp2 3, dp3 2, dp4 4, dp5 4, dp6 7, dp7 5, pl1 6, pl2 9, pl3 7, pl4 6; subtype "Level-Up"),
 *   Rare Prime        (hgss1 6, hgss2 6, hgss3 6, hgss4 8; no subtype pkmn.gg gives),
 *   LEGEND            (pkmn.gg's word, no "Rare Holo"; hgss1 4, hgss2 6, hgss3 4, hgss4 4: the two halves of a
 *                      pair take consecutive numbers),
 *   Rare Secret       (dp2 124 Time-Space Distortion, dp7 101-103 the Charmander line, pl1 Haymaker trio,
 *                      pl2 three Pikachu, pl3 the Legendary Birds, and hgss1-hgss4's Alph Lithograph numbered
 *                      ONE / TWO / THREE / FOUR),
 *   Promo             (dpp, hsp),
 *   "None"            (the four Trainer Kit halves, the 2010 HGSS Energy),
 * and the subsets, which pkmn.gg files under plain labels and tells apart only by their number prefix:
 *   SH1-SH3 dp7, SH4-SH6 pl1, SH7-SH9 pl3, SH10-SH12 pl4 (Shining Pokémon): rarity "Rare", reverseHolofoil only;
 *   RT1-RT6 pl2 (Rotom, Charon's Choice): "Rare", reverseHolofoil only;
 *   AR1-AR9 pl4 (Arceus): "Rare", holofoil;
 *   SL1-SL11 col1 (Shiny Legendaries): "Rare Holo", holofoil.
 * A set's data file gives those four subsets rarities of their own with `rarityOverrides` (scripts/build_set.py),
 * so filters, hits, pools and sell values can tell them from a plain Rare:
 *   SH*  -> "Rare Shining" (the word Shining Legends already uses; label "Shining Pokémon"),
 *   RT*  -> "Rare Rotom", AR* -> "Rare Arceus", SL* -> "Rare Shiny Legendary".
 * Alph Lithograph stays "Rare Secret" and is told apart by `alph: true` (cardFlags), so the engine's `secret`
 * pool does not deal it from the rare slot of an HGSS pack (it has its own `alph` rate).
 * pkmn.gg counts per rarity (printed + secret + subset): dp1 C47 U38 R25 RH17 LV3; dp2 C42 U37 R23 RH18 LV3 RS1;
 * dp3 C45 U41 R24 RH20 LV2; dp4 C38 U32 R21 RH11 LV4; dp5 C32 U30 R20 RH14 LV4; dp6 C48 U46 R28 RH17 LV7;
 * dp7 C31 U33 R23 (20 + SH1-SH3) RH11 LV5 RS3; pl1 C39 U42 R26 (23 + SH) RH17 LV6 RS3; pl2 C33 U32 R30 (24 + RT)
 * RH13 LV9 RS3; pl3 C45 U47 R37 (34 + SH) RH14 LV7 RS3; pl4 C32 U29 R32 (20 + AR + SH) RH12 LV6; hgss1 C40 U38 R21
 * RH14 Prime6 LEGEND4 RS1; hgss2 C28 U28 R16 RH11 P6 L6 RS1; hgss3 C29 U26 R15 RH10 P6 L4 RS1; hgss4 C30 U29 R19
 * RH12 P8 L4 RS1; col1 C31 U25 R17 RH33 (22 + SL1-SL11).
 *
 * Finish vocabulary, from the research (/mnt/project-files/every-era/dp/research/dp-pack-structure.md,
 * /mnt/project-files/every-era/hgss/research/hgss-pack-structure.md and pl-pack-structure.md section 3; each fact
 * has two sources in the second-source-check files):
 *  - Rare Holo, LV.X, secrets: COSMOS holofoil, "a very vibrant and present holofoil pattern with circles, resembling a
 *    galaxy" (Collexy), "dots and circles of varying sizes, and the occasional swirl" (Bulbapedia, Cosmos Holofoil). On a
 *    plain Rare Holo it sits in the ART WINDOW only; the frame and text stay flat.
 *  - Rare Holo LV.X: cosmos in the art plus a foil shimmer along the frame ("holofoil borders ... and art that pops out of
 *    the frame", Bulbapedia). No reverse. `foil-ex dp-lvx`.
 *  - Rare Prime: HOLOFOIL BORDERS and GOLD FOIL NAME text, spiky art window, art itself NOT holo (Bulbapedia, PokeTooling);
 *    printed on its own sheet in the reverse slot. `foil-ex dp-prime`.
 *  - LEGEND: "entirely holofoil", the whole face (Bulbapedia); two cards line up into one picture, the art runs off one
 *    edge. `foil-ultra dp-legend` plus `dp-legend-top` / `dp-legend-bottom` (legendHalf below).
 *  - Reverse holo: the MIRROR pattern, every part of the card but the art window, "a reflective pattern without any
 *    additional specific pattern" (Collexy 3.1.1.1; Coded Yellow "a holographic sheen with vertical rainbow colours").
 *    `rev-mirror era-dp dp-rev`.
 *  - Shining Pokémon (dp7 SH1-SH3, pl1, pl3, pl4): shiny-colour art on the reverse sheet, mirror-like foil (Collexy, Elite
 *    Fourum). Look NOT confirmed by a photo (low confidence). `foil-holo dp-shining`.
 *  - Rotom RT1-RT6: CRACKED ICE reverse holo over the whole card except the art (Collexy, Elite Fourum). `foil-holo dp-rotom`.
 *  - Arceus AR1-AR9: a different holofoil from the reverses (Elite Fourum), cosmos-type art holo (Collexy, pkmn.gg `holofoil`).
 *    `foil-holo dp-ar`.
 *  - Shiny Legendaries SL1-SL11: cosmos-type art holo with a silver card border like ex / LV.X (Flipside, Collexy). `foil-holo dp-shiny-legend`.
 *  - Alph Lithograph: stone-tablet Unown card. DISPUTED in the text sources (Elite Fourum "textured, but non-holo", Collexy "also
 *    received the Cosmos Holofoil treatment", pkmn.gg / TCGplayer list the print as Holofoil); DECIDED from photos (finish agent h3):
 *    textured stone, NOT a rainbow holo. `foil-holo dp-alph` draws raking light on the scan's own relief, no hue (dp-secret.css).
 *
 * TCG Live foil maps: NONE (probed 2026-10-01 on cdn.malie.io, file
 * .../cards/png/en/<key>/<key>_en_<nnn>_std.foil.png, curl -I). Known HOLO numbers (hgss1 001 Arcanine and 002, dp1 001
 * Dialga, pl1 001 Ampharos and 003, col1 001 Clefable and 002 Deoxys) and every number 001-160 under keys dp1-dp7,
 * pl1-pl4, pt1-pt4, hgss1-hgss4, hs1-hs4, hgss-1, hgss1-5, col1, cl1, col, dpbsp, hsbsp, hgssbsp, dpp, hsp: all 404, while
 * the control (xy12 001) answers 200. See the DP block of .claude/skills/card-textures/scripts/fetch_foil_maps.py. So
 * `dpMap(card)` below is the finish agents' hook for DRAWN masks (the window of a Rare Holo, the frame of a Prime / LV.X).
 *
 * The card's `era: "dp"` (set by build_products.py for the promos and the reprints, from the set's `era`) lets a later
 * product's reprint take the era's finish through its `foilAs`; the numbered sets are recognised by id.
 */

/** A Diamond & Pearl generation print: the numbered sets, the promo sets, POP 6-9, the Trainer Kits. */
export function isDp(card) {
  return card?.era === "dp" || /^(dp\d|pl\d|hgss\d|col1|dpp|hsp|pop[6-9]|dptk|hgsstk)/.test(String(card?.id || ""));
}

/** Prints that are foil edge to edge; they take the all-white map until a drawn one exists. Only the LEGEND halves. */
export const DP_FULL_ART = new Set(["LEGEND"]);

/** The first number of each HGSS set's LEGEND run: the pairs are consecutive (111 and 112 are Ho-Oh LEGEND's two halves). */
const LEGEND_FIRST = { hgss1: 111, hgss2: 90, hgss3: 87, hgss4: 99 };

/**
 * Which half of a LEGEND a card is: "top" or "bottom" (`legendHalf` data flag first, else the number: the first card of
 * each consecutive pair is taken to be the top half, so Ho-Oh LEGEND 111 is the top and 112 the bottom). The research
 * files only say the halves take consecutive numbers (hgss-pack-structure.md); which half is which is an ASSUMPTION from
 * that order, low-medium confidence: the finish agent checks it against the scans and may set `legendHalf` per card.
 * "" when the card is not a LEGEND.
 */
export function legendHalf(card) {
  if (card?.legendHalf === "top" || card?.legendHalf === "bottom") return card.legendHalf;
  if (card?.rarity !== "LEGEND") return "";
  const m = /^(hgss\d)-(\d+)$/.exec(String(card?.id || ""));
  const first = m ? LEGEND_FIRST[m[1]] : undefined;
  if (first === undefined) return "";
  return (Number(m[2]) - first) % 2 === 0 ? "top" : "bottom";
}

/** Alph Lithograph (ONE-FOUR): the data flag, else the card's name. */
export function isAlph(card) {
  return Boolean(card?.alph) || /^Alph Lithograph/i.test(String(card?.name || ""));
}

/**
 * Prints with an etched layer (the shared engraving tile). None: the Alph Lithograph's stone grain is lit from the scan itself
 * (css/holo/dp-secret.css), because the shared tile is a diagonal hatch and a hatch aliases into a line screen at phone size.
 */
export function dpEtched(card) {
  void card;
  return false;
}

/**
 * The drawn foil map of a Diamond & Pearl generation print, or "" for none (the generic engine then decides). TCG Live has
 * no maps for this generation (see the header), so the finish agents fill this in with window masks (cosmos holo: the art
 * window; Prime and LV.X: the frame). foilExtras() adds `has-foil-map` when it returns a path.
 */
export function dpMap(card) {
  void card;
  return "";
}

/**
 * The finish of a Diamond & Pearl generation print, read from its rarity. An empty string means the generic engine
 * decides; "foil-none" means the card is not foil (the plain Rare, as in the other eras).
 */
export function dpPattern(card) {
  if (isAlph(card)) return "foil-holo dp-alph";
  switch (card.rarity) {
    case "Rare Holo LV.X":
      return "foil-ex dp-lvx";
    case "Rare Prime":
      return "foil-ex dp-prime";
    case "LEGEND": {
      const half = legendHalf(card);
      return `foil-ultra dp-legend${half ? ` dp-legend-${half}` : ""}`;
    }
    case "Rare Shining":
      return "foil-holo dp-shining";
    case "Rare Rotom":
      return "foil-holo dp-rotom";
    case "Rare Arceus":
      return "foil-holo dp-ar";
    case "Rare Shiny Legendary":
      return "foil-holo dp-shiny-legend";
    case "Rare Secret":
      // Time-Space Distortion, the retro Charizard line, the Haymaker trio, the Pikachus, the Legendary Birds: cosmos holo.
      return "foil-holo dp-holo dp-secret";
    case "Rare Holo":
      return "foil-holo dp-holo";
    case "Rare":
      // The plain Rare is not foil at all (POP 6-9's rares too: the holo versions came only from retail products).
      return "foil-none";
    default:
      return "";
  }
}

/**
 * The reverse holo of a Diamond & Pearl generation print: always the Mirror pattern (the whole card but the art window,
 * art NOT foiled even on a Rare Holo's reverse; Collexy 3.1.1.1 for the DP, Platinum and HGSS overviews, Bulbapedia's
 * Reverse Holofoil page). foil-maps.js turns it into `rev-mirror era-dp dp-rev`, which css/holo/dp.css styles. A reverse of
 * a basic Energy (Call of Legends' eight) or a Trainer takes the same class.
 */
export function dpReverseFinish() {
  return "dp";
}
