/**
 * What a player sees of their level: the Levels tab of the account page, the
 * slim readout in the header, the line a toast reads after XP lands and the
 * card that stamps in on a level-up.
 *
 * Everything here is a pure function from data to an HTML string (or to a
 * plain object). app.js owns state, fetches and event delegation, and hands
 * the builders a small `deps` object, like js/quest-area.js. Nothing in this
 * file touches the DOM, so scripts/test-level-ui.mjs can run it in Node.
 *
 * deps (all optional, with safe fallbacks):
 *   esc(value)               HTML escaper
 *   num(n)                   thousands grouping
 *   gearName(kind, id)       the catalogue name of a gift, or ""
 *   gearArt(kind, id)        small HTML for a gift's picture, or ""
 *
 * Interaction hooks, handled by delegation in app.js:
 *   [data-claim-levels]      pay every unclaimed level (POST /api/levels/claim)
 *   [data-prestige]          go back to level 1 for a star (POST /api/levels/prestige)
 *   [data-road-past]         show or hide the stops already behind you
 *   [data-open-levels]       jump to the Levels tab (header readout, level-up card)
 *   [data-acct-tab="levels"] the tab itself
 */
import { LEVEL_CAP, PRESTIGE_CAP, XP_WEIGHTS, FRIEND_CAP, levelFromXp, xpSummary } from "./xp.js";
import {
  GATES,
  HOURLY_PER_PRESTIGE,
  LEVEL_GEAR,
  MILESTONES,
  PRESTIGE_ROAD,
  canPrestige,
  hourlyBonus,
  levelCoins,
  levelPayout,
  levelTitle,
  nextMilestone,
  unlockLevel,
} from "./levels.js";
import { COIN_I, coinAmount } from "./money.js?v=1";

const escHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const groupNum = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

const helpers = (deps = {}) => ({ esc: deps.esc || escHtml, num: deps.num || groupNum });

const clampLevel = (n) => Math.max(1, Math.min(LEVEL_CAP, Math.floor(Number(n) || 1)));
const count = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

/* ---- The summary ------------------------------------------------------------ */

/**
 * The XP summary for a save, always complete. The Worker sends `save.xp`; until
 * it does (or for a save built in the browser) the same numbers are worked out
 * here from xpSummary, treating level 1 as the last level paid, so every screen
 * renders and a veteran sees what is waiting for them.
 *
 * Returns { level, total, floor, ceil, into, need, pct, maxed, parts, banked,
 * claimedLevel, claimable: [levels], pending: { coins, gear, levels },
 * prestige, canPrestige, original, peak, hourly }.
 */
export function xpOf(save) {
  const sent = save?.xp && typeof save.xp === "object" && Number.isFinite(Number(save.xp.total ?? save.xp.xp)) ? save.xp : null;
  const base = sent ? { ...levelFromXp(sent.total ?? sent.xp), ...sent } : xpSummary(save || {});
  const total = count(base.total ?? base.xp);
  const lv = levelFromXp(total);
  const level = lv.level;
  const claimedLevel = Math.min(level, clampLevel(sent?.claimedLevel ?? 1));
  const claimable = Array.isArray(sent?.claimable)
    ? sent.claimable.map(Number).filter((n) => n > 1 && n <= LEVEL_CAP)
    : Array.from({ length: Math.max(0, level - claimedLevel) }, (_, i) => claimedLevel + 1 + i);
  const owed = levelPayout(claimedLevel + 1, level);
  const pending = {
    coins: count(sent?.pending?.coins ?? owed.coins),
    gear: Array.isArray(sent?.pending?.gear) ? sent.pending.gear.map((g) => ({ ...g })) : owed.gear,
    levels: count(sent?.pending?.levels ?? claimable.length),
  };
  if (!claimable.length) {
    pending.coins = 0;
    pending.gear = [];
    pending.levels = 0;
  }
  const prestige = Math.min(PRESTIGE_CAP, count(sent?.prestige));
  return {
    ...lv,
    level,
    xp: total,
    total,
    parts: Array.isArray(base.parts) ? base.parts : [],
    banked: count(base.banked),
    claimedLevel,
    claimable,
    pending,
    prestige,
    canPrestige: Boolean(sent) && canPrestige(level, claimedLevel, prestige),
    original: Boolean(sent?.original),
    peak: unlockLevel(level, prestige, count(sent?.peak)),
    hourly: hourlyBonus(level, prestige),
  };
}

