/**
 * The Layout tab on the account page: how a trainer dresses and arranges their
 * public profile (js/profile-look.js has the data, js/profile-view.js draws the
 * result). Room colour, backdrop, header, showcase style, the order and on/off
 * state of the sections, and the chasing line. Everything edits a draft; the
 * little room on the side redraws as you go, and nothing reaches the profile
 * until Save (PATCH /api/me { profileLook }).
 *
 *   layoutTab(trainer, deps)          the tab's HTML
 *   initProfileEditor(root, deps)     one delegated listener set on the account body
 *
 * deps = { esc, avatarMark, bannerVars, findCard, toast, activeTrainer,
 *          showcaseIds(), binderSlots(), save(look) -> Promise }.
 * CSS lives in css/pages/profile-look.css.
 */
import { BINDER_COLORS, COLOR_FROM_CARDS } from "./binder-looks.js";
import { accentForCard, dominantAccents, luminance } from "./card-accent.js";
import {
  CHASING_MAX,
  DEFAULT_PROFILE_LOOK,
  PROFILE_BACKDROPS,
  PROFILE_HEROES,
  PROFILE_SECTIONS,
  PROFILE_SHOWCASES,
  normalizeProfileLook,
} from "./profile-look.js";
import { roomCards, roomInk, roomRgb } from "./profile-view.js";

const SECTION_BY_ID = new Map(PROFILE_SECTIONS.map((row) => [row.id, row]));
const clone = (value) => JSON.parse(JSON.stringify(value));

let draft = null; // the look being edited
let draftOwner = ""; // id of the account the draft belongs to
let baseKey = ""; // JSON of the saved look the draft started from
let saving = false;
let announce = ""; // polite live text after a move

const key = (look) => JSON.stringify(look);
const dirty = () => Boolean(draft) && key(draft) !== baseKey;

/** Re-base the draft on the account's saved look, keeping edits in progress. */
function sync(trainer) {
  const saved = normalizeProfileLook(trainer.profileLook);
  // Another account (sign-out, switch, delete) never inherits an unsaved draft.
  if (draftOwner !== (trainer.id || trainer.handle || "")) {
    draft = null;
    draftOwner = trainer.id || trainer.handle || "";
  }
  const keep = dirty();
  baseKey = key(saved);
  if (!draft || !keep) draft = clone(saved);
  return saved;
}

/* ---- Pieces --------------------------------------------------------------- */

function cardsFor(deps) {
  const showcase = deps.showcaseIds().map((id) => ({ id }));
  const binderPages = [{ slots: deps.binderSlots().map((id) => ({ id })) }];
  return roomCards({ showcase, binderPages }, deps.findCard);
}

/** The room's light as "r g b" for the preview: the tint, or the site's own colour. */
function previewRgb(deps, trainer) {
  const rgb = roomRgb(draft, cardsFor(deps));
  if (rgb) return rgb.join(" ");
  const site = getComputedStyle(document.body).getPropertyValue("--ambient").trim();
  return site || "120 110 255";
}

/** "r g b" for the room, and the brighter one its pattern is drawn in. */
function roomVars(rgb) {
  const ink = roomInk(rgb.split(/\s+/).map(Number)).join(" ");
  return `--room:${rgb};--room-ink:${ink}`;
}

function diagram(style, cards = []) {
  const n = 6;
  const list = Array.from({ length: n }, (_, i) => cards[i] || null);
  return `<span class="pl-dia" data-style="${style}" aria-hidden="true">${list
    .map((hex) => `<i${hex ? ` style="--c:${hex}"` : ""}></i>`)
    .join("")}</span>`;
}

