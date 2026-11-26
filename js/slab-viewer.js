/**
 * Turning a slab over in your hand (grading overhaul, 2026-11-26). Noah: "allow
 * users to rotate and look at slabs similar to a card".
 *
 * slabViewerHTML(slabMarkup) wraps a slab (drawn with slabHTML({ back: true }))
 * in a 3D stage: the case gets real thickness (a stack of edge rings behind the
 * front face) and the back face sits behind it. attachSlabViewers(root) wires
 * every stage in root:
 *
 *   - drag sideways to turn it; let go and it settles on the nearest face
 *   - drag up or down to tip it (full-screen viewer), or the finger's height
 *     tips it a little (in a page, where up and down still scroll)
 *   - a mouse just hovering leans it toward the pointer, like a card
 *   - [data-sv-flip] turns it over, [data-sv-full] opens the full-screen viewer
 *
 * While it moves, the card's own holo follows the angle (the same custom
 * properties js/card-motion.js drives), and the case's reflections and the
 * label's hologram seal slide with it (--sv-x, --sv-y on the slab). Transform
 * only. Styles: css/slab-viewer.css.
 */

const MAX_TIP = 32; // degrees around the horizontal axis
const HOVER_LEAN = 14;
const SLICES = 12;
const CARD_PROPS = [
  "--pointer-x", "--pointer-y", "--pointer-from-left", "--pointer-from-top", "--pointer-from-center",
  "--card-opacity", "--card-scale", "--rotate-x", "--rotate-y", "--background-x", "--background-y",
  "--mx", "--my", "--px", "--py", "--hyp", "--tilt-x", "--tilt-y",
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const reduced = () =>
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.body.classList.contains("no-motion");

/** The stage around a slab. `full` makes it the full-screen kind (drag tips both ways, page scroll is off). */
export function slabViewerHTML(slabMarkup, { full = false, guard = "" } = {}) {
  const rings = Array.from({ length: SLICES }, (_, i) => `<i style="--i:${i + 1}"></i>`).join("");
  return `<div class="sv${full ? " sv-full-stage" : ""}" data-sv>
    <div class="sv-rot"${guard ? ` data-guard="${guard}"` : ""}>
      <span class="sv-side" aria-hidden="true">${rings}</span>
      ${slabMarkup}
    </div>
  </div>`;
}

/** A small spring: position chases target. */
function spring(value = 0) {
  return { value, target: value, v: 0 };
}
function stepSpring(s, dt, k = 120, d = 18) {
  const a = (s.target - s.value) * k - s.v * d;
  s.v += a * dt;
  s.value += s.v * dt;
  if (Math.abs(s.target - s.value) < 0.02 && Math.abs(s.v) < 0.02) {
    s.value = s.target;
    s.v = 0;
    return false;
  }
  return true;
}

function bind(stage) {
  if (stage.__sv) return stage.__sv;
  const rot = stage.querySelector(".sv-rot");
  const slab = stage.querySelector(".slab");
  if (!rot || !slab) return null;
  const full = stage.classList.contains("sv-full-stage");
  const ry = spring(0); // turn, degrees; 0 front, 180 back
  const rx = spring(0); // tip, degrees
  let face = 0; // the face it rests on: a multiple of 180
  let drag = null;
  let frame = 0;
  let last = 0;
  let lit = false;

  const tcg = () => slab.querySelector(".slab-well .tcg");

  let showingBack = false;
  function paint() {
    rot.style.transform = `rotateX(${rx.value.toFixed(2)}deg) rotateY(${ry.value.toFixed(2)}deg)`;
    // How far off square it sits on its current side: drives the light.
    const side = ((ry.value % 360) + 540) % 360 - 180; // -180..180, 0 = front square on
    const fromFront = Math.abs(side) <= 90 ? side : side > 0 ? side - 180 : side + 180;
    // Which face is towards you, as a class too: a browser that can't keep 3D
    // (no compositing) would otherwise paint the back face over the front.
    const back = Math.abs(side) > 90;
    if (back !== showingBack) {
      showingBack = back;
      rot.classList.toggle("is-back", back);
    }
    const sx = clamp(fromFront / 40, -1, 1);
    const sy = clamp(rx.value / MAX_TIP, -1, 1);
    slab.style.setProperty("--sv-x", sx.toFixed(3));
    slab.style.setProperty("--sv-y", sy.toFixed(3));
    const card = tcg();
    if (!card) return;
    const moving = Math.abs(fromFront) > 0.3 || Math.abs(rx.value) > 0.3 || drag;
    if (!moving) {
      if (lit) {
        lit = false;
        card.classList.remove("lit");
        CARD_PROPS.forEach((p) => card.style.removeProperty(p));
      }
      return;
    }
    // The light as js/card-motion.js would place it for a card tilted this far.
    const x = clamp(0.5 - fromFront / 56, 0, 1);
    const y = clamp(0.5 + rx.value / 56, 0, 1);
    const hyp = Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2);
    const set = (n, v) => card.style.setProperty(n, String(v));
    set("--pointer-x", `${(x * 100).toFixed(2)}%`);
    set("--pointer-y", `${(y * 100).toFixed(2)}%`);
    set("--pointer-from-left", x.toFixed(4));
    set("--pointer-from-top", y.toFixed(4));
    set("--pointer-from-center", hyp.toFixed(4));
    set("--card-opacity", 1);
    set("--card-scale", 1);
    set("--background-x", `${(37 + x * 26).toFixed(2)}%`);
    set("--background-y", `${(33 + y * 34).toFixed(2)}%`);
    set("--mx", `${(x * 100).toFixed(2)}%`);
    set("--my", `${(y * 100).toFixed(2)}%`);
    set("--px", x.toFixed(4));
    set("--py", y.toFixed(4));
    set("--hyp", hyp.toFixed(4));
    // The case does the turning; the card itself stays flat in its well.
    for (const n of ["--rotate-x", "--rotate-y", "--tilt-x", "--tilt-y"]) set(n, "0deg");
    if (!lit) {
      lit = true;
      card.classList.add("lit");
    }
  }

  function tick(now) {
    frame = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (reduced() && !drag) {
      ry.value = ry.target;
      rx.value = rx.target;
      ry.v = rx.v = 0;
    } else {
      moving = stepSpring(ry, dt, drag ? 900 : 90, drag ? 60 : 15) || moving;
      moving = stepSpring(rx, dt, drag ? 900 : 110, drag ? 60 : 16) || moving;
    }
    paint();
    if (moving || drag) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  const run = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  function onDown(e) {
    if (e.button > 0) return;
    if (e.target.closest("button, a")) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ry: ry.target, rx: rx.target, type: e.pointerType, moved: false };
    stage.classList.add("is-dragging");
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable: moves still arrive while over the stage */
    }
    run();
  }
  function onMove(e) {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      ry.target = drag.ry + dx * (full ? 0.55 : 0.5);
      if (full || drag.type === "mouse") rx.target = clamp(drag.rx - dy * 0.4, -MAX_TIP, MAX_TIP);
      else {
        // In a page the finger's height tips it a little; up and down stay the page's scroll.
        const box = stage.getBoundingClientRect();
        rx.target = clamp(((e.clientY - box.top) / box.height - 0.5) * -24, -12, 12);
      }
      run();
      return;
    }
    if (!drag && e.pointerType === "mouse") {
      // Hovering: lean toward the pointer, the way a card does.
      const box = stage.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      const y = (e.clientY - box.top) / box.height - 0.5;
      ry.target = face + clamp(x, -0.5, 0.5) * 2 * HOVER_LEAN;
      rx.target = clamp(-y * 2 * HOVER_LEAN * 0.8, -MAX_TIP, MAX_TIP);
      run();
    }
  }
  function settle() {
    // Rest on whichever face is nearer.
    face = Math.round(ry.target / 180) * 180;
    ry.target = face;
    rx.target = 0;
    run();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stage.classList.remove("is-dragging");
    settle();
  }
  function onLeave(e) {
    if (drag || e.pointerType !== "mouse") return;
    settle();
  }

  // The card art is an <img>: a native image drag would cancel the pointer as soon as it moves.
  const noDrag = (e) => e.preventDefault();
  stage.addEventListener("dragstart", noDrag);
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove, { passive: true });
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
  stage.addEventListener("pointerleave", onLeave);

  const api = {
    flip() {
      face = Math.round(ry.target / 180) * 180 + 180;
      ry.target = face;
      rx.target = 0;
      // A little lift at the start of the turn, so it reads as picked up.
      if (!reduced()) rx.v = -60;
      run();
      return api.isBack();
    },
    isBack: () => Math.round(face / 180) % 2 !== 0,
    destroy() {
      cancelAnimationFrame(frame);
      stage.removeEventListener("dragstart", noDrag);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointerleave", onLeave);
      delete stage.__sv;
    },
  };
  stage.__sv = api;
  paint();
  return api;
}

