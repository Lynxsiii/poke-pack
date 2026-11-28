/**
 * The profile picture picker (Account, Edit profile, Picture).
 *
 * Every Pokémon and form, as official art, a pixel sprite or an animated
 * sprite. Shinies are earned (js/shiny.js): a Black Label of the Pokémon, or
 * the one pick each mastered set gives. The catalogue (js/avatar-dex.js, generated) is
 * loaded the first time the picker is shown. Faces are drawn from one
 * thumbnail sheet per group, so a generation is one image, not 150.
 *
 * A pick is saved in place: the tile takes the cursor, the preview is redrawn
 * and nothing else on the page moves. (The old picker repainted the whole
 * account page on every pick, which threw the page and the grid back to the top.)
 */
import { AVATARS, avatarId, avatarKind, avatarShiny, avatarStyleOf, avatarIcon } from "./cosmetics.js";

const KINDS = [
  { id: "art", name: "Art", bit: 1, shinyBit: 2, none: "official art" },
  { id: "pixel", name: "Pixel", bit: 4, shinyBit: 8, none: "a pixel sprite" },
  { id: "anim", name: "Animated", bit: 16, shinyBit: 32, none: "an animated sprite" },
];
const TOP = "top";
const MINE = "shiny"; // the group of shinies the player has unlocked
const ANY_SHINY = 2 | 8 | 32;
const LOCK = `<svg class="av-lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/></svg>`;
const SEARCH_CAP = 96;

let dex = null; // { groups, byId: Map(id -> { group, index, name, flags }), sheet }
let loading = null;
let shinies = null; // { unlocked: Set(Pokédex number), open: [{ id, name }] } once /api/me/shinies has answered
let asking = null;
let ui = { group: null, query: "", kind: null, shiny: null, pick: null, choice: null, busy: false };
let deps = null;
let saving = 0;

const kindRow = (id) => KINDS.find((row) => row.id === id) || KINDS[0];

function loadDex() {
  if (dex) return Promise.resolve(dex);
  if (!loading) {
    loading = import("./avatar-dex.js").then((mod) => {
      const byId = new Map();
      for (const group of mod.AVATAR_GROUPS) {
        group.list.forEach(([id, name, flags, of], index) => byId.set(String(id), { group, index, name, flags, id: String(id), species: of || id }));
      }
      const top = { id: TOP, name: "Favourites", list: AVATARS.map(([id]) => byId.get(String(id))).filter(Boolean) };
      dex = { groups: [top, { id: MINE, name: "My shinies", list: [] }, ...mod.AVATAR_GROUPS], byId, sheet: mod.AVATAR_SHEET };
      return dex;
    });
  }
  return loading;
}

/** The name of any picture once the catalogue is in; null before. */
export function avatarDexName(id) {
  return dex?.byId.get(avatarId(id))?.name || null;
}

function loadShinies() {
  if (shinies) return Promise.resolve(shinies);
  if (!asking) {
    asking = deps
      .api("/api/me/shinies")
      .then((data) => {
        shinies = { unlocked: new Set((data.unlocked || []).map((row) => Number(row.species))), open: data.open || [] };
        return shinies;
      })
      .catch(() => null)
      .finally(() => { asking = null; });
  }
  return asking;
}

const unlocked = (entry) => Boolean(shinies?.unlocked.has(entry.species));
const speciesName = (entry) => dex.byId.get(String(entry.species))?.name || entry.name;

function entriesOf(group) {
  if (group.id === TOP) return group.list;
  if (group.id === MINE) {
    return [...dex.byId.values()].filter((entry) => unlocked(entry) && entry.flags & ANY_SHINY).sort((a, b) => a.species - b.species || a.id - b.id);
  }
  return group.list.map(([id]) => dex.byId.get(String(id)));
}

/** The Pokémon a mastered set's pick can go on: one tile each, the ones already unlocked marked as had. */
function pickEntries() {
  return (ui.pick?.species || []).map((id) => dex.byId.get(String(id))).filter((entry) => entry && entry.flags & ANY_SHINY);
}

