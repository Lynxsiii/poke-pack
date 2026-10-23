/**
 * Holo family sm-holo: the Sun & Moon Rare Holo (holo accuracy overhaul, 2026-10-22).
 *
 * Scope: every non-reverse Sun & Moon face whose era finish is `foil-holo sm-holo` (smPattern() in js/sm-foil.js: the
 * Rare Holo of sm1-sm12, Shining Legends, Dragon Majesty, Hidden Fates' main set, Detective Pikachu, the holo Black Star
 * promos and the McDonald's Collections 2017-2019), 404 faces on 2026-10-22. It adds `fam-sm-holo`; every rule in
 * css/holo/fam/sm-holo.css is scoped to it and overrides the window-holo blocks of css/holo/sm.css (left in place for
 * `?fam=off`).
 *
 * Finishes (the photos and sources are in .claude/skills/card-textures/reference/fam-sm-holo.md):
 *   smh-window    the booster Rare Holo, one pattern for the whole era ("Water Web"): only the art window's background
 *                 is foil (TCG Live's map, the Pokémon matte); tilted, it throws broad saturated rainbow bands
 *                 (blue-violet, magenta, gold, green, cyan) with a white-gold hot spot under the light, a fine pinpoint
 *                 sparkle and a few thin straight streaks. Dark ink keeps the foil down, pale and mid-tone ink takes
 *                 the colour. Lost Thunder on (`sm-late`) is the same foil: the photos (Meganium sm8 8, Lugia sm9 131,
 *                 Celebi sm11 4, Vaporeon sm115 18) show the same rainbow, not the satin pool sm.css drew.
 *   smh-confetti  the McDonald's Collections 2017, 2018 and 2019 (mcd17, mcd18, mcd19): Confetti Holofoil, separate
 *                 polygon flakes over the window background, each flashing its own colour, no broad rainbow
 *                 (tiles: scripts/fam/sm-holo/make_confetti.py), masked by a map drawn from the scan where one passed
 *                 review (CONFETTI_MAP).
 *
 * `cure` (window only): the window holo lights with two layers, `.foil` multiplying the band colour onto the print and `.cure`
 * colour-dodging a gain over it (the foil seen through ink: print x colour x light), both masked by the foil map.
 */
import { isSm, smPattern } from "../sm-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);
const DIR = "assets/foil/fam/sm-holo";

/** McDonald's Collection prints: Confetti Holofoil (Bulbapedia, TCGplayer "Holofoil"; photos in the reference note). */
const CONFETTI = /^mcd1[789]-/;

/**
 * Confetti prints with a foil map drawn from the scan (scripts/fam/sm-holo/make_confetti_maps.py, <id>-v1.webp): TCG
 * Live's map of every McDonald's print is the plain window, Pokémon included; on the real cards the Pokémon is matte.
 * mcd17-1, mcd17-9, mcd18-3 and mcd19-9 are cut by the generator's GrabCut fallback, mcd17-2, mcd19-1 and mcd19-11
 * by GrabCut from a hand-set box. Left on Live's window (reviewed 2026-10-23): mcd19-2 Alolan Exeggutor (every cut
 * took its sky with the Pokémon).
 */
const CONFETTI_MAP = new Set([
  "mcd17-1", "mcd17-2", "mcd17-3", "mcd17-4", "mcd17-5", "mcd17-6", "mcd17-7", "mcd17-8",
  "mcd17-9", "mcd17-10", "mcd17-11", "mcd17-12", "mcd18-1", "mcd18-2", "mcd18-3", "mcd18-4",
  "mcd18-5", "mcd18-6", "mcd18-7", "mcd18-8", "mcd18-9", "mcd18-10", "mcd18-11", "mcd18-12",
  "mcd19-1", "mcd19-3", "mcd19-4", "mcd19-5", "mcd19-6", "mcd19-7", "mcd19-8", "mcd19-9",
  "mcd19-10", "mcd19-11", "mcd19-12",
]);

/**
 * Detective Pikachu 1-18 have no TCG Live map and would ride sm-holo-safe.webp (a centred oval left matte), which foils
 * an off-centre Pokémon: maps cut from the scans (scripts/fam/sm-holo/make_det1_maps.py, det1-<n>-v1.webp).
 */
const DET1_MAP = /^det1-([1-9]|1[0-8])$/;

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isSm(card)) return false;
  if (card.foilAs && card.era !== "sm") return false;
  return has(smPattern(card), "sm-holo");
}

/** The real finish of a claimed face. */
export function finishOf(card) {
  return CONFETTI.test(String(card.id || "")) ? "confetti" : "window";
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const finish = finishOf(card);
  const id = String(card.id);
  const mapped = CONFETTI_MAP.has(id) || DET1_MAP.test(id);
  const style = mapped ? `--foil-map:url('${url(`${DIR}/maps/${id}-v1.webp`)}')` : "";
  // the window holo's second layer (the `.cure` span): the colour-dodged light over the multiplied band colour
  return { classes: `fam-sm-holo smh-${finish}`, style, cure: finish === "window" };
}