/** Wire every slab stage in root. Returns the controllers. */
export function attachSlabViewers(root) {
  return [...root.querySelectorAll("[data-sv]")].map(bind).filter(Boolean);
}

/** Turn the stage over; returns true when it now shows its back. */
export function flipSlab(stage) {
  return bind(stage)?.flip() ?? false;
}

let fullSheet = null;
/** The full-screen viewer: the slab big on the dark stage, turned with a finger in any direction. */
export function openSlabFullscreen(slabMarkup, { title = "Slab", guard = "" } = {}) {
  closeSlabFullscreen();
  const sheet = document.createElement("div");
  sheet.className = "sv-sheet rt-dark";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", title);
  sheet.innerHTML = `<div class="sv-sheet-body">
      ${slabViewerHTML(slabMarkup, { full: true, guard })}
      <p class="sv-hint">Drag to turn it over</p>
      <div class="sv-sheet-keys">
        <button type="button" class="ghost sm" data-sv-flip>Turn over</button>
        <button type="button" class="solid sm" data-sv-close>Done</button>
      </div>
    </div>`;
  const prevFocus = document.activeElement;
  document.body.appendChild(sheet);
  document.body.classList.add("sv-open");
  const stage = sheet.querySelector("[data-sv]");
  const ctl = bind(stage);
  const close = () => closeSlabFullscreen();
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
      if (e.target.closest?.("button") && e.key === " ") return;
      e.preventDefault();
      ctl?.flip();
    }
  };
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-sv-close]") || e.target === sheet) close();
    else if (e.target.closest("[data-sv-flip]")) ctl?.flip();
  });
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => sheet.classList.add("is-in"));
  sheet.querySelector("[data-sv-close]")?.focus({ preventScroll: true });
  fullSheet = { sheet, ctl, onKey, prevFocus };
}

export function closeSlabFullscreen() {
  if (!fullSheet) return;
  const { sheet, ctl, onKey, prevFocus } = fullSheet;
  fullSheet = null;
  ctl?.destroy();
  document.removeEventListener("keydown", onKey);
  document.body.classList.remove("sv-open");
  sheet.remove();
  prevFocus?.focus?.({ preventScroll: true });
}
