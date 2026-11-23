/**
 * Holo family sv-reverse: the standard reverse holos of the Scarlet & Violet sets.
 *
 * Scope: every reverse print of sv1-sv10, 151 (sv3pt5), Paldean Fates (sv4pt5), Shrouded Fable (sv6pt5), Prismatic
 * Evolutions (sv8pt5), Black Bolt (zsv10pt5) and White Flare (rsv10pt5): 2,134 faces. Not the pattern prints (Prismatic's
 * Poké Ball and Master Ball cards carry `pattern`), not a promo's `foilAs` frame foil, and not a face the app already
 * resolved to a Poké Ball, Master Ball or galaxy reverse (`reverseKind`): those keep the looks they have.
 *
 * Part of the holo accuracy overhaul (2026-10-22; js/holo-fam.js lists every family, first claim wins). The era module
 * (js/foil-maps.js reverseFinish(), css/holo/sv-reverse.css) drew the cobblestone with a colour-dodge only, which cannot
 * darken: at rest the pattern was a faint tint, a white frame (Colorless, Trainer, Metal) showed nothing, and the light
 * washed the type colour to pale yellow-white. It also skipped Black Bolt and White Flare (their set ids start with z/r),
 * which fell to the old cosmos crackle. css/holo/fam/sv-reverse.css redraws all of them; the research and the photos are
 * in .claude/skills/card-textures/reference/fam-sv-reverse.md.
 *
 * What it adds (the sheet's hooks):
 *   svr                 every face of the family.
 *   svr-<pattern>       grass ... colorless, trainer, special-energy: which cobblestone (TCG Live's reverse map, one per
 *                       type, the era's assets/foil/sv-reverse/<pattern>.webp), or svr-mirror for an Ancient or Future
 *                       card (a plain mirror, no pebbles).
 *   svr-tint            a coloured frame: the bare foil reads as a deeper, more saturated shade of the frame colour in
 *                       room light (the sheet multiplies a per-type ink through --svr-dark), lit the pebbles go pale and
 *                       the network stays coloured.
 *   svr-silver          a white or silver frame (Colorless, Metal, Trainer, Special Energy): the bare foil reads as
 *                       mid-grey metal against the paper (a cool grey ink).
 *   --svr-region        where the card is foil: the alpha of the type's cobblestone (TCG Live's reverse map, the era's
 *                       assets/foil/sv-reverse/<pattern>.webp): the frame, the name bar and the text box, never the
 *                       art window or the silver outer border.
 *   --svr-dark          how much the foil darkens the print in room light, as alpha (assets/foil/fam/sv-reverse/
 *                       <pattern>-dark-v1.webp, drawn from the same map by scripts/fam/sv-reverse/
 *                       make_sv_reverse_tiles.py): TCG Live's bare-foil network 1, the pebbles about half, the symbols 0.
 *                       A mirror card and a Shrouded Fable chain card use only --svr-region.
 *   cure: true          the `.cure` layer (lit only): the light and the grain, overlaid onto the card on their own
 *                       because the resting pattern on `.foil` is multiplied (a multiply cannot lighten).
 * A face the app draws with Shrouded Fable's chain carries `foil-rev-chain` (the set's reverseFoil); the sheet keys the
 * chain on that class, and every cobblestone rule steps aside for any `foil-rev-<kind>` class, so a Black Bolt or White
 * Flare copy that the app resolves to a Poké Ball print (the sets' reverseFoil) keeps the Poké Ball look.
 * Never import js/foil-maps.js from here (it waits on this module).
 */

const SV_TYPES = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless"]);
/** Patterns printed on a white or silver frame: the foil reads as grey metal there, darker than the paper. */
const SILVER = new Set(["colorless", "metal", "trainer", "special-energy"]);
/** Reverse kinds the app draws with a look of its own (finishes.css, prismatic.css, promos.css): not this family's. */
const OTHER_KINDS = new Set(["pokeball", "masterball", "galaxy"]);
const REGION = "assets/foil/sv-reverse";
const DARK = "assets/foil/fam/sv-reverse";

const setOf = (card) => String(card?.id || "").split("-")[0];

/** The cobblestone a face wears (the era's reverseFinish() for Scarlet & Violet, Black Bolt and White Flare included). */
function pattern(card) {
  if (card.supertype === "Trainer") return "trainer";
  if (card.supertype === "Energy") return (card.subtypes || []).includes("Special") ? "special-energy" : "";
  const type = String(card.types?.[0] || "").toLowerCase();
  return SV_TYPES.has(type) ? type : "";
}

const mirror = (card) => (card.subtypes || []).some((s) => s === "Ancient" || s === "Future");

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card?.reverse || card.foilAs || card.pattern) return false;
  if (!/^[rz]?sv\d/.test(setOf(card))) return false;
  if (OTHER_KINDS.has(card.reverseKind)) return false;
  return Boolean(pattern(card));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const pat = pattern(card);
  const tone = SILVER.has(pat) ? "svr-silver" : "svr-tint";
  const look = mirror(card) ? "svr-mirror" : `svr-${pat}`;
  const style = [`--svr-region:url('${url(`${REGION}/${pat}.webp`)}')`];
  if (look !== "svr-mirror") style.push(`--svr-dark:url('${url(`${DARK}/${pat}-dark-v1.webp`)}')`);
  return { classes: `fam-sv-reverse svr ${look} ${tone}`, style: style.join(";"), cure: true };
}
