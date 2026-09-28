/* poke-pack.rip — tearing the foil off a booster.

   The wrapper is one image drawn twice. The moment a tear starts, the body
   (#pack-rest-art) is clipped to everything below a jagged tear line, and the
   strip above the line is rebuilt as a row of narrow slices of the same art,
   each sitting exactly where the body used to draw it, so the pack still
   looks whole. As the finger passes a slice it comes loose and joins the lid:
   one continuous piece of foil that hangs off the tear front and lifts away
   from the pack in a smooth bend, the way a stiff strip does when you peel
   it back. Nothing flutters or curls on its own; the lid only answers the
   finger (how fast it moves and how high it rises) and settles when it
   stops. When the tear runs through, the whole lid flips off the pack and
   fades, flashing its silver inside once. Only transforms and opacity change
   per frame; the body never repaints while the tear runs, and the slices
   exist only during a tear.

   Coordinates: the lid lives in "tear space", u px along the tear from the
   corner it started at, y px down from the pack's top. A right-to-left rip
   mirrors u onto the screen. */

const STRIP_H = 12.5; // slice box height, % of pack height
const LINE_AT = 7.6; // where the tear line wanders, % of pack height
const AXIS_AT = 3.9; // the strip's centreline, which the lid bends along, % of pack height
const BELOW = 0.45; // slices reach this far under the line so no seam shows, % of pack height
const SIDE = 0.2; // slices overlap their neighbours by this fraction of a slice, hiding the joints as the lid bends
const DONE_AT = 0.45; // let go past this and the pack finishes tearing itself
const AUTO_AT = 0.94; // dragging this far finishes it too
const ZIP = 2400; // how fast the front catches up with the finger, px/s
const LIFT_DEG = 28; // how far the lid stands off the pack at its free end, degrees
const LIFT_FINGER = 30; // extra degrees when the finger rises above the pack top
const LIFT_SPEED = 10; // extra degrees while the finger is moving fast
const BEND = 0.3; // the bend happens over this fraction of the pack width behind the front
const TILT = 0.35; // how much the lid also tips towards the viewer, per degree of lift
const WAVE_DEG = 2.5; // a faint ripple running down the lid while the finger moves
const SPRING_K = 110; // how eagerly the lid follows the finger's lift...
const SPRING_D = 13; // ...and how quickly it stops swinging
const RIM_PX = 0.9; // the pale inner foil showing along a loose slice's torn edge

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2);
const DEG = 180 / Math.PI;

/** A fresh tear line per pack: a slow wander with a rough edge and the odd snag, never a regular zigzag. */
function buildLine() {
  const pts = [];
  let x = 0;
  let wander = 0;
  let drift = 0;
  while (x < 100) {
    drift = clamp(drift + (Math.random() - 0.5) * 0.5, -0.45, 0.45);
    wander = clamp(wander + drift, -1.4, 1.4);
    let rough = (Math.random() - 0.5) * 0.5;
    if (Math.random() < 0.1) rough += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9);
    pts.push([x, clamp(LINE_AT + wander + rough, 4.8, 10.6)]);
    x += 0.7 + Math.random() * (Math.random() < 0.25 ? 4 : 1.8);
  }
  pts.push([100, clamp(LINE_AT + wander * 0.6, 5, 10)]);
  return pts;
}

function lineY(line, x) {
  const t = clamp(x, 0, 100);
  for (let i = 0; i < line.length - 1; i += 1) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    if (t >= x0 && t <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
  }
  return line[line.length - 1][1];
}

/** The tear line between two pack x positions, walking from `from` to `to`. */
function lineBetween(line, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const mids = line.filter(([x]) => x > lo + 1e-6 && x < hi - 1e-6);
  if (from > to) mids.reverse();
  return [[from, lineY(line, from)], ...mids, [to, lineY(line, to)]];
}

const pct = (n) => `${n.toFixed(3)}%`;
const polygon = (pts) => `polygon(${pts.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ")})`;

