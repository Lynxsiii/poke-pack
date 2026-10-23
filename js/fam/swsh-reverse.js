/**
 * Holo family swsh-reverse: the Sword & Shield reverse holos (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every Sword & Shield reverse face (swsh1-swsh12pt5, Champion's Path, Shining Fates, Pokémon GO, Crown Zenith,
 * and the Celebrations / Trick or Trade faces the data builds) whose era finish is the chevron sheet (`rev-swsh`:
 * Pokémon and Trainers, js/foil-maps.js reverseFinish()), plus the 23 Special Energy reverses, which the era left to
 * the generic cosmos reverse of rarities.css (reverseFinish() returns "" for an Energy). 2,078 faces.
 *
 * What the real cards do (photos in /home/user/holo-refs/w2-swsh-reverse; reference/fam-swsh-reverse.md): the foil is
 * everything type-coloured but the art window, the evolution box, the cost dots and the banners; it is a sheet of 7
 * columns of up-pointing chevrons, one type icon per cell (Poké Balls on Trainers, stars on Special Energy, whose foil
 * is the text box only). At rest the reverse print is deeper and more saturated than the paper print our scan shows,
 * every cell has its own tone, every icon is darker than its cell; under a lamp a broad soft glow lifts the lit cells
 * while the icons stay dark.
 *
 * What it adds (the hooks of css/holo/fam/swsh-reverse.css):
 *   fam-swsh-reverse  every face it claims.
 *   swr-<type>        the type (grass ... colorless, trainer, energy): the sheet's per-type ink tint.
 *   --swr-tone        the redrawn chevron sheet for the type (assets/foil/fam/swsh-reverse/tone-<type>-v1.webp,
 *                     scripts/fam/swsh-reverse/make_tiles.py): white = untouched, cells 0.55-1.0, icons 0.55 x cell.
 *   swr-masked +      the print's own foil mask, from TCG Live's reverse map of that print (mask-v1/<set>/<n>.webp,
 *   --swr-mask        scripts/fam/swsh-reverse/make_masks.py): its cost dots, banners and evolution box stay plain.
 *                     NO_MASK lists the faces Live has no map for; they keep the era's median mask (--rev-pattern's
 *                     alpha less the window); every Special Energy has its map. Celebrations (no reverse print, a data
 *                     issue) masks the median alpha with Live's holo map: no chevrons over its two full-art prints.
 *                     Trick or Trade's reprints use their original print's map. Darkness masks also leave out the
 *                     white-ink text (real white ink is opaque over the foil).
 */
const DIR = "assets/foil/fam/swsh-reverse";

/** isSwsh() of js/foil-maps.js (this module cannot import it: foil-maps.js waits on the families). */
const isSwsh = (card) => card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));

const TYPES = new Set(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless", "trainer"]);

/** Claimed faces with no TCG Live reverse map (make_masks.py's list). */
const NO_MASK = new Set([
  "cel25-cc15-venusaur", "pgo-53", "swsh10-TG01", "swsh10-TG02", "swsh10-TG03", "swsh10-TG04", "swsh10-TG05",
  "swsh10-TG06", "swsh10-TG07", "swsh10-TG08", "swsh10-TG09", "swsh10-TG10", "swsh10-TG11", "swsh10-TG12",
  "swsh12-154", "swsh12-156", "swsh12pt5-143",
]);

/** A Special Energy reverse the era leaves unpainted (reverseFinish() is "" for every Energy). */
function specialEnergy(card, base) {
  if (card.supertype !== "Energy" || !(card.subtypes || []).includes("Special")) return false;
  if (card.foilAs || card.pattern || card.reverseMap) return false;
  if (card.reverseKind && card.reverseKind !== "cosmos") return false;
  return !base?.classes;
}

/** The finish this family paints a face with: a type, "trainer", "energy", or "" when it is not this family's. */
function kindOf(card, base) {
  if (!card?.reverse || !isSwsh(card)) return "";
  const classes = ` ${base?.classes || ""} `;
  if (classes.includes(" rev-swsh ")) {
    const type = /\brev-([a-z]+)\b/.exec(classes.replace(/\brev-(sv|swsh)\b/g, ""))?.[1] || "";
    return TYPES.has(type) ? type : "";
  }
  return specialEnergy(card, base) ? "energy" : "";
}

/** Whether a card face is this family's. */
export function claims(card, base) {
  return Boolean(kindOf(card, base));
}

export function famExtras(card, url, base) {
  const kind = kindOf(card, base);
  if (!kind) return null;
  const id = String(card.id || "");
  const classes = ["fam-swsh-reverse", `swr-${kind}`];
  const style = [`--swr-tone:url('${url(`${DIR}/tone-${kind}-v1.webp`)}')`];
  const set = id.split("-")[0];
  if (!NO_MASK.has(id) && card.number != null) {
    classes.push("swr-masked");
    style.push(`--swr-mask:url('${url(`${DIR}/mask-v1/${set}/${card.number}.webp`)}')`);
  }
  return { classes: classes.join(" "), style: style.join(";"), cure: false };
}
