// The lit moments (css/wow.css): the home shelf's light and glint, and the
// purse answering when the balance moves. Decoration only: it reads what the
// app already drew and never changes it, so the page works the same without
// this file. Movement is skipped under reduced motion and Settings > motion
// off; the stage light itself is not motion and stays.

// The strongest vivid colour of a wrapper, as a bright light of that hue
// (the same reading js/fx.js takes for a battle table).
const colours = new Map();
function sampleColour(img) {
  const key = img.currentSrc || img.src;
  if (colours.has(key)) return colours.get(key);
  let rgb = null;
  try {
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
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
      const c = [top.r / top.w, top.g / top.w, top.b / top.w];
      const scale = 235 / Math.max(...c);
      rgb = c.map((n) => Math.round(Math.min(255, n * scale)));
    }
  } catch {
    rgb = null; // a remote image can't be read; the default light stays
  }
  colours.set(key, rgb);
  return rgb;
}

const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("no-motion");

// ---- Home: light the pack on show ------------------------------------------
function initStage() {
  const shelf = document.getElementById("home-shelf");
  const row = document.getElementById("home-set-picker");
  if (!shelf || !row) return;

  const glint = document.createElement("span");
  glint.className = "wow-glint";
  glint.setAttribute("aria-hidden", "true");
  glint.innerHTML = "<i></i>";

  let lit = null; // the pack button the light is on
  let light = "";
  let queued = false;

  const aim = (item) => {
    const box = shelf.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    if (box.width) shelf.style.setProperty("--spot-x", `${Math.round(at.left + at.width / 2 - box.left)}px`);
  };

  const paint = () => {
    queued = false;
    const item = row.querySelector(".hs-item.is-center");
    const pack = item?.querySelector(".hs-pack");
    if (!pack) return;
    aim(item);
    const img = pack.querySelector("img");
    if (pack === lit && glint.dataset.src === (img?.currentSrc || img?.src || "")) return;
    lit = pack;
    // A promo set shows a card in a top-loader: it gets the light, not the glint.
    if (!img || pack.querySelector(".hs-loader")) {
      glint.remove();
      return;
    }
    const apply = () => {
      if (lit !== pack) return;
      const src = img.currentSrc || img.src;
      glint.dataset.src = src;
      glint.style.setProperty("--pack-mask", `url("${src}") 50% 100% / contain no-repeat`);
      pack.append(glint);
      const rgb = sampleColour(img);
      const next = rgb ? rgb.join(" ") : "";
      if (next && next !== light) {
        light = next;
        (shelf.closest(".home-hero") || shelf).style.setProperty("--stage-light", next);
        shelf.classList.remove("wow-relit");
        void shelf.offsetWidth;
        shelf.classList.add("wow-relit");
      }
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener("load", apply, { once: true });
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  };

  new MutationObserver(queue).observe(row, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "src", "srcset"] });
  row.addEventListener("scroll", () => {
    const item = row.querySelector(".hs-item.is-center");
    if (item) aim(item);
  }, { passive: true });
  window.addEventListener("resize", queue, { passive: true });
  queue();

  // The pack leans to the mouse while it is over the shelf.
  shelf.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || still()) return;
    const at = lit?.getBoundingClientRect();
    if (!at?.width) return;
    const clamp = (n) => Math.max(-1, Math.min(1, n));
    shelf.style.setProperty("--tx", clamp((event.clientX - (at.left + at.width / 2)) / 260).toFixed(3));
    shelf.style.setProperty("--ty", clamp((event.clientY - (at.top + at.height / 2)) / 220).toFixed(3));
  }, { passive: true });
  shelf.addEventListener("pointerleave", () => {
    shelf.style.setProperty("--tx", "0");
    shelf.style.setProperty("--ty", "0");
  }, { passive: true });

  // Nothing loops while the shelf is scrolled out of view.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      for (const entry of entries) shelf.classList.toggle("fx-paused", !entry.isIntersecting);
    }).observe(shelf);
  }
}

// ---- The purse: roll the figure, flip the coin, show what moved -------------
function initPurse() {
  const count = document.getElementById("coin-count");
  const purse = count?.closest(".balance");
  if (!count || !purse) return;
  const coin = purse.querySelector(".coin-i");
  const parse = (text) => {
    const n = Number(String(text).replace(/,/g, ""));
    return Number.isFinite(n) && /\d/.test(text) ? n : null;
  };
  const places = (text) => (String(text).split(".")[1] || "").length;
  const fmt = (n, dp) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  let shown = count.textContent; // what the app last set
  let settled = false; // the first figures after load are the page arriving, not a change
  let raf = 0;
  setTimeout(() => { settled = true; }, 4000);

  const observer = new MutationObserver(() => {
    const target = count.textContent;
    const from = parse(shown);
    const to = parse(target);
    const before = shown;
    shown = target;
    cancelAnimationFrame(raf);
    if (!settled || from == null || to == null || from === to || before === "0" || document.hidden || still()) return;

    const diff = to - from;
    const dp = Math.max(places(target), places(before));
    const delta = document.createElement("span");
    delta.className = `wow-delta ${diff > 0 ? "up" : "down"}`;
    delta.setAttribute("aria-hidden", "true");
    delta.textContent = `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff), dp)}`;
    purse.querySelectorAll(".wow-delta").forEach((old) => old.remove());
    purse.append(delta);
    delta.addEventListener("animationend", () => delta.remove(), { once: true });
    setTimeout(() => delta.remove(), 2400);

    if (coin && diff > 0) {
      coin.classList.remove("wow-flip");
      void coin.offsetWidth;
      coin.classList.add("wow-flip");
    }

    // Roll the figure from the old amount to the new one; the last frame is
    // the app's own text, so the purse always ends on the real balance.
    const start = performance.now();
    const ms = 520;
    const write = (text) => {
      count.textContent = text;
      observer.takeRecords();
    };
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      if (t >= 1) return write(target);
      const eased = 1 - (1 - t) ** 3;
      write(fmt(from + diff * eased, places(target)));
      raf = requestAnimationFrame(step);
    };
    write(before);
    raf = requestAnimationFrame(step);
  });
  observer.observe(count, { childList: true, characterData: true, subtree: true });
}

function init() {
  try { initStage(); } catch { /* decoration only */ }
  try { initPurse(); } catch { /* decoration only */ }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
