/**
 * The patch notes page. Updates come from data/patch-notes.json, newest first.
 * Updates that share a date sit under one date; each is a closed row (title and
 * a line saying what changed) that opens to its list. The week's big updates
 * are listed first; words narrow the page to one kind, a picker to one month.
 *
 * An entry is { id, date, kind, big?, title, summary?, link?, linkLabel?,
 * items?: string[], groups?: [{ title, items }] }.
 *   kind       "new" (a feature or new things to open), "better" (something
 *              that already existed got better) or "fix". Shown as a tag, and
 *              the words above the list narrow the page to one kind.
 *   big        1 to 3 when the update is worth a place in Home's "This week"
 *              (js/this-week.js); the heaviest of the week leads there.
 *   link       a path on the site that takes the player to the thing, with
 *              linkLabel as its words ("Open your binder").
 * Updates that arrived since the player last opened this page carry a mark.
 */

import { weekOf } from "./this-week.js?v=1";

const KINDS = [
  { key: "new", word: "New", tag: "New" },
  { key: "better", word: "Better", tag: "Better" },
  { key: "fix", word: "Fixes", tag: "Fix" },
];
const kindOf = (note) => (KINDS.some((k) => k.key === note.kind) ? note.kind : "better");
const SEEN_KEY = "pokepack.notes.seen";

