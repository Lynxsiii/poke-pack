/**
 * Small helpers shared by the achievement tables (js/achievement-*.js) and the
 * context builder in js/achievements.js. Pure functions only: this module is
 * imported by the browser and by the Worker, so no DOM, no fetch.
 */

import { homeSetId } from "./card-home.js";

/** 1,234 with a plain comma, the same in every runtime. */
export function fmt(n) {
  const value = Math.round(Number(n) || 0);
  const sign = value < 0 ? "-" : "";
  return sign + String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A short badge glyph for a goal: 25, 1K, 2.5K, 1M. */
export function markOf(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}K`;
  return String(value);
}

/**
 * Build one achievement row. Order follows how the tables read: where it
 * lives, how it feels (tier 1 bronze to 4 prismatic), what it is called, what
 * it asks, how far it goes, how progress is read, what it pays.
 * `extra` carries the optional fields: mark, title, secret, hint, set, kind.
 */
export function ach(cat, tier, id, name, note, goal, at, coins, extra = {}) {
  return { id, cat, tier, mark: extra.mark || markOf(goal), name, note, goal, at, coins, ...omit(extra, "mark") };
}

function omit(obj, key) {
  const { [key]: _drop, ...rest } = obj;
  return rest;
}

/** A secret row: shows as "???" plus `hint` until it is done. */
export function secret(cat, tier, id, mark, name, hint, note, goal, at, coins, extra = {}) {
  return ach(cat, tier, id, name, note, goal, at, coins, { ...extra, mark, secret: true, hint });
}

/** Lower-cased word list of a card name, for the token index. */
export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Does `name` contain `query` as whole words? "Mew" finds "Mew ex" and
 * "Mew VMAX" but never "Mewtwo"; "Team Rocket's" finds every Team Rocket's
 * card; "Charizard" also finds "Lance's Charizard V" and "Mega Charizard X ex".
 * Both arguments are compared case-insensitively.
 */
export function nameHas(name, query) {
  const hay = String(name || "").toLowerCase();
  const needle = String(query || "").toLowerCase().trim();
  if (!needle) return false;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    const before = at === 0 ? "" : hay[at - 1];
    const after = hay[at + needle.length] || "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    at = hay.indexOf(needle, at + 1);
  }
  return false;
}

/** The id of the set a card is counted under: its id prefix, or "mep" for an ME black star promo (js/card-home.js). */
export function setIdOfCard(cardId) {
  return homeSetId(cardId);
}

/** Cheap Pokemon lists shared by the dex table and the secrets. */
export const EEVEELUTIONS = ["Vaporeon", "Jolteon", "Flareon", "Espeon", "Umbreon", "Leafeon", "Glaceon", "Sylveon"];

/** Sword & Shield only printed these finishes (see RARITY_ORDER). */
export const SWSH_FINISHES = [
  "Rare Holo",
  "Rare Holo V",
  "Rare Holo VMAX",
  "Rare Holo VSTAR",
  "Amazing Rare",
  "Radiant Rare",
  "Rare Shiny",
  "Trainer Gallery Rare Holo",
  "Rare Ultra",
  "Rare Rainbow",
  "Rare Secret",
];

/**
 * Sun & Moon's finishes (see RARITY_ORDER). Tag Team is a GX subtype, not a
 * rarity: it shows up as Rare Holo GX, Rare Ultra, Rare Rainbow or Rare Secret.
 */
export const SM_FINISHES = [
  "Rare Holo",
  "Rare Holo GX",
  "Rare Prism Star",
  "Rare Shining",
  "Rare Shiny",
  "Rare Shiny GX",
  "Rare Ultra",
  "Rare Rainbow",
  "Rare Secret",
];

/**
 * XY's finishes (see RARITY_ORDER). Mega EX is a Pokémon-EX subtype, not a rarity:
 * it shows up as Rare Holo EX, Rare Ultra or Rare Secret. Radiant Collection has
 * no rarity of its own either.
 */
export const XY_FINISHES = ["Rare Holo", "Rare Holo EX", "Rare BREAK", "Rare Ultra", "Rare Secret"];

/**
 * A Tag Team GX is printed "Pheromosa & Buzzwole-GX": two names and a GX. The
 * Worker only knows a card's id, name and rarity, so the name is the test
 * (the Tag Team Supporters of Cosmic Eclipse carry no GX and do not count).
 */
export function isTagTeamName(name) {
  return /&.+-GX$/i.test(String(name || "").trim());
}

/** Scarlet & Violet and Mega Evolution finishes that come out of packs. */
export const SV_FINISHES = [
  "Double Rare",
  "Ultra Rare",
  "Illustration Rare",
  "Special Illustration Rare",
  "Hyper Rare",
  "ACE SPEC Rare",
  "Shiny Rare",
  "Shiny Ultra Rare",
  "Poké Ball",
  "Master Ball",
];
