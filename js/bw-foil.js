/**
 * Black & White era finishes (2011-2013): which class string a card of the era draws with.
 *
 * Split out of foil-maps.js like js/sm-foil.js and js/xy-foil.js so the finish
 * threads can tune it without touching the shared file. The recipes live in
 * css/holo/bw.css (holo, reverse, plain), bw-ex.css (Pokémon-EX, Ace Spec) and
 * bw-fullart.css (full art, secret, Radiant Collection); every class below
 * starts from the older class the Classic engine keys on (`foil-holo`,
 * `foil-ex`, `foil-ultra`, `foil-gold`) and adds its own `bw-*` class, the way
 * js/xy-foil.js does for XY.
 *
 * The rarity words are pkmn.gg's, read from its pages on 2026-10-01
 * (https://www.pkmn.gg/series/black-white/<slug>: black-white, emerging-powers,
 * noble-victories, next-destinies, dark-explorers, dragons-exalted, dragon-vault,
 * boundaries-crossed, plasma-storm, plasma-freeze, plasma-blast, legendary-treasures,
 * bw-black-star-promos). Like XY and Sun & Moon, "Rare Holo" is NOT folded into
 * "Rare" for this era (scripts/build_set.py `era` list). Counts per rarity, the
 * same as pokemontcg.io's labels (r-bw research, bw-pack-structure.md):
 *   Common, Uncommon (bw1 files the eight basic Energy 105-112 as "Common"),
 *   Rare (not foil), Rare Holo (the era's holo; Dragon Vault: all 21 cards are holo),
 *   Rare Holo EX (the regular-art Pokémon-EX, from Next Destinies; subtypes
 *     ["Basic","EX"], Team Plasma EX add "Team Plasma"; no Mega EX in this era),
 *   Rare Ultra (full art Pokémon, Pokémon-EX and Supporters: bw1 Reshiram and
 *     Zekrom, then every set to Plasma Blast; Legendary Treasures'
 *     Radiant Collection RC21-RC25),
 *   Rare ACE (Ace Spec Items and Tools from Boundaries Crossed, subtypes
 *     ["Item","ACE SPEC"], holofoil only, takes the REVERSE slot, see bwSlots),
 *   Rare Secret (bw1 Pikachu 115 and bw3 Meowth, the shiny reprints of Next
 *     Destinies to Dragons Exalted, and the gold secrets of Boundaries Crossed
 *     on, gold Reshiram and Zekrom in Legendary Treasures; secret Items too).
 * pkmn.gg gives no rarity to Dragon Vault's Kyurem and two Trainers, nor to the
 * BW Energy and the Trainer Kits ("None"); the BW Black Star Promos are "Promo".
 * Legendary Treasures' Radiant Collection RC1-RC25 is flagged `rc: true` by
 * scripts/build_set.py (`"rcNumbers": "^RC\\d+$"`); pkmn.gg lists each RC card under
 * a rarity of its own (RC1-RC20 Common/Uncommon, RC21-RC25 Rare Ultra) except
 * RC11, the regular-art Meloetta-EX, which pkmn.gg calls "Rare": builders set it
 * to "Rare Holo EX" with `rarityOverrides` (build_set.py) so the `rcUltra` pool sees it.
 *
 * Correction to the scaffold brief: TCG Live DOES have per-card foil maps for the Black &
 * White series (the brief's probe, bw1_en_001, hit a number that is not a holo). Probed
 * 2026-10-01 on cdn.malie.io, curl -I, every number 001-160 of every key, file
 * .../cards/png/en/<key>/<key>_en_<nnn>_std.foil.png (367x512 RGBA, holo prints only):
 *   bw1..bw11: key = the set id; every Rare Holo, Rare Holo EX, Rare Ultra, Rare Secret
 *   and Rare ACE card of the set has a map and no other card does (bw1 15, bw2 12, bw3 19,
 *   bw4 26, bw5 24, bw6 29, bw7 43, bw8 29, bw9 36, bw10 31, bw11 44 maps).
 *   dv1 Dragon Vault: key `bw6-5`, all 21 cards 001-021.
 *   bwp: key `bwbsp`, 85 maps (001-013, 017-028, 032 ...), numbering equals the BW promo number.
 * Not on the CDN under any key tried: the Radiant Collection RC1-RC25 (bw11 and bw11-5,
 * bw11rc, RC01 / RC001 filenames all 404), the BW Energy, the Trainer Kits, McDonald's
 * 2011 and 2012. fetch_foil_maps.py has the keys. `bwMap(card)` below is the hook where
 * the finish agents return a map path the way smSafeMap() does.
 *
 * The card's `era: "bw"` (set by build_products.py for the promos and the
 * reprints, from the set's `era`) lets a later product's reprint take the era's
 * finish through its `foilAs`; the numbered sets are recognised by id.
 */

