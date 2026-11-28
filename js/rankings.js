/**
 * The Rankings page (Social, /rankings): a board picker, the period and who to
 * compare with, your own place, the top fifty, and last week's winners.
 * Numbers come from GET /api/rankings (worker/rankings.js).
 */
import { BOARDS, BOARD_ORDER, PERIOD_LABEL, MIN_PACKS } from "./rankings-rules.js";
import { coinAmount, coinText } from "./money.js?v=4";

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
  if (!q.toString()) return;
  if (BOARDS[q.get("board")]) pick.board = q.get("board");
  pick.period = q.get("period") || "";
  pick.scope = q.get("scope") === "friends" ? "friends" : "all";
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

/** A figure whose characters roll up into place, one after another. */
function roll(text) {
  const chars = [...String(text)];
  return `<span class="rk-roll" aria-hidden="true">${chars.map((ch, i) => `<span style="--d:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</span>`;
}

function cardThumb(card) {
  if (!card?.image) return "";
  return `<img class="rk-card" src="${esc(card.image)}" alt="" loading="lazy" decoding="async" width="36" height="50" />`;
}

function rowHtml(board, row, deps, meHandle) {
  const mine = meHandle && row.user.handle === meHandle;
  const sub = board === "best" && row.card ? `${esc(row.card.name)}${row.card.set ? `, ${esc(row.card.set)}` : ""}` : `@${esc(row.user.handle)}`;
  return `<li class="rk-row${mine ? " is-me" : ""}${row.place <= 3 ? " is-top" : ""}" data-h="${esc(row.user.handle)}" style="--i:${Math.min(8, Math.max(0, row.place - 4))}">
    <span class="rk-place" aria-label="${ordinal(row.place)}">${row.place}</span>
    <a class="rk-who" href="/u/${esc(row.user.handle)}">
      ${deps.faceHtml(row.user, "sm")}
      <span class="rk-name"><b>${deps.levelTag(row.user)}<span class="rk-nm">${esc(row.user.name)}</span></b><small>${mine ? `<i class="rk-you">You</i> ` : ""}${sub}</small></span>
    </a>
    ${board === "best" ? cardThumb(row.card) : ""}
    <span class="rk-value">${valueHtml(board, row)}</span>
  </li>`;
}

/** The top three on plates: second, first, third. An empty seat is a dashed plate with a hollow ball. */
function podiumHtml(data, deps, meHandle) {
  const top = data.rows.filter((row) => row.place <= 3);
  const seat = (place) => {
    const row = top.find((r) => r.place === place);
    if (!row) {
      return `<li class="rk-seat is-empty" data-place="${place}"><span class="rk-seat-who"><i class="rk-ball" aria-hidden="true"></i><b>Open seat</b></span>
        <span class="rk-plate"><span>${place}</span></span></li>`;
    }
    const mine = meHandle && row.user.handle === meHandle;
    return `<li class="rk-seat${mine ? " is-me" : ""}" data-place="${place}">
      <a class="rk-seat-who" href="/u/${esc(row.user.handle)}" aria-label="${ordinal(place)}, ${esc(row.user.name)}, ${esc(plainValue(data.board, row))}">
        <span class="rk-seat-face">${deps.faceHtml(row.user, "md")}</span>
        <b>${esc(row.user.name)}</b>
        ${mine ? `<i class="rk-you">You</i>` : ""}
        <span class="rk-value">${valueHtml(data.board, row)}</span>
        ${data.board === "best" && row.card ? `<small>${esc(row.card.name)}</small>` : ""}
      </a>
      <span class="rk-plate" aria-hidden="true"><span>${place}</span></span>
    </li>`;
  };
  return `<ol class="rk-podium" aria-label="Top three">${seat(2)}${seat(1)}${seat(3)}</ol>`;
}

