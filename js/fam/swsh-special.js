/**
 * Holo family swsh-special (holo accuracy overhaul, 2026-10-22; first finish built 2026-11-23 from the audit
 * w2-swsh-special): the Sword & Shield special finishes no other swsh family claims.
 *
 * Claimed so far:
 *   ssp-cel  Celebrations' main set 001-025 and the set's SWSH-promo reprints (cel25-, Rare / Rare Holo, not the
 *            Classic Collection; swshPattern() files them `foil-holo swsh-holo swsh-cel`; 24 faces). The real card is
 *            foil in the art window only (TCG Live's foil map: Pokémon and 25 logo cut out): a metallic silver with a
 *            fine sparkle grain and a rainbow streak near the light; the text box and frame are plain print.
 *   ssp-cc   the Classic Collection reprints of window holos (Base Set Blastoise, Charizard, Venusaur, Dark Gyarados,
 *            Rocket's Zapdos, Cleffa, _____'s Pikachu; 7 faces). The real card is "Confetti Holofoil" in the art window
 *            only; frame, text box and border plain print. They have no Live map, so the window is a per-card
 *            rectangle (`--ssp-win`, a clip-path inset measured on the scans with
 *            .claude/skills/card-textures/scripts/fam/swsh-special/find_cc_windows.py and checked by eye).
 *   ssp-rad  Radiant Rares (`foil-holo swsh-radiant`, 15 faces). The real card: large criss-cross X / argyle bands at
 *            +-45 deg, about a sixth of the card wide, filled with fine sparkle, over the frame, the text box and the
 *            Pokémon (Live's map), fainter over the window background; lit they glow in the colour of the ink.
 *   ssp-am   Amazing Rares (`foil-holo swsh-amazing`, 9 faces). The real card: the printed rainbow paint splash (Live's
 *            map, in and past the window) is a very fine glitter that takes the ink's colour; the Pokémon carries
 *            Live's fine etch and catches light; frame and text box matte.
 * Not yet claimed (still on the era recipes in css/holo/swsh.css): the other 18 Classic Collection faces (ex-era,
 * DP / Platinum, full arts, trainers, the Umbreon star: each a different original finish needing its own research).
 * Research and what changed: .claude/skills/card-textures/reference/fam-swsh-special.md.
 */

/** A Sword & Shield era print (isSwsh() in js/foil-maps.js). */
function isSwsh(card) {
  return card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));
}

/** Art windows of the Classic Collection window holos (top right bottom left, % of the card). */
const BASE_WIN = "inset(11% 10.5% 47.5% 11.8%)";
const CC_WIN = {
  "cel25-cc2": BASE_WIN,
  "cel25-cc4": BASE_WIN,
  "cel25-cc8": BASE_WIN,
  "cel25-cc15-venusaur": BASE_WIN,
  "cel25-cc15-rockets": "inset(12.9% 12.3% 47.3% 10.2%)",
  "cel25-cc20": "inset(12.9% 10.7% 47.5% 12%)",
  "cel25-cc24": "inset(11.5% 10.7% 47.5% 12.2%)",
};

/** The finish of a face this family draws: "cel", "cc", "rad", "am" or "". */
function kind(card) {
  if (!card || card.reverse || card.pattern || !isSwsh(card)) return "";
  if (card.foilAs && card.era !== "swsh") return "";
  if (card.gallery === "cc") return CC_WIN[card.id] ? "cc" : "";
  if (card.gallery === "sv") return "";
  if (String(card.id || "").startsWith("cel25-") && (card.rarity === "Rare" || card.rarity === "Rare Holo") && card.foilMap) {
    return "cel";
  }
  if (card.rarity === "Radiant Rare" && card.foilMap) return "rad";
  if (card.rarity === "Amazing Rare" && card.foilMap) return "am";
  return "";
}

/** Whether a card face is this family's. */
export function claims(card) {
  return kind(card) !== "";
}

export function famExtras(card, url, base) {
  const k = kind(card);
  if (!k) return null;
  const style = k === "cc" ? `--ssp-win:${CC_WIN[card.id]}` : "";
  return { classes: `fam-swsh-special ssp-${k}`, style, cure: false };
}
