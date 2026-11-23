/**
 * The first-run tour: three short steps for a new player, shown once per
 * browser on Home (Noah, 2026-11-23: "maybe also a tutorial for new players").
 * Each step rings one thing on the screen (whichever copy is visible: the
 * phone's tab bar or the laptop's header) and says what it does in a line.
 * Skip ends it; it never shows again unless the player asks for it from
 * Settings or the welcome screen (startTour()).
 *
 * Motion is opacity only. Nothing here touches cards, foils or the tear.
 */

const DONE_KEY = "pokepack.tour.done";

const STEPS = [
  {
    targets: ["#tab-rip", "#home-rip"],
    title: "Open a pack",
    body: "This opens the pack on show. Tear the top off, then flip your cards one by one. Every pack follows the real set's pull rates.",
  },
  {
    targets: ['.tabbar .nav-btn[data-view="collection"]', '.site-header .nav > .nav-btn[data-view="collection"]'],
    title: "Your cards are kept",
    body: "Everything you pull goes into Collection. Fill the set, sell spares for coins, and put your favourites in your Binder.",
  },
  {
    targets: ["#daily-btn", ".balance"],
    title: "Free coins every hour",
    body: "Packs cost coins, and you get more for free every hour. When Claim shows up here, press it.",
  },
  {
    targets: ["#hud-me", ".site-header .nav-more > summary"],
    title: "Everything else",
    body: "Pack battles, grading, sleeves, friends, trades and settings are all in this menu. That's it. Have fun!",
  },
];

const read = () => {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return true; // No storage (private mode): don't nag on every visit.
  }
};
const markDone = () => {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* nothing to keep it in */
  }
};

/** The first of a step's targets that is on screen. */
function visibleTarget(step) {
  for (const sel of step.targets) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

let root = null;
let at = 0;
let target = null;
let frame = 0;

function place() {
  if (!root) return;
  const ring = root.querySelector(".tour-ring");
  const card = root.querySelector(".tour-card");
  if (!target || !target.isConnected) target = visibleTarget(STEPS[at]);
  if (!target) {
    ring.hidden = true;
    return;
  }
  const r = target.getBoundingClientRect();
  const pad = 6;
  ring.hidden = false;
  ring.style.transform = `translate(${Math.round(r.left - pad)}px, ${Math.round(r.top - pad)}px)`;
  ring.style.width = `${Math.round(r.width + pad * 2)}px`;
  ring.style.height = `${Math.round(r.height + pad * 2)}px`;
  // The card sits on the side of the screen away from what it points at.
  const below = r.top + r.height / 2 < window.innerHeight / 2;
  card.classList.toggle("is-below", below);
  card.classList.toggle("is-above", !below);
}

function onMove() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(place);
}

function paint() {
  const step = STEPS[at];
  target = visibleTarget(step);
  // Bring the ringed thing into view if it is below the fold (Home's button on a laptop).
  if (target) {
    const r = target.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) target.scrollIntoView({ block: "center", behavior: "instant" });
  }
  const last = at === STEPS.length - 1;
  root.querySelector(".tour-card").innerHTML = `
    <p class="tour-step">${at + 1} of ${STEPS.length}</p>
    <h2 class="tour-h" id="tour-h">${step.title}</h2>
    <p class="tour-body">${step.body}</p>
    <div class="tour-actions">
      <button type="button" class="solid" data-tour-next>${last ? "Got it" : "Next"}</button>
      ${last ? "" : `<button type="button" class="text-btn" data-tour-skip>Skip the tour</button>`}
    </div>`;
  place();
  root.querySelector("[data-tour-next]")?.focus({ preventScroll: true });
}

function end() {
  markDone();
  if (!root) return;
  window.removeEventListener("resize", onMove);
  window.removeEventListener("scroll", onMove, true);
  document.removeEventListener("keydown", onKey, true);
  root.remove();
  root = null;
}

function onKey(e) {
  if (!root) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    end();
  }
}

/** Start the tour now (from Settings or the welcome screen too). */
export function startTour() {
  if (root) return;
  at = 0;
  root = document.createElement("div");
  root.className = "tour";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "false");
  root.setAttribute("aria-labelledby", "tour-h");
  root.innerHTML = `<div class="tour-ring" aria-hidden="true" hidden></div><div class="tour-card"></div>`;
  root.addEventListener("click", (e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest("[data-tour-skip]")) return end();
    if (e.target.closest("[data-tour-next]")) {
      if (at >= STEPS.length - 1) return end();
      at += 1;
      paint();
    }
  });
  document.body.append(root);
  window.addEventListener("resize", onMove);
  window.addEventListener("scroll", onMove, true);
  document.addEventListener("keydown", onKey, true);
  paint();
}

/**
 * Show the tour once to someone new: only on Home, only when nothing else is
 * open over the page. `ready()` says whether now is a good moment.
 */
export function maybeStartTour(ready) {
  if (read()) return;
  let tries = 0;
  const check = () => {
    if (read() || root) return;
    if (ready()) startTour();
    else if (++tries < 20) setTimeout(check, 1500);
  };
  setTimeout(check, 1400);
}

export function tourSeen() {
  return read();
}