/** A Black & White era print: the numbered sets, Dragon Vault, the promos, McDonald's 2011 and 2012, the Trainer Kits. */
export function isBw(card) {
  return card?.era === "bw" || /^(bw\d|dv1|bwp|mcd1[12]|bwtk)/.test(String(card?.id || ""));
}

/** Prints that are foil edge to edge; they take the all-white map until a drawn or TCG Live one exists. */
export const BW_FULL_ART = new Set(["Rare Ultra", "Rare Secret"]);

/** The early sets: full arts and secret rares of Black & White to Noble Victories (untextured, 2011). */
function earlySet(card) {
  return /^bw[123]-/.test(String(card?.id || ""));
}

/**
 * Prints with an etched layer (the shared engraving tile): the full arts and
 * secrets of Next Destinies on ("the full arts in this set are the first textured
 * cards", Elite Fourum #104; Bulbapedia's Next Destinies and Boundaries Crossed
 * pages for the etching, the gold secrets "utilized the special etching featured
 * on Full Art cards"). Black & White, Emerging Powers and Noble Victories' full
 * arts and Pikachu / Meowth are flat ("the artwork and Holofoil covering the entire
 * card", Bulbapedia Black & White page). The Next Destinies to Dragons Exalted
 * secrets are yellow-bordered shiny reprints: not etched all over (EF: "the border
 * is not fully textured"), so they stay out. Finish owner may refine.
 */
export function bwEtched(card) {
  if (!BW_FULL_ART.has(card?.rarity) || earlySet(card)) return false;
  if (card.rarity === "Rare Secret" && yellowSecret(card)) return false;
  return true;
}

/** A yellow-bordered secret rare: Pikachu, Meowth and the shiny reprints (bw1, bw3, bw4, bw5, bw6). The gold ones start with Boundaries Crossed. */
function yellowSecret(card) {
  return /^bw[13456]-/.test(String(card?.id || ""));
}

/** Legendary Treasures' gold Reshiram (114) and Zekrom (115): entirely gold full arts. */
function goldFull(card) {
  return /^bw11-11[45]$/.test(String(card?.id || ""));
}

/** McDonald's 2011 and 2012 Happy Meal prints: Confetti holofoil, all twelve cards of both years (they carry `foilAs: "Rare Holo"`, which alone would draw the Tinsel). */
function isMcdConfetti(card) {
  return /^mcd1[12]-\d+$/.test(String(card?.id || ""));
}

/** A Legendary Treasures Radiant Collection card (data flag, else its bw11-RC<n> id). */
export function isRadiantCollection(card) {
  return Boolean(card?.rc) || /^bw11-RC\d/.test(String(card?.id || ""));
}

/**
 * The drawn foil map of a Black & White print, or "" for none (the generic engine
 * then decides). The finish agents fill this in: TCG Live's maps for the holo
 * prints of the numbered sets (fetch_foil_maps.py), a drawn window mask for the
 * rest. foilExtras() adds `has-foil-map` when it returns a path.
 */
export function bwMap(card) {
  // McDonald's 2011 and 2012 are Confetti too (Collexy's BW overview, section 9; the Pokumon scan of Blitzle 6/12): the same window mask.
  if (isMcdConfetti(card)) return "assets/foil/bw-rc/window-basic-v2.webp";
  // Legendary Treasures' Radiant Collection has no TCG Live map: ours (make_bw_rc_sparkle.py), the regular
  // frame's (art window full, text box half) or the full-art one (whole card; RC11 is an EX frame).
  // Legendary Treasures RC1-RC20 in the regular frame: the confetti window masks (g1); the full-frame RC cards keep the g3 maps.
  if (isRadiantCollection(card) && /^foil-holo bw-rc$/.test(bwPattern(card))) {
    return card.supertype === "Trainer" || hasSubtype(card, "SUPPORTER") ? "assets/foil/bw-rc/window-trainer-v2.webp" : "assets/foil/bw-rc/window-basic-v2.webp";
  }
  if (isRadiantCollection(card)) return fullFrame(card) ? "assets/foil/maps/bw-rc-fa-v1.webp" : "assets/foil/maps/bw-rc-v1.webp";
  const safe = bwExSafeMap(card);
  if (safe) return safe;
  return "";
}

