/**
 * The Events page (Social, /events): this week's event, your steps, the goal
 * everyone shares, the week's board, the prize table and last week's winners.
 * Numbers come from GET /api/events (worker/events.js). The page only exists
 * while js/events-rules.js EVENTS_MODE is not "off".
 */
import { EVENTS_MODE } from "./events-rules.js";
import { PLAYABLE_SETS } from "./catalog.js";
import { coinAmount, coinText } from "./money.js?v=4";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const num = (n) => Number(n || 0).toLocaleString("en-US");
const plural = (n, word) => `${num(n)} ${word}${Number(n) === 1 ? "" : "s"}`;

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${num(n)}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "3 days 4 hours left", "5 hours left", "12 minutes left". */
export function timeLeft(ends, now = Date.now()) {
  const ms = Math.max(0, Number(ends) - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days >= 1) return `${plural(days, "day")}${hours ? ` ${plural(hours, "hour")}` : ""} left`;
  if (hours >= 1) return `${plural(hours, "hour")} left`;
  return `${plural(Math.max(1, Math.ceil(ms / 60_000)), "minute")} left`;
}

/** Whether to ask the server at all. The answer still decides: in preview only the owner gets a page. */
export const eventsMayShow = () => EVENTS_MODE !== "off";

let lastJson = "";
let lastData = null;
let loadGen = 0;
let busy = "";

function heroHtml(data) {
  const event = data.event;
  const set = event.set ? PLAYABLE_SETS.find((row) => row.id === event.set.id) : null;
  const wrap = set?.wrappers?.[0];
  const art = wrap
    ? `<picture class="ev-pack"><source srcset="${esc(wrap.art)}" type="image/avif"><img src="${esc(wrap.artFallback || wrap.art)}" alt="${esc(set.name)} booster pack" width="110" height="200" loading="lazy"></picture>`
    : "";
  const ends = new Date(event.ends).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
  const href = set ? `/packs/${esc(set.id)}` : "/packs";
  return `<section class="ev-hero${art ? " has-pack" : ""}">
    ${art}
    <div class="ev-hero-text">
      <p class="ev-rule">${esc(event.rule)}</p>
      <p class="ev-ends"><b>${esc(timeLeft(event.ends))}</b>, ends ${esc(ends)}</p>
      <a class="solid rt-go ev-go" href="${href}">${set ? `Rip ${esc(set.name)}` : "Rip a pack"}</a>
    </div>
  </section>`;
}

function waitingHtml(data) {
  const rows = data.me?.waiting || [];
  if (!rows.length) return "";
  const items = rows
    .map((row) => {
      const key = `${row.week}|${row.kind}|${row.ref}`;
      let action = `<button class="solid sm" type="button" data-ev-claim="${esc(key)}"${busy === key ? " disabled" : ""}>Claim</button>`;
      if (row.held) action = `<span class="ev-note">Being checked</span>`;
      return `<li class="ev-line"><span class="ev-line-name">${esc(row.label)}</span>
        ${row.coins ? `<span class="ev-coins">${coinAmount(row.coins)}</span>` : ""}${action}</li>`;
    })
    .join("");
  return items ? `<section class="ev-part ev-wait"><h3>Unclaimed from earlier weeks</h3><ul class="ev-lines">${items}</ul></section>` : "";
}

function trackHtml(data, user) {
  const event = data.event;
  const me = data.me;
  const top = event.steps[event.steps.length - 1].at;
  const unit = event.unit;
  if (!user || !me) {
    return `<section class="ev-part ev-track">
      <h3>Your steps</h3>
      <ol class="ev-steps">${event.steps
        .map((step) => `<li class="ev-line"><span class="ev-line-name">${plural(step.at, unit)}</span>${step.coins ? `<span class="ev-coins">${coinAmount(step.coins)}</span>` : ""}</li>`)
        .join("")}</ol>
      <p class="ev-signin"><button class="ghost sm" type="button" data-open-auth="signin">Sign in</button> to start counting.</p>
    </section>`;
  }
  const next = me.steps.find((step) => !step.done);
  const fill = Math.min(1, me.points / top);
  const marks = event.steps
    .slice(0, -1)
    .map((step) => `<i style="left:${((step.at / top) * 100).toFixed(2)}%"></i>`)
    .join("");
  const steps = event.steps
    .map((step, i) => {
      const mine = me.steps[i];
      const key = `${event.week}|step|${i}`;
      let state = `<span class="ev-note">${num(step.at - me.points)} to go</span>`;
      if (mine.claimed) state = `<span class="ev-note is-done">Claimed</span>`;
      else if (mine.done && step.coins) state = `<button class="solid sm" type="button" data-ev-claim="${esc(key)}"${busy === key ? " disabled" : ""}>Claim</button>`;
      else if (mine.done) state = `<span class="ev-note is-done">Done</span>`;
      return `<li class="ev-line${mine.done ? " is-done" : ""}"><span class="ev-line-name">${plural(step.at, unit)}</span>
        ${step.coins ? `<span class="ev-coins">${coinAmount(step.coins)}</span>` : ""}${state}</li>`;
    })
    .join("");
  return `<section class="ev-part ev-track">
    <h3>Your steps</h3>
    <p class="ev-count"><b>${num(me.points)}</b><span>${unit}${me.points === 1 ? "" : "s"}${
      next ? `, ${num(next.at - me.points)} more for step ${me.steps.indexOf(next) + 1}` : ", every step done"
    }</span></p>
    <div class="ev-bar"><div class="rt-track" role="progressbar" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${Math.min(top, me.points)}" aria-label="Your event steps"><i style="--fill:${fill.toFixed(4)}"></i></div>${marks}</div>
    <ol class="ev-steps">${steps}</ol>
  </section>`;
}

