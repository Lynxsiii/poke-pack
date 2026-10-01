/**
 * EX generation finishes (2003-2007): which class string a card of the generation draws with.
 *
 * One era id, `ex`, covers the whole generation because the frame, the cosmos holo and the numbering never change
 * from EX Ruby & Sapphire (June 2003) to EX Power Keepers (February 2007): ex1 Ruby & Sapphire, ex2 Sandstorm, ex3
 * Dragon, ex4 Team Magma vs Team Aqua, ex5 Hidden Legends, ex6 FireRed & LeafGreen, ex7 Team Rocket Returns, ex8
 * Deoxys, ex9 Emerald, ex10 Unseen Forces, ex11 Delta Species, ex12 Legend Maker, ex13 Holon Phantoms, ex14 Crystal
 * Guardians, ex15 Dragon Frontiers, ex16 Power Keepers; the promo set `np` (Nintendo Black Star Promos NP001-NP040, never
 * in packs: products and events); POP Series 1-5 (`pop1`-`pop5`, two-card packs); the four EX Trainer Kit half decks
 * (`extk1a` Latias, `extk1b` Latios, `extk2a` Plusle, `extk2b` Minun; pkmn.gg and scrydex call them tk1a, tk1b, tk2a, tk2b).
 * Split out of foil-maps.js like js/dp-foil.js so the finish threads can tune it without touching the shared file. The
 * recipes live in css/holo/ex.css (cosmos holo, the reverse families, plain), ex-ex.css (Pokémon-ex, Gold Star, cracked ice)
 * and ex-delta.css (refractor holos, the Holon Phantoms and Power Keepers sheen Energy); every class below starts from the
 * older class the Classic engine keys on (`foil-holo`, `foil-ex`, `foil-ultra`) and adds its own `ex-*` class, the way
 * js/dp-foil.js does.
 *
 * The rarity words are pkmn.gg's, read from https://www.pkmn.gg/series/ex/<slug> on 2026-10-01 (all sixteen sets, the four
 * kits, https://www.pkmn.gg/series/pop and /series/np). Like XY, Black & White and the Diamond & Pearl generation, the era keeps
 * "Rare Holo" apart from "Rare" (scripts/build_set.py `era` list):
 *   Common, Uncommon, Rare (NOT foil),
 *   Rare Holo       (cosmos holo in the art box, or refractor: see below. Counts: ex1 14, ex2 14, ex3 12, ex4 12, ex5 15, ex6 17,
 *                    ex7 14, ex8 15, ex9 11, ex10 19, ex11 18, ex12 14, ex13 17, ex14 13, ex15 12, ex16 13 Pokémon, plus the holo
 *                    basic Energy: ex9 101-106, ex13 105-110, ex16 103-108, which pkmn.gg also files as "Rare Holo"),
 *   Rare Holo EX    (the Pokémon-ex; pkmn.gg writes a capital EX like XY. ex1 8, ex2 7, ex3 9, ex4 7, ex5 9, ex6 9, ex7 11, ex8 9,
 *                    ex9 11, ex10 12, ex11 3, ex12 7, ex13 3, ex14 10, ex15 10, ex16 8),
 *   Rare Holo Star  (the Gold Stars: ex7 3, ex8 3, ex10 3, ex11 3, ex12 3, ex13 3, ex14 2, ex15 2, ex16 3; the name carries a
 *                    star "Mudkip ★"),
 *   Rare Secret     (ex3 98-100 the Charmander line, ex4 96 Absol and 97 Jirachi, ex5 102 Groudon, ex6 113-116 Charmander and the
 *                    three birds ex, ex7 110 Charmeleon and 111 Here Comes Team Rocket!, ex8 108 Rocket's Raikou ex, ex9 107
 *                    Farfetch'd, ex10 116 Rocket's Persian ex and 117 Celebi ex, ex11 114 Azumarill, ex12 93 Pikachu delta,
 *                    ex13 111 Mew; ex14, ex15 and ex16 have none). Most of them are BOX TOPPERS, not in packs (research
 *                    box-contents.md): the set file flags them `boxTopper: true` and the pools leave them out,
 *   Rare            (ex10's Unown Collection A-Z, ! and ? are "Rare" on pkmn.gg, 28 cards: the set file's `rarityOverrides` gives
 *                    them "Rare Unown" so the Rare pool does not deal them as plain rares),
 *   Promo           (np),
 *   Common/Uncommon/Rare (the four Trainer Kit halves: tk1a Common 9 Rare 1, tk1b Common 9 Rare 1, tk2a Common 11 Rare 1, tk2b Uncommon
 *                    2 Common 10; each kit's one holo card, #4 Latias, #2 Latios, #6 Plusle and #6 Minun, has a holofoil variant on
 *                    pkmn.gg and takes `holo: true` by cardFlags: cosmos, see exPattern).
 * There is no "Rare Ultra", "Rare Rainbow" or "Rare Holo Star" before ex7 (the first Gold Stars): the brief's checklist of ex1,
 * ex5, ex7, ex9, ex11, ex15, ex16 found exactly the words above. The holo basic Energy (ex9, ex13, ex16) are `supertype
 * Energy`: build_set files them as rarity "Energy" with `holoEnergy: true`, so the holo pool and the Energy pool both leave
 * them out and the reverse slot deals them (exSlots `holoEnergy`).
 *
 * Finish vocabulary, from the research (/mnt/project-files/every-era/ex/research/ex-finish-types.md; Collexy "Holofoil
 * Overview EX Series era" and the Elite Fourum reverse threads 16005 and 58382 are the two sources of each fact; written
 * descriptions only: no photo was examined, the finish agents do the photo work):
 *  - COSMOS holofoil (`foil-holo ex-cosmos`): "a very vibrant, dense pattern of circles and sparkle" in the ART BOX; the frame
 *    and text stay flat. Default of Rare Holo, Pokémon-ex, Gold Star and secret in every set; also the Unown Collection, the
 *    Emerald holo Energy and the np holos.
 *  - REFRACTOR holofoil ("inverse", `ex-refractor`): the POKÉMON itself is shiny, the background has no foil. All 18 Delta
 *    Species holos (ex11), all Holon Phantoms holos except the six Energy (ex13), the three Delta holos and Sceptile ex delta of
 *    Crystal Guardians (ex14; mixed with cosmos, "interchangeably", COL), and the whole of Dragon Frontiers (ex15: "no cosmos at
 *    all", the Pokémon-ex and the Gold Stars too). A per-set rule plus a per-card `refractor` flag (exRefractor).
 *  - CRACKED ICE (`ex-cracked-ice`): a sparse, crack-like set of reflective patches; ONLY Regirock ex, Regice ex, Registeel ex
 *    (ex5) and the secret Moltres ex, Zapdos ex, Articuno ex (ex6). The layer peels off some copies, which then look like plain
 *    cosmos (COL). A per-set rule plus a per-card `crackedIce` flag (isCrackedIce).
 *  - SHEEN (`ex-sheen`): plain reflective foil with no pattern: the six holo Energy of Holon Phantoms (105-110) and Power Keepers
 *    (103-108). The Emerald Energy (101-106) are cosmos (COL; Pokegym posters call them "matrix").
 *  - The Gold Star's border is plain yellow, even on the delta stars of ex13 (Gyarados) and ex15 (EF posts 54 and 60).
 *  - The DOT STRIP (13 vertical lines at the foot of the card, in the card's colour): present on non-holo RS cards but NOT on
 *    RS holos and reverses; present on holo, reverse and non-holo cards of Sandstorm and Dragon; removed from Team Magma vs Team
 *    Aqua on (COL says holos in MA lack it but ultra and secret cards still had it: the two statements conflict slightly). No
 *    foil over the strip. Single source (COL), low-medium.
 *  - REVERSE HOLO, two eras (exReversePattern below):
 *      ex1-ex4 "mirror": the card body (everything but the art box) is covered by a plain reflective foil with no pattern, the
 *        art box un-foiled (RS: the foil bleeds a little into the art frame). EF calls it "refractor" in post 54.
 *      ex5 onward: the foil is INSIDE the art box (a pattern) with a set stamp, the body plain. ex5 and ex6 "energy" (a column of
 *        repeated type symbols; Rare and Holo Rare reverses add a holofoil stamp: the Pokémon's type symbol in ex5, a Poké Ball
 *        in ex6); ex7 "energy" with the set name stamped bottom right of the art box (silver on non-rares, orange on rares, gold
 *        name on rares); ex8 "wheel" (a fan of ten alternating dark and light wedges, plus the set-name stamp); ex9 and ex10
 *        "pokeball" (set stamp; rares: gold name, gold HP, silver rarity symbol; ex10 shows a 3D effect at an angle); ex11, ex13,
 *        ex14, ex15, ex16 "plain" (a faint sheen with no pattern, set stamp; EF post 54 also calls this "refractor"; rares gold
 *        name and HP, silver rarity symbol; the Holo Rare reverses of ex11, ex13, ex15 and the three Delta holos of ex14 add
 *        golden borders, ex16 none); ex12 "cosmos" (the only later set with the ordinary cosmos pattern in the art box).
 *    `rev-mirror era-ex ex-rev ex-rev-<pattern>` is the class string; the finish agents draw each family.
 *  - Special cards in the reverse slot: ex10's Unown Collection (cosmos holo, 28 cards, 0.199 of packs) and the holo Energy
 *    (ex9 cosmos; ex13, ex16 sheen).
 *  - Prerelease and "WINNER" stamped promos reuse the set's cosmos holo; the theme-deck exclusives are cosmos (TRR, DX, UF) or
 *    refractor (HP Latias and Latios delta).
 *
 * TCG Live foil maps: NONE (probed 2026-10-01, curl -I on https://cdn.malie.io/file/malie-io/tcgl/cards/png/en/<key>/<key>_en_<nnn>_std.foil.png).
 * Keys ex1-ex16, ex-1, rs1, exbsp, np (and a first sweep of ex, rs, rs-1, ex1-1, nsp, np1, pop1-pop5, tk1a-tk2b, extk1, ex_rs) at the known HOLO numbers 001,
 * 002, 003 (the first holo Rares of every set), 100 and 101 (Pokémon-ex and the Gold Stars of ex15 Charizard and Mew), and then
 * every number 001-145 under ex1-ex16 and 001-045 under np, rs1, ex-1 and exbsp: every answer 404, while the control (xy12
 * 001 and 002) answers 200. TCG Live's own index (.../tcgl/export/index.json, en-US) lists only me1-me5, sv1-sv10, mebsp, svbsp
 * and their sub-sets. See the EX block of .claude/skills/card-textures/scripts/fetch_foil_maps.py. So `exMap(card)` below is
 * the finish agents' hook for DRAWN masks (the art box of a Rare Holo, the frame and art of a Pokémon-ex, the Pokémon of a refractor).
 *
 * The card's `era: "ex"` (set by build_products.py for the promos and the reprints, from the set's `era`) lets a later
 * product's reprint take the era's finish through its `foilAs`; the numbered sets are recognised by id.
 */