/** Prestige stars as text for labels: "2 prestige stars". */
const starsText = (n) => `${n} prestige ${n === 1 ? "star" : "stars"}`;

/* ---- Header readout ---------------------------------------------------------- */

/** "Lv 18" over a hairline that fills with progress to the next level. */
export function levelReadoutHtml(xp, deps = {}) {
  const { esc, num } = helpers(deps);
  const stars = xp.prestige ? `, ${starsText(xp.prestige)}` : "";
  const label = xp.maxed ? `Level ${xp.level}, the top level${stars}` : `Level ${xp.level}, ${xp.pct}% of the way to level ${xp.level + 1}${stars}`;
  const wait = xp.claimable.length || xp.canPrestige ? `<i class="lvl-read-dot" aria-hidden="true"></i>` : "";
  const mark = xp.prestige ? `<i class="lvl-read-star" aria-hidden="true">${xp.prestige}</i>` : "";
  return `<span class="lvl-read-top"><small>Lv</small><b>${num(xp.level)}</b>${mark}${wait}</span><span class="lvl-read-line" aria-hidden="true"><u style="width:${xp.maxed ? 100 : xp.pct}%"></u></span><span class="sr-only">${esc(label)}${xp.claimable.length ? ". Rewards waiting." : ""}</span>`;
}

/* ---- XP feedback --------------------------------------------------------------- */

/** How each source reads in "+25 XP: 1 pack, 1 hit": singular, plural, and what an XP-only bump is. */
const NOUNS = {
  packs: ["pack", "packs"],
  hits: ["hit", "hits"],
  unique: ["new card", "new cards"],
  sealed: ["sealed product", "sealed products"],
  quests: ["quest", "quests"],
  achievements: ["achievement", "achievements"],
  mastery: ["set mastery", "set masteries"],
  battles: ["battle", "battles"],
  casino: ["casino game", "casino games"],
  grading: ["card graded", "cards graded"],
  friends: ["friend", "friends"],
  hourly: ["hourly claim", "hourly claims"],
};
/** XP that arrives without the count moving: a chest, a win, a Gem Mint 10. */
const BONUS_NOUN = { quests: "chest", battles: "battle win", casino: "casino win", grading: "Gem Mint 10" };

/**
 * What changed between two summaries. null when no XP was earned (a sale can
 * lower the worked-out total; the Worker's high-water mark keeps real XP).
 * { xp, from, to, levels, levelUp, items: [{id, n, text}], text }
 */
export function xpGain(prev, next) {
  if (!prev || !next) return null;
  const xp = next.total - prev.total;
  if (!(xp > 0)) return null;
  const before = new Map((prev.parts || []).map((p) => [p.id, p]));
  const items = [];
  for (const part of next.parts || []) {
    const was = before.get(part.id) || { count: 0, xp: 0 };
    const n = part.count - was.count;
    const gained = part.xp - was.xp;
    if (n > 0) {
      const noun = NOUNS[part.id] || [String(part.label || part.id).toLowerCase(), String(part.label || part.id).toLowerCase()];
      items.push({ id: part.id, n, xp: gained, text: `${n} ${n === 1 ? noun[0] : noun[1]}` });
    } else if (gained > 0 && BONUS_NOUN[part.id]) {
      items.push({ id: part.id, n: 0, xp: gained, text: BONUS_NOUN[part.id] });
    } else if (gained > 0) {
      items.push({ id: part.id, n: 0, xp: gained, text: String(part.label || part.id).toLowerCase() });
    }
  }
  // Source order (packs, hits, cards...) reads the way a rip happens.
  const shown = items.slice(0, 3).map((i) => i.text);
  const rest = items.length - shown.length;
  const list = shown.join(", ") + (rest > 0 ? ` and ${rest} more` : "");
  const levels = [];
  for (let lv = prev.level + 1; lv <= next.level; lv++) levels.push(lv);
  return {
    xp,
    from: prev.level,
    to: next.level,
    levels,
    levelUp: next.level > prev.level,
    items,
    list,
    text: `+${groupNum(xp)} XP${list ? `: ${list}` : ""}`,
  };
}

