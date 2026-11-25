/* Colour themes (Settings, Look). The colours themselves are in css/themes.css
   (and css/rotom.css for the default); this is the list the picker draws and
   the one place that decides whether a player may use a theme.

   `locked: true` puts a theme behind an unlock: the tile shows a lock and
   choosing it is refused unless its id is in the player's unlocked list.
   Nothing is locked yet and there is no way to buy one; when there is, set the
   flag here and pass the ids the player owns to canUseTheme(). */

export const DEFAULT_THEME = "rotom";

/* ground: the page's ground in light and dark, for the browser bar and the
   first paint (index.html keeps a copy in localStorage). Keep in step with
   --bg in the stylesheets. */
export const THEMES = [
  { id: "rotom", name: "Rotom", locked: false, ground: { light: "#eef2f3", dark: "#101317" } },
  { id: "fire", name: "Fire", locked: false, ground: { light: "#f6f0ec", dark: "#17110e" } },
  { id: "grass", name: "Grass", locked: false, ground: { light: "#edf3ee", dark: "#0f1410" } },
  { id: "ghost", name: "Ghost", locked: false, ground: { light: "#f1f0f6", dark: "#131217" } },
  { id: "fairy", name: "Fairy", locked: false, ground: { light: "#f6eff2", dark: "#171113" } },
  { id: "retro", name: "Retro", locked: false, ground: { light: "#eaf1d3", dark: "#131606" } },
];

export const MODES = ["light", "dark", "device"];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

/** May this player use the theme? `unlocked` is the list of theme ids they own. */
export function canUseTheme(id, unlocked = []) {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return false;
  return !theme.locked || unlocked.includes(id);
}

/** The look to paint for a saved choice: a known mode, and a theme the player may use. */
export function resolveLook(settings = {}, { prefersDark = false, unlocked = [] } = {}) {
  const mode = MODES.includes(settings.theme) ? settings.theme : "light";
  const theme = canUseTheme(settings.palette, unlocked) ? themeById(settings.palette) : themeById(DEFAULT_THEME);
  const dark = mode === "dark" || (mode === "device" && prefersDark);
  return { mode, theme, dark, ground: dark ? theme.ground.dark : theme.ground.light };
}