function has(entry, kind, shiny) {
  const row = kindRow(kind);
  return Boolean(entry.flags & (shiny ? row.shinyBit : row.bit));
}

/** What the picker is showing: the trainer's saved style until they flip a switch. */
function view(trainer) {
  const kind = ui.kind || avatarKind(trainer.avatarStyle);
  if (ui.pick) return { kind: "art", shiny: true };
  const shiny = ui.group === MINE && !ui.query.trim() ? true : ui.shiny ?? avatarShiny(trainer.avatarStyle);
  return { kind, shiny };
}

function matches(query) {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return null;
  const num = /^\d+$/.test(q) ? String(Number(q)) : null;
  const out = [];
  for (const group of dex.groups) {
    if (group.id === TOP || group.id === MINE) continue;
    for (const [id, name] of group.list) {
      if ((num && String(id) === num) || name.toLowerCase().includes(q)) out.push(dex.byId.get(String(id)));
    }
  }
  // Names that start with the words typed come first.
  out.sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)));
  return out;
}

function tile(entry, trainer, { kind, shiny }) {
  const { esc } = deps;
  const picking = Boolean(ui.pick);
  const on = picking ? ui.choice === entry.id : String(trainer.avatar) === entry.id;
  const ok = has(entry, kind, shiny) || (picking && kind === "art");
  const had = picking && unlocked(entry);
  const locked = shiny && ok && !picking && !unlocked(entry);
  const { cols, cell, version } = dex.sheet;
  const rows = Math.ceil(entry.group.list.length / cols);
  let face;
  if (kind === "art") {
    const x = cols > 1 ? ((entry.index % cols) / (cols - 1)) * 100 : 0;
    const y = rows > 1 ? (Math.floor(entry.index / cols) / (rows - 1)) * 100 : 0;
    const sheet = `/assets/avatars/${shiny && entry.flags & 2 ? "shiny" : "art"}-${entry.group.id}-v${version}.webp`;
    face = `<i class="av-face" style="background-image:url(${sheet});background-size:${cols * 100}% ${rows * 100}%;background-position:${x.toFixed(3)}% ${y.toFixed(3)}%"></i>`;
  } else {
    // Pixel and animated tiles both show the small sprite: a grid of moving faces is noise, and the preview above moves.
    face = `<img class="av-face pixel" src="${esc(avatarIcon(entry.id, shiny && ok))}" alt="" loading="lazy" decoding="async" width="${cell}" height="${cell}" />`;
  }
  const state = !ok ? " is-none" : locked ? " is-locked" : had ? " is-had" : "";
  return `<button type="button" class="av-pick${on ? " on" : ""}${state}" data-av="${entry.id}" aria-pressed="${on}"${state ? ` aria-disabled="true"` : ""} title="${esc(entry.name)}${locked ? " (shiny locked)" : had ? " (you have this shiny)" : ""}">
    ${face}${locked ? LOCK : ""}<small>${esc(had ? "Unlocked" : entry.name)}</small>
  </button>`;
}

const EARN = "Grade a Black Label of a Pokémon to unlock its shiny, or master a set to pick one shiny from it. Once unlocked, a shiny is yours for good.";

/** The line under the switches while shinies are showing: how many you have, and a mastered set's pick waiting to be spent. */
function earnHtml() {
  const { esc } = deps;
  if (!shinies) return `<p class="av-earn">Checking your shinies.</p>`;
  const n = shinies.unlocked.size;
  const next = shinies.open[0];
  const more = shinies.open.length - 1;
  return `<p class="av-earn"><b>${n ? `${n} shiny Pokémon unlocked.` : "Shinies are earned."}</b> ${n ? "Earn more with a Black Label of the Pokémon, or master a set for one pick." : EARN}</p>
    ${
      next
        ? `<div class="av-claim"><p><b>${esc(next.name)} mastered.</b> Pick one shiny from it to keep.${more > 0 ? ` ${more} more ${more === 1 ? "set is" : "sets are"} waiting after this one.` : ""}</p>
        <button type="button" class="solid" data-av-pick-start="${esc(next.id)}">Choose a shiny</button></div>`
        : ""
    }`;
}

