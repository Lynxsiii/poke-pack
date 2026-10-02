/**
 * The mastery banner: a display case for a mastered set, composed in HTML and
 * CSS from files the site already serves. The set's logo, a "Set Master"
 * ribbon with the set's name and card count, and the booster wrapper and chase
 * card standing on the case's shelf (the card shown whole, with a foil sheen),
 * all lit in the set's accent pair.
 *
 * Pure functions, no DOM. css/pages/mastery-banner.css paints the result and
 * does the sizing in container units, so the same markup reads at 44px, 112px,
 * 164px and 210px tall. Nothing here is saved: a profile stores
 * `mastery:<setId>` and this turns it into markup, so an old or unknown id can
 * only ever fall back to the plain wash.
 *
 * variants: "hero" (profile and account header: logo, plaque, wrapper, card),
 * "wide" (a shelf banner: same, shorter), "tile" (a set tile or picker
 * thumbnail: card and logo only, so sixty of them stay cheap).
 */
import { PLAYABLE_SETS, setIdentity } from "./catalog.js";
import { isMasterySet, setAccent } from "./mastery.js";
import { parseBanner, bannerVars } from "./cosmetics.js";
import { SET_CHASE } from "./set-chase.js";

const SET_BY_ID = new Map(PLAYABLE_SETS.map((set) => [set.id, set]));
const VARIANTS = new Set(["hero", "wide", "tile"]);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Booster wrapper art for a set, or null (promo sets have none). First wrapper, so the pick never changes. */
export function packArt(setId) {
  const wrap = SET_BY_ID.get(String(setId))?.wrappers?.[0];
  if (!wrap || !(wrap.art || wrap.artFallback)) return null;
  return { avif: wrap.art || "", png: wrap.artFallback || wrap.art };
}

/** The chase card image (full size and the small copy), or null when the set has none yet. */
export function chaseArt(setId) {
  const id = String(setId);
  const full = Object.prototype.hasOwnProperty.call(SET_CHASE, id) ? SET_CHASE[id] : "";
  if (!full || !/\.webp$/.test(full)) return null;
  return { full, small: full.replace(/\.webp$/, "-sm.webp") };
}

/**
 * A set's mastery banner as markup. opts:
 *   variant    "hero" (default), "wide" or "tile"
 *   className  extra classes on the element (acct-banner, tip-banner, ...)
 *   tag        "div" (default) or "span" where only phrasing content is allowed
 *   still      true for a swatch that never moves
 *   stamp      false to leave the "Set Master" plaque off
 *   eager      true for the one banner the page opens on (no lazy loading)
 * An unknown set still gets a banner: the accent fallback wash and the plaque.
 */
export function masteryBannerHtml(setId, opts = {}) {
  const id = String(setId ?? "");
  const variant = VARIANTS.has(opts.variant) ? opts.variant : "hero";
  const set = SET_BY_ID.get(id) || null;
  const { a, b } = setAccent(id);
  const tag = opts.tag === "span" ? "span" : "div";
  const lazy = opts.eager ? "" : ` loading="lazy"`;
  const tile = variant === "tile";
  const chase = chaseArt(id);
  const pack = tile ? null : packArt(id);
  const logo = set ? setIdentity(set).logo : "";
  const cls = ["mbn", opts.className, opts.still ? "is-still" : ""].filter(Boolean).join(" ");
  const img = (cn, src, w, h) => `<img class="${cn}" src="${esc(src)}" alt="" width="${w}" height="${h}"${lazy} decoding="async" draggable="false" />`;
  // The case, back to front: lining, the card's own colours as haze, light, the shelf, then what stands on it.
  const parts = [`<span class="mbn-bed"></span>`];
  if (chase && !tile) parts.push(img("mbn-haze", chase.full, 300, 419));
  parts.push(`<span class="mbn-light"></span>`, `<span class="mbn-floor"></span>`);
  if (pack) {
    parts.push(
      `<picture class="mbn-pack">${pack.avif ? `<source srcset="${esc(pack.avif)}" type="image/avif" />` : ""}<img src="${esc(pack.png)}" alt="" width="180" height="323"${lazy} decoding="async" draggable="false" /></picture>`
    );
  } else if (chase && !tile && set?.cardBack) {
    // No wrapper (a promo set): the card stands in front of its own back.
    parts.push(img("mbn-back", set.cardBack, 300, 419));
  }
  if (chase) parts.push(`<span class="mbn-card">${img("mbn-card-img", tile ? chase.small : chase.full, 300, 419)}<i class="mbn-foil"></i></span>`);
  const head = [];
  if (logo) head.push(`<img class="mbn-logo" src="${esc(logo)}" alt=""${lazy} decoding="async" draggable="false" />`);
  if (opts.stamp !== false && !tile) {
    const total = set ? Number(set.totalCount) || 0 : 0;
    head.push(
      `<span class="mbn-plaque"><b class="mbn-rank">Set Master</b>${set ? `<span class="mbn-set">${esc(set.name)}</span>` : ""}${total ? `<small class="mbn-count">All ${total.toLocaleString("en-US")} cards</small>` : ""}</span>`
    );
  }
  if (head.length) parts.push(`<span class="mbn-head">${head.join("")}</span>`);
  parts.push(`<span class="mbn-glass"></span>`);
  return `<${tag} class="${esc(cls)}" data-motion="mastery" data-variant="${variant}" data-set="${esc(id)}" data-pack="${pack ? 1 : 0}" data-card="${chase ? 1 : 0}" style="--b1:${a};--b2:${b}" aria-hidden="true">${parts.join("")}</${tag}>`;
}

/**
 * The banner block for whatever a profile saved. A `mastery:<id>` value draws
 * the composed banner; every other value (and any unknown mastery id, which
 * parseBanner already sends to the default) draws the plain two-colour wash,
 * exactly as before.
 */
export function bannerBlockHtml(value, opts = {}) {
  const parsed = parseBanner(value);
  if (parsed.set && isMasterySet(parsed.set)) return masteryBannerHtml(parsed.set, opts);
  const v = bannerVars(value);
  const tag = opts.tag === "span" ? "span" : "div";
  const cls = ["banner-wash", opts.className, opts.still ? "is-still" : ""].filter(Boolean).join(" ");
  return `<${tag} class="${esc(cls)}" data-motion="${esc(v.motion)}" style="${esc(v.style)}"></${tag}>`;
}