/** An EX generation print: the numbered sets, the promo set, POP Series 1-5, the Trainer Kits. */
export function isEx(card) {
  return card?.era === "ex" || /^(ex\d+|np|pop[1-5]|extk|tk[12][ab])/.test(String(card?.id || ""));
}

/** The set id a card id begins with: "ex13-105" gives "ex13", "ex5-np012" gives "ex5" (a promo filed in a set's data). */
function setOf(card) {
  const m = /^([a-z]+\d*[a-z]*\d*)-/.exec(String(card?.id || ""));
  return m ? m[1] : "";
}

/** A Pokémon-ex by name ("Mew ex", "Sceptile ex δ", "Rocket's Persian ex"), for the secret rares. */
function isExName(card) {
  return /(^|\s)ex(\s|$)/i.test(String(card?.name || ""));
}

/**
 * Refractor sets: the rarities of each whose cards are refractor ("inverse") holos. ex14 mixes the two and is decided per card
 * (the Delta ones, see exRefractor). A card's `refractor` flag (cardFlags in the set file, true or false) wins over the rule.
 */
const REFRACTOR_SETS = {
  ex11: ["Rare Holo"],
  ex13: ["Rare Holo"],
  ex15: ["Rare Holo", "Rare Holo EX", "Rare Holo Star"],
};