/** Milestones (not plain coins) opened by levels `from+1 .. to`. */
export function unlocksBetween(from, to) {
  const lo = clampLevel(from);
  const hi = clampLevel(to);
  return MILESTONES.filter((row) => row.level > lo && row.level <= hi && row.kind !== "coins");
}

/* ---- Reward wording ------------------------------------------------------------ */

const KIND_NOTE = {
  frame: "Rings your avatar.",
  hourly: "For every hourly claim.",
  banner: "A new banner motion.",
  title: "Wear it under your name.",
  gear: "Added to your gear on claim.",
  slots: "More room on your profile.",
  gate: "Opens for you to play.",
};

const SLOT_NOTE = { showcase: "Pin more cards to your profile.", slabs: "Show more graded slabs.", pages: "Show more binder pages." };

function tileName(row, deps) {
  if (row.kind === "gear") return deps.gearName?.(row.gearKind, row.id) || row.name;
  if (row.kind === "title") return row.name;
  return row.name;
}

function tileIcon(row, deps) {
  const common = `viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  switch (row.kind) {
    case "frame":
      return `<span class="lv-ic lv-ic-frame" data-frame="${deps.esc(row.id)}"><svg ${common}><circle cx="12" cy="12" r="8.5" stroke-width="2.6"/><circle cx="12" cy="12" r="3.2"/></svg></span>`;
    case "banner":
      return `<span class="lv-ic"><svg ${common}><path d="M3 8c3-2 6 2 9 0s6-2 9 0M3 13c3-2 6 2 9 0s6-2 9 0M3 18c3-2 6 2 9 0s6-2 9 0"/></svg></span>`;
    case "title":
      return `<span class="lv-ic"><svg ${common}><path d="M3.5 12.4V4.5h7.9l9.1 9.1-7.9 7.9zM8 8.3h.01"/></svg></span>`;
    case "gear": {
      const art = deps.gearArt?.(row.gearKind, row.id);
      if (art) return `<span class="lv-ic lv-ic-art">${art}</span>`;
      return row.gearKind === "coin"
        ? `<span class="lv-ic"><svg ${common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg></span>`
        : `<span class="lv-ic"><svg ${common}><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 7h6"/></svg></span>`;
    }
    case "slots":
      return `<span class="lv-ic"><svg ${common}><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" stroke-dasharray="2 2.4"/></svg></span>`;
    case "hourly":
      return `<span class="lv-ic"><svg ${common}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg></span>`;
    case "gate":
      return `<span class="lv-ic"><svg ${common}><path d="M5 21V7a7 7 0 0 1 14 0v14M5 21h14M12 12v4"/></svg></span>`;
    default:
      return `<span class="lv-ic">${COIN_I}</span>`;
  }
}

/** "Foil banner and Ace Trainer title": the unlock lines of a level-up. */
function unlockLine(row, deps) {
  const name = tileName(row, deps);
  if (row.kind === "title") return `${name} title`;
  return name;
}

/** The level a gift arrives at, for the claim slip. */
function giftLevel(id) {
  for (const [level, items] of Object.entries(LEVEL_GEAR)) if (items.some((item) => item.id === id)) return Number(level);
  return 0;
}

/** One line for a claim: "Levels 2 to 18 paid: 2,640 coins and 2 gifts." */
export function claimedText(paid, deps = {}) {
  const { num } = helpers(deps);
  const levels = Array.isArray(paid?.levels) ? paid.levels : [];
  const gifts = Array.isArray(paid?.gear) ? paid.gear.length : 0;
  const span = levels.length > 1 ? `Levels ${levels[0]} to ${levels[levels.length - 1]}` : levels.length ? `Level ${levels[0]}` : "Levels";
  return `${span} paid: ${num(paid?.coins || 0)} coins${gifts ? ` and ${gifts} ${gifts === 1 ? "gift" : "gifts"}` : ""}.`;
}

/* ---- The level-up card ------------------------------------------------------------ */

/**
 * The card that stamps in when a level is gained. `gain` is from xpGain().
 * The one action takes the player to the Levels tab.
 */
