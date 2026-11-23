/**
 * The Rankings page (Social, /rankings): a board picker, the period and who to
 * compare with, your own place, the top fifty, and last week's winners.
 * Numbers come from GET /api/rankings (worker/rankings.js).
 */
import { BOARDS, BOARD_ORDER, PERIOD_LABEL, MIN_PACKS } from "./rankings-rules.js";
import { coinAmount, coinText } from "./money.js?v=1";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const num = (n) => Number(n || 0).toLocaleString("en-US");

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${num(n)}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const pick = { board: "worth", period: "", scope: "all" };
let lastData = null;
let loadGen = 0;

function readQuery() {
  const q = new URLSearchParams(location.search);
  if (BOARDS[q.get("board")]) pick.board = q.get("board");
  if (q.get("period")) pick.period = q.get("period");
  if (q.get("scope") === "friends") pick.scope = "friends";
}

function writeQuery() {
  if (location.pathname.replace(/\/+$/, "") !== "/rankings") return;
  const q = new URLSearchParams();
  if (pick.board !== "worth") q.set("board", pick.board);
  if (pick.period && pick.period !== BOARDS[pick.board].periods[0]) q.set("period", pick.period);
  if (pick.scope === "friends") q.set("scope", "friends");
  const search = q.toString() ? `?${q}` : "";
  if (location.search !== search) history.replaceState(history.state, "", `/rankings${search}`);
}

function valueHtml(board, row) {
  if (board === "level") return row.level ? `<span class="rk-lv">Lv ${num(row.level.level)}</span>` : "";
  if (board === "worth" || board === "best") return `<span class="rk-coins">${coinAmount(row.value)}</span>`;
  if (board === "packs") return `<span class="rk-n">${num(row.value)}<small> ${row.value === 1 ? "pack" : "packs"}</small></span>`;
  return `<span class="rk-n">${num(row.value)}<small> ${row.value === 1 ? "set" : "sets"}</small></span>`;
}

function plainValue(board, row) {
  if (board === "level") return row.level ? `level ${row.level.level}${row.level.prestige ? `, prestige ${row.level.prestige}` : ""}` : "";
  if (board === "worth" || board === "best") return `${coinText(row.value)} coins`;
  if (board === "packs") return `${num(row.value)} ${row.value === 1 ? "pack" : "packs"}`;
  return `${num(row.value)} ${row.value === 1 ? "set" : "sets"}`;
}

function cardThumb(card) {
  if (!card?.image) return "";
  return `<img class="rk-card" src="${esc(card.image)}" alt="" loading="lazy" decoding="async" width="36" height="50" />`;
}

function rowHtml(board, row, deps, meHandle) {
  const mine = meHandle && row.user.handle === meHandle;
  const sub = board === "best" && row.card ? `${esc(row.card.name)}${row.card.set ? `, ${esc(row.card.set)}` : ""}` : `@${esc(row.user.handle)}`;
  return `<li class="rk-row${mine ? " is-me" : ""}${row.place <= 3 ? " is-top" : ""}">
    <span class="rk-place" aria-label="${ordinal(row.place)}">${row.place}</span>
    <a class="rk-who" href="/u/${esc(row.user.handle)}">
      ${deps.faceHtml(row.user, "sm")}
      <span class="rk-name"><b>${deps.levelTag(row.user)}${esc(row.user.name)}</b><small>${mine ? `<i class="rk-you">You</i> ` : ""}${sub}</small></span>
    </a>
    ${board === "best" ? cardThumb(row.card) : ""}
    <span class="rk-value">${valueHtml(board, row)}</span>
  </li>`;
}

function meHtml(data, deps, user) {
  if (!user) {
    return `<div class="rk-me rk-me-out">
      <p>Sign in to see where you place and compare with your friends.</p>
      <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
    </div>`;
  }
  const me = data.me;
  if (!me?.place) return `<div class="rk-me"><p class="rk-me-why">${esc(me?.reason || "Rip a pack to get on this board.")}</p></div>`;
  const of = me.of > 1 ? ` <small>of ${num(me.of)}</small>` : "";
  return `<div class="rk-me">
    <span class="rk-me-place"><small>You're</small><b>${ordinal(me.place)}</b>${of}</span>
    ${data.board === "best" && me.card ? cardThumb(me.card) : ""}
    <span class="rk-me-value">${valueHtml(data.board, { ...me, value: me.value })}${
      data.board === "best" && me.card ? `<small>${esc(me.card.name)}</small>` : ""
    }</span>
  </div>`;
}

function resetLine(data) {
  if (data.period !== "week") return "";
  const ends = new Date(data.week.ends);
  const when = ends.toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });
  return `<p class="rk-reset">Resets ${esc(when)}</p>`;
}

function lastWeekHtml(data, deps) {
  const rows = data.lastWeek || [];
  if (!rows.length) return "";
  return `<section class="rk-last" aria-labelledby="rk-last-h">
    <h3 id="rk-last-h">Last week</h3>
    <ol class="rk-last-list">${rows
      .map(
        (row) => `<li>
          <span class="rk-place">${row.place}</span>
          <a class="rk-who" href="/u/${esc(row.user.handle)}">${deps.faceHtml(row.user, "sm")}<span class="rk-name"><b>${esc(row.user.name)}</b><small>${esc(plainValue(data.board, row))}${
            data.board === "best" && row.card ? `, ${esc(row.card.name)}` : ""
          }</small></span></a>
        </li>`
      )
      .join("")}</ol>
  </section>`;
}