function tintGrid(deps, trainer) {
  const cards = cardsFor(deps);
  const dom = dominantAccents(cards);
  const picked = draft.tint;
  const cardsStyle = dom ? `background:linear-gradient(90deg, ${dom.a} 50%, ${dom.b} 50%)` : "";
  const squares = BINDER_COLORS.map(
    (row) => `<button type="button" class="pl-sw${picked === row.id ? " on" : ""}${luminance(row.hex) > 0.38 ? " pale" : ""}" data-pl="tint" data-v="${row.id}"
      style="--sw:${row.hex}" aria-pressed="${picked === row.id}" aria-label="${row.name}" title="${row.name}"></button>`
  ).join("");
  const name = picked === COLOR_FROM_CARDS ? "My cards" : BINDER_COLORS.find((row) => row.id === picked)?.name || "Site default";
  return `<div class="pl-tints">
    <div class="pl-tint-wide">
      <button type="button" class="pl-wide${picked === "" ? " on" : ""}" data-pl="tint" data-v="" aria-pressed="${picked === ""}">
        <i class="pl-wide-sw site"></i><span>Site default</span>
      </button>
      <button type="button" class="pl-wide${picked === COLOR_FROM_CARDS ? " on" : ""}" data-pl="tint" data-v="${COLOR_FROM_CARDS}" aria-pressed="${picked === COLOR_FROM_CARDS}">
        <i class="pl-wide-sw cards" style="${cardsStyle}"></i><span>My cards</span>
      </button>
    </div>
    <div class="pl-sws" role="group" aria-label="Room colour">${squares}</div>
    <p class="pl-current" aria-live="polite">${esc(name)}</p>
  </div>`;
}

function backdropTiles(rgb) {
  return `<div class="pl-tiles pl-tiles-6" role="group" aria-label="Backdrop">${PROFILE_BACKDROPS.map(
    (row) => `<button type="button" class="pl-tile${draft.backdrop === row.id ? " on" : ""}" data-pl="backdrop" data-v="${row.id}" aria-pressed="${draft.backdrop === row.id}">
      <span class="pl-thumb pl-thumb-room" style="${roomVars(rgb)}"><span class="room-bd pl-thumb-bd" data-backdrop="${row.id}"></span></span>
      <span class="pl-tile-name">${esc(row.name)}</span>
    </button>`
  ).join("")}</div>`;
}

function headerControl() {
  const note = PROFILE_HEROES.find((row) => row.id === draft.hero)?.note || "";
  return `<div class="pl-seg" role="group" aria-label="Header">${PROFILE_HEROES.map(
    (row) => `<button type="button" class="${draft.hero === row.id ? "on" : ""}" data-pl="hero" data-v="${row.id}" aria-pressed="${draft.hero === row.id}">
      <span class="pl-hero-dia" data-hero="${row.id}" aria-hidden="true"></span><span>${esc(row.name)}</span>
    </button>`
  ).join("")}</div><p class="pl-note">${esc(note)}</p>`;
}

function showcaseTiles() {
  return `<div class="pl-tiles pl-tiles-3" role="group" aria-label="Showcase style">${PROFILE_SHOWCASES.map(
    (row) => `<button type="button" class="pl-tile${draft.showcase === row.id ? " on" : ""}" data-pl="showcase" data-v="${row.id}" aria-pressed="${draft.showcase === row.id}">
      <span class="pl-thumb">${diagram(row.id)}</span>
      <span class="pl-tile-name">${esc(row.name)}</span>
    </button>`
  ).join("")}</div><p class="pl-note">${esc(PROFILE_SHOWCASES.find((row) => row.id === draft.showcase)?.note || "")}</p>`;
}

const CHEVRON = (up) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function sectionRows() {
  const last = draft.sections.length - 1;
  return `<ol class="pl-sections">${draft.sections
    .map((row, i) => {
      const info = SECTION_BY_ID.get(row.id) || { name: row.id, note: "" };
      const locked = Boolean(info.locked);
      return `<li class="pl-sec${row.on ? "" : " off"}" data-id="${row.id}">
        <div class="pl-sec-copy"><b>${esc(info.name)}</b><small>${esc(info.note)}</small></div>
        <button type="button" class="pl-move" data-pl="sec-up" data-v="${row.id}" aria-label="Move ${esc(info.name)} up"${i === 0 ? " disabled" : ""}>${CHEVRON(true)}</button>
        <button type="button" class="pl-move" data-pl="sec-down" data-v="${row.id}" aria-label="Move ${esc(info.name)} down"${i === last ? " disabled" : ""}>${CHEVRON(false)}</button>
        <button type="button" class="pl-switch" role="switch" aria-checked="${row.on}" data-pl="sec-on" data-v="${row.id}" aria-label="Show ${esc(info.name)}"${locked ? " disabled" : ""}><i></i></button>
      </li>`;
    })
    .join("")}</ol><p class="pl-sr" role="status" aria-live="polite">${esc(announce)}</p>`;
}

function chasingField() {
  return `<label class="field pl-chasing"><span>Chasing</span>
    <input data-pl-input="chasing" maxlength="${CHASING_MAX}" value="${esc(draft.chasing)}" placeholder="Umbreon VMAX alt art" autocomplete="off" />
    <span class="hint"><span>Leave it empty to hide the line.</span><output class="pl-count">${draft.chasing.length} / ${CHASING_MAX}</output></span>
  </label>`;
}