export function levelUpHtml(gain, xp, deps = {}) {
  const { esc, num } = helpers(deps);
  const d = { ...deps, esc };
  const opened = unlocksBetween(gain.from, gain.to);
  const next = nextMilestone(xp.level);
  const many = gain.to - gain.from > 1;
  const owed = xp.pending.coins;
  const lines = opened.map((row) => `<li>${tileIcon(row, d)}<span>${esc(unlockLine(row, d))}</span></li>`);
  const head = many ? `Levels ${gain.from + 1} to ${gain.to}` : `Level ${gain.to}`;
  const sub = lines.length
    ? "Unlocked on the way"
    : next
      ? `Next unlock at level ${next.level}: ${tileName(next, d)}`
      : xp.maxed
        ? xp.prestige < PRESTIGE_CAP
          ? "The top of the road. Claim it, then prestige for a star."
          : "The top of the road"
        : "Every level pays coins";
  return `<div class="lv-up-stamp" aria-hidden="true"><span><small>Level</small><b>${num(xp.level)}</b></span></div>
    <div class="lv-up-copy">
      <h2>${esc(head)}</h2>
      <p class="lv-up-xp">${esc(gain.text)}</p>
      <p class="lv-up-sub">${esc(sub)}</p>
      ${lines.length ? `<ul class="lv-up-list">${lines.slice(0, 3).join("")}${lines.length > 3 ? `<li class="more">and ${lines.length - 3} more on the road</li>` : ""}</ul>` : ""}
      ${owed ? `<p class="lv-up-coins">${coinAmount(owed)} waiting to claim</p>` : ""}
    </div>
    <div class="lv-up-actions">
      <button type="button" class="solid" data-open-levels>See the road</button>
      <button type="button" class="text-btn" data-levelup-close>Not now</button>
    </div>`;
}

/* ---- Where the XP comes from ----------------------------------------------------- */

const w = XP_WEIGHTS;
/** Plain weights and the nudge for a source nobody has tried yet. `gate` names the GATES keys that lock it. */
export const SOURCES = {
  packs: { weight: `${w.pack} XP a pack`, start: "Open your first pack.", noun: ["pack", "packs"] },
  hits: { weight: `${w.hit} XP a hit`, start: "Pull a hit rarity from a pack.", noun: ["hit", "hits"] },
  unique: { weight: `${w.unique} XP per new card`, start: "Collect a card.", noun: ["card", "cards"] },
  sealed: { weight: `${w.sealed} XP a product, on top of its packs`, start: "Open a sealed product.", noun: ["product", "products"] },
  quests: { weight: `${w.quest} XP a quest, ${w.chest} a chest`, start: "Claim a quest.", noun: ["quest", "quests"] },
  achievements: { weight: `${w.achievement[1]} to ${w.achievement[4]} XP, by tier`, start: "Claim an achievement.", noun: ["claimed", "claimed"] },
  mastery: { weight: `${w.mastery} XP a set`, start: "Master a whole set.", noun: ["set", "sets"] },
  battles: { weight: `${w.battle} XP a battle, ${w.battleWin} more for a win`, start: "Play a pack battle.", noun: ["battle", "battles"], gate: ["battles"] },
  casino: { weight: `${w.casino} XP a game, ${w.casinoWin} more for a win`, start: "Play your first game.", noun: ["game", "games"], gate: ["coinflip", "jackpot"] },
  grading: { weight: `${w.graded} XP a card, ${w.gemMint} more for a Gem Mint 10`, start: "Send a card to grading.", noun: ["card", "cards"], gate: ["grading"] },
  friends: { weight: `${w.friend} XP a friend, up to ${FRIEND_CAP}`, start: "Add a friend.", noun: ["friend", "friends"] },
  hourly: { weight: `${w.hourly} XP a claim`, start: "Claim your hourly coins.", noun: ["claim", "claims"] },
};

/** The level a source opens at, or 0 when it is open from the start. */
function sourceGate(id) {
  const keys = SOURCES[id]?.gate;
  return keys ? Math.min(...keys.map((key) => GATES[key])) : 0;
}

/**
 * The XP rows, split into what has paid and what is still untouched.
 * earned: biggest first, each with its share of the total. fresh: sources
 * with no XP yet, each with how to start it and the level it opens at.
 */
export function sourceRows(xp) {
  const total = Math.max(1, xp.total);
  const earned = [];
  const fresh = [];
  for (const part of xp.parts) {
    const info = SOURCES[part.id] || { weight: "", start: "", noun: ["", ""] };
    const row = { ...part, ...info, share: Math.min(100, (part.xp / total) * 100), opensAt: sourceGate(part.id) };
    (part.xp > 0 ? earned : fresh).push(row);
  }
  earned.sort((a, b) => b.xp - a.xp);
  return { earned, fresh };
}

