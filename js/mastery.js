/**
 * Set mastery looks: an accent pair per set, the seal, the exclusive banner id.
 * Pure functions, no DOM, so the browser and the Worker share them.
 *
 * The accent pair comes from data/set-accents.json by way of the generated
 * js/set-accents.js (scripts/make_set_accents.py). The seal is a minted medal:
 * the set's own symbol large on an enamel plate, and a rim that is struck a
 * quarter at a time (bronze, silver, gold) until the set is mastered and the
 * rim goes to foil. Gradients and plain shapes only. No SVG filters: they alias
 * on iPhone Safari. The composed banner lives in js/mastery-banner.js.
 */
import { PLAYABLE_SETS, setIdentity } from "./catalog.js";
import { SET_ACCENTS } from "./set-accents.js";
import { MASTERY_RANKS, masteryRank } from "./mastery-ranks.js";

export const MASTERY_BANNER_PREFIX = "mastery:";
export const MASTERY_CLAIM_RE = /^set-(.+)-master$/;
export const FALLBACK_ACCENT = { a: "#f2c14e", b: "#ff7a3d" };

const SET_BY_ID = new Map(PLAYABLE_SETS.map((set) => [set.id, set]));
const HEX = /^#[0-9a-f]{6}$/i;
const INK_DARK = "#0d0c14";

let uid = 0;

/** True for a set id that has (or can have) a mastery look. */
export function isMasterySet(setId) {
  const id = String(setId || "");
  return SET_BY_ID.has(id) || Object.prototype.hasOwnProperty.call(SET_ACCENTS, id);
}

/** The set's two accent colours. Unknown sets get a defined fallback, never undefined. */
export function setAccent(setId) {
  const row = Object.prototype.hasOwnProperty.call(SET_ACCENTS, String(setId)) ? SET_ACCENTS[setId] : null;
  if (row && HEX.test(row.a) && HEX.test(row.b)) return { a: row.a, b: row.b };
  return { ...FALLBACK_ACCENT };
}

/** ["set-sv9-master", "x"] to ["sv9"]. Order kept, duplicates and unknown sets dropped. */
export function masterySetIds(claimedIds) {
  const list = claimedIds instanceof Set ? [...claimedIds] : Array.isArray(claimedIds) ? claimedIds : [];
  const out = [];
  for (const raw of list) {
    const match = MASTERY_CLAIM_RE.exec(String(raw));
    if (match && isMasterySet(match[1]) && !out.includes(match[1])) out.push(match[1]);
  }
  return out;
}

export function masteryBannerId(setId) {
  return `${MASTERY_BANNER_PREFIX}${setId}`;
}

export function isMasteryBanner(value) {
  return typeof value === "string" && value.startsWith(MASTERY_BANNER_PREFIX);
}

/** The set id inside a `mastery:<id>` banner id, or "" when it is not one. */
export function masteryBannerSet(value) {
  return isMasteryBanner(value) ? value.slice(MASTERY_BANNER_PREFIX.length) : "";
}

/* ---- colour helpers (hex in, hex out) ---------------------------------- */