function meHtml(data, deps, user) {
  if (!user) {
    return `<div class="rk-me rk-me-out">
      <i class="rk-ball" aria-hidden="true"></i>
      <p>Sign in to see where you place and compare with your friends.</p>
      <button class="ghost" type="button" data-open-auth="signin">Sign in</button>
    </div>`;
  }
  const me = data.me;
  if (!me?.place) return `<div class="rk-me rk-me-none"><i class="rk-ball" aria-hidden="true"></i><p class="rk-me-why">${esc(me?.reason || "Rip a pack to get on this board.")}</p></div>`;
  const of = me.of > 1 ? ` <small>of ${num(me.of)}</small>` : "";
  return `<div class="rk-me">
    <span class="rk-me-tag">Your rank</span>
    <span class="rk-me-place"><b aria-label="${ordinal(me.place)}">${roll(ordinal(me.place))}</b>${of}</span>
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
        (row) => `<li data-place="${row.place}">
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
      `<button type="button" class="rk-board rt-word${key === pick.board ? " on" : ""}" data-rk-board="${key}" aria-pressed="${key === pick.board}">${esc(BOARDS[key].label)}</button>`
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
  // Phones show the boards as one picker (css/pages/phone.css); it presses the matching word.
  const picker = `<label class="rk-pick"><span>Board</span><select data-rk-pick aria-label="Board">${BOARD_ORDER.map(
    (key) => `<option value="${key}"${key === pick.board ? " selected" : ""}>${esc(BOARDS[key].label)}</option>`
  ).join("")}</select></label>`;
  return `<div class="rk-boards" role="group" aria-label="Board">${words}</div>${picker}
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
    return `<div class="rk-empty rk-empty-box"><i class="rk-ball" aria-hidden="true"></i><p>${empty}</p></div>`;
  }
  const rest = data.rows.filter((row) => row.place > 3);
  return `${podiumHtml(data, deps, meHandle)}${
    rest.length
      ? `<ol class="rk-list" start="${rest[0].place}" aria-label="${esc(BOARDS[data.board].label)}, ${esc(PERIOD_LABEL[data.period])}">${rest
          .map((row) => rowHtml(data.board, row, deps, meHandle))
          .join("")}</ol>`
      : ""
  }`;
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

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("no-motion");
let drawnPick = "";
let drawnSig = "";
let drawnPlace = 0;

/** What a board shows, so a poll that brings nothing new leaves the page (and its motion) alone. */
function boardSig(data) {
  const card = (c) => (c ? [c.id || "", c.name || "", c.image || ""] : null);
  const row = (r) => [r.place, r.user?.handle, r.user?.name, r.user?.avatar, r.user?.level, r.user?.prestige, r.value, r.level?.level, card(r.card)];
  return JSON.stringify([data.board, data.period, data.scope, (data.rows || []).map(row), data.me ? [data.me.place, data.me.of, data.me.value, data.me.reason, card(data.me.card)] : null, (data.lastWeek || []).map(row)]);
}

/** Update the board words and the period and compare keys in place, so the ink plate grows under a new pick. */
function syncControls(top, html) {
  const next = document.createElement("div");
  next.innerHTML = html;
  const key = (el) => [...el.querySelectorAll("button")].map((b) => JSON.stringify(b.dataset)).join("|");
  const old = new Map([...top.children].map((el) => [el.classList[0], el]));
  const wanted = new Set();
  let cursor = null;
  for (const el of [...next.children]) {
    const name = el.classList[0];
    wanted.add(name);
    const prev = old.get(name);
    if (prev && prev.tagName === el.tagName && key(prev) === key(el)) {
      const fresh = el.querySelectorAll("button");
      prev.querySelectorAll("button").forEach((b, i) => {
        b.className = fresh[i].className;
        b.setAttribute("aria-pressed", fresh[i].getAttribute("aria-pressed"));
      });
      if (!fresh.length && prev.textContent !== el.textContent) prev.textContent = el.textContent;
      cursor = prev;
    } else if (prev) {
      prev.replaceWith(el);
      cursor = el;
    } else {
      if (cursor) cursor.after(el);
      else top.prepend(el);
      cursor = el;
    }
  }
  for (const [name, el] of old) if (!wanted.has(name)) el.remove();
}

/** Rows that were on the board before slide from where they stood to their new place. */
function slideRows(body, before) {
  if (!before.size || still()) return;
  const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  let n = 0;
  for (const el of body.querySelectorAll(".rk-row[data-h]")) {
    const was = before.get(el.dataset.h);
    if (was == null) continue;
    el.classList.add("is-moved");
    if (n++ > 24) continue;
    const dy = was - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 2 || Math.abs(dy) > 1400) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 440, easing: ease });
  }
}

/**
 * Draw the page into `root`. deps: { api, faceHtml, levelTag, user, openAuth }.
 * The social tick calls this every few seconds: the same board comes back
 * quietly, and only a change is drawn (rows slide to their new places).
 */
export async function renderRankings(root, deps) {
  if (!root) return;
  const user = deps.user();
  readQuery();
  if (!user) pick.scope = "all";
  const periods = BOARDS[pick.board].periods;
  if (!periods.includes(pick.period)) pick.period = periods[0];
  writeQuery();

  let body = root.querySelector(".rk-body");
  const first = !body;
  if (!body) {
    root.innerHTML = `<section class="rk" aria-label="Rankings"><div class="rk-top"></div><div class="rk-body" aria-live="polite"></div>${HOW}</section>`;
    body = root.querySelector(".rk-body");
    bind(root, deps);
  }
  syncControls(root.querySelector(".rk-top"), controlsHtml(user));
  const pickKey = `${pick.board}|${pick.period}|${pick.scope}|${user?.handle || ""}`;
  const quiet = !first && pickKey === drawnPick && Boolean(lastData);
  if (!quiet) body.classList.add("is-loading");
  if (!lastData) body.innerHTML = `<p class="sr-only">Loading the board.</p><div class="rk-ghosts" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<i style="--i:${i}"></i>`).join("")}</div>`;

  const gen = ++loadGen;
  const q = new URLSearchParams({ board: pick.board, period: pick.period, scope: pick.scope });
  let data;
  try {
    data = await deps.api(`/api/rankings?${q}`);
  } catch (err) {
    if (gen !== loadGen) return;
    body.classList.remove("is-loading");
    if (quiet) return; // a missed poll keeps the board that is up
    drawnPick = "";
    body.innerHTML = `<div class="rk-empty rk-empty-box"><i class="rk-ball" aria-hidden="true"></i><p>${esc(err.message || "Couldn't load the board.")} Try again in a moment.</p></div>`;
    return;
  }
  if (gen !== loadGen || !root.isConnected) return;
  lastData = data;
  body.classList.remove("is-loading");
  const sig = boardSig(data);
  if (quiet && sig === drawnSig) return;
  const before = new Map([...body.querySelectorAll(".rk-row[data-h]")].map((el) => [el.dataset.h, el.getBoundingClientRect().top]));
  body.classList.toggle("is-quiet", quiet);
  body.innerHTML = `${meHtml(data, deps, user)}${resetLine(data)}${listHtml(data, deps, user)}${lastWeekHtml(data, deps)}`;
  // On a quiet refresh your own place still rolls when it moved.
  if (quiet && data.me?.place && data.me.place !== drawnPlace) body.querySelector(".rk-me")?.classList.add("is-new-place");
  drawnPick = pickKey;
  drawnSig = sig;
  drawnPlace = data.me?.place || 0;
  slideRows(body, before);
}

function bind(root, deps) {
  root.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-rk-pick]");
    if (sel) root.querySelector(`[data-rk-board="${sel.value}"]`)?.click();
  });
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
    writeQuery(); // before the render reads the address back
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
