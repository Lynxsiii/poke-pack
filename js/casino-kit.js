/* Small helpers the casino pages share: the API shape, figures, stake
   thumbnails, player lines. Presentational only; every value and every result
   comes from the Worker (worker/casino.js). */
import { api } from "./api.js";
import { esc, coins, coinTag, icon, seatAvatar } from "./battle-kit.js";

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
  pot: '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.6"/><path d="M5.5 6.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5"/><path d="M5.5 11.5v5c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
export const casinoIcon = (name, cls = "") =>
  EXTRA_ICONS[name]
    ? `<svg class="bt-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${EXTRA_ICONS[name]}</svg>`
    : icon(name, cls);
