/**
 * Colour taken from cards. Pure functions, no DOM, shared by the browser and
 * the Worker. A binder or a profile set to "cards" asks for the dominant
 * colours of the cards it holds and paints itself with them.
 *
 * A card's colour is its Pokémon type; Trainers and Energy without a type use
 * the set's own accent pair. js/binder-view.js may refine a card from its
 * art once the image has loaded (same-origin, so a canvas can read it), but
 * everything here works without a single image.
 */
import { setAccent } from "./mastery.js";

export const TYPE_COLORS = {
  Grass: "#5fbf5a",
  Fire: "#f0603a",
  Water: "#4a9be8",
  Lightning: "#f5cf3a",
  Psychic: "#b05fd6",
  Fighting: "#b9703f",
  Darkness: "#5a5878",
  Metal: "#9aa5b4",
  Fairy: "#f08ec0",
  Dragon: "#c9a23a",
  Colorless: "#cfcac0",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(value) {
  return typeof value === "string" && HEX.test(value);
}

export function hexToRgb(hex) {
  const n = Number.parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Linear blend in sRGB: t 0 is a, t 1 is b. */
export function mixHex(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** [hue 0-359, saturation 0-1, lightness 0-1]. */
export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return [(h + 360) % 360, s, l];
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** The setId in a card id like "me55-149" or "sv10-5" (everything before the last dash). */
export function setIdOfCard(card) {
  return String(card?.id || "").replace(/-[^-]*$/, "");
}

/** One card's main colour: its type, else its set's first accent. Always a hex. */
export function accentForCard(card) {
  const type = Array.isArray(card?.types) ? card.types.find((t) => TYPE_COLORS[t]) : null;
  if (type) return TYPE_COLORS[type];
  return setAccent(setIdOfCard(card)).a;
}

/**
 * The two colours a group of cards leans on. Hues fall into twelve bins weighted
 * by saturation (a grey Colorless card barely votes); the heaviest bin gives
 * `a`, the next one `b`. Fewer than two distinct bins gives `b` as a shifted
 * partner of `a`. An empty list gives null so the caller keeps its own colour.
 * `accents` is an optional list of hex strings (a card refined from its art)
 * used in place of the type colour, in the same order as `cards`.
 */
export function dominantAccents(cards, accents) {
  const list = (Array.isArray(cards) ? cards : []).map((card, i) => (isHex(accents?.[i]) ? accents[i] : accentForCard(card)));
  if (!list.length) return null;
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, hex: [] }));
  for (const hex of list) {
    const [h, s] = hexToHsl(hex);
    const bin = bins[Math.floor(h / 30) % 12];
    const weight = 0.15 + s;
    bin.weight += weight;
    bin.hex.push([hex, weight]);
  }
  const ranked = bins.filter((bin) => bin.weight > 0).sort((p, q) => q.weight - p.weight);
  const average = (bin) => {
    const total = bin.hex.reduce((sum, [, w]) => sum + w, 0);
    const rgb = [0, 0, 0];
    for (const [hex, w] of bin.hex) hexToRgb(hex).forEach((v, i) => { rgb[i] += (v * w) / total; });
    return rgbToHex(rgb);
  };
  const a = average(ranked[0]);
  if (ranked[1]) return { a, b: average(ranked[1]) };
  const [h, s, l] = hexToHsl(a);
  return { a, b: hslToHex((h + 28) % 360, Math.min(1, s * 0.9), Math.min(0.78, l + 0.06)) };
}
