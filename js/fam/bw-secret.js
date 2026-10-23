/**
 * Holo family bw-secret: Black & White secret rares (32 faces).
 *
 * Scope: every `bw-secret` print. The gold secrets and gold Items of Boundaries Crossed to Plasma Blast (bw7-bw10),
 * the yellow-bordered secrets (Pikachu bw1-115, Meowth bw3-102 and the shiny reprints and Pokémon Catcher of
 * bw4-bw6) and Legendary Treasures' all-gold Reshiram and Zekrom (bw11-114, bw11-115).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-bw-secret` (every rule in css/holo/fam/bw-secret.css is scoped to it), a finish class and the family's own
 * maps as custom properties, and `cure: true` for the extra `.cure` layer the sheet paints the lit holo on.
 *
 *   bws-gold      bw7-bw10: brushed gold frame (`--bws-metal`, its hatch `--bws-hatch`), holo art window and type
 *                 symbol (`--bws-texg`: Live's stipple, swirls and rings, window and symbol only, dark ink held down),
 *                 the Pokémon (`--bws-pok`) and its own etch (`--bws-wave`); `bws-trainer` on Items, which also get
 *                 `--bws-disc` (the text box's Poké Ball); `bws-silver` on Rare Candy (the ball reads silver-grey)
 *   bws-goldfull  bw11-114, bw11-115: the whole face mirror gold, the engraving `--bws-eng` (Live's etch, ink knocked out)
 *                 and `--bws-ink` (alpha 1 on the gold of the scan, 0 on the ink and the symbols)
 *   bws-yellow    bw1, bw3-bw6: matte yellow frame; the window background is etched arcs (`--bws-etch`, Live's etch,
 *                 which also holds the text-box symbol's rings), the Pokémon (or the Item) is the foil: `--bws-stip`
 *                 its fine stipple, `--bws-fm` its shape (TCG Live's foil map with the pupils, nostrils, cheeks and
 *                 the small energy symbols knocked out); `bws-item` on Pokémon Catcher (gold metal, no rainbow)
 *   bws-grain     bw1-115, bw3-102 (with bws-yellow): the scenery is pebbled varnish (`--bws-grain-a`, `-b`)
 *
 * v2 (2026-10-02): the gold maps are split by zone so a layer paints only the zone it belongs to (no rainbow over the
 * frame or the text box); the -v2 maps are made by scripts/fam/bw-secret/make_bw_secret_v2.py.
 * v3 (2026-10-02, review #2): the yellow glitter is its own speck map (Live's etch for these cards is the window
 * background and the text-box rings, not the Pokémon, so the etched glitter painted nothing), the all-gold faces get a
 * baked ink mask, the yellow faces get a foil mask with the eyes and cheeks knocked out, and the grain bumps are
 * rewritten; make_bw_secret_v3.py.
 *
 * v4 (2026-10-22, photo audits bw-secret-a and -b): Live's etch back on the yellow faces (window arcs, symbol), a
 * per-card stipple instead of the shared speck map, fm-v4 without the energy symbols, finer grain shown only when lit,
 * and the Items' Poké Ball disc (disc/<id>); make_bw_secret_v4.py.
 * v5 (2026-10-22, the fresh review): the gold faces' Pokémon etch and area (wave/, pok/, texg/), the yellow faces' etch
 * and stipple off the Pokémon's dark ink (etch/-v2, stip/-v2) and a dark-ink sheen map (dark/); make_bw_secret_v5.py.
 * v6 (2026-10-22, round 3): the sheet carries most of it (no lamp on the Items' Poké Ball, the window rainbow in
 * hard-light, the border's green and pink, Virizion's crimson); pok/bw10-103 and dark/ redrawn by make_bw_secret_v5.py.
 *
 * The maps are built by .claude/skills/card-textures/scripts/fam/bw-secret/make_bw_secret_maps.py into
 * assets/foil/fam/bw-secret/; a face without them is not claimed, so it keeps the era sheet's look rather than
 * painting with a missing mask. Never import js/foil-maps.js from here (it waits on this module).
 */
import { isBw, bwPattern } from "../bw-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face the maps were built for, by finish. */
const GOLD = new Set([
  "bw7-150", "bw7-151", "bw7-152", "bw7-153",
  "bw8-136", "bw8-137", "bw8-138",
  "bw9-117", "bw9-118", "bw9-119", "bw9-120", "bw9-121", "bw9-122",
  "bw10-102", "bw10-103", "bw10-104", "bw10-105",
]);
const GOLD_FULL = new Set(["bw11-114", "bw11-115"]);
const YELLOW = new Set([
  "bw1-115", "bw3-102",
  "bw4-100", "bw4-101", "bw4-102", "bw4-103",
  "bw5-109", "bw5-110", "bw5-111",
  "bw6-125", "bw6-126", "bw6-127", "bw6-128",
]);
const GRAIN = new Set(["bw1-115", "bw3-102"]);
const DIR = "assets/foil/fam/bw-secret";

/** Whether a card face is this family's. */
export function claims(card) {
  if (!card || card.reverse || !isBw(card) || !has(bwPattern(card), "bw-secret")) return false;
  const id = String(card.id || "");
  return GOLD.has(id) || GOLD_FULL.has(id) || YELLOW.has(id);
}

export function famExtras(card, url, base) {
  if (!claims(card)) return null;
  const id = String(card.id);
  const map = (kind, suffix = "") => `url('${url(`${DIR}/${kind}/${id}${suffix}.webp`)}')`;
  const style = [];
  let finish = "bws-yellow";
  if (GOLD.has(id)) {
    const item = card.supertype === "Trainer";
    finish = item ? (id === "bw10-105" ? "bws-gold bws-trainer bws-silver" : "bws-gold bws-trainer") : "bws-gold";
    if (id === "bw10-103") finish += " bws-pink"; // v5: Virizion's pink ink takes a crimson tone (pok/ keeps only the pink)
    // v5: the art's own etch on the Pokémon (wave), the Pokémon as an area (pok) and the window etch gated by the
    // scan's luminance (texg) replace the shared --bws-tex
    style.push(`--bws-metal:${map("metal")}`, `--bws-hatch:${map("hatch", "-v2")}`, `--bws-wave:${map("wave")}`,
      `--bws-pok:${map("pok")}`, `--bws-texg:${map("texg")}`);
    if (item) style.push(`--bws-disc:${map("disc")}`); // v4: the text box's Poké Ball, a silver-grey disc
  } else if (GOLD_FULL.has(id)) {
    finish = "bws-goldfull";
    style.push(`--bws-eng:${map("eng", "-v2")}`, `--bws-ink:${map("ink", "-v3")}`);
  } else {
    // v4: Live's etch (window arcs, symbol rings), the Pokémon's own stipple and the foil map without the energy symbols;
    // v5: the etch without the Pokémon (-v2), the stipple off dark ink (-v2) and the dark ink's own sheen (dark)
    style.push(`--bws-fm:${map("fm", "-v4")}`, `--bws-stip:${map("stip", "-v2")}`, `--bws-etch:${map("etch", "-v2")}`);
    if (!GRAIN.has(id)) style.push(`--bws-dark:${map("dark")}`);
    if (GRAIN.has(id)) {
      finish = "bws-yellow bws-grain";
      style.push(`--bws-grain-a:${map("grain", "-a-v3")}`, `--bws-grain-b:${map("grain", "-b-v3")}`);
    } else if (card.supertype === "Trainer") {
      finish = "bws-yellow bws-item";
    }
  }
  return { classes: `fam-bw-secret ${finish}`, style: style.join(";"), cure: true };
}
