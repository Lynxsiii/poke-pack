/* poke-pack.rip — tearing the foil off a booster.

   The wrapper is one image drawn twice. The moment a tear starts, the body
   (#pack-rest-art) is clipped to everything below a jagged tear line, and the
   strip above the line is rebuilt as a row of narrow slices of the same art,
   each sitting exactly where the body used to draw it, so the pack still
   looks whole. As the finger passes a slice it comes loose and joins a short
   rope (a Verlet chain with one point per slice edge) that hangs off the tear
   front, curls up the way foil does, and twists to flash its silver inside.
   Only transforms, opacity and filter change per frame; the body never
   repaints while the tear runs, and the slices exist only during a tear.

   Coordinates: the rope lives in "tear space", u px along the tear from the
   corner it started at, y px down from the pack's top. A right-to-left rip
   mirrors u onto the screen. */

const STRIP_H = 12.5; // slice box height, % of pack height
const LINE_AT = 7.6; // where the tear line wanders, % of pack height
const AXIS_AT = 3.9; // the strip's centreline, which the rope follows, % of pack height
const BELOW = 0.45; // slices reach this far under the line so no seam shows, % of pack height
const SIDE = 0.06; // slices overlap their neighbours by this fraction of a slice
const DONE_AT = 0.45; // let go past this and the pack finishes tearing itself
const AUTO_AT = 0.94; // dragging this far finishes it too
const ZIP = 2400; // how fast the front catches up with the finger, px/s
const ROOT_ANGLE = (236 * Math.PI) / 180; // the strip leaves the front up and back
const CURL = 8; // degrees each slice turns further round the curl...
const CURL_GROW = 0.8; // ...tightening towards the tip
const SHAPE_K = 0.11; // how eagerly the strip returns to that curl
const RIM_PX = 0.9; // the pale inner foil showing along a loose slice's torn edge

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2);
const DEG = 180 / Math.PI;

