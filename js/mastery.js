/**
 * Set mastery looks: an accent pair per set, the emblem seal, the exclusive
 * banner id. Pure functions, no DOM, so the browser and the Worker share them.
 *
 * The accent pair comes from data/set-accents.json by way of the generated
 * js/set-accents.js (scripts/make_set_accents.py). The emblem is a flat seal:
 * a toothed rim and an inner disc in the set's two colours, a star and a
 * laurel, and the set's own symbol in the middle. Gradients and plain shapes
 * only. No SVG filters: they alias on iPhone Safari.
 */
import { PLAYABLE_SETS, setIdentity } from "./catalog.js";
import { SET_ACCENTS } from "./set-accents.js";

export const MASTERY_BANNER_PREFIX = "mastery:";
export const MASTERY_CLAIM_RE = /^set-(.+)-master$/;
export const FALLBACK_ACCENT = { a: "#f2c14e", b: "#9b6dff" };

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

function starPath(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? inner : outer;
    const ang = (Math.PI * i) / 5 - Math.PI / 2;
    pts.push(`${num(cx + r * Math.cos(ang))} ${num(cy + r * Math.sin(ang))}`);
  }
  return `M${pts.join("L")}Z`;
}

/** One almond leaf from (x, y) pointing along unit vector (dx, dy). */
function leaf(x, y, dx, dy, len, wide) {
  const mx = x + dx * len * 0.5;
  const my = y + dy * len * 0.5;
  const px = -dy * wide;
  const py = dx * wide;
  return `M${num(x)} ${num(y)}Q${num(mx + px)} ${num(my + py)} ${num(x + dx * len)} ${num(y + dy * len)}Q${num(mx - px)} ${num(my - py)} ${num(x)} ${num(y)}Z`;
}

/** Two laurel branches hugging the lower half of the inner disc, tips meeting at the top. */
function laurel(cx, cy, radius, fill) {
  const paths = [];
  const steps = 7;
  for (const side of [-1, 1]) {
    // the stem: an arc from the bottom, up the side
    const t0 = (172 * Math.PI) / 180;
    const t1 = (58 * Math.PI) / 180;
    const sx = (t) => cx + side * radius * Math.sin(t);
    const sy = (t) => cy - radius * Math.cos(t);
    paths.push(`<path d="M${num(sx(t0))} ${num(sy(t0))}A${radius} ${radius} 0 0 ${side === 1 ? 0 : 1} ${num(sx(t1))} ${num(sy(t1))}" fill="none" stroke="${fill}" stroke-width="1.1" stroke-linecap="round"/>`);
    for (let i = 0; i < steps; i += 1) {
      const t = ((166 - i * 16) * Math.PI) / 180;
      const x = sx(t);
      const y = sy(t);
      const dir = [-side * Math.cos(t), -Math.sin(t)]; // direction of travel up the arc
      const out = [side * Math.sin(t), -Math.cos(t)]; // outward
      const size = 7.2 - i * 0.35;
      for (const flip of [1, -1]) {
        const ang = (38 * Math.PI) / 180;
        const dx = dir[0] * Math.cos(ang) + flip * out[0] * Math.sin(ang);
        const dy = dir[1] * Math.cos(ang) + flip * out[1] * Math.sin(ang);
        paths.push(`<path d="${leaf(x, y, dx, dy, size, 1.9)}"/>`);
      }
    }
  }
  return `<g fill="${fill}">${paths.join("")}</g>`;
}

/**
 * The mastery seal as an inline SVG string.
 * opts: size (px, default 48), name (set name for the accessible label),
 * symbol (image URL; defaults to the set's own symbol from the catalog).
 * Set `label: false` for a decorative emblem that sits beside its own text.
 */
export function masteryEmblem(setId, opts = {}) {
  const size = Math.max(16, Math.round(Number(opts.size) || 48));
  const { a, b } = setAccent(setId);
  const mid = midStop(a, b);
  const set = SET_BY_ID.get(String(setId));
  const symbol = opts.symbol || (set ? setIdentity(set).symbol : "");
  const name = opts.name || (set && set.name) || String(setId);
  const id = `mem${(uid = (uid + 1) % 1e6)}`;
  const light = mix(a, "#ffffff", 0.62);
  const discTop = mix(INK_DARK, a, 0.36);
  const discBottom = mix(INK_DARK, b, 0.26);
  const label = opts.label === false ? `aria-hidden="true"` : `role="img" aria-label="${esc(name)} Master"`;
  const image = symbol
    ? `<image href="${esc(symbol)}" x="29.5" y="36" width="37" height="24" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  return `<svg class="mastery-emblem-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}" ${label} data-set="${esc(setId)}">`
    + `<defs>`
    + `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${b}"/></linearGradient>`
    + `<linearGradient id="${id}i" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`
    + `<linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${discTop}"/><stop offset="1" stop-color="${discBottom}"/></linearGradient>`
    + `</defs>`
    + `<path d="${rimPath(48, 48, 47.5, 44.2, 28)}" fill="url(#${id}r)"/>`
    + `<circle cx="48" cy="48" r="41" fill="${INK_DARK}"/>`
    + `<circle cx="48" cy="48" r="39.2" fill="none" stroke="url(#${id}i)" stroke-width="2"/>`
    + `<circle cx="48" cy="48" r="37" fill="url(#${id}d)"/>`
    + laurel(48, 48, 27.5, `url(#${id}i)`)
    + `<path d="${starPath(48, 20, 6.4, 2.7)}" fill="${light}"/>`
    + image
    + `</svg>`;
}

const SIZES = { sm: 28, md: 48, lg: 96 };

/**
 * The emblem in its styled wrapper (css/pages/mastery.css). `size` is "sm",
 * "md" or "lg". `locked: true` draws it as a silhouette for a set not yet
 * mastered.
 */
export function masteryEmblemHtml(setId, opts = {}) {
  const size = SIZES[opts.size] ? opts.size : "md";
  const { a, b } = setAccent(setId);
  const cls = `mastery-emblem${opts.locked ? " is-locked" : ""}`;
  return `<span class="${cls}" data-size="${size}" style="--b1:${a};--b2:${b}">${masteryEmblem(setId, { size: SIZES[size], name: opts.name, symbol: opts.symbol, label: opts.label })}</span>`;
}