/** Whether a card is a refractor ("inverse") holo: the Pokémon shiny, the background matte. See the header. */
export function exRefractor(card) {
  if (card?.refractor === true) return true;
  if (card?.refractor === false) return false;
  const set = setOf(card);
  if (REFRACTOR_SETS[set]) return REFRACTOR_SETS[set].includes(card.rarity) && card.supertype !== "Energy" && !card.holoEnergy;
  // Crystal Guardians: the three Delta holos and Sceptile ex delta; the rest of its holos are cosmos.
  if (set === "ex14") return /δ/.test(String(card?.name || "")) && (card.rarity === "Rare Holo" || card.rarity === "Rare Holo EX");
  return false;
}

/** Whether a card is a cracked-ice holo: Regirock ex, Regice ex, Registeel ex (ex5) and the secret bird ex of ex6. `crackedIce` flag first. */
export function isCrackedIce(card) {
  if (card?.crackedIce === true) return true;
  if (card?.crackedIce === false) return false;
  const set = setOf(card);
  if (set === "ex5") return card.rarity === "Rare Holo EX" && /^(Regirock|Regice|Registeel) ex$/.test(String(card.name || "").trim());
  if (set === "ex6") return card.rarity === "Rare Secret" && /^(Articuno|Moltres|Zapdos) ex$/.test(String(card.name || "").trim());
  return false;
}

