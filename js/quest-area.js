/**
 * The quest area of the account page: the quest board, the achievement wall,
 * the mastery shelf, and the small pieces that other pages borrow (the emblem
 * strip on a profile, the mastery banners and grouped titles in the Look tab).
 *
 * Everything here is a pure function from data to an HTML string. app.js owns
 * state, fetches and event delegation and hands each function a `deps` object
 * (esc, num, coin, setIdentity, the achievement helpers, ...), so this module
 * never imports app.js and can be read or tested on its own.
 *
 * Interaction hooks, all handled by delegation in app.js:
 *   data-quest-claim="<id>"      claim a quest or a chest
 *   data-claim="<id>"            claim one achievement
 *   #claim-all                   claim every ready achievement
 *   data-ach-cat / data-ach-filter   the wall's category words and status control
 *   data-mastery-era / data-mastery-set   the shelf
 *   data-jump-set="<id>"         open that set's collection
 *   data-set-banner="mastery:<id>"   pick a mastery banner
 *   data-set-title="<name>"      pick a title
 */

const DAY = 86_400_000;
const GLYPH = "&#10022;";

/* ---- Small shared pieces -------------------------------------------------- */

/** "Resets in 5 hours", "Resets in 3 days". */
export function resetIn(at, now = Date.now()) {
  const ms = Math.max(0, Number(at) - now);
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

function bar(pct, cls = "") {
  return `<span class="qa-bar ${cls}" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
}

function segments(done, total) {
  let out = "";
  for (let i = 0; i < total; i++) out += `<i${i < done ? ' class="on"' : ""}></i>`;
  return `<span class="qa-segs" aria-hidden="true">${out}</span>`;
}

/* ---- Quest board ----------------------------------------------------------- */

const PERIODS = [
  { id: "daily", title: "Today", span: DAY, lede: "Fresh every day." },
  { id: "weekly", title: "This week", span: 7 * DAY, lede: "Starts on Monday." },
  { id: "monthly", title: "This month", span: 0, lede: "The monthly campaign." },
];

function periodEnd(id, periods) {
  const start = Number(periods?.[id]);
  if (!start) return 0;
  if (id === "monthly") {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return start + (id === "weekly" ? 7 : 1) * DAY;
}

/** Fourteen flat squares ending today, drawn from the streak length. */
function streakStrip(summary, deps) {
  const { esc, num } = deps;
  const streak = Math.max(0, Number(summary.streak) || 0);
  const best = Math.max(streak, Number(summary.streakBest) || 0);
  const claimed = new Set(summary.claimed || []);
  const dailyIds = [...(summary.active?.daily || []), "chest-daily"];
  const today =
    typeof summary.streakToday === "boolean" ? summary.streakToday : dailyIds.some((id) => claimed.has(id));
  const start = Number(summary.periods?.daily) || Date.now() - (Date.now() % DAY);
  const letters = ["S", "M", "T", "W", "T", "F", "S"];
  // Filled cells end today when today already counts, otherwise yesterday.
  const lastFilled = today ? 13 : 12;
  const cells = [];
  for (let i = 0; i < 14; i++) {
    const on = streak > 0 && i <= lastFilled && i > lastFilled - streak;
    const isToday = i === 13;
    const day = new Date(start - (13 - i) * DAY);
    cells.push(
      `<li class="${on ? "on" : ""}${isToday ? " today" : ""}"><i></i><small>${letters[day.getUTCDay()]}</small></li>`
    );
  }
  const line = streak
    ? `<b>${num(streak)} day streak</b>`
    : `<b>No streak yet</b>`;
  const hint = !today
    ? streak
      ? "Claim any quest today to keep it going."
      : "Claim any quest today to start one."
    : streak > 1
      ? "Today counts."
      : "Started today.";
  return `<section class="qb-streak" aria-label="Quest streak">
    <div class="qb-streak-copy">
      <p>${line}<span>Best ${num(best)} ${best === 1 ? "day" : "days"}</span></p>
      <p class="qb-streak-hint">${esc(hint)}</p>
    </div>
    <ol class="qb-days" aria-hidden="true">${cells.join("")}</ol>
  </section>`;
}

function questRowHtml(row, summary, deps, { fresh }) {
  const { esc, num } = deps;
  const claimed = new Set(summary.claimed || []);
  const at = Math.min(row.goal, Number(summary.progress?.[row.id] || 0));
  const done = at >= row.goal;
  const paid = claimed.has(row.id);
  const pct = Math.round((at / row.goal) * 100);
  const state = paid ? "is-claimed" : done ? "is-ready" : "is-open";
  const status = paid
    ? `<span class="qa-done">Claimed</span>`
    : done
      ? `<button class="solid sm qa-claim" type="button" data-quest-claim="${esc(row.id)}">Claim</button>`
      : `<span class="qa-count">${num(at)} of ${num(row.goal)}</span>`;
  return `<li class="qrow ${state}${fresh.has(row.id) ? " is-fresh" : ""}">
    <b class="qrow-name">${esc(row.name)}</b>
    <span class="qa-coin">${GLYPH} ${num(row.coins)}</span>
    <p class="qrow-note">${esc(row.note)}</p>
    <span class="qrow-status">${status}</span>
    ${paid ? "" : bar(pct, done ? "full" : "")}
  </li>`;
}

function chestRowHtml(period, rows, summary, deps, { fresh }) {
  const { esc, num } = deps;
  const claimed = new Set(summary.claimed || []);
  const id = `chest-${period.id}`;
  // A chest waits only for the quests it needs (battle wins never hold it shut).
  const chest = deps.chestRow ? deps.chestRow(period.id, rows) : null;
  const needs = chest?.needs ? rows.filter((row) => chest.needs.includes(row.id)) : rows;
  const got = needs.filter((row) => claimed.has(row.id)).length;
  const unlocked = needs.length > 0 && (got >= needs.length || Boolean(summary.chests?.[period.id]));
  const paid = claimed.has(id);
  const coins = deps.chestCoins ? deps.chestCoins(period.id, rows, summary) : 0;
  const skipped = needs.length < rows.length;
  const name = `${period.id[0].toUpperCase()}${period.id.slice(1)} chest`;
  const state = paid ? "is-claimed" : unlocked ? "is-ready" : "is-open";
  const status = paid
    ? `<span class="qa-done">Opened</span>`
    : unlocked
      ? `<button class="solid sm qa-claim" type="button" data-quest-claim="${id}">Open</button>`
      : `<span class="qa-count">${num(got)} of ${num(needs.length)}</span>`;
  const note = paid
    ? "Everything claimed. See you at the reset."
    : unlocked
      ? "Every quest claimed. The chest is open."
      : needs.length === 1
        ? "Claim the quest above to open it."
        : `Claim ${skipped ? `${needs.length} quests above, battle wins aside,` : `all ${needs.length} quests above`} to open it.`;
  return `<li class="qrow qrow-chest ${state}${fresh.has(id) ? " is-fresh" : ""}">
    <b class="qrow-name"><svg class="qa-chest" viewBox="0 0 20 18" width="20" height="18" aria-hidden="true"><path d="M2 7h16v9H2zM1 3.5h18V7H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 9.5h3v3h-3z" fill="currentColor"/></svg>${esc(name)}</b>
    <span class="qa-coin">${coins ? `${GLYPH} ${num(coins)}` : "Bonus"}</span>
    <p class="qrow-note">${esc(note)}</p>
    <span class="qrow-status">${status}</span>
    ${paid ? "" : segments(got, needs.length)}
  </li>`;
}

/**
 * The board: the streak, then today, this week and this month, each ending in
 * its chest. `summary` is save.quests from the Worker (see questSummary).
 */
export function questBoardHtml(summary, deps, ui = {}) {
  const { esc, num } = deps;
  if (!summary || summary.unavailable) {
    return `<div class="qb"><p class="qa-empty">Quests are being set up. Check back in a minute.</p></div>`;
  }
  const fresh = ui.fresh || new Set();
  const now = deps.now ? deps.now() : Date.now();
  const claimed = new Set(summary.claimed || []);
  const sections = PERIODS.map((period) => {
    const rows = (summary.active?.[period.id] || []).map((id) => deps.questRow(id)).filter(Boolean);
    if (!rows.length) return "";
    const got = rows.filter((row) => claimed.has(row.id)).length;
    const end = periodEnd(period.id, summary.periods);
    return `<section class="qb-period" data-period="${period.id}">
      <header class="qb-head">
        <h2>${period.title}</h2>
        <p>${end ? `Resets in ${esc(resetIn(end, now))}` : esc(period.lede)}<span>${num(got)} of ${num(rows.length)} claimed</span></p>
      </header>
      <ol class="qb-rows">
        ${rows.map((row) => questRowHtml(row, summary, deps, { fresh })).join("")}
        ${chestRowHtml(period, rows, summary, deps, { fresh })}
      </ol>
    </section>`;
  }).join("");
  const streak = summary.streak != null || summary.streakBest != null ? streakStrip(summary, deps) : "";
  return `<div class="qb">
    ${streak}
    <div class="qb-periods">${sections}</div>
  </div>`;
}

/** How many quests and chests are claimable right now, for the tab's dot. */
export function questReadyCount(summary, deps) {
  if (!summary || summary.unavailable) return 0;
  const claimed = new Set(summary.claimed || []);
  let n = 0;
  for (const period of PERIODS) {
    const rows = (summary.active?.[period.id] || []).map((id) => deps.questRow(id)).filter(Boolean);
    const chest = deps.chestRow ? deps.chestRow(period.id, rows) : null;
    const needs = chest?.needs ? rows.filter((row) => chest.needs.includes(row.id)) : rows;
    for (const row of rows) {
      if (!claimed.has(row.id) && Number(summary.progress?.[row.id] || 0) >= row.goal) n++;
    }
    const got = needs.filter((row) => claimed.has(row.id)).length;
    if (needs.length && got >= needs.length && !claimed.has(`chest-${period.id}`)) n++;
  }
  return n;
}

/* ---- Achievement wall ------------------------------------------------------ */

/** One row's state against the player's progress. */
function status(row, stats, deps) {
  const p = deps.achievementProgress(row, stats.ctx);
  const isClaimed = stats.claimed.has(row.id);
  const ready = !isClaimed && p.done;
  const hidden = Boolean(deps.isSecret(row)) && !isClaimed && !p.done;
  return { p, isClaimed, ready, hidden, state: isClaimed ? "claimed" : ready ? "ready" : "locked" };
}

const STATE_RANK = { ready: 0, locked: 1, claimed: 3 };

/** The medal: a ring that fills with progress around the mark or the set symbol. */
function medal(row, s, deps) {
  const { esc } = deps;
  const inner =
    row.set && deps.setById?.(row.set)
      ? `<img src="${esc(deps.setIdentity(deps.setById(row.set)).symbol)}" alt="" width="24" height="24" loading="lazy" decoding="async" />`
      : esc(row.mark);
  const cls = String(row.mark || "").length > 3 ? " long" : "";
  return `<div class="qa-badge${cls}" style="--pct:${s.isClaimed ? 100 : s.p.pct}"><span>${inner}</span></div>`;
}

/** Text that says what a row hands over besides coins. */
function exclusives(row) {
  if (row.kind === "mastery") return `${row.title ? `${row.title} title, ` : ""}emblem and banner`;
  return row.title ? `${row.title} title` : "";
}

export function achievementTileHtml(row, stats, deps, ui = {}) {
  const { esc, num } = deps;
  const s = status(row, stats, deps);
  const face = deps.achievementFace(row, s.p.done || s.isClaimed);
  const fresh = ui.fresh?.has(row.id) ? " is-fresh" : "";
  if (face.masked) {
    return `<article class="qa-tile t${row.tier} is-secret" data-ach="${esc(row.id)}">
      <div class="qa-badge secret"><span>?</span></div>
      <div class="qa-copy">
        <b>${esc(face.name)}</b>
        <p class="qa-hint">${esc(face.note)}</p>
      </div>
      <div class="qa-side"><span class="qa-coin">?</span><span class="qa-count">Secret</span></div>
    </article>`;
  }
  const secret = deps.isSecret(row);
  const reveal = secret && s.ready && ui.reveal?.has(row.id) ? " is-reveal" : "";
  const own = exclusives(row);
  const action = s.isClaimed
    ? `<span class="qa-done">Claimed</span>`
    : s.ready
      ? `<button class="ghost sm qa-claim" type="button" data-claim="${esc(row.id)}">Claim</button>`
      : `<span class="qa-count">${num(s.p.at)} of ${num(s.p.goal)}</span>`;
  return `<article class="qa-tile t${row.tier} is-${s.state}${row.kind === "mastery" ? " is-mastery" : ""}${fresh}${reveal}" data-ach="${esc(row.id)}">
    ${medal(row, s, deps)}
    <div class="qa-copy">
      <b>${esc(row.name)}${secret ? `<em class="qa-secret-mark">Secret</em>` : ""}</b>
      <p>${esc(row.note)}</p>
      ${own ? `<span class="qa-own">${s.isClaimed ? "Won" : "Unlocks"}: ${esc(own)}</span>` : ""}
    </div>
    <div class="qa-side"><span class="qa-coin">${GLYPH} ${num(row.coins)}</span>${action}</div>
    ${s.isClaimed || s.ready ? "" : bar(s.p.pct)}
  </article>`;
}

/** Per-category tallies, computed in one pass. */
export function achievementTallies(stats, deps) {
  const cats = new Map(deps.categories.map((c) => [c.id, { claimed: 0, total: 0, ready: 0 }]));
  for (const row of deps.rows) {
    const tally = cats.get(row.cat);
    if (!tally) continue;
    tally.total += 1;
    if (stats.claimed.has(row.id)) tally.claimed += 1;
    else if (deps.achievementProgress(row, stats.ctx).done) tally.ready += 1;
  }
  return cats;
}

const FILTERS = [
  { id: "all", name: "All" },
  { id: "ready", name: "Ready" },
  { id: "locked", name: "Locked" },
  { id: "claimed", name: "Claimed" },
];

const EMPTY = {
  ready: "Nothing is ready to claim in this category. Keep playing and it lands here.",
  locked: "Everything in this category is earned. Nothing left to chase.",
  claimed: "Nothing claimed here yet. Finished ones wait under Ready.",
  all: "Nothing in this category yet.",
};

export function achievementWallHtml(stats, ui, deps) {
  const { esc, num } = deps;
  const tallies = achievementTallies(stats, deps);
  const cats = deps.categories.filter((c) => tallies.get(c.id)?.total);
  const cat = cats.some((c) => c.id === ui.cat) ? ui.cat : cats[0]?.id;
  const filter = FILTERS.some((f) => f.id === ui.filter) ? ui.filter : "all";

  const inCat = deps.rows.filter((row) => row.cat === cat).map((row) => ({ row, s: status(row, stats, deps) }));
  const counts = {
    all: inCat.length,
    ready: inCat.filter((x) => x.s.ready).length,
    locked: inCat.filter((x) => !x.s.isClaimed && !x.s.ready).length,
    claimed: inCat.filter((x) => x.s.isClaimed).length,
  };
  const shown = inCat
    .filter((x) => filter === "all" || x.s.state === filter)
    .map((x, i) => ({ ...x, i, rank: x.s.hidden ? 2 : STATE_RANK[x.s.state] }))
    .sort((a, b) => (filter === "all" ? a.rank - b.rank || a.i - b.i : a.i - b.i));
  const titles = deps.rows.filter((row) => row.title && stats.claimed.has(row.id)).length;
  const catNote = deps.categories.find((c) => c.id === cat)?.note || "";

  return `<div class="qa-wall">
    <div class="qa-head">
      <dl class="acct-figures qa-summary">
        <div class="acct-fig"><dt>Claimed</dt><dd>${num(stats.claimed.size)} of ${num(stats.total)}</dd></div>
        <div class="acct-fig money"><dt>Banked so far</dt><dd>${GLYPH} ${num(stats.banked)}</dd></div>
        <div class="acct-fig money"><dt>Waiting for you</dt><dd>${GLYPH} ${num(stats.waiting)}</dd></div>
        <div class="acct-fig"><dt>Titles won</dt><dd>${num(titles)}</dd></div>
      </dl>
      ${
        stats.ready.length
          ? `<button class="solid claim-cta" type="button" id="claim-all">Claim all ${num(stats.ready.length)} <span class="claim-amt">${GLYPH} ${num(stats.waiting)}</span></button>`
          : `<p class="qa-none">Nothing to claim right now.</p>`
      }
    </div>
    <div class="qa-words" role="tablist" aria-label="Achievement categories">
      ${cats
        .map((c) => {
          const t = tallies.get(c.id);
          const on = c.id === cat;
          return `<button type="button" role="tab" class="qa-word${on ? " on" : ""}" aria-selected="${on}" data-ach-cat="${esc(c.id)}">
            <span>${esc(c.name)}</span><small>${num(t.claimed)} of ${num(t.total)}</small>${t.ready ? `<i class="qa-dot" title="${num(t.ready)} ready"></i>` : ""}
          </button>`;
        })
        .join("")}
    </div>
    <div class="qa-bar-row">
      <p class="qa-catnote">${esc(catNote)}</p>
      <div class="qa-seg" role="group" aria-label="Show">
        ${FILTERS.map(
          (f) => `<button type="button" class="${f.id === filter ? "on" : ""}" data-ach-filter="${f.id}" aria-pressed="${f.id === filter}">${f.name}<small>${num(counts[f.id])}</small></button>`
        ).join("")}
      </div>
    </div>
    ${
      shown.length
        ? `<div class="qa-grid${shown.length > 60 ? " big" : ""}">${shown.map((x) => achievementTileHtml(x.row, stats, deps, ui)).join("")}</div>`
        : `<p class="qa-empty">${esc(EMPTY[filter])}</p>`
    }
  </div>`;
}

/* ---- Mastery ---------------------------------------------------------------- */

function eraBlocks(deps) {
  const order = [];
  const map = new Map();
  for (const set of deps.sets) {
    const era = set.era || set.edition || "Other";
    if (!map.has(era)) {
      map.set(era, []);
      order.push(era);
    }
    map.get(era).push(set);
  }
  return order.map((era) => ({ era, sets: map.get(era) }));
}

function masterySetTile(set, row, mastered, on, deps) {
  const { esc, num } = deps;
  const { symbol } = deps.setIdentity(set);
  const pct = row.total ? Math.min(100, (row.owned / row.total) * 100) : 0;
  return `<button type="button" class="qm-set${on ? " on" : ""}${mastered ? " is-mastered" : ""}" data-mastery-set="${esc(set.id)}" aria-pressed="${on}" aria-label="${esc(set.name)}, ${num(row.owned)} of ${num(row.total)} cards${mastered ? ", mastered" : ""}">
    <span class="qm-set-top">
      <img class="qm-symbol" src="${esc(symbol)}" alt="" height="20" loading="lazy" decoding="async" />
      <span class="qm-emblem">${deps.masteryEmblem(set.id, { size: "sm", locked: !mastered, label: false })}</span>
    </span>
    <span class="qm-name">${esc(set.name)}</span>
    <span class="qm-foot">
      <span class="qm-count">${mastered ? "Mastered" : `${num(row.owned)}/${num(row.total)}`}</span>
      ${bar(pct, mastered ? "full" : "")}
    </span>
  </button>`;
}

/** The inline panel under the chosen set: progress, its achievements, what mastery unlocks. */
export function masteryDetailHtml(set, row, stats, deps, ui = {}) {
  const { esc, num } = deps;
  const mastered = stats.claimed.has(`set-${set.id}-master`);
  const masteryRow = deps.masteryRowFor(set.id);
  const rows = deps.achievementsBySet(set.id);
  const missing = Math.max(0, row.total - row.owned);
  const pct = row.total ? Math.min(100, (row.owned / row.total) * 100) : 0;
  const title = masteryRow?.title || `${set.name} Master`;
  const banner = deps.bannerVars(deps.masteryBannerId(set.id));
  const unlocked = mastered;
  return `<section class="qm-detail" data-detail="${esc(set.id)}" aria-label="${esc(set.name)} mastery">
    <div class="qm-detail-main">
      <header class="qm-detail-head">
        <span class="qm-detail-emblem">${deps.masteryEmblem(set.id, { size: "lg", locked: !mastered, name: set.name })}</span>
        <div>
          <h3>${esc(set.name)}</h3>
          <p>${
            mastered
              ? "Mastered. Every card is in the binder."
              : missing
                ? `${num(missing)} ${missing === 1 ? "card" : "cards"} to go for mastery.`
                : "Every card owned. Claim the mastery below."
          }</p>
        </div>
      </header>
      <div class="qm-meter">
        ${bar(pct, mastered ? "full" : "")}
        <span>${num(row.owned)} of ${num(row.total)} cards</span>
      </div>
      <button type="button" class="ghost sm qm-open" data-jump-set="${esc(set.id)}">Open ${esc(set.name)} collection</button>
      <div class="qm-unlocks">
        <h4>What mastery unlocks</h4>
        <ul>
          <li class="${unlocked ? "is-open" : ""}">
            <span class="qm-art">${deps.masteryEmblem(set.id, { size: "md", locked: !mastered, label: false })}</span>
            <span><b>Emblem</b><small>Shown under your name on your profile.</small></span>
          </li>
          <li class="${unlocked ? "is-open" : ""}">
            <span class="qm-art"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M3.5 12.4V4.5h7.9l9.1 9.1-7.9 7.9zM8 8.3a1.2 1.2 0 1 0 0-.01z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></span>
            <span><b>${esc(title)}</b><small>A title that sits under your name.</small></span>
          </li>
          <li class="${unlocked ? "is-open" : ""}">
            <span class="qm-art wide"><span class="qm-banner-prev acct-banner banner-wash" data-motion="${esc(banner.motion)}" style="${esc(banner.style)}"></span></span>
            <span><b>Exclusive banner</b><small>Only ${esc(set.name)} masters can use it.</small></span>
          </li>
        </ul>
      </div>
    </div>
    <div class="qm-detail-rows">
      <h4>${esc(set.name)} achievements</h4>
      <div class="qa-grid one">${rows.map((r) => achievementTileHtml(r, stats, deps, ui)).join("")}</div>
    </div>
  </section>`;
}

export function masteryShelfHtml(stats, ui, deps) {
  const { esc, num } = deps;
  const blocks = eraBlocks(deps);
  const rowFor = new Map(stats.setRows.map((r) => [r.set.id, r]));
  const masteredOf = (set) => stats.claimed.has(`set-${set.id}-master`);
  const era = blocks.some((b) => b.era === ui.era) ? ui.era : blocks[0]?.era;
  const block = blocks.find((b) => b.era === era) || blocks[0];
  const mastered = deps.sets.filter(masteredOf).length;
  const half = stats.setRows.filter((r) => r.pct >= 50).length;
  const selected = block?.sets.find((s) => s.id === ui.set) || null;
  return `<div class="qm">
    <dl class="acct-figures qa-summary">
      <div class="acct-fig"><dt>Sets mastered</dt><dd>${num(mastered)} of ${num(deps.sets.length)}</dd></div>
      <div class="acct-fig"><dt>Halfway or better</dt><dd>${num(half)}</dd></div>
      <div class="acct-fig"><dt>Banners unlocked</dt><dd>${num(mastered)}</dd></div>
    </dl>
    <div class="qa-words" role="tablist" aria-label="Eras">
      ${blocks
        .map((b) => {
          const on = b.era === era;
          const got = b.sets.filter(masteredOf).length;
          return `<button type="button" role="tab" class="qa-word${on ? " on" : ""}" aria-selected="${on}" data-mastery-era="${esc(b.era)}">
            <span>${esc(deps.eraTitle(b.era))}</span><small>${num(got)} of ${num(b.sets.length)}</small></button>`;
        })
        .join("")}
    </div>
    <p class="qm-lede">Own every card in a set and claim its mastery. Each one hands over a title, an emblem and a banner nobody else can use.</p>
    <div class="qm-shelf">
      ${(block?.sets || [])
        .map((set) => masterySetTile(set, rowFor.get(set.id) || { owned: 0, total: set.totalCount || 1 }, masteredOf(set), selected?.id === set.id, deps))
        .join("")}
    </div>
    ${selected ? masteryDetailHtml(selected, rowFor.get(selected.id) || { owned: 0, total: selected.totalCount || 1 }, stats, deps, ui) : ""}
  </div>`;
}

/* ---- Emblem strip (account hero, public profile) ---------------------------- */

export function masteryStripHtml(setIds, deps, { mine = false, limit = 18 } = {}) {
  const { esc, num } = deps;
  const ids = (setIds || []).filter((id) => deps.setById(id));
  if (!ids.length) return "";
  const shown = ids.slice(0, limit);
  const more = ids.length - shown.length;
  const label = `${num(ids.length)} ${ids.length === 1 ? "set" : "sets"} mastered`;
  const items = shown
    .map((id) => {
      const name = `${deps.setById(id).name} Master`;
      return `<li title="${esc(name)}" aria-label="${esc(name)}">${deps.masteryEmblem(id, { size: "sm", label: false })}</li>`;
    })
    .join("");
  const inner = `<ul class="mstrip-list">${items}</ul><small>${esc(label)}${more > 0 ? ` (+${num(more)} more)` : ""}</small>`;
  return mine
    ? `<button type="button" class="mstrip" data-acct-tab="mastery" aria-label="${esc(label)}. Open Mastery.">${inner}</button>`
    : `<div class="mstrip" role="group" aria-label="${esc(label)}">${inner}</div>`;
}

/* ---- Look tab: mastery banners and grouped titles ---------------------------- */

export function masteryBannersHtml(current, claimed, deps) {
  const { esc, num } = deps;
  const open = deps.sets.filter((set) => claimed.has(`set-${set.id}-master`));
  const shut = deps.sets.filter((set) => !claimed.has(`set-${set.id}-master`));
  const tile = (set, unlocked) => {
    const id = deps.masteryBannerId(set.id);
    const v = deps.bannerVars(id);
    const on = current === id;
    return `<button type="button" class="mb-tile${on ? " on" : ""}${unlocked ? "" : " locked"}" ${unlocked ? `data-set-banner="${esc(id)}"` : "disabled"} aria-pressed="${on}">
      <span class="mb-art acct-banner banner-wash is-still" data-motion="${esc(v.motion)}" style="${esc(v.style)}"></span>
      <b>${esc(set.name)}</b>
      <small>${unlocked ? (on ? "In use" : "Use this banner") : `Master ${esc(set.name)} to unlock`}</small>
    </button>`;
  };
  return `<div class="mb">
    <h3>Mastery banners <small>${num(open.length)} of ${num(deps.sets.length)} unlocked</small></h3>
    ${
      open.length
        ? `<div class="mb-grid">${open.map((set) => tile(set, true)).join("")}</div>`
        : `<p class="qa-empty slim">Master a set to unlock its banner. Each one is exclusive to that set.</p>`
    }
    ${
      shut.length
        ? `<details class="qa-fold"><summary>${num(shut.length)} still locked</summary><div class="mb-grid">${shut.map((set) => tile(set, false)).join("")}</div></details>`
        : ""
    }
  </div>`;
}

/**
 * Titles in folded groups so 46 mastery titles do not become a wall: the
 * everyday ones, the badge rewards, then a group per era of set masters.
 */
export function titleGroupsHtml(titles, current, unlocked, deps) {
  const { esc, num } = deps;
  const masterSet = (row) => {
    const m = /^set-(.+)-master$/.exec(row.ach || "");
    return m ? deps.setById(m[1]) : null;
  };
  const groups = [
    { id: "everyday", name: "Everyday", rows: titles.filter((r) => !r.award) },
    { id: "rewards", name: "Badge rewards", rows: titles.filter((r) => r.award && !masterSet(r)) },
  ];
  for (const era of eraBlocks(deps)) {
    groups.push({
      id: `era-${era.era}`,
      name: `${deps.eraTitle(era.era)} masters`,
      rows: titles.filter((r) => era.sets.includes(masterSet(r))),
    });
  }
  const chip = (row) => {
    const open = unlocked.has(row.name);
    const on = current === row.name;
    const set = masterSet(row);
    const note = set && !open ? `Master ${set.name} to unlock.` : row.note;
    return `<button type="button" class="title-chip${on ? " on" : ""}${open ? "" : " locked"}" ${open ? `data-set-title="${esc(row.name)}"` : "disabled"} aria-pressed="${on}" title="${esc(note)}">
      <b>${esc(row.name)}</b><small>${esc(note)}</small>
    </button>`;
  };
  let opened = false;
  return groups
    .filter((g) => g.rows.length)
    .map((g) => {
      const got = g.rows.filter((r) => unlocked.has(r.name)).length;
      const hasCurrent = g.rows.some((r) => r.name === current);
      const open = hasCurrent || (!opened && got > 0 && g.id === "everyday");
      if (open) opened = true;
      return `<details class="qa-fold title-group"${open ? " open" : ""}>
        <summary><span>${esc(g.name)}</span><small>${num(got)} of ${num(g.rows.length)}</small></summary>
        <div class="title-wall">${g.rows.map(chip).join("")}</div>
      </details>`;
    })
    .join("");
}

/* ---- Overview and signed-out helpers ----------------------------------------- */

/** A compact medal for lists that are not the wall (Closest badges, the signed-out preview). */
export function miniMedal(row, pct, deps) {
  const { esc } = deps;
  return `<div class="qa-badge sm t${row.tier}" style="--pct:${pct}"><span>${esc(row.mark)}</span></div>`;
}
