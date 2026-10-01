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
import { GATES, GATE_NAMES, gateMessage } from "./levels.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** { key, need, level } while the gate is shut for this player, otherwise null. */
export function gateLock(key, user, used = false) {
  const need = GATES[key];
  const level = Math.floor(Number(user?.level));
  if (!need || used || !Number.isFinite(level) || level < 1 || level >= need) return null;
  return { key, need, level };
}

/** The notice, or "" when the gate is open. `lock` is what gateLock returned. */
export function gateNoticeHTML(lock) {
  if (!lock) return "";
  const name = GATE_NAMES[lock.key] || lock.key;
  const left = lock.need - lock.level;
  return `<aside class="gate-lock" data-gate="${esc(lock.key)}" aria-label="${esc(gateMessage(lock.key))}">
    <span class="gate-lock-stub" aria-hidden="true"><small>Level</small><b>${lock.need}</b></span>
    <div class="gate-lock-body">
      <h2>Reach level ${lock.need} to open ${esc(name)}</h2>
      <p>You are level ${lock.level}, ${left === 1 ? "one level" : `${left} levels`} away. Opening packs, finishing quests and claiming achievements all earn XP.</p>
      <button type="button" class="gate-lock-link" data-acct-tab="levels">See your levels</button>
    </div>
  </aside>`;
}

/** Why a locked control did nothing. */
export const gateRefusal = (lock) => (lock ? gateMessage(lock.key) : "");
