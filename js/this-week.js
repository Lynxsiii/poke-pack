/**
 * Home's "This week": the newest big update, the other new things from the
 * last seven days, and the cards whose price moved most.
 *
 * Updates come from data/patch-notes.json. An entry carries `kind` ("new",
 * "better" or "fix") and, when it is worth a place on Home, `big`: 1 for a
 * feature, 2 or 3 for the ones that should lead. Fixes never show here.
 * `link` and `linkLabel` send the player straight to the thing.
 *
 * Prices come from GET /api/prices/movers (worker/movers.js): the biggest
 * weekly rises and falls in TCGplayer market price, as dollars.
 */

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MORE_ROWS = 3;

const parseDay = (value) => {
  const at = new Date(`${value}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at;
};

const shortDay = (value) => {
  const at = parseDay(value);
  return at ? at.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : String(value || "");
};

/** "Nov 22 to 28", or "Nov 28 to Dec 4" across a month's end. */
export function rangeWords(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return "";
  const month = (d) => d.toLocaleDateString(undefined, { month: "short" });
  const same = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return same ? `${month(a)} ${a.getDate()} to ${b.getDate()}` : `${month(a)} ${a.getDate()} to ${month(b)} ${b.getDate()}`;
}

const isoDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * What Home says about the week ending `today`: the update that leads, the
 * rows under it, and how many smaller changes sit behind them. With nothing
 * big in the week, the newest big update leads and the week is empty.
 */
export function weekOf(notes, today = Date.now()) {
  const list = Array.isArray(notes) ? notes.filter((note) => note?.id && note.title && note.date) : [];
  const to = isoDay(today);
  const from = isoDay(today - (WEEK_DAYS - 1) * DAY_MS);
  const inWeek = list.filter((note) => note.date >= from && note.date <= to);
  // The heaviest first; among equals the file's order stands (newest first).
  const big = inWeek.filter((note) => note.big).sort((a, b) => (Number(b.big) || 1) - (Number(a.big) || 1));
  const lead = big[0] || list.find((note) => note.big) || null;
  const rest = big.slice(1);
  const shown = new Set([lead, ...rest.slice(0, MORE_ROWS)].filter(Boolean).map((note) => note.id));
  const others = inWeek.filter((note) => !shown.has(note.id));
  return {
    from,
    to,
    lead,
    leadInWeek: Boolean(big[0]),
    more: rest.slice(0, MORE_ROWS),
    added: others.filter((note) => note.kind !== "fix").length,
    fixes: others.filter((note) => note.kind === "fix").length,
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function initThisWeek(deps) {
  const { root, esc, coinAmount, coinText, toCoins, openCard, loadMovers, notes } = deps;
  let movers = null; // null until asked for, then { up, down, day, since } (empty lists when it failed)
  let asked = false;
  let side = "up";

  const leadHtml = (week) => {
    const note = week.lead;
    if (!note) return "";
    const tag = week.leadInWeek ? "New" : "Latest";
    const go = note.link
      ? `<a class="wk-go" href="${esc(note.link)}">${esc(note.linkLabel || "Take a look")}</a>`
      : "";
    return `<article class="wk-lead">
        <p class="wk-lead-top"><span class="rt-tag">${tag}</span><time datetime="${esc(note.date)}">${esc(shortDay(note.date))}</time></p>
        <h3><a href="/notes#note-${esc(note.id)}" data-note="${esc(note.id)}">${esc(note.title)}</a></h3>
        ${note.summary ? `<p class="wk-lead-sum">${esc(note.summary)}</p>` : ""}
        <p class="wk-lead-links">${go}<a class="wk-read" href="/notes#note-${esc(note.id)}" data-note="${esc(note.id)}">What changed</a></p>
      </article>`;
  };

  const moreHtml = (week) =>
    week.more
      .map(
        (note, i) => `<a class="rt-row wk-row" style="--i:${i}" href="/notes#note-${esc(note.id)}" data-note="${esc(note.id)}">
          <span class="rt-row-lab">${esc(shortDay(note.date))}</span>
          <span class="rt-row-name">${esc(note.title)}</span>
        </a>`
      )
      .join("");

  const tailHtml = (week) => {
    const parts = [];
    if (week.added) parts.push(plural(week.added, "more update", "more updates"));
    if (week.fixes) parts.push(plural(week.fixes, "fix", "fixes"));
    const line = parts.length ? `${parts.join(" and ")} this week.` : "";
    return `<p class="wk-tail">${line ? `<span>${esc(line)}</span> ` : ""}<a class="tlink" href="/notes">All patch notes</a></p>`;
  };

  const moverHtml = (card, i) => {
    const up = card.pct >= 0;
    const now = toCoins(card.now);
    const was = toCoins(card.was);
    const pct = `${up ? "+" : "-"}${Math.abs(Math.round(card.pct))}%`;
    const said = `${card.name}, ${card.setName || "card"} ${card.number}, ${up ? "up" : "down"} ${Math.abs(Math.round(card.pct))} percent to ${coinText(now)} coins, was ${coinText(was)}`;
    return `<button type="button" class="wk-card" style="--i:${i}" data-mover="${esc(card.id)}" data-set="${esc(card.set)}" aria-label="${esc(said)}">
        <span class="wk-art"><img src="${esc(card.img)}" alt="" loading="lazy" decoding="async" /><b class="wk-pct${up ? "" : " is-down"}">${pct}</b></span>
        <span class="wk-nm">${esc(card.name)}</span>
        <span class="wk-set">${esc(card.setName)}${card.number ? `, ${esc(card.number)}` : ""}</span>
        <span class="wk-price">${coinAmount(now)}<s>${esc(coinText(was))}</s></span>
      </button>`;
  };

  const moversHtml = () => {
    if (!movers) {
      return `<div class="wk-movers"><div class="wk-movers-head"><h3>Going up</h3></div>
        <div class="wk-cards" aria-hidden="true">${`<span class="wk-card wk-ghost rt-skel"></span>`.repeat(4)}</div></div>`;
    }
    const sides = ["up", "down"].filter((key) => movers[key]?.length);
    if (!sides.length) return "";
    if (!sides.includes(side)) side = sides[0];
    const tabs =
      sides.length > 1
        ? `<div class="wk-sides" role="group" aria-label="Price moves">${sides
            .map(
              (key) =>
                `<button type="button" class="rt-word${key === side ? " on" : ""}" data-wk-side="${key}" aria-pressed="${key === side}">${key === "up" ? "Going up" : "Going down"}</button>`
            )
            .join("")}</div>`
        : "";
    const span = movers.since && movers.day ? `${shortDay(movers.since)} to ${shortDay(movers.day)}` : "the last week";
    return `<div class="wk-movers">
        <div class="wk-movers-head"><h3 id="wk-movers-h">${sides.length > 1 ? "Price moves" : side === "up" ? "Going up" : "Going down"}</h3>${tabs}</div>
        <div class="wk-cards" role="group" aria-labelledby="wk-movers-h">${movers[side].map(moverHtml).join("")}</div>
        <p class="wk-foot">TCGplayer market price, ${esc(span)}. Tap a card for its chart.</p>
      </div>`;
  };

  function render() {
    if (!root) return;
    const week = weekOf(notes());
    const moversPart = moversHtml();
    if (!week.lead && !moversPart) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    root.hidden = false;
    const range = rangeWords(week.from, week.to);
    root.innerHTML = `<header class="wk-head"><h2 id="home-week-h">This week</h2>${range ? `<span class="wk-range">${esc(range)}</span>` : ""}</header>
      <div class="wk-grid${moversPart ? "" : " is-solo"}">
        ${week.lead ? `<div class="wk-news">${leadHtml(week)}${week.more.length ? `<div class="wk-rows">${moreHtml(week)}</div>` : ""}${tailHtml(week)}</div>` : ""}
        ${moversPart}
      </div>`;
    if (!asked) {
      asked = true;
      loadMovers()
        .then((data) => {
          movers = { up: Array.isArray(data?.up) ? data.up : [], down: Array.isArray(data?.down) ? data.down : [], day: data?.day || "", since: data?.since || "" };
        })
        .catch(() => {
          movers = { up: [], down: [], day: "", since: "" };
        })
        .finally(render);
    }
  }

  root?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-wk-side]");
    if (tab) {
      if (tab.dataset.wkSide !== side) {
        side = tab.dataset.wkSide;
        render();
        root.querySelector(`[data-wk-side="${side}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    const card = event.target.closest("[data-mover]");
    if (card) openCard({ id: card.dataset.mover, setId: card.dataset.set });
  });

  return { render };
}