function communityHtml(data) {
  const c = data.community;
  const unit = data.event.unit;
  const fill = Math.min(1, c.total / Math.max(1, c.goal));
  const key = `${data.event.week}|goal|goal`;
  let tail = "";
  if (c.coins) {
    if (c.reached && data.me?.goal?.claimed) tail = `<span class="ev-note is-done">Claimed</span>`;
    else if (c.reached && data.me?.goal?.qualifies) tail = `<button class="solid sm" type="button" data-ev-claim="${esc(key)}"${busy === key ? " disabled" : ""}>Claim ${coinText(c.coins)}</button>`;
  }
  const line = c.reached
    ? c.coins
      ? `Goal reached. Everyone at step 1 or past it takes ${coinText(c.coins)} coins.`
      : "Goal reached."
    : c.coins
      ? `${num(c.goal - c.total)} to go. Hit it and everyone at step 1 or past it takes ${coinText(c.coins)} coins.`
      : `${num(c.goal - c.total)} to go.`;
  return `<section class="ev-part ev-all">
    <h3>Everyone's goal</h3>
    <p class="ev-count"><b>${num(c.total)}</b><span>of ${num(c.goal)} ${unit}s, ${plural(c.players, "player")} in</span></p>
    <div class="ev-bar"><div class="rt-track" role="progressbar" aria-valuemin="0" aria-valuemax="${c.goal}" aria-valuenow="${Math.min(c.goal, c.total)}" aria-label="Everyone's goal"><i style="--fill:${fill.toFixed(4)}"></i></div></div>
    <p class="ev-all-line"><span>${esc(line)}</span>${tail}</p>
  </section>`;
}

function boardHtml(data, deps, user) {
  const unit = data.event.unit;
  const rows = data.board
    .map((row) => {
      const mine = user && row.user.handle === user.handle;
      return `<li class="rk-row${mine ? " is-me" : ""}">
        <span class="rk-place" aria-label="${ordinal(row.place)}">${row.place}</span>
        <a class="rk-who" href="/u/${esc(row.user.handle)}">${deps.faceHtml(row.user, "sm")}
          <span class="rk-name"><b>${deps.levelTag(row.user)}<span class="rk-nm">${esc(row.user.name)}</span></b><small>${mine ? `<i class="rk-you">You</i> ` : ""}@${esc(row.user.handle)}</small></span></a>
        <span class="rk-value"><span class="rk-n">${num(row.value)}<small> ${unit}${row.value === 1 ? "" : "s"}</small></span></span>
      </li>`;
    })
    .join("");
  const off = data.me?.place && data.me.place > data.board.length ? `<p class="ev-mine">You're ${ordinal(data.me.place)} with ${plural(data.me.points, unit)}.</p>` : "";
  // Nobody has scored: the board itself, with its first three seats open.
  const empty = [1, 2, 3].map((place) => `<li class="rk-row ev-open"><span class="rk-place">${place}</span><span class="ev-open-seat">Open</span></li>`).join("");
  return `<section class="ev-part ev-board">
    <h3>This week's board</h3>
    <ol class="rk-list">${rows || empty}</ol>
    ${off}
    <p class="ev-more"><a class="tlink" href="/rankings?board=best&period=week">Best pull</a> and <a class="tlink" href="/rankings?board=packs&period=week">Packs ripped</a> are on Rankings.</p>
  </section>`;
}

function prizesHtml(data) {
  const p = data.prizes;
  if (!p) return "";
  const band = (row) => (row.from === row.to ? ordinal(row.from) : `${ordinal(row.from)} to ${ordinal(row.to)}`);
  const names = p.boards.map((row) => row.label);
  return `<section class="ev-part ev-prizes">
    <h3>Prizes when the week ends</h3>
    <table class="ev-table"><thead><tr><th scope="col">Place</th><th scope="col">Coins</th></tr></thead>
      <tbody>${p.table.map((row) => `<tr><th scope="row">${band(row)}</th><td>${coinAmount(row.coins)}</td></tr>`).join("")}</tbody></table>
    <ul class="ev-rules">
      <li>The same prizes on three boards: ${esc(names.slice(0, -1).join(", "))} and ${esc(names[names.length - 1])}.</li>
      ${p.onePrize ? "<li>One prize a player each week. If you place on more than one board, the biggest pays.</li>" : ""}
      <li>Your account needs to be ${p.minAgeDays} days old and level ${p.minLevel}, with ${p.minPaidPacks} packs bought that week.</li>
      <li>Battle packs and free packs don't score in the event.</li>
    </ul>
  </section>`;
}

