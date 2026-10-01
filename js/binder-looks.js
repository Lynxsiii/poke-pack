/**
 * Binder looks: what a trainer's binder is made of. Data and pure functions,
 * no DOM, so the page and the Worker agree on every id.
 *
 * A look is seven plain ids (see normalizeBinderLook). Colours and materials
 * are free. An animated "edition" is bought once with coins (priced here, paid
 * in worker/binder-look.js, owned in the binder_editions table) and then lives
 * on the account; anyone can try one on before buying.
 *
 * CSS contract (css/binder/*.css):
 *   .binder-object[data-material][data-hardware][data-pockets][data-page][data-edition]
 *   with --b-main --b-deep --b-light --b-accent --b-on --b-page set from
 *   resolveBinderLook(). The default look ("classic") draws nothing extra: it is
 *   the nine-pocket page in its well, so every existing binder looks as it did.
 */
import { dominantAccents, hexToHsl, hslToHex, luminance, mixHex } from "./card-accent.js";

export const BINDER_LOOK_VERSION = 1;
export const BINDER_NAME_MAX = 24;

/** The twenty-four cover colours, named like a stationer's range. Free. */
export const BINDER_COLORS = [
  { id: "ink", name: "Ink", hex: "#1b1b21" },
  { id: "graphite", name: "Graphite", hex: "#3a3b42" },
  { id: "stone", name: "Stone", hex: "#8b8780" },
  { id: "bone", name: "Bone", hex: "#e6dcc6" },
  { id: "navy", name: "Navy", hex: "#1c2a52" },
  { id: "cobalt", name: "Cobalt", hex: "#2f5fd0" },
  { id: "sky", name: "Sky", hex: "#6fb3e8" },
  { id: "teal", name: "Teal", hex: "#1f8a8a" },
  { id: "jade", name: "Jade", hex: "#2fae7f" },
  { id: "mint", name: "Mint", hex: "#a8e6c8" },
  { id: "forest", name: "Forest", hex: "#1f5a3a" },
  { id: "olive", name: "Olive", hex: "#6b7a2e" },
  { id: "mustard", name: "Mustard", hex: "#d1a52b" },
  { id: "amber", name: "Amber", hex: "#e08a1e" },
  { id: "rust", name: "Rust", hex: "#b4502a" },
  { id: "crimson", name: "Crimson", hex: "#c42b2f" },
  { id: "wine", name: "Wine", hex: "#6e1f33" },
  { id: "rose", name: "Rose", hex: "#e0728f" },
  { id: "blush", name: "Blush", hex: "#f0b8c0" },
  { id: "plum", name: "Plum", hex: "#5b2a6e" },
  { id: "violet", name: "Violet", hex: "#7b4fd8" },
  { id: "lilac", name: "Lilac", hex: "#b9a4e8" },
  { id: "chocolate", name: "Chocolate", hex: "#4a2f22" },
  { id: "tan", name: "Tan", hex: "#b98a5a" },
];

/** "cards" takes its colour from the cards in the binder (needs `cards` in resolveBinderLook). */
export const COLOR_FROM_CARDS = "cards";

/** Metals a stitch, edge or ring can be, beside the colours. */
export const BINDER_METALS = [
  { id: "silver", name: "Silver", hex: "#c9ccd2" },
  { id: "brass", name: "Brass", hex: "#c9a24a" },
];

/** Cover materials, all free. "classic" is the original bare page and the default. */
export const BINDER_MATERIALS = [
  { id: "classic", name: "No cover", note: "Just the pages, as before." },
  { id: "leather", name: "Leather", note: "Pebbled grain with a stitched edge." },
  { id: "cloth", name: "Cloth", note: "Woven linen with a stitched edge." },
  { id: "matte", name: "Soft-touch", note: "Matte plastic, like a pro binder." },
  { id: "gloss", name: "Gloss", note: "Lacquered, with a window of light." },
  { id: "suede", name: "Suede", note: "Napped and warm." },
  { id: "carbon", name: "Carbon", note: "Twill weave under clear coat." },
  { id: "denim", name: "Denim", note: "Twill with a contrast stitch." },
  { id: "brushed", name: "Brushed metal", note: "Machined aluminium." },
];