/** Spending a mastered set's pick: the set's Pokémon, then one confirm, because it cannot be taken back. */
function pickHtml(trainer) {
  const { esc } = deps;
  const list = pickEntries();
  const chosen = list.find((entry) => entry.id === ui.choice);
  const head = chosen
    ? `<div class="av-claim is-ask"><p><b>Unlock shiny ${esc(chosen.name)}?</b> This spends your ${esc(ui.pick.name)} pick for good.</p>
        <div class="av-claim-acts"><button type="button" class="solid" data-av-pick-yes${ui.busy ? " disabled" : ""}>Unlock it</button><button type="button" class="ghost" data-av-pick-no>Not this one</button></div></div>`
    : `<div class="av-claim"><p><b>Your ${esc(ui.pick.name)} pick.</b> Tap the Pokémon whose shiny you want. You get one, and it can't be changed.</p>
        <button type="button" class="ghost" data-av-pick-cancel>Later</button></div>`;
  return `${head}<div class="av-grid" data-kind="art">${list.map((entry) => tile(entry, trainer, { kind: "art", shiny: true })).join("")}</div>`;
}

function gridHtml(trainer) {
  const { esc } = deps;
  if (ui.pick) return pickHtml(trainer);
  const v = view(trainer);
  const found = matches(ui.query);
  const group = dex.groups.find((g) => g.id === ui.group) || dex.groups[0];
  const all = found || entriesOf(group);
  const list = found ? all.slice(0, SEARCH_CAP) : all;
  const earn = v.shiny ? earnHtml() : "";
  if (!list.length && !found) return `${earn}<p class="panel-empty av-empty">No shinies yet. The ones you unlock are kept here.</p>`;
  if (!list.length) return `<p class="panel-empty av-empty">No Pokémon called “${esc(ui.query.trim())}”. Try part of the name or its number.</p>`;
  const missing = list.filter((entry) => !has(entry, v.kind, v.shiny)).length;
  const row = kindRow(v.kind);
  return `${earn}<div class="av-grid" data-kind="${v.kind}">${list.map((entry) => tile(entry, trainer, v)).join("")}</div>
    ${found && all.length > list.length ? `<p class="av-note">Showing the first ${list.length} of ${all.length}. Type more of the name to narrow it.</p>` : ""}
    ${missing ? `<p class="av-note">${missing === 1 ? "The faded one has" : `The ${missing} faded ones have`} no ${v.shiny ? "shiny " : ""}${row.id === "art" ? "art" : row.id === "pixel" ? "pixel sprite" : "animated sprite"} yet.</p>` : ""}`;
}

/** The whole Picture section. Shows a quiet line until the catalogue has loaded, then paints itself. */
export function avatarPickerHtml(trainer) {
  const { esc } = deps;
  if (!dex) {
    loadDex().then(() => deps.root().querySelector("[data-av-picker]") && paint());
    return `<div data-av-picker><p class="panel-empty">Loading every Pokémon.</p></div>`;
  }
  if (!shinies && !asking) loadShinies().then((got) => got && deps.root().querySelector("[data-av-picker]") && paintGrid());
  if (ui.pick) return `<div data-av-picker class="is-picking"><div class="av-results" aria-live="polite">${gridHtml(trainer)}</div></div>`;
  const v = view(trainer);
  const mine = dex.byId.get(String(trainer.avatar));
  if (!ui.group) ui.group = mine && !AVATARS.some(([id]) => String(id) === mine.id) ? mine.group.id : TOP;
  const searching = Boolean(ui.query.trim());
  return `<div data-av-picker>
    <div class="av-bar">
      <div class="seg av-kinds" role="group" aria-label="Picture style">${KINDS.map(
        (row) => `<button type="button" class="seg-btn${row.id === v.kind ? " on" : ""}" data-av-kind="${row.id}" aria-pressed="${row.id === v.kind}">${row.name}</button>`
      ).join("")}</div>
      <button type="button" class="av-shiny${v.shiny ? " on" : ""}" data-av-shiny aria-pressed="${v.shiny}"><i aria-hidden="true"></i>Shiny</button>
    </div>
    <label class="field av-search"><span class="sr-only">Search Pokémon</span>
      <input id="av-search" type="search" value="${esc(ui.query)}" placeholder="Search ${dex.byId.size.toLocaleString()} Pokémon by name or number" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" />
    </label>
    <div class="av-groups${searching ? " is-off" : ""}" role="group" aria-label="Pokémon group">${dex.groups
      .map((g) => `<button type="button" class="rt-word av-group${!searching && g.id === ui.group ? " on" : ""}" data-av-group="${g.id}" aria-pressed="${!searching && g.id === ui.group}">${esc(g.name)}</button>`)
      .join("")}</div>
    <div class="av-results" aria-live="polite">${gridHtml(trainer)}</div>
  </div>`;
}

