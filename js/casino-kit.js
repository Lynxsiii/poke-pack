/* Small helpers the casino pages share: the API shape, figures, stake
   thumbnails, player lines. Presentational only; every value and every result
   comes from the Worker (worker/casino.js). */
import { api } from "./api.js";
import { esc, coins, coinTag, icon, seatAvatar, wrapperArt, setById } from "./battle-kit.js";
import { coinHTML } from "./coin.js?v=2";

export { api, esc, coins, coinTag, icon, seatAvatar };

export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

/** "23h 10m", "9m", "40s"; "" once it has passed. */
export function timeLeft(ms) {
  if (!(ms > 0)) return "";
  const s = Math.ceil(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const copiesIn = (stake) => (stake || []).reduce((n, c) => n + c.qty, 0);
export const playerName = (p) => (p ? (p.bot ? p.name : p.name || "Trainer") : "");

/** A stack of overlapping card thumbnails, `max` shown and a "+n" for the rest. */
export function stakeStack(stake, max = 5, cls = "") {
  const list = [...(stake || [])].sort((a, b) => b.value * b.qty - a.value * a.qty);
  const shown = list.slice(0, max);
  const rest = copiesIn(stake) - shown.reduce((n, c) => n + c.qty, 0);
  return `<span class="cs-stack ${cls}" role="img" aria-label="${esc(plural(copiesIn(stake), "card"))}">${shown
    .map((c, i) => `<img src="${esc(c.small || c.image)}" alt="" loading="lazy" decoding="async" style="--i:${i}" />`)
    .join("")}${rest > 0 ? `<b class="cs-stack-more">+${rest}</b>` : ""}</span>`;
}

/** The whole pile as tappable card tiles (the table view). */
export function pileTiles(stake) {
  const list = [...(stake || [])].sort((a, b) => b.value * b.qty - a.value * a.qty);
  return list
    .map(
      (c) => `<button class="cs-card" type="button" data-inspect="${esc(c.id)}" data-rev="${c.rev ? 1 : 0}" title="${esc(c.name)}">
        <img src="${esc(c.small || c.image)}" alt="${esc(c.name)}" loading="lazy" decoding="async" />
        ${c.qty > 1 ? `<b class="cs-card-qty">x${c.qty}</b>` : ""}
        <span class="cs-card-value">${coins(c.value)}</span>
      </button>`
    )
    .join("");
}

/** Avatar, name and @handle for a flip's host or challenger. */
export function playerChip(p, cls = "") {
  if (!p) return `<span class="cs-player ${cls} is-empty">${seatAvatar(null)}<span class="cs-player-copy"><b>Open seat</b></span></span>`;
  return `<span class="cs-player ${cls}">${seatAvatar(p)}<span class="cs-player-copy"><b>${esc(playerName(p))}</b>${
    p.bot ? "<small>House bot</small>" : p.handle ? `<small>@${esc(p.handle)}</small>` : ""
  }</span></span>`;
}

/** Empty-state paragraph in the house voice. */
export const emptyLine = (text) => `<p class="cs-empty">${esc(text)}</p>`;

const EXTRA_ICONS = {
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.6"/><path d="M12 9v6M9.6 12h4.8"/>',
  // the pot: three cards tossed in, fanned behind one coin
  pot: '<path d="M8.3 13.9 8.3 5 8.6 4.4 9.4 4.1 14.6 4.1 15.1 4.2 15.5 4.6 15.7 5.2 15.7 13.9M7.2 15.9 3.3 8.1 3.2 7.6 3.3 7.1 3.6 6.7 7.9 4.6M16.1 4.6 20.4 6.7 20.7 7.1 20.8 7.6 20.7 8.1 16.8 15.9"/><circle cx="12" cy="17.4" r="4.2"/><circle cx="12" cy="17.4" r="1.7"/>',
  // the hit between two packs
  clash: '<path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
export const casinoIcon = (name, cls = "") =>
  EXTRA_ICONS[name]
    ? `<svg class="bt-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${EXTRA_ICONS[name]}</svg>`
    : icon(name, cls);

/* ---------- The three table arts ----------
   One family: real objects on a table, lit from the upper left, each on the
   same soft pool of shadow (.cs-art-shadow, css/pages/casino.css). `size` is
   the art's height in px; at 76 each fills about 70% of the hub's tile box. */

const CARD_BACK = "assets/cards/shared/card-back.webp";
const shadow = () => `<i class="cs-art-shadow" aria-hidden="true"></i>`;

/** The house coin (or a promo coin) at rest on the table. */
export function coinArtHTML({ size = 76, heads = null, tails = null, rest = "heads", cls = "" } = {}) {
  const dim = Math.max(24, Number(size) || 76);
  return `<span class="cs-art cs-art-coin ${cls}" style="--s:${dim}px" aria-hidden="true">${shadow()}${coinHTML({ heads, tails, size: dim, rest })}</span>`;
}

/** The pot: three cards tossed in face down, the coin on top. */
export function potArtHTML({ size = 76, cls = "" } = {}) {
  const dim = Math.max(24, Number(size) || 76);
  return `<span class="cs-art cs-art-pot ${cls}" style="--s:${dim}px" aria-hidden="true">${shadow()}
    <span class="cs-pot-cards">${[0, 1, 2].map((i) => `<img src="${CARD_BACK}" alt="" loading="lazy" decoding="async" draggable="false" style="--i:${i}" />`).join("")}</span>
    ${coinHTML({ size: Math.round(dim * 0.52), rest: "heads" })}</span>`;
}

/** Pack battles: two boosters of the set clashing, a hit mark between them.
    `art` puts a specific wrapper in front (the hall's chosen product); the
    second pack is the set's next wrapper, or the same one when it has only
    one. `glint` adds the hall's light sweep inside the front pack. */
export function battlesArtHTML({ setId = "", art = "", size = 76, cls = "", glint = false, eager = false } = {}) {
  // size 0 leaves --s to the stylesheet (the hall sizes the stage per breakpoint)
  const style = size === 0 ? "" : ` style="--s:${Math.max(24, Number(size) || 76)}px"`;
  const all = (setById(setId)?.wrappers || []).map((w) => w.art).filter(Boolean);
  const front = art || all[0] || wrapperArt(setId);
  const back = all.find((a) => a !== front) || front;
  if (!front) return `<span class="cs-art cs-art-clash is-empty ${cls}"${style} aria-hidden="true"></span>`;
  const img = (src) => `<img src="${esc(src)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false" />`;
  return `<span class="cs-art cs-art-clash ${cls}"${style} aria-hidden="true">${shadow()}
    <span class="cs-clash-pack is-front is-pack">${img(front)}${glint ? '<span class="hl-glint"></span>' : ""}</span>
    <span class="cs-clash-pack is-back is-pack">${img(back)}</span>
    <span class="cs-clash-mark">${casinoIcon("clash")}</span></span>`;
}
