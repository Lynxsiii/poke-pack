/**
 * The side of levels that touches the page: what a new save earned, said once.
 *
 * app.js hands every save it adopts to `feed.adopt(save, userId)` (one call,
 * in applyCloudSave). The feed remembers the last summary it showed, works out
 * the XP gained since with js/level-ui.js, and
 *   - prints "+25 XP: 1 pack, 1 hit" in a toast of its own (it never replaces
 *     another message the site is showing),
 *   - or, if a level was gained, stamps a level-up card in with what it
 *     unlocked and one tap to the Levels tab,
 *   - and keeps the header's level readout current.
 *
 * Several saves in a row (a rip, then the sale of its cards) fold into one
 * message, and nothing is shown while a pack is being opened or a dialog is
 * up: it waits for the reveal to finish. The first save of a session, and the
 * first after signing in as someone else, set the baseline and say nothing.
 *
 * Motion lives in css/pages/levels.css and is off under body.no-motion.
 */
import { levelReadoutHtml, levelUpHtml, xpGain, xpOf } from "./level-ui.js";

const TOAST_MS = 3200;
const CARD_MS = 11000;
const SETTLE_MS = 450;
const RETRY_MS = 900;

/**
 * deps: { toast: the site's toast element (for stacking), readout: header node,
 *         isBusy(): a pack or dialog is up, openLevels(): jump to the tab,
 *         uiDeps: esc/num/gearName/gearArt for the builders }
 */
export function createXpFeed(deps) {
  let userId = null;
  let baseline = null; // the summary last reported
  let latest = null; // the summary of the newest save
  let timer = 0;
  let toastEl = null;
  let toastTimer = 0;
  let cardEl = null;
  let cardTimer = 0;

  function paintReadout(save) {
    const node = deps.readout;
    if (!node) return;
    if (!save) {
      node.classList.add("hidden");
      return;
    }
    const xp = latest || xpOf(save);
    // renderHeader runs on a timer: only touch the DOM when the readout changed.
    const html = levelReadoutHtml(xp, deps.uiDeps);
    if (node.dataset.painted !== html) {
      node.innerHTML = html;
      node.dataset.painted = html;
    }
    node.title = xp.maxed ? `Level ${xp.level}` : `Level ${xp.level}, ${xp.pct}% to level ${xp.level + 1}`;
    node.classList.remove("hidden");
  }

  function showToast(gain, xp) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast toast-xp";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    const head = `+${gain.xp.toLocaleString("en-US")} XP`;
    const rest = gain.list ? `: ${gain.list}` : "";
    const line = xp.maxed ? 100 : xp.pct;
    toastEl.innerHTML = `<span class="xp-toast-line"><b></b><span></span></span><span class="xp-toast-lv"><small>Level</small> ${xp.level}</span><span class="xp-toast-bar" aria-hidden="true"><i style="width:${line}%"></i></span>`;
    toastEl.querySelector("b").textContent = head;
    toastEl.querySelector(".xp-toast-line span").textContent = rest;
    // Sit above the site's own toast when it is showing, so neither hides the other.
    toastEl.classList.toggle("stacked", Boolean(deps.toast?.classList.contains("show")));
    // Restart the entrance when a second message follows the first.
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), TOAST_MS);
  }

  function closeCard() {
    clearTimeout(cardTimer);
    if (!cardEl) return;
    const el = cardEl;
    cardEl = null;
    el.classList.remove("show");
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 380);
  }

  function showCard(gain, xp) {
    closeCard();
    toastEl?.classList.remove("show");
    const el = document.createElement("section");
    el.className = "lv-up";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", `Level ${xp.level} reached`);
    el.innerHTML = levelUpHtml(gain, xp, deps.uiDeps);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-open-levels]")) {
        closeCard();
        deps.openLevels?.();
      } else if (e.target.closest("[data-levelup-close]")) {
        closeCard();
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeCard();
    });
    const arm = () => {
      clearTimeout(cardTimer);
      cardTimer = setTimeout(closeCard, CARD_MS);
    };
    el.addEventListener("pointerenter", () => clearTimeout(cardTimer));
    el.addEventListener("pointerleave", arm);
    el.addEventListener("focusin", () => clearTimeout(cardTimer));
    el.addEventListener("focusout", arm);
    document.body.appendChild(el);
    cardEl = el;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
    arm();
  }

  function flush() {
    timer = 0;
    if (!latest || !baseline) return;
    if (deps.isBusy?.()) {
      timer = setTimeout(flush, RETRY_MS);
      return;
    }
    const gain = xpGain(baseline, latest);
    baseline = latest;
    if (!gain) return;
    if (gain.levelUp) showCard(gain, latest);
    else showToast(gain, latest);
  }

  return {
    /** Every adopted save comes through here. `uid` is the signed-in account, or null. */
    adopt(save, uid) {
      if (!save) return;
      const xp = xpOf(save);
      if (uid !== userId || !baseline) {
        // A new session or a different account: remember where it starts, say nothing.
        userId = uid;
        baseline = xp;
        latest = xp;
        paintReadout(save);
        return;
      }
      latest = xp;
      paintReadout(save);
      if (xp.total < baseline.total) baseline = xp; // a sale lowered the worked-out total: nothing earned
      clearTimeout(timer);
      timer = setTimeout(flush, SETTLE_MS);
    },
    /** Signed out or switched: forget everything and hide the readout. */
    reset() {
      clearTimeout(timer);
      timer = 0;
      userId = null;
      baseline = null;
      latest = null;
      closeCard();
      toastEl?.classList.remove("show");
      paintReadout(null);
    },
    /** Repaint the header readout from the newest save (renderHeader calls this). */
    paint(save) {
      paintReadout(save);
    },
    closeCard,
  };
}