function paint() {
  const trainer = deps.trainer();
  const host = deps.root().querySelector("[data-av-picker]");
  if (!trainer || !host) return;
  host.outerHTML = avatarPickerHtml(trainer);
  centreGroup();
}

function paintGrid() {
  const trainer = deps.trainer();
  const host = deps.root().querySelector(".av-results");
  if (trainer && host) host.innerHTML = gridHtml(trainer);
}

function centreGroup() {
  const on = deps.root().querySelector(".av-group.on");
  const track = on?.parentElement;
  if (track && track.scrollWidth > track.clientWidth) track.scrollLeft = Math.max(0, on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2);
}

async function save(patch, undo) {
  const turn = ++saving;
  try {
    await deps.save(patch);
  } catch (err) {
    if (turn === saving) undo?.();
    deps.toast(err.message || "Couldn't save your picture.");
  }
}

function pick(button) {
  const trainer = deps.trainer();
  const entry = dex?.byId.get(button.dataset.av);
  if (!trainer || !entry) return;
  if (ui.pick) {
    if (unlocked(entry)) return deps.toast(`You already have shiny ${entry.name}.`);
    ui.choice = entry.id;
    return paintGrid();
  }
  const v = view(trainer);
  if (v.shiny && has(entry, v.kind, true) && !unlocked(entry)) {
    const base = speciesName(entry);
    deps.toast(`Shiny ${entry.name} is locked. Grade a Black Label ${base}, or spend a mastered set's pick on it.`);
    return;
  }
  if (!has(entry, v.kind, v.shiny)) {
    const row = kindRow(v.kind);
    deps.toast(`${entry.name} has no ${v.shiny ? "shiny " : ""}${row.id === "art" ? "art" : row.id === "pixel" ? "pixel sprite" : "animated sprite"} yet.`);
    return;
  }
  const root = deps.root();
  const before = root.querySelector(".av-pick.on");
  const mark = (el, on) => { el?.classList.toggle("on", on); el?.setAttribute("aria-pressed", String(on)); };
  mark(before, false);
  mark(button, true);
  button.classList.remove("rt-picked");
  void button.offsetWidth;
  button.classList.add("rt-picked");
  save({ avatar: entry.id, avatarStyle: avatarStyleOf(v.kind, v.shiny) }, () => { mark(button, false); mark(before, true); });
}

/** A new style or the shiny switch: keep the Pokémon if it has that picture, and save it. */
function restyle(next) {
  const trainer = deps.trainer();
  if (!trainer || !dex) return;
  const v = { ...view(trainer), ...next };
  ui.kind = v.kind;
  ui.shiny = v.shiny;
  if (next.shiny === false && ui.group === MINE) ui.group = TOP;
  const mine = dex.byId.get(String(trainer.avatar));
  paint();
  // Turning Shiny on with a picture whose shiny is locked only shows the shinies; the picture stays.
  if (mine && v.shiny && !unlocked(mine)) return;
  if (mine && has(mine, v.kind, v.shiny)) save({ avatarStyle: avatarStyleOf(v.kind, v.shiny) }, () => { ui.kind = null; ui.shiny = null; paint(); });
  else if (mine) deps.toast(`${mine.name} has no ${v.shiny ? "shiny " : ""}${kindRow(v.kind).none.replace(/^an? /, "")}, so your picture stays as it is.`);
}