/** A fresh tear line per pack: a slow wander with fine teeth and the odd snag. */
function buildLine() {
  const pts = [];
  let x = 0;
  let wander = 0;
  let up = Math.random() < 0.5;
  while (x < 100) {
    wander = clamp(wander + (Math.random() - 0.5) * 0.9, -1.3, 1.3);
    let tooth = (up ? -1 : 1) * (0.12 + Math.random() * 0.5);
    if (Math.random() < 0.14) tooth *= 2.2 + Math.random() * 1.6;
    pts.push([x, clamp(LINE_AT + wander + tooth, 4.6, 10.8)]);
    x += 1.2 + Math.random() * (Math.random() < 0.3 ? 6 : 2.6);
    up = !up;
  }
  pts.push([100, clamp(LINE_AT + wander * 0.5, 5, 10)]);
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
 * @param {HTMLElement} o.strip    the empty container the slices are built in
 * @param {SVGPathElement} o.edge  bright torn-foil rim along the line
 * @param {SVGPathElement} o.shade shadow under that rim
 * @param {HTMLElement} o.glints   container for the foil flecks
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
  let lift = 0; // how far above the strip the finger is, px
  let start = { x: 0, y: 0 };
  let rect = null;
  let N = 0; // slice count
  let seg = 0; // slice width, px
  let cy = 0; // the rope's resting height, px
  let slices = [];
  let pts = []; // rope points, one per slice boundary (N + 1)
  let free = 0; // slices torn loose, counted from the start corner
  let loose = false; // the whole strip has left the pack
  let raf = 0;
  let last = 0;
  let clock = 0;
  let speed = 0; // recent front speed, px/s, drives the flutter
  let anim = null; // { from, to, t0, dur, ease }
  let hooks = {};
  let poses = null; // snapshot of slice poses while easing back
  let tossEnd = 0;
  let ticks = 0;

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

  function artUrl() {
    const img = art.querySelector("img");
    return img?.currentSrc || img?.src || "";
  }

  function buildSlices() {
    N = clamp(Math.round(W / 15), 9, 18);
    seg = W / N;
    const url = artUrl();
    const frag = document.createDocumentFragment();
    slices = [];
    pts = [];
    for (let k = 0; k <= N; k += 1) pts.push({ x: k * seg, y: cy, px: k * seg, py: cy });
    for (let k = 0; k < N; k += 1) {
      const u0 = k * seg;
      const u1 = (k + 1) * seg;
      const X0 = dir === "left" ? 100 - (u1 / W) * 100 : (u0 / W) * 100;
      const X1 = dir === "left" ? 100 - (u0 / W) * 100 : (u1 / W) * 100;
      const w = X1 - X0;
      const E0 = Math.max(0, X0 - w * SIDE);
      const E1 = Math.min(100, X1 + w * SIDE);
      const ew = E1 - E0;
      const hinge = dir === "left" ? X1 : X0;
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
      el.style.transformOrigin = `${pct(local(hinge))} ${pct((AXIS_AT / STRIP_H) * 100)}`;
      el.innerHTML = `<div class="ts-face ts-front" style="clip-path:${frontClip}"><div class="ts-clip" style="clip-path:${artClip}"><div class="ts-art" style="left:${pct(
        (-E0 / ew) * 100
      )};width:${pct((100 / ew) * 100)};height:${pct((100 / STRIP_H) * 100)};background-image:url(&quot;${url}&quot;)"></div></div></div><div class="ts-face ts-back" style="clip-path:${backClip}"></div>`;
      frag.appendChild(el);
      slices.push({ el, front: el.firstElementChild, u0, u1, freed: false, sheen: -1 });
    }
    strip.textContent = "";
    strip.appendChild(frag);
    strip.classList.add("on");
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
    shade.setAttribute("transform", `translate(0 ${(H * 0.0045).toFixed(2)})`);
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
    loose = false;
    booster.classList.toggle("tear-from-left", dir === "left");
    booster.classList.toggle("tear-from-right", dir === "right");
  }

  /* ---- Rope --------------------------------------------------------------- */

  function detachUpTo(u) {
    while (free < N && slices[free].u1 <= u + 0.01) {
      const s = slices[free];
      s.freed = true;
      s.el.classList.add("free");
      s.front.style.setProperty("--rim", "1");
      const p = pts[free];
      // A small flick as the foil lets go, more when the finger is moving fast.
      const kick = 0.6 + clamp(speed / 600, 0, 1);
      p.px = p.x + 40 * kick * (1 / 60);
      p.py = p.y + 150 * kick * (1 / 60);
      free += 1;
      ticks += 1;
      if (fx() && Math.random() < 0.45) fleck(u, lineY(line, uToPackPct(u)), false);
      if (ticks % 3 === 0 && phase === "drag") buzz?.(3);
    }
  }

  function step(dt) {
    if (!fx()) return;
    const sub = 2;
    const h = dt / sub;
    const damp = Math.exp(-h * (loose ? 1.4 : 7));
    const end = loose ? N : free;
    for (let s = 0; s < sub; s += 1) {
      for (let k = 0; k <= end; k += 1) {
        if (!loose && k >= free) continue;
        const p = pts[k];
        const vx = (p.x - p.px) * damp;
        const vy = (p.y - p.py) * damp;
        p.px = p.x;
        p.py = p.y;
        p.x += vx + (loose ? 260 : 0) * h * h;
        p.y += vy + (loose ? -1000 : 0) * h * h;
      }
      if (!loose && free > 0) {
        // Foil remembers being rolled: the strip stands up off the tear front
        // and spirals back behind the finger, which lifts the root when it
        // rises off the crimp. Each point chases its place on that spiral.
        const pin = pts[free];
        let ang = ROOT_ANGLE;
        let tx = pin.x;
        let ty = pin.y - lift * 0.8;
        for (let j = 1; j <= free; j += 1) {
          tx += Math.cos(ang) * seg;
          ty += Math.sin(ang) * seg;
          const p = pts[free - j];
          p.x += (tx - p.x) * SHAPE_K;
          p.y += (ty - p.y) * SHAPE_K;
          ang -= (CURL + CURL_GROW * j) / DEG;
        }
      }
      for (let it = 0; it < 3; it += 1) {
        // Slices keep their width.
        for (let k = 0; k < end; k += 1) {
          const a = pts[k];
          const b = pts[k + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const diff = (dist - seg) / dist;
          const bPinned = !loose && k + 1 >= free;
          if (bPinned) {
            a.x += dx * diff;
            a.y += dy * diff;
          } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
          }
        }
      }
      // The strip can rest on the pack but not sink into it.
      if (!loose) {
        for (let k = 0; k < free; k += 1) {
          const p = pts[k];
          if (p.y > cy + 3) {
            p.y = cy + 3;
            p.py = p.y + (p.py - p.y) * 0.3;
          }
        }
      }
    }
  }

  function render() {
    const motion = fx();
    const flutter = (4 + 18 * clamp(speed / 700, 0, 1) + (loose ? 40 : 0)) * Math.sin(clock * 0.011);
    const roll = loose ? 200 : 58 * clamp((free - 1) / 6, 0, 1);
    const end = loose ? N : free;
    for (let k = 0; k < end; k += 1) {
      const s = slices[k];
      if (!motion) {
        s.el.style.opacity = "0";
        continue;
      }
      const p = pts[k];
      const q = pts[k + 1];
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * DEG;
      const rotZ = dir === "left" ? -ang : ang;
      const tx = dir === "left" ? s.u0 - p.x : p.x - s.u0;
      const ty = p.y - cy;
      const f = end ? (end - k) / end : 0;
      const rotX = roll * Math.pow(f, 1.6) + flutter * Math.sin(clock * 0.012 + k * 0.9) * Math.min(1, f * 2);
      s.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${rotZ.toFixed(2)}deg) rotateX(${rotX.toFixed(1)}deg)`;
      const sheen = Math.round((0.32 * Math.abs(Math.sin(rotX / DEG)) + 0.1 * clamp(-ty / 40, 0, 1)) * 20) / 20;
      if (sheen !== s.sheen) {
        s.sheen = sheen;
        s.el.style.setProperty("--sheen", String(sheen));
      }
    }
    revealEdge();
  }

  function fleck(u, yPct, strong) {
    if (!glints) return;
    const away = dir === "left" ? -1 : 1;
    const count = strong ? 12 : 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const at = clamp(uToPackPct(u) + (Math.random() - 0.5) * (strong ? 36 : 6), 0, 100);
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
      backFrame(animT);
      return;
    }

    detachUpTo(front);
    if (phase === "finish" && front >= W - 0.01) beginToss(now);
    step(dt);
    render();

    if (phase === "toss" && now >= tossEnd) {
      finishToss();
      return;
    }
    const busy = phase === "toss" || phase === "finish" || (phase === "drag" && (Math.abs(target - front) > 0.05 || free > 0));
    if (busy) raf = requestAnimationFrame(frame);
  }

  function beginToss(now) {
    phase = "toss";
    loose = true;
    free = N;
    const away = dir === "left" ? -1 : 1;
    if (fx()) {
      // Throw the strip clear: away along the tear and up, with a shiver through it.
      for (let k = 0; k <= N; k += 1) {
        const p = pts[k];
        const f = k / N;
        p.px = p.x - (420 + 260 * f + (Math.random() - 0.5) * 140) * (1 / 60);
        p.py = p.y + (340 + 160 * (1 - f) + (Math.random() - 0.5) * 140) * (1 / 60);
      }
      fleck(W, lineY(line, uToPackPct(W)), true);
    }
    strip.classList.add("toss");
    tossEnd = now + (fx() ? 470 : 30);
    hooks.onRipped?.();
    void away;
  }

  function finishToss() {
    stop();
    phase = "idle";
    hooks.onDone?.();
  }

  /* ---- Easing back when the finger lets go early ------------------------- */

  function backFrame(t) {
    const e = easeOut(t);
    for (let k = 0; k < free; k += 1) {
      const s = slices[k];
      if (s.u1 > front || t >= 1) {
        s.el.style.transform = "";
        s.el.style.opacity = "";
        s.el.classList.remove("free");
        s.front.style.setProperty("--rim", "0");
        s.el.style.setProperty("--sheen", "0");
        continue;
      }
      const pose = poses[k];
      if (!pose) continue;
      s.el.style.transform = `translate3d(${(pose.tx * (1 - e)).toFixed(2)}px, ${(pose.ty * (1 - e)).toFixed(2)}px, 0) rotate(${(
        pose.rz *
        (1 - e)
      ).toFixed(2)}deg) rotateX(${(pose.rx * (1 - e)).toFixed(1)}deg)`;
    }
    revealEdge();
    if (t < 1) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const done = hooks.onBack;
    clear();
    done?.();
  }

  function snapshotPoses() {
    poses = slices.map((s, k) => {
      if (!s.freed) return null;
      const p = pts[k];
      const q = pts[k + 1];
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * DEG;
      const rotX = 58 * clamp((free - 1) / 6, 0, 1) * Math.pow((free - k) / free, 1.6);
      return { tx: dir === "left" ? s.u0 - p.x : p.x - s.u0, ty: p.y - cy, rz: dir === "left" ? -ang : ang, rx: rotX };
    });
  }

  /* ---- Clearing ------------------------------------------------------------ */

  function clear() {
    stop();
    phase = "idle";
    anim = null;
    poses = null;
    dir = null;
    front = 0;
    target = 0;
    lift = 0;
    speed = 0;
    free = 0;
    loose = false;
    ticks = 0;
    slices = [];
    pts = [];
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
    /** The finger let go early: the strip settles back down and the tear heals. */
    easeBack(done) {
      if (phase !== "drag") return;
      hooks = { onBack: done };
      if (!dir || front < 1 || !fx()) {
        clear();
        done?.();
        return;
      }
      snapshotPoses();
      phase = "back";
      anim = { from: front, to: 0, t0: performance.now(), dur: 260, ease: easeIn };
      last = 0;
      loop();
    },
    /** Finish the rip: run the tear across, then throw the strip clear. */
    complete({ onRipped, onDone } = {}) {
      if (phase === "finish" || phase === "toss") return;
      if (phase !== "drag") {
        clear();
        measure();
      }
      if (!dir) setDir("right");
      hooks = { onRipped, onDone };
      phase = "finish";
      const left = 1 - front / W;
      anim = { from: front, to: W, t0: performance.now(), dur: fx() ? 160 + 340 * left : 120, ease: easeOut };
      last = 0;
      loop();
    },
  };
}