/** A Radiant Collection card that is foil edge to edge: the full arts RC21-RC25 and the regular-art EX RC11. */
function fullFrame(card) {
  return card.rarity === "Rare Ultra" || card.rarity === "Rare Holo EX" || hasSubtype(card, "EX");
}

/**
 * The text-safe median map of a Pokémon-EX or Ace Spec print TCG Live has no map for (a reprint
 * in a later product, a promo it lacks), from scripts/make_bw_ex_safe_maps.py: the frame, the
 * rule box and the art's ground foil, the text box and a typical Pokémon matte, so css/holo/bw-ex.css
 * never paints over the rules text. "" for any other card (the Radiant Collection's EX is g3's).
 */
export function bwExSafeMap(card) {
  const p = bwPattern(card);
  if (/\bbw-rc\b/.test(p)) return "";
  if (/\bbw-ace\b/.test(p)) return "assets/foil/maps/bw-ace-safe.webp";
  if (/\bbw-ex\b/.test(p)) return "assets/foil/maps/bw-ex-safe.webp";
  return "";
}

/** A card whose subtypes name `sub` (case-insensitive). */
function hasSubtype(card, sub) {
  return (card.subtypes || []).some((s) => String(s).toUpperCase() === sub);
}

/**
 * The finish of a Black & White print, read from its rarity. An empty string
 * means the generic engine decides; "foil-none" means the card is not foil (the
 * plain Rare, as in Sword & Shield, Sun & Moon and XY).
 */
export function bwPattern(card) {
  const trainer = card.supertype === "Trainer" || hasSubtype(card, "SUPPORTER") || hasSubtype(card, "ITEM");
  // Dragon Vault: all 21 cards are holofoil ("ALL of them foil!"), including the
  // Kyurem and the two Trainers pkmn.gg gives no rarity.
  // The five Dragon Vault stamp promos (dv1-<n>-dvstamp) take the same finish through this rule: they carry their own foilMap, the
  // plain card's Live map with the DRAGON VAULT wordmark cut out (make_bw_promo_maps.py), so the Tinsel never runs across the stamp.
  if (/^dv1-/.test(String(card.id || "")) && !card.rc) return "foil-holo bw-holo bw-vault";
  if (isMcdConfetti(card)) return "foil-holo bw-rc";
  // RC11, the regular-art Meloetta-EX, comes through as "Rare": it is a Pokémon-EX.
  const rarity = card.rarity === "Rare" && isRadiantCollection(card) && hasSubtype(card, "EX") ? "Rare Holo EX" : card.rarity;
  let pattern = "";
  switch (rarity) {
    case "Rare Secret":
      // Three secret finishes (photos: texture-refs/g3/SOURCES.txt, TCG Live's maps):
      //  - bw-yellow (bw1 Pikachu, bw3 Meowth, the shiny reprints of bw4-bw6): the yellow-bordered
      //    card whose only foil is the Pokémon and the type symbol (the map says so), ring etch in the window;
      //  - bw-gold (bw7-bw10): the regular layout in a gold holo border, holo etched art window and symbol;
      //  - bw-goldfull (bw11 gold Reshiram and Zekrom): the whole card mirror gold with an engraved outline.
      // `bw-item` marks a Trainer (the foil is an object in the window and a Poké Ball).
      pattern = goldFull(card)
        ? "foil-gold bw-secret bw-gold bw-goldfull"
        : `foil-ultra bw-secret ${yellowSecret(card) ? "bw-yellow" : "bw-gold"}${trainer ? " bw-item" : ""}`;
      break;
    case "Rare Ultra":
      // Full art: Pokémon, Pokémon-EX and Supporters (a full-art Supporter has no frame to keep).
      pattern = `foil-ultra bw-fa${trainer ? " bw-tfa" : ""}${earlySet(card) ? " bw-flat" : ""}`;
      break;
    case "Rare Holo EX":
      pattern = "foil-ex bw-ex";
      break;
    case "Rare ACE":
      // Ace Spec: foil on the border, name strip, ACE SPEC box and the artwork's background; holofoil only.
      pattern = "foil-holo bw-ace";
      break;
    case "Rare Holo":
      pattern = "foil-holo bw-holo";
      break;
    case "Rare":
      // The plain Rare is not foil at all.
      pattern = "foil-none";
      break;
    default:
      break;
  }
  // Legendary Treasures' Radiant Collection: a confetti of glitter dots over the art window and the
  // lower box of every card, over the whole face on the full arts and the EX (bw-rc-fa); not a rainbow
  // finish, so the rarity's own pattern is dropped (photos: texture-refs/g3/SOURCES.txt, finish 6).
  if (isRadiantCollection(card)) return `foil-holo bw-rc${fullFrame({ ...card, rarity }) ? " bw-rc-fa" : ""}`;
  return pattern;
}