async function startPick(setId) {
  try {
    const data = await deps.api(`/api/me/shinies?set=${encodeURIComponent(setId)}`);
    const set = shinies?.open.find((row) => row.id === setId);
    ui.pick = { id: setId, name: set?.name || setId, species: data.species || [] };
    ui.choice = null;
    ui.query = "";
    paint();
    deps.root().querySelector("[data-av-picker]")?.scrollIntoView({ block: "start" });
  } catch (err) {
    deps.toast(err.message || "Couldn't open that set's pick.");
  }
}

async function confirmPick() {
  const trainer = deps.trainer();
  const entry = dex?.byId.get(String(ui.choice));
  if (!trainer || !entry || !ui.pick || ui.busy) return;
  ui.busy = true;
  try {
    await deps.api("/api/me/shinies/pick", { method: "POST", body: JSON.stringify({ setId: ui.pick.id, species: entry.species }) });
    shinies.unlocked.add(entry.species);
    shinies.open = shinies.open.filter((row) => row.id !== ui.pick.id);
    // Wear it straight away, in the style already chosen where that shiny exists.
    const want = ui.kind || avatarKind(trainer.avatarStyle);
    const kind = [want, "art", "pixel", "anim"].find((id) => has(entry, id, true));
    ui = { ...ui, pick: null, choice: null, busy: false, group: MINE, shiny: true, kind };
    paint();
    deps.toast(`Shiny ${entry.name} unlocked.`);
    if (kind) save({ avatar: entry.id, avatarStyle: avatarStyleOf(kind, true) }, paint);
  } catch (err) {
    ui.busy = false;
    deps.toast(err.message || "Couldn't unlock that shiny.");
    paintGrid();
  }
}

/** Wire the picker once. `d`: { root(), trainer(), esc, toast, api(path, init), save(patch) }. */
export function initAvatarPicker(d) {
  deps = d;
  const root = d.root();
  root.addEventListener("click", (e) => {
    const tileEl = e.target.closest("[data-av]");
    if (tileEl) return pick(tileEl);
    const kind = e.target.closest("[data-av-kind]");
    if (kind) return restyle({ kind: kind.dataset.avKind });
    const start = e.target.closest("[data-av-pick-start]");
    if (start) return startPick(start.dataset.avPickStart);
    if (e.target.closest("[data-av-pick-yes]")) return confirmPick();
    if (e.target.closest("[data-av-pick-no]")) { ui.choice = null; return paintGrid(); }
    if (e.target.closest("[data-av-pick-cancel]")) { ui.pick = null; ui.choice = null; return paint(); }
    const shiny = e.target.closest("[data-av-shiny]");
    if (shiny) return restyle({ shiny: shiny.getAttribute("aria-pressed") !== "true" });
    const group = e.target.closest("[data-av-group]");
    if (group) {
      ui.group = group.dataset.avGroup;
      ui.query = "";
      if (ui.group === MINE) ui.shiny = true;
      paint();
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id !== "av-search") return;
    const was = Boolean(ui.query.trim());
    ui.query = e.target.value;
    paintGrid();
    if (was !== Boolean(ui.query.trim())) {
      const groups = root.querySelector(".av-groups");
      groups?.classList.toggle("is-off", !was);
      for (const el of groups?.children || []) {
        const on = was && el.dataset.avGroup === ui.group;
        el.classList.toggle("on", on);
        el.setAttribute("aria-pressed", String(on));
      }
    }
  });
}

/** Leaving the picker: the next visit starts from what is saved. */
export function resetAvatarPicker() {
  ui = { group: null, query: "", kind: null, shiny: null, pick: null, choice: null, busy: false };
  shinies = null; // asked again next time: a Black Label may have been graded since
}

