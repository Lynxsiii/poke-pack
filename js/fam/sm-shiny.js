/**
 * Holo family sm-shiny: Hidden Fates' Shiny Vault shinies and Shining Legends' Shining Pokémon (holo accuracy overhaul,
 * 2026-10-22; built 2026-11-23).
 *
 * Scope: exactly the faces smPattern() in js/sm-foil.js files with `sm-shiny` (89 in the census of 2026-11-23, audit
 * group w2-sm-shiny): the Shiny Rares SV1-SV45 (`foil-holo foil-shiny sm-shiny`), the Shiny GX SV46-SV80 (`sm-shiny-gx`)
 * and the Rare Shining of sm35 plus the Shining promos Ho-Oh, Celebi and Lugia (`sm-shining`, through `foilAs`). The
 * Shiny Vault Supporters SV81-SV86 (sm-fullart) and golds SV87-SV94 (sm-gold) are not claimed.
 *
 * Classes (css/holo/fam/sm-shiny.css; facts in .claude/skills/card-textures/reference/fam-sm-shiny.md):
 *   fam-sm-shiny   every claimed face.
 *   sms-window     the Shiny Rare: silver window, rays, etch; a pastel shimmer broken by the etch.
 *   sms-gx         the Shiny GX: silver edge to edge, a crisp line engraving that reads over the whole face.
 *   sms-shining    the Shining Pokémon: only the Pokémon is foil; ink stays saturated, the engraving reads on it and
 *                  colour flashes only on its highlights.
 */
import { isSm, smPattern } from "../sm-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** "window", "gx", "shining" or "". */
export function kindOf(card) {
  if (!card || card.reverse || !isSm(card)) return "";
  if (card.foilAs && card.era !== "sm") return "";
  // the Shining promos draw `sm-shining` through foilAs (their era is "sm"), so read the pattern as foilExtras does
  const c = card.foilAs ? { ...card, rarity: card.foilAs } : card;
  const p = smPattern(c);
  if (!has(p, "sm-shiny")) return "";
  if (has(p, "sm-shining")) return "shining";
  return has(p, "sm-shiny-gx") ? "gx" : "window";
}

/**
 * Faces with TCG Live's etch at its native size (scripts/fam/sm-shiny/ship_live_etch.py, <id>-etch-v1.webp): the
 * Shiny Vault SV1-SV80 and the six Rare Shining of sm35. The data's maps are 400 px, and their softened copies drew
 * the engraving as a faint grain. The Shining promos keep their data maps.
 */
const LIVE_ETCH = /^(sm115-SV([1-9]|[1-7]\d|80)|sm35-(9|27|40|42|56|57))$/;
const DIR = "assets/foil/fam/sm-shiny";

/** Whether a card face is this family's. */
export function claims(card) {
  return kindOf(card) !== "";
}

export function famExtras(card, url, base) {
  const kind = kindOf(card);
  if (!kind) return null;
  const id = String(card.id || "");
  const live = LIVE_ETCH.test(id);
  const style = live ? `--sms-etch:url('${url(`${DIR}/${id}-etch-v1.webp`)}')` : "";
  return { classes: `fam-sm-shiny sms-${kind}${live ? " sms-live" : ""}`, style, cure: false };
}
