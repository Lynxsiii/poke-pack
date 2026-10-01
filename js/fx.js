// Site-wide motion: scroll reveals, the ambient set colour, and the pointer
// parallax on the featured stage. Everything here is decoration, so it all
// switches off under prefers-reduced-motion or Settings → motion off
// (body.no-motion), and the page reads the same without it.

const REVEAL = [
  ".home-block", ".home-lounge .lounge-panel", ".home-set", ".pack-card", ".sealed-card",
  ".catalog-card", ".panel", ".binder-page", ".acct-tile", ".ach-tile", ".notes-entry",
  ".setting-card", ".settings-group", ".bulk-set-card",
].join(",");

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("no-motion");

let observer = null;
const seen = new WeakSet();

function watch(root) {
  if (!observer) return;
  // Stagger siblings that arrive together, capped so a long grid never waits.
  let index = 0;
  root.querySelectorAll(REVEAL).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);
    el.classList.add("fx-reveal");
    el.style.setProperty("--fx-delay", `${Math.min(index++, 8) * 45}ms`);
    observer.observe(el);
  });
}

function startReveals() {
  if (!("IntersectionObserver" in window)) return;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("fx-in");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
  const main = document.getElementById("main-content");
  if (!main) return;
  watch(main);
  new MutationObserver(() => watch(main)).observe(main, { childList: true, subtree: true });
}

// The dominant saturated colour of a wrapper, used to tint the page light.
const colourCache = new Map();
function sampleColour(img) {
  const key = img.currentSrc || img.src;
  if (colourCache.has(key)) return colourCache.get(key);
  let rgb = null;
  try {
    const canvas = document.createElement("canvas");
    const size = 24;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    // Bucket vivid pixels by hue and keep the heaviest bucket, so a pack with
    // two strong colours lights in one of them instead of their muddy mix.
    const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
      const delta = max - min;
      if (!max || delta / max < 0.35 || max < 70) continue;
      let hue = max === pr ? ((pg - pb) / delta) % 6 : max === pg ? (pb - pr) / delta + 2 : (pr - pg) / delta + 4;
      hue = (hue * 60 + 360) % 360;
      const w = (delta / max) * (max / 255);
      const bucket = buckets[Math.floor(hue / 30) % 12];
      bucket.w += w; bucket.r += pr * w; bucket.g += pg * w; bucket.b += pb * w;
    }
    const top = buckets.reduce((a, b) => (b.w > a.w ? b : a));
    if (top.w > 0.5) {
      // Normalise to a bright light of that hue.
      const c = [top.r / top.w, top.g / top.w, top.b / top.w];
      const scale = 235 / Math.max(...c);
      rgb = c.map((n) => Math.round(Math.min(255, n * scale)));
    }
  } catch {
    rgb = null; // a tainted canvas (remote image) simply leaves the default light
  }
  colourCache.set(key, rgb);
  return rgb;
}

export function tintFrom(img, glint) {
  if (!img) return;
  // The glint layer is clipped to the wrapper's own outline.
  if (glint) glint.style.setProperty("--pack-mask", `url("${img.currentSrc || img.src}") center / 100% 100% no-repeat`);
  const apply = () => {
    const rgb = sampleColour(img);
    if (rgb) document.body.style.setProperty("--ambient", rgb.join(" "));
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

// Featured stage: the pack and card lean towards the pointer.
function startParallax() {
  document.addEventListener("pointermove", (event) => {
    const stage = event.target?.closest?.(".home-stage");
    if (!stage || reduced() || event.pointerType !== "mouse") return;
    const rect = stage.getBoundingClientRect();
    stage.style.setProperty("--sx", ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
    stage.style.setProperty("--sy", ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    const stage = event.target?.closest?.(".home-stage");
    if (stage && !stage.contains(event.relatedTarget)) {
      stage.style.setProperty("--sx", "0");
      stage.style.setProperty("--sy", "0");
    }
  }, { passive: true });
}

// The hero's looping effects stop once they are scrolled out of view, so a
// long page is not animating something nobody can see.
function pauseOffscreen() {
  if (!("IntersectionObserver" in window)) return;
  const loops = document.querySelectorAll(".home-copy, .home-stage");
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.classList.toggle("fx-paused", !entry.isIntersecting);
  });
  loops.forEach((el) => io.observe(el));
  // Level cosmetics are drawn into pages after load (banners with a moving
  // motion, big avatar frames), so look for new ones now and then.
  const LEVEL_LOOPS = '.banner-wash:is([data-motion="foil"], [data-motion="starfall"], [data-motion="holo"]), .lvl-frame[data-s="md"], .lvl-frame[data-s="lg"], .lvl-frame[data-s="xl"]';
  const watched = new WeakSet();
  setInterval(() => {
    document.querySelectorAll(LEVEL_LOOPS).forEach((el) => {
      if (watched.has(el)) return;
      watched.add(el);
      io.observe(el);
    });
  }, 1500);
}

// Every endless loop holds still while the window is in the background or
// nobody has touched the page for a while, so a tab left open costs nothing:
// a looping effect makes the browser draw every frame, forever, even when the
// person is using another app. Any input brings them back at once. Only
// infinite animations are held, so nothing waiting on an animation's end is.
const REST_AFTER_MS = 20000;

function restWhenIdle() {
  if (!document.getAnimations) return;
  const held = new Set();
  let resting = false;
  let lastInput = performance.now();

  const hold = () => {
    for (const anim of document.getAnimations()) {
      const el = anim.effect?.target;
      if (!el || held.has(el) || anim.playState !== "running") continue;
      if (anim.effect.getTiming?.().iterations !== Infinity) continue;
      el.classList.add("fx-held");
      held.add(el);
    }
  };
  const rest = () => {
    resting = true;
    hold();
  };
  const wake = () => {
    lastInput = performance.now();
    if (!resting) return;
    resting = false;
    held.forEach((el) => el.classList.remove("fx-held"));
    held.clear();
  };

  for (const type of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
  window.addEventListener("focus", wake);
  window.addEventListener("blur", rest);
  document.addEventListener("visibilitychange", () => (document.hidden ? rest() : wake()));
  // A slow check, not a timer reset on every pointer move. While resting it
  // also catches loops that a re-render started after the last sweep.
  setInterval(() => {
    if (resting) hold();
    else if (performance.now() - lastInput > REST_AFTER_MS || !document.hasFocus()) rest();
  }, 4000);
}

// body.at-top while the page is scrolled to its start (the phone docks hide
// there on the home page so they never cover the rip button).
function trackTop() {
  let queued = false;
  const paint = () => {
    queued = false;
    document.body.classList.toggle("at-top", window.scrollY < 48);
  };
  paint();
  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }, { passive: true });
}

export function initFx() {
  document.documentElement.classList.add("fx-ready");
  trackTop();
  if (!reduced()) startReveals();
  startParallax();
  pauseOffscreen();
  restWhenIdle();
}
