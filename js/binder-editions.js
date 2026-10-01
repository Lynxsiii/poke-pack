/**
 * Animated binder covers: the markup for the fx layer and the one helper that
 * keeps its loops from running when nobody can see them.
 *
 *   binderFxHtml(editionId)   inner spans for .binder-cover > .binder-fx
 *                             (js/binder-object.js puts them there). "" for no
 *                             edition or an unknown id. Pure, no DOM.
 *   watchBinderFx(root?)      call after a render that may have drawn binders
 *                             (the /binder page, the public profile, the editor
 *                             preview). Returns nothing; safe to call again.
 *   EDITION_LAYERS            how many layer spans each edition draws.
 *
 * CSS lives in css/binder/editions.css (link it after css/binder/materials.css).
 * It keys on .binder-object[data-edition], so the attribute on the object is
 * the switch; nothing here sets it. Each layer is an <i class="fx-a|b|c">, at
 * most three per edition, and moves by transform, opacity or filter only.
 *
 * Idle rest. Every loop here is an infinite CSS animation on a layer, so
 * js/fx.js already freezes it (.fx-held) after 20s without input, when the
 * window loses focus or the tab is hidden. watchBinderFx adds the one thing
 * fx.js does not know about: a binder scrolled out of view. It toggles
 * .fx-paused on the .binder-fx element (css/theme.css pauses every descendant
 * animation under .fx-paused), with a small margin so a loop is already
 * running again when the binder scrolls in. Without IntersectionObserver the
 * loops simply keep running.
 *
 * Reduced motion and Settings > motion off (body.no-motion) are handled in the
 * CSS: the layers stop on a still pose that is part of the design.
 */

/** Layer spans per edition. Static art lives on .binder-fx and its pseudo-elements. */
export const EDITION_LAYERS = {
  aurora: 2,
  tide: 2,
  ember: 3,
  starfield: 3,
  prism: 3,
  holo: 2,
};

const LETTERS = ["a", "b", "c"];

export function binderFxHtml(editionId) {
  const count = Object.prototype.hasOwnProperty.call(EDITION_LAYERS, editionId) ? EDITION_LAYERS[editionId] : 0;
  let html = "";
  for (let i = 0; i < count; i += 1) html += `<i class="fx-${LETTERS[i]}"></i>`;
  return html;
}

let seen = new WeakSet();
let observer = null;

function ensureObserver() {
  if (observer || typeof IntersectionObserver === "undefined") return observer;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle("fx-paused", !entry.isIntersecting);
  }, { rootMargin: "120px 0px" });
  return observer;
}

export function watchBinderFx(root = document) {
  if (!root || !root.querySelectorAll) return;
  const io = ensureObserver();
  if (!io) return;
  const layers = root.matches?.(".binder-fx") ? [root] : [...root.querySelectorAll(".binder-fx")];
  for (const el of layers) {
    if (seen.has(el)) continue;
    seen.add(el);
    io.observe(el);
  }
}
