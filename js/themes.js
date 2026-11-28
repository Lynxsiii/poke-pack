/* Colour themes (Settings, Look). The colours themselves are in css/themes.css
   (and css/rotom.css for the default); this is the list the picker draws and
   the one place that decides whether a player may use a theme.

   `locked: true` puts a theme behind an unlock: the tile shows a lock and
   choosing it is refused unless its id is in the player's unlocked list.
   Nothing is locked yet and there is no way to buy one; when there is, set the
   flag here and pass the ids the player owns to canUseTheme(). */

export const DEFAULT_THEME = "rocket";

/* ground: the page's ground in light and dark, for the browser bar and the
   first paint (index.html keeps a copy in localStorage). Keep in step with
   --bg in the stylesheets.
   mode: every theme but Rotom is light or dark by itself (scripts/build_themes.mjs);
   the Light/Dark setting only moves a theme that has no `mode`. */
export const THEMES = [
  { id: "rotom", name: "Rotom", locked: false, ground: { light: "#eef2f3", dark: "#101317" } },
  { id: "haunt", name: "Haunt", locked: false, mode: "dark", ground: { light: "#24104d", dark: "#24104d" } },
  { id: "rocket", name: "Rocket", locked: false, mode: "dark", ground: { light: "#0d0d0e", dark: "#0d0d0e" } },
  { id: "emerald", name: "Emerald", locked: false, mode: "dark", ground: { light: "#053b30", dark: "#053b30" } },
  { id: "magma", name: "Magma", locked: false, mode: "dark", ground: { light: "#2a0d08", dark: "#2a0d08" } },
  { id: "goldstar", name: "Gold star", locked: false, mode: "dark", ground: { light: "#12100a", dark: "#12100a" } },
  { id: "prism", name: "Prism", locked: false, mode: "light", ground: { light: "#f3d9ff", dark: "#f3d9ff" } },
  { id: "sunset", name: "Sunset", locked: false, mode: "light", ground: { light: "#ffb27a", dark: "#ffb27a" } },
  { id: "dotmatrix", name: "Dot matrix", locked: false, mode: "light", ground: { light: "#9bbc0f", dark: "#9bbc0f" } },
  { id: "surf", name: "Surf", locked: false, mode: "light", ground: { light: "#27c6da", dark: "#27c6da" } },
  { id: "volt", name: "Volt", locked: false, mode: "light", ground: { light: "#ffd426", dark: "#ffd426" } },
  { id: "rival", name: "Rival", locked: false, mode: "light", ground: { light: "#4f9dff", dark: "#4f9dff" } },
  { id: "berry", name: "Berry", locked: false, mode: "light", ground: { light: "#b4ecd6", dark: "#b4ecd6" } },
];

/* Themes that were replaced (2026-11-28): a saved choice moves to its successor. */
const RENAMED = { fire: "magma", grass: "emerald", ghost: "haunt", fairy: "berry", retro: "dotmatrix" };
const currentId = (id) => RENAMED[id] || id;


export const MODES = ["light", "dark", "device"];

export function themeById(id) {
  return THEMES.find((t) => t.id === currentId(id)) || THEMES[0];
}

/** May this player use the theme? `unlocked` is the list of theme ids they own. */
export function canUseTheme(id, unlocked = []) {
  const theme = THEMES.find((t) => t.id === currentId(id));
  if (!theme) return false;
  return !theme.locked || unlocked.includes(currentId(id));
}

/** The look to paint for a saved choice: a known mode, and a theme the player may use. */
export function resolveLook(settings = {}, { prefersDark = false, unlocked = [] } = {}) {
  const mode = MODES.includes(settings.theme) ? settings.theme : "light";
  const theme = canUseTheme(settings.palette, unlocked) ? themeById(settings.palette) : themeById(DEFAULT_THEME);
  const dark = theme.mode ? theme.mode === "dark" : mode === "dark" || (mode === "device" && prefersDark);
  return { mode, theme, dark, ground: dark ? theme.ground.dark : theme.ground.light };
}
