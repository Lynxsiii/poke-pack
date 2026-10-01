/**
 * Profile looks: how a trainer's public profile is dressed and laid out. Data
 * and pure functions, no DOM, shared by the page and the Worker.
 *
 *   tint      the colour of the room: "" (the site's own), a binder colour id,
 *             or "cards" (the dominant colours of the showcase and shown binder pages)
 *   backdrop  a still pattern drawn over the room, tinted by it
 *   hero      "banner" (the banner behind the name) or "plain" (no banner, bigger picture)
 *   showcase  "row" | "grid" | "stage" (first card large)
 *   sections  the order of the page and which are on; hidden ones are not drawn
 *   chasing   one line under the name: what this trainer is after
 *
 * Everything is free. Sections are a registry: add an id to PROFILE_SECTIONS
 * (and a renderer in js/profile-view.js) to give another thread a place on the
 * page, e.g. "mastery" for the Levels thread's shelf of mastered sets. Unknown
 * ids in saved data are dropped on read, missing ones are appended on, so a
 * look saved before a section existed still shows it.
 */
import { BINDER_COLORS, COLOR_FROM_CARDS, cleanLine } from "./binder-looks.js";

export const PROFILE_LOOK_VERSION = 1;
export const CHASING_MAX = 48;

/** Page sections, in their default order. `locked` ones cannot be turned off. */
export const PROFILE_SECTIONS = [
  { id: "mastery", name: "Mastery", note: "The sets you have mastered." },
  { id: "showcase", name: "Showcase", note: "The cards you pinned." },
  { id: "graded", name: "Graded", note: "Slabs you chose to show." },
  { id: "binder", name: "Binder", note: "The binder pages you display." },
  { id: "wall", name: "Wall", note: "Notes from other trainers. Turn it off to stop new notes." },
];

export const PROFILE_BACKDROPS = [
  { id: "none", name: "Plain" },
  { id: "grain", name: "Grain" },
  { id: "grid", name: "Grid" },
  { id: "dots", name: "Dots" },
  { id: "stripes", name: "Stripes" },
  { id: "halftone", name: "Halftone" },
];

export const PROFILE_HEROES = [
  { id: "banner", name: "Banner", note: "Your banner behind your name." },
  { id: "plain", name: "Plain", note: "No banner, a bigger picture." },
];

export const PROFILE_SHOWCASES = [
  { id: "row", name: "Row", note: "One shelf, in your order." },
  { id: "grid", name: "Grid", note: "Cards in rows of three." },
  { id: "stage", name: "Stage", note: "Your first card large, the rest beside it." },
];

export const DEFAULT_PROFILE_LOOK = Object.freeze({
  v: PROFILE_LOOK_VERSION,
  tint: "",
  backdrop: "none",
  hero: "banner",
  showcase: "row",
  sections: PROFILE_SECTIONS.map((row) => ({ id: row.id, on: true })),
  chasing: "",
});

const TINT_IDS = new Set(["", COLOR_FROM_CARDS, ...BINDER_COLORS.map((row) => row.id)]);
const ids = (rows) => new Set(rows.map((row) => row.id));
const BACKDROP_IDS = ids(PROFILE_BACKDROPS);
const HERO_IDS = ids(PROFILE_HEROES);
const SHOWCASE_IDS = ids(PROFILE_SHOWCASES);
const SECTION_IDS = ids(PROFILE_SECTIONS);

export function cleanChasing(value) {
  return cleanLine(value, CHASING_MAX);
}

/** [{id, on}] in the trainer's order: unknown and repeated ids dropped, missing ones appended on. */
export function normalizeSections(value) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(value) ? value : []) {
    const id = typeof row === "string" ? row : row?.id;
    if (!SECTION_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, on: typeof row === "object" && row ? row.on !== false : true });
  }
  for (const { id } of PROFILE_SECTIONS) if (!seen.has(id)) out.push({ id, on: true });
  return out;
}

/** Any stored or posted value (object, JSON string, null) to a complete, valid look. */
export function normalizeProfileLook(value) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const pick = (given, set, fallback) => (set.has(given) ? given : fallback);
  return {
    v: PROFILE_LOOK_VERSION,
    tint: TINT_IDS.has(raw.tint) ? raw.tint : "",
    backdrop: pick(raw.backdrop, BACKDROP_IDS, DEFAULT_PROFILE_LOOK.backdrop),
    hero: pick(raw.hero, HERO_IDS, DEFAULT_PROFILE_LOOK.hero),
    showcase: pick(raw.showcase, SHOWCASE_IDS, DEFAULT_PROFILE_LOOK.showcase),
    sections: normalizeSections(raw.sections),
    chasing: cleanChasing(raw.chasing),
  };
}

/** True when the wall is off (the Worker refuses new notes). */
export function wallIsOff(look) {
  return normalizeProfileLook(look).sections.some((row) => row.id === "wall" && !row.on);
}

/** The sections to draw, in order. */
export function visibleSections(look) {
  return normalizeProfileLook(look).sections.filter((row) => row.on).map((row) => row.id);
}