/** How the binder is held together. "none" belongs to the classic look. */
export const BINDER_HARDWARE = [
  { id: "none", name: "None" },
  { id: "rings", name: "Silver rings" },
  { id: "brass", name: "Brass rings" },
  { id: "black", name: "Black rings" },
  { id: "zip", name: "Zip around" },
];

export const BINDER_POCKETS = [
  { id: "clear", name: "Clear", note: "Plain, with a still highlight." },
  { id: "frosted", name: "Frosted", note: "Fogged plastic, cards sit behind it." },
  { id: "smoke", name: "Smoke", note: "Dark tint, picks the cards out." },
  { id: "tint", name: "Tinted", note: "A wash of the cover colour." },
];

/** The paper behind the pockets. "tint" leans on the cover colour (or the page's own cards). */
export const BINDER_PAGES = [
  { id: "well", name: "Well", note: "The site's dark page." },
  { id: "black", name: "Black" },
  { id: "cream", name: "Cream" },
  { id: "tint", name: "Tint" },
];

/**
 * Animated covers. Price is in coins, like a slab guard. `free` ids need no
 * purchase. Each plays only transform, opacity and filter, rests under
 * reduced motion and when the page is idle, and never loops on a large layer.
 */
export const BINDER_EDITIONS = [
  { id: "aurora", name: "Aurora", price: 12, note: "A slow curtain of colour across the cover." },
  { id: "tide", name: "Tide", price: 12, note: "Long waves rolling under the grain." },
  { id: "ember", name: "Ember", price: 18, note: "A warm glow that breathes, with rising sparks." },
  { id: "starfield", name: "Starfield", price: 18, note: "A night sky that twinkles." },
  { id: "prism", name: "Prism", price: 24, note: "Facets that catch the light as it turns." },
  { id: "holo", name: "Holo foil", price: 30, note: "A rainbow foil sheen, like a holo card." },
];

export const DEFAULT_BINDER_LOOK = Object.freeze({
  v: BINDER_LOOK_VERSION,
  name: "",
  material: "classic",
  color: "ink",
  accent: "auto",
  hardware: "none",
  pockets: "clear",
  page: "well",
  edition: "",
});

const COLOR_BY_ID = new Map(BINDER_COLORS.map((row) => [row.id, row]));
const METAL_BY_ID = new Map(BINDER_METALS.map((row) => [row.id, row]));
const ids = (rows) => new Set(rows.map((row) => row.id));
const MATERIAL_IDS = ids(BINDER_MATERIALS);
const HARDWARE_IDS = ids(BINDER_HARDWARE);
const POCKET_IDS = ids(BINDER_POCKETS);
const PAGE_IDS = ids(BINDER_PAGES);
const EDITION_BY_ID = new Map(BINDER_EDITIONS.map((row) => [row.id, row]));

export function editionById(id) {
  return EDITION_BY_ID.get(String(id || "")) || null;
}

/** Price in coins of an edition (0 for none or a free one). */
export function editionPrice(id) {
  return editionById(id)?.price || 0;
}

/** A name for the cover plate: trimmed, one line, at most BINDER_NAME_MAX characters. */
export function cleanBinderName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, BINDER_NAME_MAX);
}

/**
 * Any stored or posted value (an object, a JSON string, null) to a complete,
 * valid look. Unknown ids fall back to the default for that field, so a look
 * saved by a later version still renders. The edition is kept as asked: the
 * server decides whether the account owns it.
 */
