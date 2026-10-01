/**
 * The mastery banner: a set's own art, composed in HTML and CSS from files the
 * site already serves. A set's logo, its booster wrapper standing tilted like a
 * pack on a shelf, and its chase card cropped to the illustration, all tinted
 * by the set's accent pair, with a stamped "Master" in the corner.
 *
 * Pure functions, no DOM. css/pages/mastery-banner.css paints the result and
 * does the sizing in container units, so the same markup reads at 44px, 150px
 * and 210px tall. Nothing here is saved: a profile stores `mastery:<setId>`
 * and this turns it into markup, so an old or unknown id can only ever fall
 * back to the plain wash.
 *
 * variants: "hero" (profile and account header: logo, wrapper, card, stamp),
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
 *   stamp      false to leave the "Master" stamp off
 *   eager      true for the one banner the page opens on (no lazy loading)
 * An unknown set still gets a banner: the accent fallback wash and the stamp.
 */
export function masteryBannerHtml(setId, opts = {}) {
  const id = String(setId ?? "");
  const variant = VARIANTS.has(opts.variant) ? opts.variant : "hero";
  const set = SET_BY_ID.get(id) || null;
  const { a, b } = setAccent(id);
  const tag = opts.tag === "span" ? "span" : "div";
  const lazy = opts.eager ? "" : ` loading="lazy"`;
  const chase = chaseArt(id);
  const pack = variant === "tile" ? null : packArt(id);
  const logo = set ? setIdentity(set).logo : "";
  const cls = ["mbn", opts.className, opts.still ? "is-still" : ""].filter(Boolean).join(" ");
  const parts = [`<span class="mbn-bed"></span>`];
  if (chase) {
    parts.push(`<img class="mbn-card" src="${esc(variant === "tile" ? chase.small : chase.full)}" alt="" width="300" height="419"${lazy} decoding="async" draggable="false" />`);
  }
  parts.push(`<span class="mbn-light"></span>`);
  if (pack) {
    parts.push(
      `<picture class="mbn-pack">${pack.avif ? `<source srcset="${esc(pack.avif)}" type="image/avif" />` : ""}<img src="${esc(pack.png)}" alt="" width="180" height="323"${lazy} decoding="async" draggable="false" /></picture>`
    );
  }
  if (logo) parts.push(`<img class="mbn-logo" src="${esc(logo)}" alt=""${lazy} decoding="async" draggable="false" />`);
  if (opts.stamp !== false && variant !== "tile") parts.push(`<span class="mbn-stamp">Master</span>`);
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