/** The ids that are newer than the newest update this browser saw last time. Empty on a first visit. */
function unseenIds(notes) {
  let seen = "";
  try {
    seen = localStorage.getItem(SEEN_KEY) || "";
    localStorage.setItem(SEEN_KEY, notes[0].id);
  } catch {
    return new Set();
  }
  const at = seen ? notes.findIndex((note) => note.id === seen) : -1;
  return new Set(at > 0 ? notes.slice(0, at).map((note) => note.id) : []);
}

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function parseDate(value) {
  const at = new Date(`${value}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function dayParts(value) {
  const at = parseDate(value);
  if (!at) return { day: value, year: "" };
  return {
    day: at.toLocaleDateString(undefined, { month: "long", day: "numeric" }),
    year: String(at.getFullYear()),
    full: at.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
  };
}

function monthOf(value) {
  const at = parseDate(value);
  if (!at) return { key: String(value).slice(0, 7), label: String(value).slice(0, 7) };
  return {
    key: String(value).slice(0, 7),
    label: at.toLocaleDateString(undefined, { month: "long" }),
  };
}

function groupsOf(note) {
  if (Array.isArray(note.groups) && note.groups.length) return note.groups;
  return [{ title: "", items: note.items || [] }];
}

function entryHtml(note, open, order = 99, fresh = false) {
  const kind = KINDS.find((k) => k.key === kindOf(note));
  const go = note.link ? `<p class="nt-go"><a class="tlink" href="${esc(note.link)}">${esc(note.linkLabel || "Take a look")}</a></p>` : "";
  const body = groupsOf(note)
    .map(
      (group) => `${group.title ? `<h4>${esc(group.title)}</h4>` : ""}
        <ul>${(group.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    )
    .join("");
  return `<details class="nt-entry${note.big ? " is-big" : ""}" id="note-${esc(note.id)}" data-kind="${kind.key}"${open ? " open" : ""}${order < 8 ? ` style="--nt-i:${order}"` : ""}>
      <summary>
        <span class="nt-head">
          <span class="nt-tags"><span class="nt-kind" data-kind="${kind.key}">${kind.tag}</span>${fresh ? `<span class="nt-fresh">Since your last visit</span>` : ""}</span>
          <span class="nt-title">${esc(note.title)}</span>
          ${note.summary ? `<span class="nt-sum">${esc(note.summary)}</span>` : ""}
        </span>
        <span class="nt-mark" aria-hidden="true"></span>
      </summary>
      <div class="nt-body">${body}${go}</div>
    </details>`;
}

function dayHtml(date, notes, firstOpenId, start = 0, fresh = new Set()) {
  const parts = dayParts(date);
  return `<section class="nt-day" data-month="${esc(String(date).slice(0, 7))}">
      <h3 class="nt-date"><time class="rt-tag" datetime="${esc(date)}">${esc(parts.full || parts.day)}</time><span class="nt-count"${notes.length > 1 ? "" : " hidden"}>${notes.length} updates</span></h3>
      <div class="nt-updates">${notes.map((note, i) => entryHtml(note, note.id === firstOpenId, start + i, fresh.has(note.id))).join("")}</div>
    </section>`;
}

/** Draw the page into `body`, and the one-line fact under the title into `factEl`. */
export function renderNotesPage(body, notes, factEl, state = {}) {
  if (!body) return;
  if (!notes.length) {
    body.innerHTML = `<div class="nt-empty rt-empty"><i class="rt-ball e" aria-hidden="true"></i><p>No patch notes have been posted yet.</p></div>`;
    if (factEl) factEl.textContent = "";
    return;
  }

  const days = [];
  for (const note of notes) {
    const last = days[days.length - 1];
    if (last && last.date === note.date) last.notes.push(note);
    else days.push({ date: note.date, notes: [note] });
  }

  const months = [];
  for (const note of notes) {
    const month = monthOf(note.date);
    if (!months.some((m) => m.key === month.key)) months.push(month);
  }

  // Worked out once per visit, so the marks stay while the player filters and comes back.
  state.fresh ||= unseenIds(notes);
  const fresh = state.fresh;

  if (factEl) {
    const oldest = dayParts(notes[notes.length - 1].date);
    const newest = dayParts(notes[0].date);
    // No running total: a count in the hundreds reads as machine output, and the dates say enough.
    const since = fresh.size ? ` ${fresh.size} new since your last visit.` : "";
    factEl.textContent = `Every change since ${oldest.full || oldest.day}. The latest is from ${newest.full || newest.day}.${since}`;
  }

  const month = months.some((m) => m.key === state.month) ? state.month : "all";
  state.month = month;
  const kind = KINDS.some((k) => k.key === state.kind) ? state.kind : "all";
  state.kind = kind;

  // The week's big updates first, as rows that jump to their entry.
  const week = weekOf(notes);
  const bigs = week.leadInWeek ? [week.lead, ...week.more] : [];
  const shortDay = (value) => parseDate(value)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || value;
  const weekHtml = bigs.length
    ? `<section class="nt-week" aria-labelledby="nt-week-h">
        <h3 id="nt-week-h">Big this week</h3>
        <div class="nt-week-rows">${bigs
          .map(
            (note) => `<a class="rt-row nt-week-row" href="/notes#note-${esc(note.id)}" data-nt-jump="${esc(note.id)}">
              <span class="rt-row-lab">${esc(shortDay(note.date))}</span>
              <span class="rt-row-name">${esc(note.title)}</span>
            </a>`
          )
          .join("")}</div>
      </section>`
    : "";

  body.innerHTML = `${weekHtml}<div class="nt-bar">
      <div class="nt-kinds" role="group" aria-label="Kind of update">
        <button type="button" class="nt-pick rt-word${kind === "all" ? " on" : ""}" data-kind="all" aria-pressed="${kind === "all"}">All</button>
        ${KINDS.map(
          (k) =>
            `<button type="button" class="nt-pick rt-word${kind === k.key ? " on" : ""}" data-kind="${k.key}" aria-pressed="${kind === k.key}">${k.word}</button>`
        ).join("")}
      </div>
      <div class="nt-tools">
        <label class="nt-when"><span class="sr-only">Month</span>
          <select class="filter nt-month-pick" data-nt-month>
            <option value="all"${month === "all" ? " selected" : ""}>Every month</option>
            ${months.map((m) => `<option value="${esc(m.key)}"${month === m.key ? " selected" : ""}>${esc(m.label)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="nt-all" data-nt-all>Expand all</button>
      </div>
    </div>
    <p class="nt-none rt-empty" hidden>Nothing of that kind that month.</p>
    <div class="nt-list">${(() => {
      let seen = 0;
      return days
        .map((day) => {
          const html = dayHtml(day.date, day.notes, "", seen, fresh);
          seen += day.notes.length;
          return html;
        })
        .join("");
    })()}</div>`;

  const list = body.querySelector(".nt-list");
  const toggle = body.querySelector("[data-nt-all]");

  const none = body.querySelector(".nt-none");
  const monthPick = body.querySelector("[data-nt-month]");

  /** Show one month and one kind ("all" for either). A day with nothing left to show goes with them. */
  const show = (monthKey, kindKey, animate = false) => {
    state.month = monthKey;
    state.kind = kindKey;
    monthPick.value = monthKey;
    for (const btn of body.querySelectorAll(".nt-pick")) {
      const on = btn.dataset.kind === kindKey;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    let shown = 0;
    let any = false;
    for (const section of list.querySelectorAll(".nt-day")) {
      let count = 0;
      for (const entry of section.querySelectorAll(".nt-entry")) {
        entry.hidden = kindKey !== "all" && entry.dataset.kind !== kindKey;
        if (!entry.hidden) count += 1;
      }
      section.hidden = !count || (monthKey !== "all" && section.dataset.month !== monthKey);
      const tally = section.querySelector(".nt-count");
      tally.hidden = count < 2;
      tally.textContent = `${count} updates`;
      if (!section.hidden) any = true;
      // Picking a month or a kind: the first few days rise in turn (decoration only).
      section.classList.remove("nt-in");
      if (animate && !section.hidden && shown < 4) {
        void section.offsetWidth;
        section.style.setProperty("--nt-d", String(shown++));
        section.classList.add("nt-in");
      }
    }
    none.hidden = any;
    syncToggle();
  };
  const showMonth = (key, animate = false) => show(key, state.kind, animate);

  const visibleEntries = () => [...list.querySelectorAll(".nt-day:not([hidden]) .nt-entry:not([hidden])")];
  const syncToggle = () => {
    const entries = visibleEntries();
    const allOpen = entries.length > 0 && entries.every((entry) => entry.open);
    toggle.textContent = allOpen ? "Collapse all" : "Expand all";
    toggle.dataset.open = allOpen ? "1" : "0";
  };

  body.querySelector(".nt-kinds").addEventListener("click", (event) => {
    const btn = event.target.closest(".nt-pick");
    if (btn) show(state.month, btn.dataset.kind, btn.dataset.kind !== state.kind);
  });
  monthPick.addEventListener("change", () => showMonth(monthPick.value, true));
  toggle.addEventListener("click", () => {
    const open = toggle.dataset.open !== "1";
    for (const entry of visibleEntries()) entry.open = open;
    syncToggle();
  });
  list.addEventListener("toggle", syncToggle, true);

  show(month, kind);

  const openEntry = (entry) => {
    show("all", "all");
    entry.open = true;
    entry.scrollIntoView({ block: "start" });
  };
  body.querySelector(".nt-week")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-nt-jump]");
    const entry = row && list.querySelector(`#${CSS.escape(`note-${row.dataset.ntJump}`)}`);
    if (!entry) return;
    event.preventDefault();
    event.stopPropagation();
    openEntry(entry);
  });

  // A link to #note-<id> opens that update, and so does a jump handed over by the app (state.jump,
  // set when a link on another page names one). The page may still be fading in, so the scroll
  // is repeated once it has been laid out.
  const wanted = state.jump || (location.hash.startsWith("#note-") ? decodeURIComponent(location.hash.slice(1)) : "");
  state.jump = "";
  const target = wanted ? list.querySelector(`#${CSS.escape(wanted)}`) : null;
  if (target) {
    openEntry(target);
    requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({ block: "start" })));
  }
}