function sourcesHtml(xp, deps) {
  const { esc, num } = deps;
  const { earned, fresh } = sourceRows(xp);
  const pctText = (p) => (p >= 1 ? `${Math.round(p)}%` : "under 1%");
  const earnedHtml = earned
    .map(
      (row) => `<li class="lv-src">
        <b class="lv-src-name">${esc(row.label)}</b>
        <span class="lv-src-xp">${num(row.xp)} XP</span>
        <p class="lv-src-note">${num(row.count)} ${esc(row.count === 1 ? row.noun[0] : row.noun[1])}. ${esc(row.weight)}.<span>${esc(pctText(row.share))} of your XP</span></p>
        <span class="lv-bar" aria-hidden="true"><i style="width:${Math.max(1.5, Math.round(row.share * 10) / 10)}%"></i></span>
      </li>`
    )
    .join("");
  const bankedHtml = xp.banked
    ? `<li class="lv-src is-kept"><b class="lv-src-name">Kept from before</b><span class="lv-src-xp">${num(xp.banked)} XP</span><p class="lv-src-note">XP you earned earlier is never taken back, even after you sell the cards.</p></li>`
    : "";
  const freshHtml = fresh
    .map((row) => {
      const shut = row.opensAt && xp.level < row.opensAt;
      return `<li class="lv-try${shut ? " is-shut" : ""}">
        <b>${esc(row.label)}</b>
        <p>${shut ? `Opens at level ${row.opensAt}. ` : ""}${esc(row.start)} ${esc(row.weight)}.</p>
      </li>`;
    })
    .join("");
  return `<section class="lv-sources" aria-labelledby="lv-sources-h">
    <header class="lv-head"><h2 id="lv-sources-h">Where your XP comes from</h2></header>
    ${earned.length || bankedHtml ? `<ol class="lv-src-list">${earnedHtml}${bankedHtml}</ol>` : `<p class="lv-empty">Rip a pack to earn your first XP.</p>`}
    ${fresh.length ? `<h3 class="lv-sub">${earned.length ? "Not tried yet" : "Ways to earn XP"}</h3><ul class="lv-try-list">${freshHtml}</ul>` : ""}
  </section>`;
}

/* ---- The road ---------------------------------------------------------------------- */

/**
 * The stops on the road: every level that unlocks something, plus every fifth
 * level (which pays a bonus). Each stop carries its tiles (everything but the
 * plain coin payout, which is the stop's `coins`).
 */
export function roadStops() {
  const levels = new Set();
  for (const row of MILESTONES) if (row.level >= 2) levels.add(row.level);
  for (let lv = 5; lv <= LEVEL_CAP; lv += 5) levels.add(lv);
  return [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({ level, coins: levelCoins(level), tiles: MILESTONES.filter((row) => row.level === level && row.kind !== "coins") }));
}

/**
 * The road for a player: stops with their state, the gap notes between them,
 * and where "you are here" sits. `ui.past` shows every stop behind you;
 * otherwise only the last three, with the rest folded into one line.
 */
export function roadModel(xp, ui = {}) {
  const stops = roadStops();
  const nextStop = stops.find((s) => s.level > xp.level && s.tiles.length) || null;
  const doneStops = stops.filter((s) => s.level <= xp.level);
  const keep = 3;
  const folded = ui.past ? [] : doneStops.slice(0, Math.max(0, doneStops.length - keep));
  const foldedSet = new Set(folded.map((s) => s.level));
  const items = [];
  let prevLevel = folded.length ? folded[folded.length - 1].level : 1;
  let placedHere = false;
  const here = () => {
    items.push({ type: "here", level: xp.level });
    placedHere = true;
  };
  if (folded.length) items.push({ type: "past", count: folded.length, from: 2, to: folded[folded.length - 1].level, open: false });
  for (const stop of stops) {
    if (foldedSet.has(stop.level)) continue;
    if (!placedHere && stop.level > xp.level) {
      // The gap before "you are here" and the gap after it.
      if (xp.level > prevLevel + 1) items.push({ type: "gap", from: prevLevel + 1, to: xp.level, done: true });
      here();
      prevLevel = Math.max(prevLevel, xp.level);
    }
    if (stop.level > prevLevel + 1) items.push({ type: "gap", from: prevLevel + 1, to: stop.level - 1, done: stop.level - 1 <= xp.level });
    const done = stop.level <= xp.level;
    const paid = stop.level <= xp.claimedLevel;
    items.push({
      type: "stop",
      ...stop,
      done,
      paid,
      waiting: done && !paid,
      kept: stop.level <= (xp.peak || xp.level),
      next: nextStop?.level === stop.level,
      away: stop.level - xp.level,
    });
    prevLevel = stop.level;
  }
  if (!placedHere) here();
  if (ui.past && doneStops.length > keep) items.unshift({ type: "past", count: doneStops.length - keep, from: 2, to: doneStops[doneStops.length - keep - 1].level, open: true });
  return { items, nextStop };
}

