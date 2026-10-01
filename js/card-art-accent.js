/**
 * Card colour from the art itself. A binder (or a profile) set to "cards" first
 * paints with each card's Pokémon-type colour (js/card-accent.js, instant, no
 * images). This module refines that from the scan: it reads a card's small
 * same-origin image into an 8x8 canvas and takes the average of the most
 * saturated pixels, so a Tropius that is mostly gold fruit leans gold, not
 * "Grass".
 *
 *   cachedCardAccents(cards)           sync: [hex | undefined] aligned with `cards`,
 *                                      from the cache only. Pass it as ctx.accents to
 *                                      resolveBinderLook / dominantAccents; entries that
 *                                      are not sampled yet fall back to the type colour.
 *   sampleCardAccents(cards, onFresh)  async: samples every card not yet in the cache,
 *                                      a few at a time, never on the render path. Calls
 *                                      onFresh() (at most once a frame) whenever new
 *                                      colours landed, and resolves to the same array as
 *                                      cachedCardAccents(cards) when done.
 *
 * Both take the card objects the site already holds (id, imageSmall / image).
 * Results are cached by card id for the life of the page (a Map), failures too,
 * so a card is only ever read once. Remote or non-image sources are skipped (a
 * cross-origin canvas is tainted and cannot be read); the type colour stands in.
 * Call it only when a look uses "cards" (colour or tint); it does nothing else.
 */
import { hexToHsl, hslToHex, rgbToHex } from "./card-accent.js";

const cache = new Map(); // card id -> hex, or null when this card could not be read
const pending = new Map(); // card id -> promise, so overlapping calls share one read
const MAX_CARDS = 120; // a binder is big; the first screens' worth is plenty to colour a cover
const PARALLEL = 4;
const SIZE = 8;

function sameOrigin(src) {
  try {
    return new URL(src, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/**
 * The colour a card's art leans on: crop away the printed border and the text
 * box (the yellow frame would win every time), shrink to 8x8, then average the
 * most saturated quarter of the pixels. Lightness is kept in a range a cover can
 * use (not near black, not near white).
 */
export function accentFromPixels(data) {
  const px = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    if (hi < 28 || lo > 238) continue; // pure black or paper white says nothing
    px.push([r, g, b, hi - lo]);
  }
  if (!px.length) return null;
  px.sort((p, q) => q[3] - p[3]);
  const top = px.slice(0, Math.max(3, Math.ceil(px.length / 4)));
  const rgb = [0, 0, 0];
  for (const p of top) for (let c = 0; c < 3; c++) rgb[c] += p[c] / top.length;
  const [h, s, l] = hexToHsl(rgbToHex(rgb));
  return hslToHex(h, Math.max(s, 0.22), Math.min(0.7, Math.max(0.3, l)));
}

function readImage(img) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!ctx || !w || !h) return null;
  // The window of art: 8-92% across, 9-62% down a card.
  ctx.drawImage(img, w * 0.08, h * 0.09, w * 0.84, h * 0.53, 0, 0, SIZE, SIZE);
  return accentFromPixels(ctx.getImageData(0, 0, SIZE, SIZE).data);
}

function sampleOne(card) {
  const id = card?.id;
  if (!id) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (pending.has(id)) return pending.get(id);
  const src = card.imageSmall || card.image;
  const job = (async () => {
    let hex = null;
    try {
      if (src && sameOrigin(src)) hex = readImage(await loadImage(src));
    } catch {
      hex = null;
    }
    cache.set(id, hex);
    pending.delete(id);
    return hex;
  })();
  pending.set(id, job);
  return job;
}

export function cachedCardAccents(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => cache.get(card?.id) || undefined);
}

export async function sampleCardAccents(cards, onFresh) {
  const list = (Array.isArray(cards) ? cards : []).filter((card) => card?.id && !cache.has(card.id)).slice(0, MAX_CARDS);
  const todo = [...new Map(list.map((card) => [card.id, card])).values()];
  let queued = false;
  const poke = () => {
    if (queued || typeof onFresh !== "function") return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      onFresh();
    });
  };
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const card = todo[next++];
      const hex = await sampleOne(card);
      if (hex) poke();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  return cachedCardAccents(cards);
}