export function normalizeBinderLook(value) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const pick = (given, set, fallback) => (set.has(given) ? given : fallback);
  const colour = String(raw.color || "");
  const accent = String(raw.accent || "");
  const edition = EDITION_BY_ID.has(raw.edition) ? raw.edition : "";
  let material = pick(raw.material, MATERIAL_IDS, DEFAULT_BINDER_LOOK.material);
  // An animated cover needs a cover to play on: the bare page has none.
  if (edition && material === "classic") material = "matte";
  return {
    v: BINDER_LOOK_VERSION,
    name: cleanBinderName(raw.name),
    material,
    color: colour === COLOR_FROM_CARDS || COLOR_BY_ID.has(colour) ? colour : DEFAULT_BINDER_LOOK.color,
    accent: accent === "auto" || COLOR_BY_ID.has(accent) || METAL_BY_ID.has(accent) ? accent : DEFAULT_BINDER_LOOK.accent,
    hardware: pick(raw.hardware, HARDWARE_IDS, DEFAULT_BINDER_LOOK.hardware),
    pockets: pick(raw.pockets, POCKET_IDS, DEFAULT_BINDER_LOOK.pockets),
    page: pick(raw.page, PAGE_IDS, DEFAULT_BINDER_LOOK.page),
    edition,
  };
}

/** True when a look draws nothing beyond the bare page (the default). */
export function isClassicLook(look) {
  const l = normalizeBinderLook(look);
  return l.material === "classic" && !l.edition && l.page === "well" && l.pockets === "clear";
}

/** The hex of a colour id ("ink", a metal), or null. */
export function colorHex(id) {
  return COLOR_BY_ID.get(id)?.hex || METAL_BY_ID.get(id)?.hex || null;
}

/** A second colour that sits well with `hex`: its complement-ish partner, or a metal on a dark/bright cover. */
function autoAccent(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (s < 0.18) return luminance(hex) > 0.5 ? "#2a2a31" : "#c9a24a";
  return hslToHex((h + 150) % 360, Math.min(0.8, s), l > 0.5 ? 0.3 : 0.7);
}

/**
 * The hexes and attributes to paint a binder.
 *   resolveBinderLook(look, { cards })
 * `cards` is the list of card objects the colour may lean on when color is
 * "cards" (the binder's cards for the cover, one page's cards for a page);
 * `accents` an optional list of hexes refined from art, in the same order.
 * Returns { look, attrs, vars, style, fromCards }:
 *   attrs  data-* attributes for .binder-object
 *   vars   --b-main (cover), --b-deep (shadowed edge), --b-light (highlight),
 *          --b-accent (stitch, edge, trim), --b-on (readable ink on the cover),
 *          --b-page (the paper), --b-pocket (pocket tint)
 *   style  the same vars as an inline style string
 */
export function resolveBinderLook(value, ctx = {}) {
  const look = normalizeBinderLook(value);
  let main;
  let second = null;
  let fromCards = false;
  if (look.color === COLOR_FROM_CARDS) {
    const dom = dominantAccents(ctx.cards, ctx.accents);
    if (dom) {
      main = dom.a;
      second = dom.b;
      fromCards = true;
    }
  }
  if (!main) main = colorHex(look.color === COLOR_FROM_CARDS ? "ink" : look.color) || "#1b1b21";
  const accent = look.accent === "auto" ? second || autoAccent(main) : colorHex(look.accent) || autoAccent(main);
  const deep = mixHex(main, "#000000", 0.55);
  const light = mixHex(main, "#ffffff", 0.32);
  const on = luminance(main) > 0.38 ? "#17161c" : "#f3f1ec";
  const pageTone = { well: "#0e0e13", black: "#050507", cream: "#ece3cf", tint: mixHex(main, "#0b0b10", 0.72) }[look.page];
  const pocket = look.pockets === "tint" ? mixHex(main, "#ffffff", 0.2) : "#ffffff";
  const vars = {
    "--b-main": main,
    "--b-deep": deep,
    "--b-light": light,
    "--b-accent": accent,
    "--b-on": on,
    "--b-page": pageTone,
    "--b-pocket": pocket,
  };
  return {
    look,
    fromCards,
    attrs: {
      "data-material": look.material,
      "data-hardware": look.hardware,
      "data-pockets": look.pockets,
      "data-page": look.page,
      "data-edition": look.edition,
    },
    vars,
    style: Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";"),
  };
}

/** The hex colour ids that belong in a picker, in order (24 colours then "cards"). */
export function binderColorIds() {
  return [...BINDER_COLORS.map((row) => row.id), COLOR_FROM_CARDS];
}
