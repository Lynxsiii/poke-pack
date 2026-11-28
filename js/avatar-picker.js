/**
 * The profile picture picker (Account, Edit profile, Picture).
 *
 * Every Pokémon and form, as official art, a pixel sprite or an animated
 * sprite, each with its shiny. The catalogue (js/avatar-dex.js, generated) is
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
const SEARCH_CAP = 96;

let dex = null; // { groups, byId: Map(id -> { group, index, name, flags }), sheet }
let loading = null;
let ui = { group: null, query: "", kind: null, shiny: null };
let deps = null;
let saving = 0;

const kindRow = (id) => KINDS.find((row) => row.id === id) || KINDS[0];

function loadDex() {
  if (dex) return Promise.resolve(dex);
  if (!loading) {
    loading = import("./avatar-dex.js").then((mod) => {
      const byId = new Map();
      for (const group of mod.AVATAR_GROUPS) {
        group.list.forEach(([id, name, flags], index) => byId.set(String(id), { group, index, name, flags, id: String(id) }));
      }
      const top = { id: TOP, name: "Favourites", list: AVATARS.map(([id]) => byId.get(String(id))).filter(Boolean) };
      dex = { groups: [top, ...mod.AVATAR_GROUPS], byId, sheet: mod.AVATAR_SHEET };
      return dex;
    });
  }
  return loading;
}

/** The name of any picture once the catalogue is in; null before. */
export function avatarDexName(id) {
  return dex?.byId.get(avatarId(id))?.name || null;
}

function entriesOf(group) {
  return group.id === TOP ? group.list : group.list.map(([id]) => dex.byId.get(String(id)));
}

function has(entry, kind, shiny) {
  const row = kindRow(kind);
  return Boolean(entry.flags & (shiny ? row.shinyBit : row.bit));
}

/** What the picker is showing: the trainer's saved style until they flip a switch. */
function view(trainer) {
  const kind = ui.kind || avatarKind(trainer.avatarStyle);
  const shiny = ui.shiny ?? avatarShiny(trainer.avatarStyle);
  return { kind, shiny };
}

function matches(query) {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return null;
  const num = /^\d+$/.test(q) ? String(Number(q)) : null;
  const out = [];
  for (const group of dex.groups) {
    if (group.id === TOP) continue;
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
  const on = String(trainer.avatar) === entry.id;
  const ok = has(entry, kind, shiny);
  const { cols, cell, version } = dex.sheet;
  const rows = Math.ceil(entry.group.list.length / cols);
  let face;
  if (kind === "art") {
    const x = cols > 1 ? ((entry.index % cols) / (cols - 1)) * 100 : 0;
    const y = rows > 1 ? (Math.floor(entry.index / cols) / (rows - 1)) * 100 : 0;
    const sheet = `/assets/avatars/${shiny && ok ? "shiny" : "art"}-${entry.group.id}-v${version}.webp`;
    face = `<i class="av-face" style="background-image:url(${sheet});background-size:${cols * 100}% ${rows * 100}%;background-position:${x.toFixed(3)}% ${y.toFixed(3)}%"></i>`;
  } else {
    // Pixel and animated tiles both show the small sprite: a grid of moving faces is noise, and the preview above moves.
    face = `<img class="av-face pixel" src="${esc(avatarIcon(entry.id, shiny && ok))}" alt="" loading="lazy" decoding="async" width="${cell}" height="${cell}" />`;
  }
  return `<button type="button" class="av-pick${on ? " on" : ""}${ok ? "" : " is-none"}" data-av="${entry.id}" aria-pressed="${on}"${ok ? "" : ` aria-disabled="true"`} title="${esc(entry.name)}">
    ${face}<small>${esc(entry.name)}</small>
  </button>`;
}

function gridHtml(trainer) {
  const { esc } = deps;
  const v = view(trainer);
  const found = matches(ui.query);
  const group = dex.groups.find((g) => g.id === ui.group) || dex.groups[0];
  const all = found || entriesOf(group);
  const list = found ? all.slice(0, SEARCH_CAP) : all;
  if (!list.length) return `<p class="panel-empty av-empty">No Pokémon called “${esc(ui.query.trim())}”. Try part of the name or its number.</p>`;
  const missing = list.filter((entry) => !has(entry, v.kind, v.shiny)).length;
  const row = kindRow(v.kind);
  return `<div class="av-grid" data-kind="${v.kind}">${list.map((entry) => tile(entry, trainer, v)).join("")}</div>
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
  const v = view(trainer);
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
  const mine = dex.byId.get(String(trainer.avatar));
  paint();
  if (mine && has(mine, v.kind, v.shiny)) save({ avatarStyle: avatarStyleOf(v.kind, v.shiny) }, () => { ui.kind = null; ui.shiny = null; paint(); });
  else if (mine) deps.toast(`${mine.name} has no ${v.shiny ? "shiny " : ""}${kindRow(v.kind).none.replace(/^an? /, "")}, so your picture stays as it is.`);
}

/** Wire the picker once. `d`: { root(), trainer(), esc, toast, save(patch) }. */
export function initAvatarPicker(d) {
  deps = d;
  const root = d.root();
  root.addEventListener("click", (e) => {
    const tileEl = e.target.closest("[data-av]");
    if (tileEl) return pick(tileEl);
    const kind = e.target.closest("[data-av-kind]");
    if (kind) return restyle({ kind: kind.dataset.avKind });
    const shiny = e.target.closest("[data-av-shiny]");
    if (shiny) return restyle({ shiny: shiny.getAttribute("aria-pressed") !== "true" });
    const group = e.target.closest("[data-av-group]");
    if (group) {
      ui.group = group.dataset.avGroup;
      ui.query = "";
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
  ui = { group: null, query: "", kind: null, shiny: null };
}

