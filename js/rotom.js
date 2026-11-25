// The Rotom menu's moving parts (css/rotom.css). Decoration only: it reads
// what the app already drew and never changes it, so every page works the
// same without this file. Movement is skipped under reduced motion and
// Settings > motion off.

const still = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body.classList.contains("no-motion");

// ---- Changing page: the slab swings in, the page's blocks rise in turn, ----
// ---- and HP bars fill. body.rt-enter is on for under a second. -------------
function initEnter() {
  const body = document.body;
  let last = body.dataset.view || "";
  let timer = 0;
  const play = () => {
    if (still()) return;
    body.classList.remove("rt-enter");
    void body.offsetWidth;
    body.classList.add("rt-enter");
    clearTimeout(timer);
    timer = setTimeout(() => body.classList.remove("rt-enter"), 1100);
  };
  new MutationObserver(() => {
    const now = body.dataset.view || "";
    if (now === last) return;
    last = now;
    play();
  }).observe(body, { attributes: true, attributeFilter: ["data-view"] });
  if (!body.classList.contains("is-booting")) play();
  else {
    const boot = new MutationObserver(() => {
      if (body.classList.contains("is-booting")) return;
      boot.disconnect();
      play();
    });
    boot.observe(body, { attributes: true, attributeFilter: ["class"] });
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

    purse.classList.remove("rt-bump");
    void purse.offsetWidth;
    purse.classList.add("rt-bump");

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

// ---- The phone header gains its white bar once the page has scrolled --------
function initScrolled() {
  const body = document.body;
  let on = false;
  let queued = false;
  const read = () => {
    queued = false;
    const now = window.scrollY > 12;
    if (now === on) return;
    on = now;
    body.classList.toggle("rt-scrolled", on);
  };
  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(read);
  }, { passive: true });
  read();
}

// ---- The tab bar's marker slides to the area you are in ---------------------
function initTabMark() {
  const bar = document.querySelector(".tabbar");
  if (!bar) return;
  const mark = document.createElement("span");
  mark.className = "rt-tabmark";
  mark.setAttribute("aria-hidden", "true");
  bar.append(mark);
  let queued = false;
  const place = () => {
    queued = false;
    const tab = bar.querySelector(":scope > .nav-btn.active:not(.tab-rip)");
    const box = bar.getBoundingClientRect();
    if (!tab || !box.width) return mark.style.setProperty("--on", "0");
    const r = tab.getBoundingClientRect();
    if (!r.width) return mark.style.setProperty("--on", "0");
    mark.style.setProperty("--x", `${Math.round(r.left - box.left + r.width / 2)}px`);
    mark.style.setProperty("--on", "1");
  };
  const ask = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(place);
  };
  new MutationObserver(ask).observe(bar, { attributes: true, attributeFilter: ["class"], subtree: true });
  window.addEventListener("resize", ask, { passive: true });
  ask();
}

function init() {
  try { initEnter(); } catch { /* decoration only */ }
  try { initPurse(); } catch { /* decoration only */ }
  try { initScrolled(); } catch { /* decoration only */ }
  try { initTabMark(); } catch { /* decoration only */ }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