/** No EX print has an etched layer: the dot strip and the cosmos circles are flat. */
export function exEtched(card) {
  void card;
  return false;
}

const WINDOWS = "assets/foil/ex-win/";

/** A Pokémon-ex or Gold Star by subtype (the ex frame is the Pokémon-ex finish agent's: ex-ex.css). */
function isExFrame(card) {
  return (card?.subtypes || []).some((s) => /^(ex|star)$/i.test(String(s)));
}

/**
 * The art window of an EX generation print's regular frame: `assets/foil/ex-win/<layout>[-i].webp`, a white 600 x 838 image whose
 * alpha is the picture (scripts/make_ex_window_masks.py measures it from the scans). Layouts: `pokemon` (Basic and the trainer
 * kits' and POP's Pokémon), `pokemon-evo` (Stage 1 and 2: the Evolves-from circle is cut out of the corner), `trainer` (Item,
 * Supporter, Stadium, Tool, TM) and `energy` (Special Energy: the picture runs under the title to both card edges); a basic
 * Energy has none. ex3 and ex6's scrydex scans are zoomed out about 5 percent, so they take the `-i` variants. "" for a
 * Pokémon-ex, a Gold Star and the other frames (the other finish agents' masks).
 */
export function exWindow(card) {
  if (!card || isExFrame(card)) return "";
  const subs = card.subtypes || [];
  let layout;
  if (card.supertype === "Trainer") layout = "trainer";
  else if (card.supertype === "Energy") return subs.includes("Special") ? `${WINDOWS}energy.webp` : "";
  else layout = subs.includes("Stage 1") || subs.includes("Stage 2") || card.evolvesFrom ? "pokemon-evo" : "pokemon";
  const inset = /^ex[36]-\d/.test(String(card.id || ""));
  return `${WINDOWS}${layout}${inset ? "-i" : ""}.webp`;
}

/**
 * The cosmos holo's window map: every Rare Holo that is not a refractor, the secret cosmos reprints, the promos with a cosmos
 * `foilAs` and the kit holos take their frame's art window (exWindow). The Pokémon-ex, Gold Star, refractor, sheen, Unown and
 * cracked-ice prints are the other finish agents'.
 */
