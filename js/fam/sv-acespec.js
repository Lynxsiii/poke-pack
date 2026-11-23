/**
 * Holo family sv-acespec (holo accuracy overhaul, 2026-10-22; built 2026-11-23 from the audit w2-sv-ace): the Scarlet &
 * Violet ACE SPEC Rares (33 faces in the census of 2026-11-23, sv5 to sv8pt5).
 *
 * Scope: exactly the faces js/app.js files as `foil-holo foil-acespec`: rarity "ACE SPEC Rare" with a TCG Live foil map
 * and a Scarlet & Violet id. The Black & White "Rare ACE" cards are bw-ex-ace.
 *
 * The real card is a raspberry foil card crossed by a fine diamond lattice (about eight diamonds across) that glints
 * gold and rainbow in the art window and shows as paler rose lines on the body. The scans print the stock a neon
 * fuchsia, so each card gets a body mask (the stock pink only, art window cut out) that the sheet tints raspberry:
 *   fam-sv-acespec  every claimed face (css/holo/fam/sv-acespec.css scopes every rule to it).
 *   --ace-body      assets/foil/fam/sv-acespec/<id>-body-v1.webp, from
 *                   .claude/skills/card-textures/scripts/fam/sv-acespec/make_body_masks.py.
 * Research and what changed: .claude/skills/card-textures/reference/fam-sv-acespec.md.
 */

const SV_ID = /^(?:[zr]?sv\d|svp-)/;
const DIR = "assets/foil/fam/sv-acespec";
/** Cards with a body mask (every ACE SPEC Rare in the data on 2026-11-23). */
const BODY = new Set(`sv5-141 sv5-152 sv5-153 sv5-154 sv5-157 sv5-158 sv5-162 sv6-152 sv6-162 sv6-163 sv6-164 sv6-165
sv6-167 sv6pt5-58 sv6pt5-60 sv6pt5-62 sv7-134 sv7-136 sv7-142 sv8-162 sv8-164 sv8-176 sv8-182 sv8-183 sv8-185 sv8-186
sv8-191 sv8pt5-116 sv8pt5-117 sv8pt5-119 sv8pt5-128 sv8pt5-129 sv8pt5-131`.split(/\s+/));

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || card.pattern || !card.foilMap) return false;
  if (!SV_ID.test(String(card.id || ""))) return false;
  return card.rarity === "ACE SPEC Rare";
}

export function famExtras(card, url, base) {
  if (!claims(card, base)) return null;
  const style = BODY.has(card.id) ? `--ace-body:url('${url(`${DIR}/${card.id}-body-v1.webp`)}')` : "";
  return { classes: BODY.has(card.id) ? "fam-sv-acespec ace-tinted" : "fam-sv-acespec", style, cure: false };
}