function lastHtml(data, deps) {
  const last = data.last;
  const labels = { event: "Event points", best: "Best pull", packs: "Packs ripped" };
  const boards = Object.entries(last.winners || {})
    .filter(([, rows]) => rows.length)
    .map(
      ([board, rows]) => `<div class="ev-last-board"><h4>${labels[board] || esc(board)}</h4><ol>${rows
        .map((row) => `<li><span class="ev-last-place">${row.place}</span><a class="ev-last-who" href="/u/${esc(row.user.handle)}">${deps.faceHtml(row.user, "sm")}<span>${esc(row.user.name)}</span></a></li>`)
        .join("")}</ol></div>`
    )
    .join("");
  if (!boards) return "";
  return `<section class="ev-part ev-last"><h3>Last week, ${esc(last.title)}</h3>
    <p class="ev-last-goal">${last.community.reached ? "Everyone's goal was reached" : "Everyone's goal was missed"}, ${num(last.community.total)} of ${num(last.community.goal)}.</p>
    <div class="ev-last-boards">${boards}</div></section>`;
}

function draw(pane, data, deps) {
  const user = deps.user();
  pane.innerHTML = `<div class="ev">
    ${data.preview ? `<p class="ev-preview">Preview. Only you can see this page.</p>` : ""}
    ${heroHtml(data)}
    ${trackHtml(data, user)}
    ${communityHtml(data)}
    ${waitingHtml(data)}
    ${boardHtml(data, deps, user)}
    ${prizesHtml(data)}
    ${lastHtml(data, deps)}
  </div>`;
  nameTitle(pane, data);
}

/** The page is named after the event, not after the tab. The hub redraws its head, so this runs on every pass. */
function nameTitle(pane, data) {
  const title = pane.parentElement?.querySelector(":scope > .hub-head .page-title");
  if (title && title.textContent !== data.event.title) title.textContent = data.event.title;
}

async function claim(pane, key, deps) {
  if (busy) return;
  const [week, kind, ref] = key.split("|");
  const from = pane.querySelector(`[data-ev-claim="${CSS.escape(key)}"]`)?.getBoundingClientRect();
  busy = key;
  try {
    const data = await deps.api("/api/events/claim", { method: "POST", body: JSON.stringify({ week: Number(week), kind, ref }) });
    deps.onClaim?.(data, from);
    deps.toast(`+${num(data.coins)} coins`);
  } catch (err) {
    deps.toast(err.message || "Couldn't claim that.");
  } finally {
    busy = "";
    lastJson = "";
    renderEvents(pane, deps);
  }
}

/**
 * Draw the page into `pane`. deps: { api, faceHtml, levelTag, user, toast,
 * onClaim(data, rect), onHidden() }. Safe to call on a timer: a poll that
 * changed nothing redraws nothing.
 */
export async function renderEvents(pane, deps) {
  if (!pane.dataset.evBound) {
    pane.dataset.evBound = "1";
    pane.addEventListener("click", (e) => {
      const key = e.target.closest("[data-ev-claim]")?.dataset.evClaim;
      if (key) claim(pane, key, deps);
    });
  }
  if (lastData && !pane.querySelector(".ev")) draw(pane, lastData, deps);
  else if (lastData) nameTitle(pane, lastData);
  const gen = ++loadGen;
  let data;
  try {
    data = await deps.api("/api/events");
  } catch {
    if (!pane.querySelector(".ev")) pane.innerHTML = `<p class="ev-none">Couldn't load this week's event. Pull to refresh.</p>`;
    return;
  }
  if (gen !== loadGen) return;
  if (!data?.visible) {
    lastData = null;
    lastJson = "";
    pane.innerHTML = `<p class="ev-none">No event is running this week.</p>`;
    deps.onHidden?.();
    return;
  }
  const json = JSON.stringify(data) + (deps.user()?.handle || "");
  if (json === lastJson && pane.querySelector(".ev")) return nameTitle(pane, data);
  lastJson = json;
  lastData = data;
  draw(pane, data, deps);
}

/** One line for Home or a profile: the event's name and how long is left. Null when no event shows for this viewer. */
export async function eventBrief(api) {
  if (!eventsMayShow()) return null;
  try {
    const data = await api("/api/events");
    if (!data?.visible) return null;
    return { title: data.event.title, rule: data.event.rule, ends: data.event.ends, left: timeLeft(data.event.ends), points: data.me?.points ?? null, href: "/events" };
  } catch {
    return null;
  }
}
