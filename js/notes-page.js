/**
 * The patch notes page. Updates come from data/patch-notes.json, newest first.
 * Updates that share a date sit under one date; each is a closed row (title and
 * a line saying what changed) that opens to its list. The newest is open.
 * A word picker narrows the page to one month.
 *
 * An entry is { id, date, title, summary?, items?: string[], groups?:
 * [{ title, items }] }.
 */

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

function entryHtml(note, open) {
  const body = groupsOf(note)
    .map(
      (group) => `${group.title ? `<h4>${esc(group.title)}</h4>` : ""}
        <ul>${(group.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    )
    .join("");
  return `<details class="nt-entry" id="note-${esc(note.id)}"${open ? " open" : ""}>
      <summary>
        <span class="nt-head">
          <span class="nt-title">${esc(note.title)}</span>
          ${note.summary ? `<span class="nt-sum">${esc(note.summary)}</span>` : ""}
        </span>
        <span class="nt-mark" aria-hidden="true"></span>
      </summary>
      <div class="nt-body">${body}</div>
    </details>`;
}

function dayHtml(date, notes, firstOpenId) {
  const parts = dayParts(date);
  return `<section class="nt-day" data-month="${esc(String(date).slice(0, 7))}">
      <h3 class="nt-date"><time datetime="${esc(date)}"><span class="nt-full">${esc(parts.full || parts.day)}</span><span class="nt-d">${esc(parts.day)}</span><span class="nt-y">${esc(parts.year)}</span></time></h3>
      <div class="nt-updates">${notes.map((note) => entryHtml(note, note.id === firstOpenId)).join("")}</div>
    </section>`;
}

/** Draw the page into `body`, and the one-line fact under the title into `factEl`. */
export function renderNotesPage(body, notes, factEl, state = {}) {
  if (!body) return;
  if (!notes.length) {
    body.innerHTML = `<p class="nt-empty">No patch notes have been posted yet.</p>`;
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

  if (factEl) {
    const oldest = dayParts(notes[notes.length - 1].date);
    const newest = dayParts(notes[0].date);
    factEl.textContent = `${notes.length} updates since ${oldest.full || oldest.day}. The latest is from ${newest.full || newest.day}.`;
  }

  const month = months.some((m) => m.key === state.month) ? state.month : "all";
  state.month = month;

  body.innerHTML = `<div class="nt-bar">
      <div class="nt-months" role="group" aria-label="Month">
        <button type="button" class="nt-month${month === "all" ? " on" : ""}" data-month="all" aria-pressed="${month === "all"}">All</button>
        ${months
          .map(
            (m) =>
              `<button type="button" class="nt-month${month === m.key ? " on" : ""}" data-month="${esc(m.key)}" aria-pressed="${month === m.key}">${esc(m.label)}</button>`
          )
          .join("")}
      </div>
      <button type="button" class="nt-all" data-nt-all>Expand all</button>
    </div>
    <div class="nt-list">${days
      .map((day) => dayHtml(day.date, day.notes, day.notes[0].id === notes[0].id ? notes[0].id : ""))
      .join("")}</div>`;

  const list = body.querySelector(".nt-list");
  const toggle = body.querySelector("[data-nt-all]");

  const showMonth = (key) => {
    state.month = key;
    for (const btn of body.querySelectorAll(".nt-month")) {
      const on = btn.dataset.month === key;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    for (const section of list.querySelectorAll(".nt-day")) {
      section.hidden = key !== "all" && section.dataset.month !== key;
    }
    syncToggle();
  };

  const visibleEntries = () => [...list.querySelectorAll(".nt-day:not([hidden]) .nt-entry")];
  const syncToggle = () => {
    const entries = visibleEntries();
    const allOpen = entries.length > 0 && entries.every((entry) => entry.open);
    toggle.textContent = allOpen ? "Collapse all" : "Expand all";
    toggle.dataset.open = allOpen ? "1" : "0";
  };

  body.querySelector(".nt-months").addEventListener("click", (event) => {
    const btn = event.target.closest(".nt-month");
    if (btn) showMonth(btn.dataset.month);
  });
  toggle.addEventListener("click", () => {
    const open = toggle.dataset.open !== "1";
    for (const entry of visibleEntries()) entry.open = open;
    syncToggle();
  });
  list.addEventListener("toggle", syncToggle, true);

  showMonth(month);

  // A link to #note-<id> opens that update.
  const target = location.hash.startsWith("#note-")
    ? list.querySelector(`#${CSS.escape(decodeURIComponent(location.hash.slice(1)))}`)
    : null;
  if (target) {
    showMonth("all");
    target.open = true;
    target.scrollIntoView({ block: "start" });
  }
}