/**
 * The reverse holo of a Black & White print. Two finishes of the era:
 *  - "bw-plain": Black & White's own (bw1) reverse is the plain mirror, flat foil
 *    everywhere but the artwork window (Collexy's BW holofoil overview: "In Black &
 *    White Base Set the Set Reverse Holofoil pattern is the Mirror Pattern"; codedyellow:
 *    "no pattern ... a single holographic sheen in the colour of the Pokémon type").
 *  - "bw-<kind>": from Emerging Powers on the foil carries the Energy pattern: shaded
 *    symbols of the card's type (Poké Balls on Trainers) over the body, the artwork plain.
 *    One tile per type, drawn from TCG Live's reverse maps (assets/foil/bw-reverse/,
 *    make_bw_reverse.py).
 * foil-maps.js hands the finish to bwReverseExtras(), whose classes css/holo/bw.css styles.
 */
export function bwReverseFinish(card) {
  return /^bw1-/.test(String(card?.id || "")) ? "bw-plain" : `bw-${bwReverseKind(card)}`;
}

const BW_REVERSE_TYPES = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless"]);

/** The tile a reverse holo draws with: its type, "trainer" (Poké Balls), "energy" (a Special Energy), "energy-plasma" and "plasma" (the Team Plasma shield), else colorless. */
function bwReverseKind(card) {
  if (card?.supertype === "Trainer") return "trainer";
  if (card?.supertype === "Energy") return card.name === "Plasma Energy" ? "energy-plasma" : "energy";
  // A Team Plasma Pokémon's reverse is a flat mirror with the Team Plasma shield in the text area (bw8-bw10).
  if ((card?.subtypes || []).includes("Team Plasma")) return "plasma";
  const type = String(card?.types?.[0] || "").toLowerCase();
  return BW_REVERSE_TYPES.has(type) ? type : "colorless";
}

/**
 * Classes and inline variables of a Black & White reverse holo. `--bw-layout` is the alpha mask of where
 * this frame is foil (assets/foil/bw-reverse/layout-<basic|evo|trainer>.webp: the card less its art window,
 * a Stage card's evolution notch and the symbols that are never foil); `--rev-pattern` is the type's tile.
 * A Special Energy's tile is its own layout (a picture box with no foil, a text box with it).
 */
export function bwReverseExtras(card, url, finish) {
  const plain = finish === "bw-plain";
  const kind = plain ? "" : finish.slice(3);
  const subs = card.subtypes || [];
  const energy = card.supertype === "Energy";
  const layout = card.supertype === "Trainer" ? "trainer" : subs.includes("Stage 1") || subs.includes("Stage 2") ? "evo" : "basic";
  const classes = ["rev-mirror", "era-bw", "bw-rev"];
  if (plain) classes.push("bw-rev-plain");
  else classes.push(`bw-rev-${kind}`);
  const vars = [];
  if (!energy || plain) {
    classes.push(`bw-lay-${layout}`);
    vars.push(`--bw-layout:url('${url(`assets/foil/bw-reverse/layout-${layout}.webp`)}')`);
  }
  if (!plain) vars.push(`--rev-pattern:url('${url(`assets/foil/bw-reverse/${kind}.webp`)}')`);
  return { classes: classes.join(" "), style: vars.join(";"), cure: false };
}