/**
 * @param {object} o
 * @param {HTMLElement} o.booster  #pack-body, the box the pack art fills
 * @param {HTMLElement} o.art      #pack-rest-art, the body copy of the wrapper
 * @param {HTMLElement} o.strip    the empty container the lid is built in
 * @param {SVGPathElement} o.edge  bright torn-foil rim along the line
 * @param {SVGPathElement} o.shade shadow under that rim
 * @param {HTMLElement} o.glints   container for the foil flecks and the spark at the front
 * @param {() => boolean} o.fxOn   false under the no-motion setting or reduced motion
 * @param {(pattern: number|number[]) => void} [o.buzz]
 */
export function createTear({ booster, art, strip, edge, shade, glints, fxOn, buzz }) {
  let line = buildLine();
  let W = 0;
  let H = 0;
  let dir = null; // "right" | "left"
  let phase = "idle"; // idle | drag | back | finish | toss
  let front = 0; // the tear front, tear-space px
  let target = 0; // where the finger says the front should be
  let lift = 0; // how far above the strip's centreline the finger is, px
  let start = { x: 0, y: 0 };
  let rect = null;
  let N = 0; // slice count
  let seg = 0; // slice width, px
  let cy = 0; // the lid's resting height, px
  let slices = [];
  let free = 0; // slices torn loose, counted from the start corner
  let lid = null; // the element the loose slices hang in
  let spark = null; // the hot point riding the tear front
  let raf = 0;
  let last = 0;
  let clock = 0;
  let speed = 0; // recent front speed, px/s
  let amp = 0; // how far the lid is lifting right now, degrees at the free end
  let ampV = 0; // ...and how fast that is changing
  let ampHold = false; // easing back: the lid flattens instead of chasing the finger
  let anim = null; // { from, to, t0, dur, ease }
  let hooks = {};
  let tossEnd = 0;
  let ticks = 0;
  let sparkOn = -1;

  const fx = () => fxOn();

  /* ---- Geometry ---------------------------------------------------------- */

  function measure() {
    rect = booster.getBoundingClientRect();
    W = rect.width || 270;
    H = rect.height > 10 ? rect.height : W * 1.83;
    cy = (AXIS_AT / 100) * H;
  }

  const toU = (clientX) => (dir === "left" ? rect.right - clientX : clientX - rect.left);
  const uToPackPct = (u) => (dir === "left" ? 100 - (u / W) * 100 : (u / W) * 100);
  const uToX = (u) => (dir === "left" ? W - u : u);

  function artUrl() {
    const img = art.querySelector("img");
    return img?.currentSrc || img?.src || "";
  }

  function buildSlices() {
    N = clamp(Math.round(W / 14), 12, 20);
    seg = W / N;
    const url = artUrl();
    lid = document.createElement("div");
    lid.className = "tear-lid";
    slices = [];
    for (let k = 0; k < N; k += 1) {
      const u0 = k * seg;
      const u1 = (k + 1) * seg;
      const X0 = dir === "left" ? 100 - (u1 / W) * 100 : (u0 / W) * 100;
      const X1 = dir === "left" ? 100 - (u0 / W) * 100 : (u1 / W) * 100;
      const w = X1 - X0;
      const E0 = Math.max(0, X0 - w * SIDE);
      const E1 = Math.min(100, X1 + w * SIDE);
      const ew = E1 - E0;
      const local = (x) => ((x - E0) / ew) * 100;
      const cut = lineBetween(line, E1, E0).map(([x, y]) => [local(x), ((y + BELOW) / STRIP_H) * 100]);
      const rim = (RIM_PX / ((H * STRIP_H) / 100)) * 100;
      const frontClip = polygon([[0, 0], [100, 0], ...cut]);
      const artClip = polygon([[0, 0], [100, 0], ...cut.map(([x, y]) => [x, y - rim])]);
      const backClip = polygon([[0, 100], [100, 100], ...cut.map(([x, y]) => [x, 100 - y])]);

      const el = document.createElement("div");
      el.className = "tear-slice";
      el.style.left = pct(E0);
      el.style.width = pct(ew);
      el.style.height = pct(STRIP_H);
      el.style.transformOrigin = `${pct(local((X0 + X1) / 2))} ${pct((AXIS_AT / STRIP_H) * 100)}`;
      el.innerHTML = `<div class="ts-face ts-front" style="clip-path:${frontClip}"><div class="ts-clip" style="clip-path:${artClip}"><div class="ts-art" style="left:${pct(
        (-E0 / ew) * 100
      )};width:${pct((100 / ew) * 100)};height:${pct((100 / STRIP_H) * 100)};background-image:url(&quot;${url}&quot;)"></div></div></div><div class="ts-face ts-back" style="clip-path:${backClip}"></div>`;
      lid.appendChild(el);
      slices.push({ el, front: el.firstElementChild, u0, u1, mid: (u0 + u1) / 2, freed: false, sheen: -1 });
    }
    strip.textContent = "";
    strip.appendChild(lid);
    strip.style.setProperty("--away", dir === "left" ? "-1" : "1");
    strip.classList.add("on");
    if (glints && fx()) {
      spark = document.createElement("i");
      spark.className = "tear-spark";
      glints.appendChild(spark);
      sparkOn = -1;
    }
  }

  function clipBody() {
    const cut = lineBetween(line, 0, 100);
    art.style.clipPath = polygon([...cut, [100, 100], [0, 100]]);
  }

  function drawEdge() {
    const cut = dir === "left" ? lineBetween(line, 100, 0) : lineBetween(line, 0, 100);
    const d = cut.map(([x, y], i) => `${i ? "L" : "M"}${((x / 100) * W).toFixed(2)} ${((y / 100) * H).toFixed(2)}`).join(" ");
    const svg = edge.ownerSVGElement;
    svg?.setAttribute("viewBox", `0 0 ${W.toFixed(2)} ${H.toFixed(2)}`);
    edge.setAttribute("d", d);
    shade.setAttribute("d", d);
    shade.setAttribute("transform", `translate(0 ${(H * 0.004).toFixed(2)})`);
    revealEdge();
  }

  function revealEdge() {
    const off = `${(100 - (front / W) * 100).toFixed(2)}`;
    edge.style.strokeDashoffset = off;
    shade.style.strokeDashoffset = off;
  }

  function setDir(d) {
    dir = d;
    if (!rect) measure();
    buildSlices();
    clipBody();
    drawEdge();
    free = 0;
    amp = 0;
    ampV = 0;
    ampHold = false;
    booster.classList.toggle("tear-from-left", dir === "left");
    booster.classList.toggle("tear-from-right", dir === "right");
  }

  /* ---- The lid ------------------------------------------------------------ */

  function detachUpTo(u) {
    while (free < N && slices[free].u1 <= u + 0.01) {
      const s = slices[free];
      s.freed = true;
      s.el.classList.add("free");
      s.front.style.setProperty("--rim", "1");
      free += 1;
      ticks += 1;
      if (fx() && Math.random() < 0.4) fleck(u, lineY(line, uToPackPct(u)), false);
      if (ticks % 3 === 0 && phase === "drag") buzz?.(3);
    }
  }

  /** Easing back: slices the retreating front has passed sit down again. */
  function reattachAbove(u) {
    while (free > 0 && slices[free - 1].u1 > u + 0.01) {
      free -= 1;
      const s = slices[free];
      s.freed = false;
      s.sheen = -1;
      s.el.classList.remove("free");
      s.el.style.transform = "";
      s.el.style.opacity = "";
      s.el.style.setProperty("--sheen", "0");
      s.front.style.setProperty("--rim", "0");
    }
  }

  /** The lid's lift follows the finger with a little spring in it. */
  function settle(dt) {
    const fast = clamp(speed / 900, 0, 1);
    const high = clamp(lift / (H * 0.3), 0, 1);
    const want = ampHold ? 0 : LIFT_DEG + LIFT_FINGER * high + LIFT_SPEED * fast;
    const h = Math.min(dt, 1 / 30);
    ampV += (want - amp) * SPRING_K * h - ampV * SPRING_D * h;
    amp += ampV * h;
    if (ampHold) amp = Math.max(0, amp);
  }

  function render() {
    const motion = fx();
    const wave = (WAVE_DEG * clamp(speed / 700, 0, 1)) / DEG;
    const L = BEND * W;
    const A = amp / DEG;
    const bendAt = (s) => A * (1 - Math.exp(-s / L)) + wave * Math.sin(s * (Math.PI * 2 / (0.7 * W)) - clock * 0.01);
    const step = seg / 3;
    let a = 0; // arc length walked back from the front...
    let x = front; // ...and where that lands, tear space
    let y = cy;
    for (let k = free - 1; k >= 0; k -= 1) {
      const s = slices[k];
      if (!motion) {
        s.el.style.opacity = "0";
        continue;
      }
      const sk = front - s.u1;
      while (a < sk - 1e-6) {
        const h = Math.min(step, sk - a);
        const p = bendAt(a + h / 2);
        x -= Math.cos(p) * h;
        y -= Math.sin(p) * h;
        a += h;
      }
      const p = bendAt(sk + seg / 2);
      const cxk = x - (Math.cos(p) * seg) / 2;
      const cyk = Math.min(y - (Math.sin(p) * seg) / 2, cy + 2);
      x -= Math.cos(p) * seg;
      y -= Math.sin(p) * seg;
      a = sk + seg;
      const deg = p * DEG;
      const tx = uToX(cxk) - uToX(s.mid);
      const ty = cyk - cy;
      const rz = dir === "left" ? -deg : deg;
      const rx = -TILT * deg;
      s.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${rz.toFixed(2)}deg) rotateX(${rx.toFixed(1)}deg)`;
      // A band of light travels along the lid as each part of it tips through the same angle.
      const g = (deg - 26) / 16;
      const sheen = Math.round((0.22 * Math.exp(-g * g) + 0.05 * clamp(-ty / 40, 0, 1)) * 40) / 40;
      if (sheen !== s.sheen) {
        s.sheen = sheen;
        s.el.style.setProperty("--sheen", String(sheen));
      }
    }
    revealEdge();
    if (spark) {
      const on = phase === "drag" || phase === "finish" ? Math.round(clamp(speed / 500, 0, 1) * 10) / 10 : 0;
      spark.style.transform = `translate3d(${uToX(front).toFixed(1)}px, ${((lineY(line, uToPackPct(front)) / 100) * H).toFixed(1)}px, 0)`;
      if (on !== sparkOn) {
        sparkOn = on;
        spark.style.opacity = String(on);
      }
    }
  }

  function fleck(u, yPct, strong) {
    if (!glints) return;
    const away = dir === "left" ? -1 : 1;
    const count = strong ? 14 : 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const at = clamp(uToPackPct(u) + (Math.random() - 0.5) * (strong ? 40 : 6), 0, 100);
      const bit = document.createElement("i");
      bit.className = "glint";
      bit.style.left = pct(at);
      bit.style.top = pct(yPct - 0.5 + Math.random() * 1.2);
      bit.style.setProperty("--s", `${(1.6 + Math.random() * (strong ? 2.6 : 1.4)).toFixed(1)}px`);
      bit.style.setProperty("--gx", `${(away * (8 + Math.random() * (strong ? 120 : 22)) + (Math.random() - 0.5) * 24).toFixed(0)}px`);
      bit.style.setProperty("--gy", `${(-6 - Math.random() * (strong ? 90 : 30)).toFixed(0)}px`);
      bit.style.setProperty("--rot", `${((Math.random() - 0.5) * 540).toFixed(0)}deg`);
      bit.style.setProperty("--dly", `${(Math.random() * (strong ? 90 : 30)).toFixed(0)}ms`);
      bit.addEventListener("animationend", () => bit.remove());
      frag.appendChild(bit);
    }
    glints.appendChild(frag);
  }

  /* ---- Frame loop --------------------------------------------------------- */

  function loop() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    clock = now;
    const was = front;

    let animT = 1;
    if (phase === "drag") {
      front += clamp(target - front, 0, ZIP * dt);
    } else if (anim) {
      animT = clamp((now - anim.t0) / anim.dur, 0, 1);
      front = anim.from + (anim.to - anim.from) * anim.ease(animT);
      if (animT >= 1) anim = null;
    }
    front = clamp(front, 0, W);
    const v = Math.abs(front - was) / Math.max(dt, 1e-3);
    speed += (v - speed) * 0.25;

    if (phase === "back") {
      reattachAbove(front);
      settle(dt);
      render();
      if (animT < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const done = hooks.onBack;
      clear();
      done?.();
      return;
    }

    detachUpTo(front);
    if (phase === "toss") {
      if (now >= tossEnd) {
        finishToss();
        return;
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    settle(dt);
    render();
    if (phase === "finish" && front >= W - 0.01) {
      beginToss(now);
      raf = requestAnimationFrame(frame);
      return;
    }
    // While the finger is down the lid keeps answering it; without motion there is nothing to draw between moves.
    const busy = phase === "finish" || (phase === "drag" && (Math.abs(target - front) > 0.05 || (free > 0 && fx())));
    if (busy) raf = requestAnimationFrame(frame);
  }

  function beginToss(now) {
    phase = "toss";
    free = N;
    if (spark) spark.style.opacity = "0";
    if (fx()) fleck(W, lineY(line, uToPackPct(W)), true);
    strip.classList.add("toss");
    tossEnd = now + (fx() ? 440 : 30);
    hooks.onRipped?.();
  }

  function finishToss() {
    stop();
    phase = "idle";
    hooks.onDone?.();
  }

  /* ---- Clearing ------------------------------------------------------------ */

  function clear() {
    stop();
    phase = "idle";
    anim = null;
    dir = null;
    front = 0;
    target = 0;
    lift = 0;
    speed = 0;
    amp = 0;
    ampV = 0;
    ampHold = false;
    free = 0;
    ticks = 0;
    slices = [];
    lid = null;
    spark = null;
    sparkOn = -1;
    rect = null;
    strip.textContent = "";
    strip.classList.remove("on", "toss");
    art.style.clipPath = "";
    edge.setAttribute("d", "");
    shade.setAttribute("d", "");
    edge.style.strokeDashoffset = "100";
    shade.style.strokeDashoffset = "100";
    if (glints) glints.textContent = "";
    booster.classList.remove("tear-from-left", "tear-from-right");
  }

  /* ---- Public ------------------------------------------------------------- */

  return {
    /** A new pack on the table: fresh tear line, nothing torn. */
    newPack() {
      clear();
      line = buildLine();
    },
    reset: clear,
    begin(e) {
      if (phase !== "idle" && phase !== "back") return;
      clear();
      measure();
      phase = "drag";
      start = { x: e.clientX, y: e.clientY };
    },
    move(e) {
      if (phase !== "drag") return;
      if (!dir) {
        const dx = e.clientX - start.x;
        if (Math.abs(dx) < 5) return;
        setDir(dx > 0 ? "right" : "left");
      }
      target = clamp(toU(e.clientX), 0, W);
      lift = clamp(cy - (e.clientY - rect.top), 0, H * 0.35);
      loop();
    },
    /** True once the first few pixels of drag have picked a direction. */
    started: () => Boolean(dir),
    progress: () => (W ? front / W : 0),
    tornEnough: () => W > 0 && front / W >= DONE_AT,
    tornThrough: () => W > 0 && front / W >= AUTO_AT,
    /** The finger let go early: the lid lies back down and the tear heals. */
    easeBack(done) {
      if (phase !== "drag") return;
      hooks = { onBack: done };
      if (!dir || front < 1 || !fx()) {
        clear();
        done?.();
        return;
      }
      phase = "back";
      ampHold = true;
      ampV = Math.min(ampV, 0);
      anim = { from: front, to: 0, t0: performance.now(), dur: 300, ease: easeIn };
      last = 0;
      loop();
    },
    /** Finish the rip: run the tear across, then throw the lid clear. */
    complete({ onRipped, onDone } = {}) {
      if (phase === "finish" || phase === "toss") return;
      if (phase !== "drag") {
        clear();
        measure();
      }
      if (!dir) setDir("right");
      hooks = { onRipped, onDone };
      phase = "finish";
      ampHold = false;
      const left = 1 - front / W;
      anim = { from: front, to: W, t0: performance.now(), dur: fx() ? 170 + 360 * left : 120, ease: easeOut };
      last = 0;
      loop();
    },
  };
}