function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mix `t` of `over` into `base` (0 to 1). */
export function mix(base, over, t) {
  const a = rgb(base);
  const b = rgb(over);
  return hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

function toHsl(color) {
  const [r, g, b] = rgb(color).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * A middle gradient stop that goes round the hue wheel instead of straight
 * through RGB, so gold to blue passes through green, not grey.
 */
export function midStop(a, b) {
  const [ha, sa, la] = toHsl(a);
  const [hb, sb, lb] = toHsl(b);
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return fromHsl(ha + dh / 2, Math.max(sa, sb) * 0.96, (la + lb) / 2);
}

/* ---- the seal ------------------------------------------------------------ */

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const num = (n) => Math.round(n * 100) / 100;

/**
 * The seal draws a rank as 0 to 4: 0 is "not started", then one more quarter
 * of the rim per stop in MASTERY_RANKS (js/mastery-ranks.js, the one table the
 * rewards and the Worker read), and the last stop is the set mastered, which
 * is also when the foil rim comes on.
 */

/** A seal rank from a set percentage: 0 when no stop is reached, 4 at Master. */
function sealFromPct(pct) {
  return masteryRank(pct).index + 1;
}

/** A rank given as a number 0-4 or one of the ids ("bronze" ...). Missing means mastered. */
function rankIndex(rank, pct) {
  if (rank !== undefined && rank !== null && rank !== "") {
    if (typeof rank === "number") return Math.max(0, Math.min(4, Math.floor(rank) || 0));
    const at = MASTERY_RANKS.findIndex((row) => row.id === String(rank));
    if (at >= 0) return at + 1;
  }
  if (pct !== undefined && pct !== null) return sealFromPct(pct);
  return 4;
}

/** Metals for the lit part of the rim below master. Master uses the set's own two colours as foil. */
const METAL = {
  1: ["#f0b98a", "#b06a35"], // bronze
  2: ["#f6f8fc", "#9ba6b8"], // silver
  3: ["#ffe9a6", "#d09a22"], // gold
};

/**
 * Foil: bands of light and shade across the set's two colours, so it reads as
 * struck metal rather than a rainbow. Highlight, colour, shadow, glint, colour,
 * shadow, highlight.
 */
function foilStops(a, b) {
  const stops = [
    [0, mix(a, "#ffffff", 0.72)],
    [0.17, a],
    [0.36, mix(a, "#000000", 0.5)],
    [0.5, mix(mix(a, b, 0.5), "#ffffff", 0.55)],
    [0.68, b],
    [0.85, mix(b, "#000000", 0.45)],
    [1, mix(b, "#ffffff", 0.6)],
  ];
  return stops.map(([at, color]) => `<stop offset="${at}" stop-color="${color}"/>`).join("");
}

/** A toothed rim: `teeth` points, alternating outer and inner radius. */
function rimPath(cx, cy, outer, inner, teeth) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const ang = (Math.PI * i) / teeth - Math.PI / 2;
    pts.push(`${num(cx + r * Math.cos(ang))} ${num(cy + r * Math.sin(ang))}`);
  }
  return `M${pts.join("L")}Z`;
}