function actionBar(trainer) {
  const isDirty = dirty();
  return `<div class="pl-bar${isDirty ? " is-dirty" : ""}">
    <button class="solid" type="button" data-pl="save"${isDirty && !saving ? "" : ' aria-disabled="true"'}>${saving ? "Saving…" : isDirty ? "Save layout" : "Saved"}</button>
    <button class="text-btn" type="button" data-pl="undo"${isDirty ? "" : " hidden"}>Undo changes</button>
    <button class="text-btn" type="button" data-pl="reset">Reset to default</button>
  </div>`;
}

/* ---- The room, in miniature ------------------------------------------------ */

function previewHtml(deps, trainer) {
  const rgb = previewRgb(deps, trainer);
  const cardHex = deps.showcaseIds().slice(0, 6).map((id) => accentForCard(deps.findCard(id) || { id }));
  const plain = draft.hero === "plain";
  const parts = draft.sections
    .filter((row) => row.on)
    .map((row) => {
      const name = SECTION_BY_ID.get(row.id)?.name || row.id;
      const body =
        row.id === "showcase"
          ? diagram(draft.showcase, cardHex)
          : row.id === "graded"
            ? `<span class="pl-mini-slabs" aria-hidden="true"><i></i><i></i><i></i></span>`
            : row.id === "binder"
              ? `<span class="pl-mini-pockets" aria-hidden="true">${"<i></i>".repeat(9)}</span>`
              : row.id === "mastery"
                ? `<span class="pl-mini-shelf" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`
                : row.id === "wall"
                ? `<span class="pl-mini-lines" aria-hidden="true"><i></i><i></i></span>`
                : "";
      return `<div class="pl-mini-sec" data-id="${row.id}"><b>${esc(name)}</b>${body}</div>`;
    })
    .join("");
  return `<div class="pl-room" style="${roomVars(rgb)}">
    ${draft.backdrop !== "none" ? `<span class="room-bd pl-room-bd" data-backdrop="${draft.backdrop}" style="--bd-step:14px"></span>` : ""}
    <div class="pl-mini-hero" data-hero="${plain ? "plain" : "banner"}">
      ${plain ? "" : deps.bannerBlock(trainer.banner, { className: "acct-banner pl-mini-banner", variant: "wide", still: true })}
      <div class="pl-mini-id">
        ${deps.avatarMark(trainer, "trainer-mark pl-mini-face")}
        <div class="pl-mini-name"><b>${esc(trainer.name)}</b>
          ${draft.chasing ? `<small><span>Chasing:</span> ${esc(draft.chasing)}</small>` : `<small>@${esc(trainer.handle)}</small>`}
        </div>
      </div>
    </div>
    <div class="pl-mini-body">${parts || `<p class="pl-mini-empty">Every section is off. Visitors see your header only.</p>`}</div>
  </div>`;
}

/* ---- Tab ------------------------------------------------------------------ */

function inner(trainer, deps) {
  const rgb = previewRgb(deps, trainer);
  return `<aside class="pl-preview" aria-label="Preview of your profile">
      ${previewHtml(deps, trainer)}
    </aside>
    <div class="pl-controls">
      <section class="acct-sec">
        <div class="acct-sec-head"><h2>Room colour</h2></div>
        ${tintGrid(deps, trainer)}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head"><h2>Backdrop</h2></div>
        ${backdropTiles(rgb)}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head"><h2>Header</h2></div>
        ${headerControl()}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head"><h2>Showcase style</h2></div>
        ${showcaseTiles()}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head"><h2>Sections</h2></div>
        ${sectionRows()}
      </section>
      <section class="acct-sec">
        <div class="acct-sec-head"><div><h2>Chasing</h2><p>One line under your name about the card you want most.</p></div></div>
        ${chasingField()}
      </section>
      ${actionBar(trainer)}
      <p class="pl-note pl-open">Your saved profile is at <a href="/u/${esc(trainer.handle)}">poke-pack.rip/u/${esc(trainer.handle)}</a>.</p>
    </div>`;
}

export function layoutTab(trainer, deps) {
  sync(trainer);
  return `<div class="pl-layout" id="pl-layout">${inner(trainer, deps)}</div>`;
}