function exWindowMap(card) {
  if (!card || exRefractor(card) || isExFrame(card) || card.holoEnergy || card.supertype === "Energy") return "";
  const cosmos = card.rarity === "Rare Holo" || (card.rarity === "Rare Secret" && !isExName(card)) || card.holo || card.foilAs === "Rare Holo";
  return cosmos ? exWindow(card) : "";
}

/**
 * The drawn foil map of an EX generation print, or "" for none (the generic engine then decides). TCG Live has no maps for
 * this generation (see the header), so the finish agents fill this in with drawn masks. foilExtras() adds `has-foil-map` when
 * it returns a path. i1: the cosmos holo's art window (exWindowMap). The Pokémon-ex frame, the refractor Pokémon, Unown and the
 * holo Energy are added by the other finish agents' functions (|| them here).
 */
export function exMap(card) {
  // i2's: Pokémon-ex (silver frame and art), Gold Star and Unown; i1's cosmos window of the other holos; i3's refractor Pokémon and
  // sheen Energy.
  return exExMap(card) || exWindowMap(card) || exDeltaMap(card);
}

/*
 * i3 (refractor holos, sheen Energy): assets/foil/ex-delta/, drawn by .claude/skills/card-textures/scripts/make_ex_delta_masks.py.
 *   <card id>.webp   a refractor print: ALPHA is the Pokémon's silhouette inside the art window (the art background, the printed
 *                    frame, the name bar and the text are 0); a Delta Species holo adds its yellow border at 0.30;
 *   energy-art.webp  the Holon Phantoms and Power Keepers holo Energy: the picture alone (header bar and footer strip are 0).
 * Every exRefractor() print has a file; the Emerald Energy (cosmos) are i1's.
 */
const DELTA = "assets/foil/ex-delta/";

export function exDeltaMap(card) {
  if (!card || !isEx(card)) return "";
  if (card.holoEnergy) return setOf(card) === "ex9" ? "" : `${DELTA}energy-art.webp`;
  return exRefractor(card) ? `${DELTA}${card.id}.webp` : "";
}

/*
 * i2 (Pokémon-ex, cracked ice, Gold Star, secret rares, Unown): masks drawn by scripts/make_ex_ex_masks.py, assets/foil/ex-ex/.
 * Measured on the scans: the frame moves a little from set to set (A: ex1, ex4, ex5, ex7-ex16; A2: ex2; B: ex3 and ex6), the dot
 * strip along the foot exists on ex2, ex3 and ex4 only, and a Stage 1 or 2 has the evolution circle where a Basic has its tab.
 *   ring-<frame>[-s]-<layout>: the art window plus the silver frame (the Pokémon-ex, cracked ice included);
 *   win-<frame>-<layout>:      the art window alone (Gold Star, Unown, the non-ex secret rares);
 *   (win-trainer.webp is drawn too but unused: i1's exWindow takes the Supporter frame.)
 * A refractor print (exRefractor: the delta ex and stars, ex13 Gyarados) is i3's, so it returns "" here.
 */
const EXEX_FRAME = { ex2: "A2", ex3: "B", ex6: "B" };
const EXEX_STRIP = new Set(["ex2", "ex3", "ex4"]);

function exExLayout(card) {
  return /Stage [12]/.test((card.subtypes || []).join(" ")) ? "stage" : "basic";
}

/** A Pokémon-ex frame print: the Rare Holo EX and the secret rares that are Pokémon-ex by name. */
function isExRing(card) {
  return card.rarity === "Rare Holo EX" || (card.rarity === "Rare Secret" && card.supertype !== "Trainer" && isExName(card));
}

export function exExMap(card) {
  if (!isEx(card) || exRefractor(card)) return "";
  const set = setOf(card);
  const frame = EXEX_FRAME[set] || "A";
  const base = "assets/foil/ex-ex/";
  if (isExRing(card)) return `${base}ring-${frame}${EXEX_STRIP.has(set) ? "-s" : ""}-${exExLayout(card)}.webp`;
  // The non-ex secret rares are i1's cosmos windows (exWindowMap); the Gold Stars and the Unown are drawn here.
  if (card.rarity === "Rare Holo Star" || card.rarity === "Rare Unown" || card.unown) {
    return `${base}win-${frame === "A2" ? "A" : frame}-${exExLayout(card)}.webp`;
  }
  return "";
}