function gapText(from, to, num) {
  const lo = levelCoins(from);
  const hi = levelCoins(to);
  if (from === to) return `Level ${from} pays ${coinAmount(lo)}`;
  return `Levels ${from} to ${to} pay ${coinAmount(lo)} to ${num(hi)} each`;
}

function tileHtml(row, stop, deps) {
  const { esc } = deps;
  const paidKind = row.kind === "gear";
  // Unlocks stay open up to the highest level reached (prestige, or the first curve).
  const open = stop.done || (!paidKind && row.kind !== "hourly" && stop.kept);
  const state = !open ? "locked" : paidKind && !stop.paid ? "waiting" : "won";
  const word = state === "locked" ? "" : state === "waiting" ? "Waiting" : paidKind ? "Paid" : "Yours";
  return `<li class="lv-tile k-${esc(row.kind)} is-${state}">
    ${tileIcon(row, deps)}
    <span class="lv-tile-copy"><b>${esc(tileName(row, deps))}</b><small>${esc((row.kind === "slots" && SLOT_NOTE[row.id]) || KIND_NOTE[row.kind] || row.note || "")}</small></span>
    ${word ? `<span class="lv-tile-state">${word}</span>` : ""}
  </li>`;
}

function stopHtml(stop, xp, deps, ui) {
  const { esc, num } = deps;
  const state = stop.done ? "is-done" : "is-locked";
  const fresh = ui.fresh?.has(stop.level) ? " is-fresh" : "";
  const pay = stop.waiting
    ? `<span class="lv-pay is-waiting">${coinAmount(stop.coins)} waiting</span>`
    : `<span class="lv-pay">${coinAmount(stop.coins)}${stop.paid ? " paid" : ""}</span>`;
  const away = stop.done ? "" : `<span class="lv-away">${stop.away} ${stop.away === 1 ? "level" : "levels"} away</span>`;
  return `<li class="lv-stop ${state}${stop.next ? " is-next" : ""}${fresh}" data-level="${stop.level}">
    <span class="lv-stop-num"><b>${stop.level}</b></span>
    <span class="lv-node" aria-hidden="true"></span>
    <div class="lv-stop-body">
      <p class="lv-stop-head">${stop.next ? `<em>Next unlock</em>` : ""}<span class="lv-stop-name">Level ${stop.level}</span>${away}${pay}</p>
      ${stop.tiles.length ? `<ul class="lv-tiles">${stop.tiles.map((row) => tileHtml(row, stop, deps)).join("")}</ul>` : ""}
    </div>
  </li>`;
}

function roadHtml(xp, deps, ui) {
  const { esc, num } = deps;
  const { items } = roadModel(xp, ui);
  const rows = items
    .map((item) => {
      if (item.type === "stop") return stopHtml(item, xp, deps, ui);
      if (item.type === "gap") return `<li class="lv-gap${item.done ? " is-done" : ""}"><span></span><span class="lv-node sm" aria-hidden="true"></span><p>${gapText(item.from, item.to, num)}</p></li>`;
      if (item.type === "here") {
        return `<li class="lv-here" aria-current="step"><span class="lv-stop-num"><b>${xp.level}</b></span><span class="lv-node here" aria-hidden="true"></span>
          <p><b>You're here</b>${xp.maxed ? "The top level." : `${num(xp.need - xp.into)} XP to level ${xp.level + 1}`}</p></li>`;
      }
      return `<li class="lv-past"><span></span><span class="lv-node sm" aria-hidden="true"></span>
        <button type="button" class="text-btn" data-road-past aria-expanded="${item.open}">${item.open ? "Hide the earlier stops" : `${item.count} earlier ${item.count === 1 ? "stop" : "stops"}, levels ${item.from} to ${item.to}`}</button></li>`;
    })
    .join("");
  return `<section class="lv-road-sec" aria-labelledby="lv-road-h">
    <header class="lv-head"><h2 id="lv-road-h">Level rewards</h2></header>
    <ol class="lv-road">${rows}</ol>
  </section>`;
}