function controlsHtml(user) {
  const board = BOARDS[pick.board];
  const words = BOARD_ORDER.map(
    (key) =>
      `<button type="button" class="rk-board${key === pick.board ? " on" : ""}" data-rk-board="${key}" aria-pressed="${key === pick.board}">${esc(BOARDS[key].label)}</button>`
  ).join("");
  const periods =
    board.periods.length > 1
      ? `<div class="seg rk-seg" role="group" aria-label="Period">${board.periods
          .map(
            (p) =>
              `<button type="button" class="seg-btn${p === pick.period ? " on" : ""}" data-rk-period="${p}" aria-pressed="${p === pick.period}">${PERIOD_LABEL[p]}</button>`
          )
          .join("")}</div>`
      : "";
  const scope = user
    ? `<div class="seg rk-seg" role="group" aria-label="Compare with">${[
        ["all", "Everyone"],
        ["friends", "Friends"],
      ]
        .map(
          ([key, label]) =>
            `<button type="button" class="seg-btn${key === pick.scope ? " on" : ""}" data-rk-scope="${key}" aria-pressed="${key === pick.scope}">${label}</button>`
        )
        .join("")}</div>`
    : "";
  return `<div class="rk-boards" role="group" aria-label="Board">${words}</div>
    ${periods || scope ? `<div class="rk-controls">${periods}${scope}</div>` : ""}
    <p class="rk-blurb">${esc(board.blurb)}</p>`;
}

function listHtml(data, deps, user) {
  const meHandle = user?.handle || "";
  if (!data.rows.length) {
    const empty =
      data.scope === "friends"
        ? "None of your friends are on this board yet."
        : data.period === "week"
          ? "Nobody has ripped a pack this week yet. First one takes the top spot."
          : "Nobody is on this board yet.";
    return `<p class="rk-empty">${empty}</p>`;
  }
  return `<ol class="rk-list" aria-label="${esc(BOARDS[data.board].label)}, ${esc(PERIOD_LABEL[data.period])}">${data.rows
    .map((row) => rowHtml(data.board, row, deps, meHandle))
    .join("")}</ol>`;
}

const HOW = `<details class="rk-how">
  <summary>How rankings are counted</summary>
  <ul>
    <li>Only what happened on the site counts: packs the site opened for you, the cards and slabs you own, your level and your masteries. Nothing your browser sends is trusted.</li>
    <li>Packs opened as a guest before signing up don't count toward packs or pulls.</li>
    <li>You show up once you've ripped ${MIN_PACKS} packs. Weekly boards run Monday to Monday and need just one.</li>
    <li>Collection value uses today's prices, so it moves when the market does. Boards refresh every few minutes.</li>
  </ul>
</details>`;

/**
 * Draw the page into `root`. deps: { api, faceHtml, levelTag, user, openAuth }.
 */
export async function renderRankings(root, deps) {
  if (!root) return;
  const user = deps.user();
  if (!lastData) readQuery();
  if (!user) pick.scope = "all";
  const periods = BOARDS[pick.board].periods;
  if (!periods.includes(pick.period)) pick.period = periods[0];
  writeQuery();

  let body = root.querySelector(".rk-body");
  if (!body) {
    root.innerHTML = `<section class="rk" aria-label="Rankings"><div class="rk-top"></div><div class="rk-body" aria-live="polite"></div>${HOW}</section>`;
    body = root.querySelector(".rk-body");
    bind(root, deps);
  }
  root.querySelector(".rk-top").innerHTML = controlsHtml(user);
  body.classList.add("is-loading");
  if (!lastData) body.innerHTML = `<p class="rk-empty">Loading the board.</p>`;

  const gen = ++loadGen;
  const q = new URLSearchParams({ board: pick.board, period: pick.period, scope: pick.scope });
  let data;
  try {
    data = await deps.api(`/api/rankings?${q}`);
  } catch (err) {
    if (gen !== loadGen) return;
    body.classList.remove("is-loading");
    body.innerHTML = `<p class="rk-empty">${esc(err.message || "Couldn't load the board.")} Try again in a moment.</p>`;
    return;
  }
  if (gen !== loadGen || !root.isConnected) return;
  lastData = data;
  body.classList.remove("is-loading");
  body.innerHTML = `${meHtml(data, deps, user)}${resetLine(data)}${listHtml(data, deps, user)}${lastWeekHtml(data, deps)}`;
}

function bind(root, deps) {
  root.addEventListener("click", (e) => {
    const board = e.target.closest("[data-rk-board]");
    const period = e.target.closest("[data-rk-period]");
    const scope = e.target.closest("[data-rk-scope]");
    if (!board && !period && !scope) return;
    if (board) {
      if (pick.board === board.dataset.rkBoard) return;
      pick.board = board.dataset.rkBoard;
      pick.period = BOARDS[pick.board].periods[0];
    }
    if (period) pick.period = period.dataset.rkPeriod;
    if (scope) pick.scope = scope.dataset.rkScope;
    renderRankings(root, deps);
  });
}

let standingCache = { handle: "", at: 0, places: null };

/**
 * A trainer's best two places in a short line ("2nd in Collection, 5th in Best pull this week"),
 * or "" when they are on no board. Cached for a minute.
 */
export async function standingLine(api, handle) {
  if (!handle) return "";
  if (standingCache.handle !== handle || Date.now() - standingCache.at > 60_000) {
    try {
      const data = await api(`/api/rankings/u/${encodeURIComponent(handle)}`);
      standingCache = { handle, at: Date.now(), places: data.places || [] };
    } catch {
      return "";
    }
  }
  const places = [...(standingCache.places || [])].sort((a, b) => a.place - b.place || (a.period === "week" ? -1 : 1)).slice(0, 2);
  return places
    .map((p) => `${ordinal(p.place)} in ${BOARDS[p.board]?.label || p.board}${p.period === "week" ? " this week" : ""}`)
    .join(", ");
}