/* ---- Behaviour -------------------------------------------------------------- */

export function initProfileEditor(root, deps) {
  const layout = () => root.querySelector("#pl-layout");

  /** Redraw the whole tab body, keeping focus on the same control. */
  function repaint({ focus } = {}) {
    const trainer = deps.activeTrainer();
    const host = layout();
    if (!trainer || !host) return;
    const scroll = window.scrollY;
    const active = focus || focusKey();
    host.innerHTML = inner(trainer, deps);
    window.scrollTo({ top: scroll, behavior: "instant" });
    restoreFocus(host, active);
  }

  /** Redraw only what a keystroke changes. */
  function repaintLight() {
    const trainer = deps.activeTrainer();
    const host = layout();
    if (!trainer || !host) return;
    const preview = host.querySelector(".pl-room");
    if (preview) preview.outerHTML = previewHtml(deps, trainer);
    const bar = host.querySelector(".pl-bar");
    if (bar) bar.outerHTML = actionBar(trainer);
    const count = host.querySelector(".pl-count");
    if (count) count.textContent = `${draft.chasing.length} / ${CHASING_MAX}`;
  }

  function focusKey() {
    const el = document.activeElement;
    if (!el || !layout()?.contains(el)) return null;
    const attr = el.dataset?.pl;
    return attr ? [attr, el.dataset.v ?? ""] : null;
  }

  function restoreFocus(host, key2) {
    if (!key2) return;
    const [attr, value] = key2;
    let target = host.querySelector(value === "" ? `[data-pl="${attr}"]` : `[data-pl="${attr}"][data-v="${CSS.escape(value)}"]`);
    if (target?.disabled) {
      // A move button that has reached the end hands focus to its partner.
      const partner = { "sec-up": "sec-down", "sec-down": "sec-up" }[attr];
      target = (partner && host.querySelector(`[data-pl="${partner}"][data-v="${CSS.escape(value)}"]:not(:disabled)`)) || host.querySelector(`[data-pl="sec-on"][data-v="${CSS.escape(value)}"]`);
    }
    target?.focus({ preventScroll: true });
  }

  function move(id, delta) {
    const list = draft.sections;
    const from = list.findIndex((row) => row.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [row] = list.splice(from, 1);
    list.splice(to, 0, row);
    announce = `${SECTION_BY_ID.get(id)?.name || id} is now number ${to + 1} of ${list.length}.`;
  }

  async function save() {
    if (saving || !dirty()) return;
    saving = true;
    repaint({ focus: ["save", ""] });
    try {
      await deps.save(normalizeProfileLook(draft));
      draft = null; // what the server kept (cleaned) becomes the draft and the new base
      deps.toast("Layout saved.");
    } catch (err) {
      deps.toast(err?.message || "Couldn't save your layout.");
    } finally {
      saving = false;
      const trainer = deps.activeTrainer();
      if (trainer) sync(trainer);
      repaint({ focus: ["save", ""] });
    }
  }

  root.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-pl-input='chasing']");
    if (!input || !draft) return;
    // Keep what was typed (a trailing space is part of typing); the cleaned value is what gets saved.
    draft.chasing = input.value.replace(/\s+/g, " ").slice(0, CHASING_MAX);
    repaintLight();
  });

  root.addEventListener("click", (event) => {
    const el = event.target.closest?.("[data-pl]");
    if (!el || !draft || !layout()?.contains(el)) return;
    const what = el.dataset.pl;
    const value = el.dataset.v ?? "";
    announce = "";
    if (what === "tint") draft.tint = value;
    else if (what === "backdrop") draft.backdrop = value;
    else if (what === "hero") draft.hero = value;
    else if (what === "showcase") draft.showcase = value;
    else if (what === "sec-on") {
      const row = draft.sections.find((r) => r.id === value);
      if (row) {
        row.on = !row.on;
        announce = `${SECTION_BY_ID.get(value)?.name || value} is ${row.on ? "shown" : "hidden"}.`;
      }
    } else if (what === "sec-up") move(value, -1);
    else if (what === "sec-down") move(value, 1);
    else if (what === "undo") {
      const trainer = deps.activeTrainer();
      draft = clone(normalizeProfileLook(trainer?.profileLook));
    } else if (what === "reset") {
      draft = clone(DEFAULT_PROFILE_LOOK);
    } else if (what === "save") {
      if (el.getAttribute("aria-disabled") !== "true") save();
      return;
    } else return;
    repaint();
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
