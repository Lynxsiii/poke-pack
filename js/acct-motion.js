// The account page's moving figures (css/pages/trainer-card.css, DESIGN.md
// Motion). Decoration only: the app writes the real number into the element
// first, and this only counts up to it. A figure marked data-roll="<n>" rolls
// from 0 when the page arrives, and from its last value when it changes in
// front of the player (a claim pays XP, a level is reached). Skipped under
// reduced motion and Settings > motion off.

const last = new Map();

const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("no-motion");

const fmt = (n) => Math.round(n).toLocaleString("en-US");

/**
 * Roll every [data-roll] figure under `root`. Each figure needs a stable
 * data-roll-key so its last value survives a repaint. `arriving` rolls from 0.
 */
export function rollFigures(root, { arriving = false } = {}) {
  if (!root) return;
  for (const el of root.querySelectorAll("[data-roll]")) {
    const to = Number(el.dataset.roll);
    const key = el.dataset.rollKey || "";
    if (!Number.isFinite(to)) continue;
    const from = arriving ? 0 : last.has(key) ? last.get(key) : to;
    last.set(key, to);
    if (from === to || still()) continue;
    const text = el.textContent;
    const start = performance.now();
    const dur = Math.min(900, 420 + Math.abs(to - from) * 6);
    el.classList.add("is-rolling");
    const step = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = text;
        el.classList.remove("is-rolling");
      }
    };
    requestAnimationFrame(step);
  }
}

/* ---- Bars that grow -------------------------------------------------------
   A fill marked data-grow-key="<key>" (the <i> inside an HP bar) remembers its
   width across repaints. When XP arrives in front of the player the fill grows
   from where it was instead of jumping; when a level is crossed it fills to the
   end, and the new level's fill grows from empty. Transform only. */
const lastPct = new Map();

export function growBars(root, { arriving = false } = {}) {
  if (!root) return;
  for (const el of root.querySelectorAll("[data-grow-key]")) {
    const key = el.dataset.growKey;
    const to = parseFloat(el.style.width) || 0;
    const had = lastPct.has(key);
    const from = lastPct.get(key);
    lastPct.set(key, to);
    if (arriving || !had || from === to || still() || typeof el.animate !== "function") continue;
    el.style.transformOrigin = "0 50%";
    if (to > from) {
      el.animate([{ transform: `scaleX(${Math.max(0, from / Math.max(to, 0.01))})` }, { transform: "scaleX(1)" }], {
        duration: 650, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards",
      });
    } else {
      // A level was crossed: the old bar topped out, the new one fills from empty.
      el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
        duration: 620, delay: 140, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards",
      });
      el.closest("[data-grow-up]")?.classList.add("is-levelling");
    }
  }
}

/* ---- Coins to the purse ---------------------------------------------------
   A claim sends a few coins from the button to the purse in the header, on a
   short arc, before the purse bumps (js/rotom.js). `from` is the claim button's
   rect, taken before the repaint replaced it. Decoration only. */
const COIN_SRC = "/assets/coins/pp-coin-v1.svg";

export function flyCoins(from, { count = 5 } = {}) {
  if (!from || still() || typeof document.body.animate !== "function") return;
  const purse = [...document.querySelectorAll(".balance")].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  });
  const to = purse?.querySelector(".coin-i")?.getBoundingClientRect() || purse?.getBoundingClientRect();
  if (!to) return;
  const x0 = from.left + from.width / 2;
  const y0 = from.top + from.height / 2;
  const x1 = to.left + to.width / 2;
  const y1 = to.top + to.height / 2;
  const n = Math.max(1, Math.min(6, count));
  for (let i = 0; i < n; i++) {
    const coin = document.createElement("img");
    coin.src = COIN_SRC;
    coin.alt = "";
    coin.className = "acct-fly-coin";
    coin.style.left = `${x0 - 11}px`;
    coin.style.top = `${y0 - 11}px`;
    document.body.append(coin);
    const spread = (i - (n - 1) / 2) * 14;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lift = Math.min(90, 40 + Math.abs(dy) * 0.18);
    const anim = coin.animate(
      [
        { transform: `translate(${spread * 0.4}px, 0) scale(0.6)`, opacity: 0 },
        { transform: `translate(${spread}px, -18px) scale(1.05)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${dx * 0.5 + spread * 0.5}px, ${dy * 0.5 - lift}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 0.2 },
      ],
      { duration: 620 + i * 40, delay: i * 45, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" }
    );
    anim.onfinish = anim.oncancel = () => coin.remove();
  }
}

/* ---- Picks that change ----------------------------------------------------
   Every repaint rebuilds the account page, so a chosen word's plate would grow
   in again on every claim. markPicks remembers what was chosen in each group and
   marks only a pick that changed with .rt-picked (the plate grows under it, a tile
   lands). It returns the set of attributes that changed. On a new tab (`quiet`)
   it only learns the tab's picks, apart from the tab word itself. */
const PICK_ATTRS = [
  "data-acct-tab", "data-quest-period", "data-ach-cat", "data-ach-filter", "data-mastery-era",
  "data-set-style", "data-set-avatar", "data-profile-color", "data-set-frame", "data-set-motion",
  "data-set-banner", "data-set-title", "data-banner-a", "data-banner-b",
];
const lastPick = new Map();

export function markPicks(root, { quiet = false } = {}) {
  const changed = new Set();
  if (!root) return changed;
  const seen = new Set();
  for (const el of root.querySelectorAll('.on, [aria-pressed="true"], [aria-current="true"], [aria-checked="true"]')) {
    const attr = PICK_ATTRS.find((name) => el.hasAttribute(name));
    if (!attr || el.closest(".tcard")) continue;
    const key = attr;
    if (seen.has(key)) continue;
    seen.add(key);
    const value = el.getAttribute(attr);
    const had = lastPick.has(key);
    const was = lastPick.get(key);
    lastPick.set(key, value);
    if (!had || was === value) continue;
    if (quiet && attr !== "data-acct-tab") continue;
    changed.add(attr);
    if (!still()) el.classList.add("rt-picked");
  }
  return changed;
}

/* The preview on the Look tab: when what it shows changes, it lands (a short
   settle), so a picked frame or banner is seen arriving on the card. */
let lastPreview = "";
export function landPreview(el, { quiet = false } = {}) {
  if (!el) {
    lastPreview = "";
    return;
  }
  const sig = el.innerHTML;
  const changed = lastPreview && lastPreview !== sig;
  lastPreview = sig;
  if (changed && !quiet && !still()) el.classList.add("is-landing");
}