/**
 * The reverse pattern family of each numbered set, from the Elite Fourum table (thread 16005, zomus 2023, and the poll thread
 * 58382) and Collexy's overview (see the header): `pattern` is the family the finish agents draw, `stamp` what the Rare and Holo
 * Rare reverses add ("type": the Pokémon's type symbol, "ball": a Poké Ball, "set": the set name stamped bottom right of the art
 * box on every reverse, "" none), `goldRares` whether Rare and Holo Rare reverses carry a gold name and HP and a silver rarity
 * symbol, `border` whether Holo Rare reverses add golden borders ("holo": every Holo Rare, "delta": the three Delta holos of
 * ex14). The first four sets use the whole-card mirror (art box un-foiled), the rest foil the art box.
 */
export const EX_REVERSE = {
  ex1: { pattern: "mirror", stamp: "", goldRares: false, border: "" },
  ex2: { pattern: "mirror", stamp: "", goldRares: false, border: "" },
  ex3: { pattern: "mirror", stamp: "", goldRares: false, border: "" },
  ex4: { pattern: "mirror", stamp: "", goldRares: false, border: "" },
  ex5: { pattern: "energy", stamp: "type", goldRares: false, border: "" },
  ex6: { pattern: "energy", stamp: "ball", goldRares: false, border: "" },
  ex7: { pattern: "energy", stamp: "set", goldRares: true, border: "" },
  ex8: { pattern: "wheel", stamp: "set", goldRares: false, border: "" },
  ex9: { pattern: "pokeball", stamp: "set", goldRares: true, border: "" },
  ex10: { pattern: "pokeball", stamp: "set", goldRares: true, border: "" },
  ex11: { pattern: "plain", stamp: "set", goldRares: true, border: "holo" },
  ex12: { pattern: "cosmos", stamp: "set", goldRares: false, border: "" },
  ex13: { pattern: "plain", stamp: "set", goldRares: true, border: "holo" },
  ex14: { pattern: "plain", stamp: "set", goldRares: true, border: "delta" },
  ex15: { pattern: "plain", stamp: "set", goldRares: true, border: "holo" },
  ex16: { pattern: "plain", stamp: "set", goldRares: true, border: "" },
};

/** The reverse pattern family of a set id ("ex8" gives "wheel"), "" for a set with no reverse print (np, POP, the kits). */
export function exReversePattern(setId) {
  return EX_REVERSE[String(setId || "")]?.pattern || "";
}

/**
 * Where the set stamp sits on a reverse holo of each set, as a box [left, top, right, bottom] in the 600 x 838 card frame,
 * read off the flat scans of Collexy's EX overview (the logo is foil-free, printed over the pattern, at the art window's lower
 * right: ex7 Team Rocket Returns ... ex16 Power Keepers; ex5 and ex6 carry none). The pattern is cut out of these boxes, with a
 * few pixels of margin for the scans' crop jitter.
 */
const EX_STAMP = {
  ex7: [396, 314, 546, 392],
  ex8: [292, 332, 552, 392],
  ex9: [266, 344, 542, 392],
  ex10: [436, 350, 546, 392],
  ex11: [374, 342, 546, 392],
  ex12: [402, 334, 546, 392],
  ex13: [418, 328, 548, 392],
  ex14: [394, 310, 546, 388],
  ex15: [354, 330, 546, 392],
  ex16: [396, 314, 546, 392],
};

/** The reverse holo's finish: the family of its set, drawn on top of the mirror class. */
export function exReverseFinish() {
  return "ex";
}