/* ---- The pass and the claim slip ----------------------------------------------------- */

function punchHtml(xp) {
  const filled = xp.maxed ? 10 : (xp.into / Math.max(1, xp.need)) * 10;
  let out = "";
  for (let i = 0; i < 10; i++) {
    const fill = Math.max(0, Math.min(1, filled - i));
    out += `<i${fill >= 1 ? ' class="on"' : ""}>${fill > 0 && fill < 1 ? `<u style="width:${Math.round(fill * 100)}%"></u>` : ""}</i>`;
  }
  return out;
}

function starsHtml(n) {
  if (!n) return "";
  let out = "";
  for (let i = 0; i < PRESTIGE_CAP; i++) out += `<i${i < n ? ' class="on"' : ""}></i>`;
  return `<span class="lv-stars" role="img" aria-label="${starsText(n)} of ${PRESTIGE_CAP}">${out}</span>`;
}

function passHtml(xp, deps) {
  const { esc, num } = deps;
  const title = levelTitle(xp.peak || xp.level) || "Rookie";
  const next = nextMilestone(xp.level);
  const left = xp.maxed ? 0 : xp.need - xp.into;
  const nextLine = next
    ? `Next unlock at level ${next.level}: ${esc(tileName(next, deps))}. ${next.level - xp.level} ${next.level - xp.level === 1 ? "level" : "levels"} to go.`
    : "You've unlocked everything. Only the coins are left.";
  return `<section class="lv-pass" aria-label="Your level">
    <div class="lv-pass-top">
      <p class="lv-level"><small>Level</small><b>${num(xp.level)}</b></p>
      <p class="lv-seal" aria-label="Your title: ${esc(title)}"><span>${esc(title)}</span></p>
    </div>
    <div class="lv-punch" role="img" aria-label="${xp.maxed ? "Top level reached" : `${xp.pct}% of the way to level ${xp.level + 1}`}">${punchHtml(xp)}</div>
    <p class="lv-xpline">${
      xp.maxed
        ? `<b>${num(xp.total)} XP</b><span>Top level</span>`
        : `<b>${num(xp.into)} of ${num(xp.need)} XP</b><span>${num(left)} to level ${xp.level + 1}</span>`
    }</p>
    <p class="lv-next">${nextLine}</p>
    <p class="lv-hourly"><span>Hourly claim</span><b>${coinAmount(xp.hourly)}</b></p>
    ${xp.prestige ? `<div class="lv-pass-stars"><span>Prestige ${num(xp.prestige)}</span>${starsHtml(xp.prestige)}</div>` : ""}
    ${xp.original ? `<p class="lv-original"><b>Original 100.</b> You reached level 100 before levels got harder. Everything it opened stays yours.</p>` : ""}
  </section>`;
}

/**
 * Prestige: what the next star brings, and the button once it can be taken.
 * Below level 100 it is a short preview; at the cap it is the action.
 */
