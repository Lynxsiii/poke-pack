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