/**
 * Class string and custom properties of an EX reverse holo: `rev-mirror era-ex ex-rev ex-rev-<family> ex-rev-set-<set>`
 * (css/holo/ex.css), `--ex-win`, the art window of the card's frame, and `--st-x/y/w/h`, the set stamp's box as fractions of the
 * card. The Mirror of ex1-ex4 foils everything BUT the window, every later family only the window minus the stamp (the pattern
 * lives in the art box). A basic Energy has no window: the Mirror covers its whole face. np promos and the like get the
 * Mirror. foilExtras() calls this for a finish "ex".
 */
export function exReverseExtras(card, url) {
  const set = String(card?.id || "").split("-")[0];
  const family = exReversePattern(set) || "mirror";
  const win = exWindow(card);
  const energy = card?.supertype === "Energy" && !(card.subtypes || []).includes("Special");
  const box = EX_STAMP[set];
  const f = (n, d) => (n / d).toFixed(4);
  const stamp = box && !energy
    ? `;--st-x:${f(box[0], 600)};--st-y:${f(box[1], 838)};--st-w:${f(box[2] - box[0], 600)};--st-h:${f(box[3] - box[1], 838)}`
    : "";
  return {
    classes: `rev-mirror era-ex ex-rev ex-rev-${energy ? "mirror" : family}${EX_REVERSE[set] ? ` ex-rev-set-${set}` : ""}${energy ? " ex-rev-basic-energy" : ""}`,
    style: (win ? `--ex-win:url('${url(win)}')` : "") + stamp,
    cure: false,
  };
}

/**
 * The finish of an EX generation print, read from its rarity. An empty string means the generic engine decides;
 * "foil-none" means the card is not foil (the plain Rare, as in the other eras).
 */
export function exPattern(card) {
  const refractor = exRefractor(card) ? " ex-refractor" : "";
  // The holo basic Energy: Emerald's are cosmos, Holon Phantoms' and Power Keepers' the sheen.
  if (card.holoEnergy) return setOf(card) === "ex9" ? "foil-holo ex-cosmos ex-energy" : "foil-holo ex-sheen ex-energy";
  // Unseen Forces' Unown Collection, in the reverse slot.
  if (card.rarity === "Rare Unown" || card.unown) return "foil-holo ex-cosmos ex-unown";
  // The one holo half-deck card of each Trainer Kit (Latias, Latios, Plusle, Minun: `holo: true` by cardFlags; pkmn.gg files
  // Latias, Latios and Plusle as "Rare" and Minun as "Common", all four with a holofoil variant): cosmos.
  if (card.holo && /^(Rare|Common|Uncommon|None|)$/.test(String(card.rarity || ""))) return "foil-holo ex-cosmos ex-kit";
  // The np promos (and any promo) that carry a cosmos `foilAs`: the Pokémon-ex ones take the ex frame (ex-ex.css), the rest the cosmos
  // (a delta one flagged `refractor` stays refractor).
  if (card.rarity === "Promo" && card.foilAs === "Rare Holo") {
    if (isExFrame(card)) return "foil-ex ex-ex";
    return refractor ? `foil-holo${refractor}` : "foil-holo ex-cosmos";
  }
  switch (card.rarity) {
    case "Rare Holo EX":
      return `foil-ex ex-ex${isCrackedIce(card) ? " ex-cracked-ice" : ""}${refractor}`;
    case "Rare Holo Star":
      return `foil-ultra ex-star${refractor}`;
    case "Rare Secret":
      // The secret Pokémon-ex (the cracked-ice birds, Celebi ex, the Rocket's ex) keep the silver ex frame; the rest are cosmos.
      if (isExName(card)) return `foil-ex ex-ex ex-secret${isCrackedIce(card) ? " ex-cracked-ice" : ""}${refractor}`;
      return `foil-holo ex-cosmos ex-secret${refractor}`;
    case "Rare Holo":
      return refractor ? `foil-holo${refractor}` : "foil-holo ex-cosmos";
    case "Rare":
      // The plain Rare is not foil at all (POP 1-5's rares too: the in-pack cards are non-holo, the holo versions came from
      // retail products); the kit holo is caught above by its `holo` flag.
      return "foil-none";
    default:
      return "";
  }
}