function prestigeHtml(xp, deps) {
  const { esc, num } = deps;
  if (xp.prestige >= PRESTIGE_CAP) {
    return `<section class="lv-prestige is-done" aria-labelledby="lv-pr-h"><h2 id="lv-pr-h">Prestige ${num(xp.prestige)}</h2><p>Every star there is. Your hourly claim stays at its best for good.</p></section>`;
  }
  const next = PRESTIGE_ROAD[xp.prestige];
  const gains = [`Hourly claim up ${coinAmount(HOURLY_PER_PRESTIGE)} for good`];
  if (next.title) gains.push(`The ${next.title} title`);
  if (next.frames.length) gains.push(next.frames.length === 1 ? "A prestige frame" : `${next.frames.length} prestige frames`);
  gains.push("Every level pays its coins again");
  const list = `<ul class="lv-pr-list">${gains.map((g) => `<li>${g.includes("<") ? g : esc(g)}</li>`).join("")}</ul>`;
  let action;
  if (xp.canPrestige) {
    action = `<button type="button" class="solid lv-pr-btn" data-prestige>Prestige to star ${num(xp.prestige + 1)}</button>
      <p class="lv-pr-fine">You go back to level 1. Frames, titles, banners and profile room you've opened all stay.</p>`;
  } else if (xp.maxed) {
    action = `<p class="lv-pr-fine">Claim your level rewards first, then you can prestige.</p>`;
  } else {
    action = `<p class="lv-pr-fine">Opens at level ${LEVEL_CAP}. ${num(LEVEL_CAP - xp.level)} ${LEVEL_CAP - xp.level === 1 ? "level" : "levels"} to go.</p>`;
  }
  return `<section class="lv-prestige${xp.canPrestige ? " is-ready" : ""}" aria-labelledby="lv-pr-h">
    <header class="lv-pr-head"><span class="lv-pr-star" aria-hidden="true">${num(xp.prestige + 1)}</span><h2 id="lv-pr-h">Prestige ${num(xp.prestige + 1)}</h2></header>
    ${list}
    ${action}
  </section>`;
}

function claimHtml(xp, deps, ui) {
  const { esc, num } = deps;
  if (!xp.claimable.length) {
    const nextPay = xp.maxed ? "Every level is paid." : `Level ${xp.level + 1} pays ${coinAmount(levelCoins(xp.level + 1))}.`;
    return `<p class="lv-claim-none">Nothing to claim. ${nextPay}</p>`;
  }
  const first = xp.claimable[0];
  const last = xp.claimable[xp.claimable.length - 1];
  const span = first === last ? `Level ${first}` : `Levels ${first} to ${last}`;
  const gifts = xp.pending.gear
    .map((g) => {
      const name = deps.gearName?.(g.kind, g.id) || (g.kind === "coin" ? "A coin" : "A sleeve");
      const lv = giftLevel(g.id);
      return `<li><span>${esc(name)}<small>${g.kind === "coin" ? "Coin" : "Sleeve"}${lv ? `, from level ${lv}` : ""}</small></span><span class="lv-slip-val">Gift</span></li>`;
    })
    .join("");
  return `<section class="lv-claim" aria-labelledby="lv-claim-h">
    <h2 id="lv-claim-h">${esc(span)} ${xp.claimable.length === 1 ? "is" : "are"} waiting</h2>
    <button class="solid claim-cta lv-claim-btn" type="button" data-claim-levels>Claim level rewards <span class="claim-amt">${coinAmount(xp.pending.coins)}</span></button>
    <p class="lv-slip-cap">This claim pays</p>
    <ul class="lv-slip">
      <li><span>Coins<small>${xp.claimable.length} ${xp.claimable.length === 1 ? "level" : "levels"} of payouts</small></span><span class="lv-slip-val lv-slip-coin">${coinAmount(xp.pending.coins)}</span></li>
      ${gifts}
    </ul>
    ${ui.note ? `<p class="lv-claim-note">${esc(ui.note)}</p>` : ""}
  </section>`;
}

/**
 * The whole Levels tab. `ui`: { past: show every stop behind you, fresh: Set of
 * levels just paid, so their tiles stamp in }.
 */
export function levelsTabHtml(xp, deps = {}, ui = {}) {
  const d = { ...deps, ...helpers(deps) };
  return `<div class="lv">
    <div class="lv-side">
      ${passHtml(xp, d)}
      ${claimHtml(xp, d, ui)}
      ${prestigeHtml(xp, d)}
      ${sourcesHtml(xp, d)}
    </div>
    <div class="lv-main">${roadHtml(xp, d, ui)}</div>
  </div>`;
}

/** The count on the Levels tab: levels waiting to be paid. */
export function levelsReadyCount(xp) {
  return (xp?.claimable?.length || 0) + (xp?.canPrestige ? 1 : 0);
}

/** The toast after a prestige: "Prestige 2. Back to level 1, and your hourly claim is now 325." */
export function prestigedText(xp) {
  return `Prestige ${xp.prestige}. Back to level 1, and your hourly claim is now ${groupNum(xp.hourly)}.`;
}
