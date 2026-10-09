/**
 * The lock notice for a level gate: a flat ticket stub saying what opens at
 * which level, where the player stands and where to look. The Worker is the
 * authority (worker/gates.js refuses with a 403 {error, needLevel}); this only
 * tells the player before they try. The numbers come from js/levels.js.
 *
 * A notice shows only when the level is known, is under the gate, and the page
 * has no sign the player already uses the feature (`used`). When the level is
 * not known the controls stay as they were and the server decides.
 */
import { GATES, GATE_NAMES, gateMessage, levelPerks, nextSlotLevel, slotMessage } from "./levels.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Games that need an adult account; keep in step with worker/gates.js ADULT_ONLY (empty: the casino is 13+). `adult` comes from worker/terms.js. */
const ADULT_ONLY = new Set();
export const CASINO_AGE = 18;

/** { key, need, level } (or { key, age }) while the gate is shut for this player, otherwise null. */
export function gateLock(key, user, used = false) {
  // Age has no veterans' pass; a game already open is still finished from its own page.
  if (ADULT_ONLY.has(key) && user && user.adult === false) return { key, age: CASINO_AGE };
  const need = GATES[key];
  // Gates count from the highest level reached, so a prestiged player is never locked out.
  const level = Math.floor(Number(user?.unlockLevel ?? user?.perks?.unlockLevel ?? user?.level));
  if (!need || used || !Number.isFinite(level) || level < 1 || level >= need) return null;
  return { key, need, level };
}

/** The notice, or "" when the gate is open. `lock` is what gateLock returned. */
export function gateNoticeHTML(lock) {
  if (!lock) return "";
  if (lock.age) {
    return `<aside class="gate-lock gate-age" data-gate="${esc(lock.key)}" aria-label="${esc(ageMessage())}">
    <span class="gate-lock-stub" aria-hidden="true"><small>Age</small><b>${lock.age}+</b></span>
    <div class="gate-lock-body">
      <h2>The casino is for players ${lock.age} and older</h2>
      <p>Coinflip, Jackpot, Pack battles and the Upgrader are games of chance, so they stay shut until you're ${lock.age}. Packs, the binder, grading and everything else are open. Games you already started can still be finished.</p>
      <a class="gate-lock-link" href="/terms">Read the Terms</a>
    </div>
  </aside>`;
  }
  const name = GATE_NAMES[lock.key] || lock.key;
  const left = lock.need - lock.level;
  return `<aside class="gate-lock" data-gate="${esc(lock.key)}" aria-label="${esc(gateMessage(lock.key))}">
    <span class="gate-lock-stub" aria-hidden="true"><small>Level</small><b>${lock.need}</b></span>
    <div class="gate-lock-body">
      <h2>Reach level ${lock.need} to open ${esc(name)}</h2>
      <p>You're level ${lock.level}, ${left === 1 ? "one level" : `${left} levels`} away. Opening packs, finishing quests and claiming achievements all earn XP.</p>
      <button type="button" class="gate-lock-link" data-acct-tab="levels">See your levels</button>
    </div>
  </aside>`;
}

/** Why a locked control did nothing. */
export const gateRefusal = (lock) => (lock ? (lock.age ? ageMessage() : gateMessage(lock.key)) : "");

function ageMessage() {
  return `The casino is for players ${CASINO_AGE} and older.`;
}

const ROOM_KEYS = { showcase: "showcaseSlots", slabs: "shownSlabs", pages: "binderPages" };

/**
 * What a profile list can hold for this level: { cap, more }. `cap` is the
 * level's allowance, never below what is already in the list (saved data is
 * never cut) and never above the hard cap `hardMax`; `more` is " Reach level N
 * for more slots." while a bigger step is ahead, otherwise "". With no known
 * level the cap is the hard cap, and the Worker decides.
 */
export function roomLine(kind, level, used, hardMax) {
  const lv = Math.floor(Number(level));
  if (!Number.isFinite(lv) || lv < 1) return { cap: hardMax, more: "" };
  const cap = Math.min(hardMax, Math.max(levelPerks(lv)[ROOM_KEYS[kind]] || 0, Math.floor(Number(used)) || 0));
  return { cap, more: cap < hardMax && nextSlotLevel(kind, lv) ? ` ${slotMessage(kind, lv)}` : "" };
}
