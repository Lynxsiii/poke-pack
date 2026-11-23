/**
 * Holo family swsh-holo: the Sword & Shield Rare Holo, the "Line" holofoil (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every non-reverse Sword & Shield face whose finish is `foil-holo swsh-holo` and not the Celebrations pearl
 * (`swsh-cel`) or the Classic Collection (`swsh-classic`): the Rare Holo of swsh1-swsh12pt5, Pokémon GO, the Black Star
 * promos filed as Rare Holo by foilAs, and the six Trick or Trade 2023 reprints (which carry `era: "swsh"` but miss the
 * era's `era-swsh` class, so the sheet keys on this family's class alone). swshPattern() in js/foil-maps.js decides the
 * finish; this module cannot import it (foil-maps.js waits on the families), so claims() repeats its Rare Holo branch.
 *
 * What it adds (the hooks of css/holo/fam/swsh-holo.css; the research is in reference/fam-swsh-holo.md):
 *   fam-swsh-holo  every face it claims: the line holo in the art window (TCG Live's foil map, the Pokémon cut out),
 *                  hard-light so the art stays readable, about 140 fine lines across the card and broad soft pastel
 *                  bands that slide sideways with the tilt.
 *   swh-tg         Astral Radiance's Trainer Gallery TG01-TG12, filed as "Rare Holo" (swsh9's are "Trainer Gallery Rare
 *                  Holo", so they get swsh-tg): Live maps them edge to edge and the real cards are whole-card soft
 *                  pastel sheen with no lines, so they take the pastel bands without the line screen.
 *   swh-radiant    Radiant Eevee SWSH230, filed as "Rare Holo" by foilAs: a Radiant (whole-card foil), so it also takes
 *                  the pastel sheen without the lines until the data files it as "Radiant Rare".
 */
const DIR = "assets/foil/fam/swsh-holo";

/** isSwsh() of js/foil-maps.js. */
const isSwsh = (card) => card?.era === "swsh" || /^(swsh|cel25|pgo)/.test(String(card?.id || ""));

/** Whether a card face is this family's: swshPattern() returns exactly `foil-holo swsh-holo` for it. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !isSwsh(card)) return false;
  // foilPattern() in app.js only asks swshPattern() for a print with no foilAs or one filed in the era
  if (card.foilAs && card.era !== "swsh") return false;
  if (card.rarity !== "Rare Holo") return false;
  // the Classic Collection, the Shiny Vault and Celebrations' pearl are other finishes
  if (card.gallery === "cc" || card.gallery === "sv") return false;
  if (String(card.id || "").startsWith("cel25-")) return false;
  return true;
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const classes = ["fam-swsh-holo"];
  if (card.gallery === "tg") classes.push("swh-tg");
  else if ((card.subtypes || []).includes("Radiant")) classes.push("swh-radiant");
  else classes.push("swh-lines");
  // the line screen as an image (scripts/fam/swsh-holo/make_lines.py): 140 soft lines across the card, and the same at a
  // third of the swing for screens of 1.5 dppx or less (the sheet's media rule), where a line is under two device pixels
  const style = [
    `--swh-lines:url('${url(`${DIR}/lines-v1.webp`)}')`,
    `--swh-lines-soft:url('${url(`${DIR}/lines-soft-v1.webp`)}')`,
  ].join(";");
  return { classes: classes.join(" "), style, cure: false };
}
