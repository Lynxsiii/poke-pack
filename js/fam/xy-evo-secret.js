/**
 * Holo family xy-evo-secret: Evolutions' five secret rares (xy12 109-113: the Japanese Exeggutor, Flying Pikachu, Surfing Pikachu, Imakuni?'s Doduo, Here Comes Team Rocket!).
 *
 * Scope: the ids in CARDS (not their reverses).
 *
 * VERDICT (2026-10-02): these five prints are NOT foil, so the family draws nothing, on purpose. Real photos at an angle, in
 * direct sunlight and beside holo neighbours (the Starlight Charizard 11 in the same frame glitters, the secret does not) show a
 * plain glossy card: the art window, the gold bevel round it, the mottled paper wash and the Trainer's brushed-silver frame are
 * all printed ink, with no glitter, rainbow, etch or pattern. Scrydex and Cardrake list only "Normal"; TCG Live has no foil or
 * etch map (404); the five sit on Evolutions' plain uncommon sheet. Sources: /mnt/project-files/holo-remaster/xy-evo-secret/refs/SOURCES.md
 * and .claude/skills/card-textures/reference/fam-xy-evo-secret.md. The era sheet already draws them flat (js/xy-foil.js
 * isNotFoil() gives "foil-none", css/holo/base.css hides .foil and .glare for it) and this family keeps it that way: it only
 * claims the five faces, so the census and the lab see them as a family, and adds `fam-xy-evo-secret`. css/holo/fam/xy-evo-secret.css
 * has no rules. If a macro photo or a scan of a real foil print ever turns up, draw it here from the card's own scan.
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). Started
 * 2026-10-02 for Noah's secret rare remake (20:09: "remake the Secret rares, most have really shitty texture and i dont
 * like the overuse of the rainbow glare as most cards dont really have that rainbow glare ..."). This module decides which
 * card faces are this family's and returns what to add to the face foilExtras() built: the class `fam-xy-evo-secret`, any
 * finer classes, the family's own custom properties and `cure: true` to get the extra `.cure` layer. `base` is foilExtras()'s
 * own result ({ classes, style, cure }) for the same face. Never import js/foil-maps.js from here.
 * Before this family the cards were the era sheet's `foil-none` (the bare scan), the same pixels as now: `?famskip=xy-evo-secret`
 * in the lab shows it.
 */
import { isXy } from "../xy-foil.js?v=5";

/** The prints this family draws. */
const CARDS = new Set(["xy12-109", "xy12-110", "xy12-111", "xy12-112", "xy12-113"]);

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isXy(card) && CARDS.has(String(card.id || ""));
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  return { classes: "fam-xy-evo-secret", style: "", cure: false };
}