/** An annular sector, angles in degrees clockwise from the top. */
function sector(cx, cy, r0, r1, a0, a1) {
  const pt = (r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return `${num(cx + r * Math.sin(rad))} ${num(cy - r * Math.cos(rad))}`;
  };
  return `M${pt(r1, a0)}A${r1} ${r1} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
}

/**
 * The mastery seal as an inline SVG string: a minted medal. The set's own
 * symbol sits large on an enamel plate; the rim says how far the set is.
 *
 * opts: size (px, default 48), name (set name for the accessible label),
 * symbol (image URL; defaults to the set's own symbol from the catalog),
 * rank (0-4 or "bronze", "silver", "gold", "master") or pct (set percent):
 * a quarter of the rim is struck per rank, so bronze is one quarter in
 * bronze, silver two in silver, gold three in gold, and master the full
 * reeded rim in foil. With neither, the seal is a mastered one, as it always
 * was. Rank 0 is the silhouette. `label: false` makes it decorative.
 * No SVG filters: they alias on iPhone Safari.
 */
export function masteryEmblem(setId, opts = {}) {
  const size = Math.max(16, Math.round(Number(opts.size) || 48));
  const rank = rankIndex(opts.rank, opts.pct);
  const { a, b } = setAccent(setId);
  const set = SET_BY_ID.get(String(setId));
  const symbol = opts.symbol || (set ? setIdentity(set).symbol : "");
  const name = opts.name || (set && set.name) || String(setId);
  const id = `mem${(uid = (uid + 1) % 1e6)}`;
  const plateTop = mix(INK_DARK, a, 0.34);
  const plateBottom = mix(INK_DARK, b, 0.2);
  const rankName = rank ? MASTERY_RANKS[rank - 1].name : "Not started";
  const text = rank === 4 ? `${name} Master` : rank === 0 ? `${name}, not started` : `${name}, ${rankName} mastery`;
  const label = opts.label === false ? `aria-hidden="true"` : `role="img" aria-label="${esc(text)}"`;
  const defs = [
    `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1">${foilStops(a, b)}</linearGradient>`,
    `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${plateTop}"/><stop offset="1" stop-color="${plateBottom}"/></linearGradient>`,
  ];
  let metal = `url(#${id}f)`;
  if (rank >= 1 && rank <= 3) {
    defs.push(`<linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${METAL[rank][0]}"/><stop offset="1" stop-color="${METAL[rank][1]}"/></linearGradient>`);
    metal = `url(#${id}m)`;
  }
  // The rim. Master: a reeded edge in foil. Below it: four struck quarters, the rest left blank.
  let rim;
  if (rank === 4) {
    rim = `<path d="${rimPath(48, 48, 47.6, 44.6, 36)}" fill="${metal}"/>`;
  } else {
    const gap = 9;
    const quarters = [];
    for (let q = 0; q < 4; q += 1) {
      const lit = q < rank;
      quarters.push(`<path d="${sector(48, 48, 38, 46.4, q * 90 + gap / 2, (q + 1) * 90 - gap / 2)}" fill="${lit ? metal : "#ffffff"}"${lit ? "" : ` fill-opacity=".14"`}/>`);
    }
    rim = quarters.join("");
  }
  const ring = rank === 0 ? "#ffffff" : metal;
  const image = symbol
    ? `<image href="${esc(symbol)}" x="26" y="26" width="44" height="44" preserveAspectRatio="xMidYMid meet"${rank === 0 ? ` opacity=".7"` : ""}/>`
    : "";
  return `<svg class="mastery-emblem-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" ${label} data-set="${esc(setId)}" data-rank="${rank}">`
    + `<defs>${defs.join("")}</defs>`
    + rim
    + `<circle cx="48" cy="48" r="37.2" fill="${INK_DARK}"/>`
    + `<circle cx="48" cy="48" r="35" fill="url(#${id}p)"/>`
    + `<circle cx="48" cy="48" r="33.3" fill="none" stroke="${ring}" stroke-width="1.4"${rank === 0 ? ` stroke-opacity=".28"` : ""}/>`
    + `<circle cx="48" cy="48" r="29.4" fill="none" stroke="${ring}" stroke-width=".6" stroke-opacity="${rank === 0 ? ".16" : ".5"}"/>`
    + image
    + `</svg>`;
}

const SIZES = { sm: 28, md: 48, lg: 96, xl: 128 };

/**
 * The seal in its styled wrapper (css/pages/mastery.css). `size` is "sm",
 * "md", "lg" or "xl". `locked: true` draws it as a silhouette for a set not
 * yet mastered, unless `rank` or `pct` says it has reached a stop; then the
 * struck part of the rim shows how far it is.
 */
export function masteryEmblemHtml(setId, opts = {}) {
  const size = SIZES[opts.size] ? opts.size : "md";
  const { a, b } = setAccent(setId);
  const known = opts.rank !== undefined || opts.pct !== undefined;
  const rank = known ? rankIndex(opts.rank, opts.pct) : opts.locked ? 0 : 4;
  const cls = `mastery-emblem${rank === 0 || opts.dim ? " is-locked" : ""}${rank > 0 && rank < 4 ? " is-partial" : ""}`;
  return `<span class="${cls}" data-size="${size}" data-rank="${rank}" style="--b1:${a};--b2:${b}">${masteryEmblem(setId, { size: SIZES[size], name: opts.name, symbol: opts.symbol, label: opts.label, rank })}</span>`;
}
