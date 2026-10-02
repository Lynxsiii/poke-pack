/* Small helpers every battle module shares: escaping, coin figures, icons,
   seat avatars and product art. Keep it presentational; the rules live in
   js/battle-rules.js and every number comes from the server. */
import { PLAYABLE_SETS } from "./catalog.js";
import { HIT_RARITIES } from "./engine.js";
import { botPersona } from "./battle-rules.js";
import { avatarSrc, avatarStyle } from "./cosmetics.js";
import { avatarColor } from "./palette.js";
import { coinText, coinAmount } from "./money.js?v=1";

export const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** 1234.5 -> "1,234.50", 2500 -> "2,500" */
export const coins = coinText;

/** A money figure, the way the header shows coins: the coin mark, then the amount. */
export const coinTag = (value, cls = "") => `<span class="bt-coins ${cls}">${coinAmount(value)}</span>`;

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  skip: '<path d="m5 5 9 7-9 7zM17 5v14"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17.5 14a5 5 0 0 1 3.5 5"/>',
  bot: '<rect x="4.5" y="7.5" width="15" height="12" rx="3.5"/><path d="M12 3.5v4M9 12.5v1.5M15 12.5v1.5M9.5 16.5h5"/>',
  swords: '<path d="m5 3 14 14-2 2L3 5zM19 3 5 17l2 2L21 5zM3 19l3-3M18 16l3 3"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="bt-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

/** Front wrapper art for a set, for products without their own picture. */
const WRAPPERS = new Map(PLAYABLE_SETS.map((set) => [set.id, set.wrappers?.[0]?.art || ""]));
export const wrapperArt = (setId) => WRAPPERS.get(setId) || "";
export const setById = (setId) => PLAYABLE_SETS.find((set) => set.id === setId) || null;

/** Seat avatar: a real trainer's own avatar, or the bot persona's partner. */
export function seatAvatar(seat, cls = "bt-avatar") {
  if (!seat) return `<span class="${cls} is-open" aria-hidden="true">${icon("plus")}</span>`;
  const persona = seat.bot ? botPersona(seat) : null;
  const color = avatarColor(persona?.color || seat.color);
  const src = avatarSrc(persona?.avatar || seat.avatar, persona ? "art" : seat.avatarStyle);
  const pixel = !persona && avatarStyle(seat.avatarStyle) === "pixel" ? " pixel" : "";
  return `<span class="${cls}${seat.bot ? " is-bot" : ""}${pixel}" style="--avatar:${esc(color.hex)}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" /></span>`;
}

/** 0 bulk, 1 holo/rare, 2 hit (Double Rare and up), 3 chase (IR/SIR/HR/gold and friends). */
const CHASE = new Set(["Special Illustration Rare", "Hyper Rare", "Mega Hyper Rare", "Illustration Rare", "Mega Attack Rare", "Master Ball", "Shiny Ultra Rare", "Gold Rare", "Secret Rare", "Rainbow Rare"]);
export function hitTier(card) {
  if (!card) return 0;
  if (CHASE.has(card.rarity)) return 3;
  if (!card.reverse && HIT_RARITIES.has(card.rarity)) return 2;
  if (card.reverse || /Rare|Holo|Shiny|Radiant|Amazing|ACE/.test(card.rarity || "")) return 1;
  return 0;
}
export const isBulk = (card) => ["Common", "Uncommon", "Energy"].includes(card?.rarity) && !card?.reverse;
