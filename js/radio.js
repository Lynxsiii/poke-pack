/**
 * Optional Unova lo-fi player. Mounted after boot so a missing file or a
 * blocked autoplay policy cannot take down packs, binder, or saves.
 */
import { mountDock, bindDock } from "./header-docks.js?v=2";

const STORAGE = "poke-pack-radio-v1";
const TRACKS = [
  { id: "accumula", title: "Accumula Town", artist: "Matcha", src: "assets/radio/accumula.mp3", cover: "assets/radio/accumula.jpg" },
  { id: "virbank", title: "Virbank City", artist: "Matcha", src: "assets/radio/virbank.mp3", cover: "assets/radio/virbank.jpg" },
  { id: "castelia", title: "Castelia City", artist: "Matcha", src: "assets/radio/castelia.mp3", cover: "assets/radio/castelia.jpg" },
  { id: "nimbasa", title: "Nimbasa City", artist: "Matcha", src: "assets/radio/nimbasa.mp3", cover: "assets/radio/nimbasa.jpg" },
  { id: "skyarrow", title: "Skyarrow Bridge", artist: "Matcha", src: "assets/radio/skyarrow.mp3", cover: "assets/radio/skyarrow.jpg" },
  { id: "relic", title: "Relic Song", artist: "Matcha", src: "assets/radio/relic.mp3", cover: "assets/radio/relic.jpg" },
  { id: "route10", title: "Route 10", artist: "Matcha", src: "assets/radio/route10.mp3", cover: "assets/radio/route10.jpg" },
  { id: "marine", title: "Marine Tube", artist: "Matcha", src: "assets/radio/marine.mp3", cover: "assets/radio/marine.jpg" },
  { id: "lacunosa", title: "Lacunosa Town", artist: "Matcha", src: "assets/radio/lacunosa.mp3", cover: "assets/radio/lacunosa.jpg" },
  { id: "undella", title: "Undella Town", artist: "Matcha", src: "assets/radio/undella.mp3", cover: "assets/radio/undella.jpg" },
];

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!raw || typeof raw !== "object") return { i: 0, vol: 0.16, open: false };
    const i = Number(raw.i);
    const vol = Number(raw.vol);
    return {
      i: Number.isInteger(i) && i >= 0 && i < TRACKS.length ? i : 0,
      vol: vol >= 0 && vol <= 1 ? vol : 0.16,
      open: Boolean(raw.open),
    };
  } catch {
    return { i: 0, vol: 0.16, open: false };
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(prefs));
  } catch {
    /* private mode / full disk — player still works */
  }
}

function clock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function initRadio() {
  try {
    mountRadio();
  } catch {
    /* keep the rest of the site running */
  }
}

function mountRadio() {
  if (!TRACKS.length || document.getElementById("radio")) return;

  const prefs = loadPrefs();
  let index = prefs.i;
  let seeking = false;

  // The player drops down from the top bar now, so it starts closed rather
  // than reopening over the page it lands on.
  const root = document.createElement("aside");
  root.id = "radio";
  root.className = "radio";
  root.setAttribute("aria-label", "Lo-fi radio");
  root.innerHTML = `
    <audio id="radio-audio" preload="metadata" playsinline></audio>
    <button type="button" class="radio-peek" id="radio-peek" aria-expanded="false" aria-controls="radio-panel" aria-label="Radio">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8.5" width="17" height="11" rx="1.5"/><path d="M7 8.5l9.5-4.5"/><circle cx="15.5" cy="14" r="2.5"/><path d="M6.5 12.5h4M6.5 15.5h4"/></svg>
      <span class="radio-peek-eq" aria-hidden="true"><i></i><i></i><i></i></span>
    </button>
    <div class="radio-panel" id="radio-panel" role="region" aria-label="Now playing">
      <div class="radio-now">
        <img class="radio-cover" id="radio-art" alt="" />
        <div class="radio-copy">
          <p class="radio-kicker">Unova lo-fi</p>
          <b id="radio-title"></b>
          <small id="radio-artist"></small>
        </div>
        <button type="button" class="radio-hide" id="radio-hide" aria-label="Hide player">–</button>
      </div>
      <div class="radio-progress">
        <span id="radio-elapsed">0:00</span>
        <input class="radio-seek" id="radio-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" />
        <span id="radio-left">0:00</span>
      </div>
      <div class="radio-controls">
        <button type="button" id="radio-prev" aria-label="Previous track">‹</button>
        <button type="button" class="radio-play" id="radio-play" aria-label="Play">▶</button>
        <button type="button" id="radio-next" aria-label="Next track">›</button>
        <label class="radio-vol">
          <span aria-hidden="true">♪</span>
          <input id="radio-vol" type="range" min="0" max="100" value="${Math.round(prefs.vol * 100)}" step="1" aria-label="Volume" />
        </label>
      </div>
      <div class="radio-list" id="radio-list"></div>
    </div>
  `;
  mountDock(root);

  const audio = root.querySelector("#radio-audio");
  const peek = root.querySelector("#radio-peek");
  const hide = root.querySelector("#radio-hide");
  const playBtn = root.querySelector("#radio-play");
  const prevBtn = root.querySelector("#radio-prev");
  const nextBtn = root.querySelector("#radio-next");
  const seek = root.querySelector("#radio-seek");
  const vol = root.querySelector("#radio-vol");
  const list = root.querySelector("#radio-list");
  const titleEl = root.querySelector("#radio-title");
  const artistEl = root.querySelector("#radio-artist");
  const elapsedEl = root.querySelector("#radio-elapsed");
  const leftEl = root.querySelector("#radio-left");
  const art = root.querySelector("#radio-art");

  audio.volume = Math.min(prefs.vol, 0.18);
  vol.value = String(Math.round(audio.volume * 100));

  list.innerHTML = TRACKS.map(
    (track, i) => `<button type="button" class="radio-track" data-track="${i}">
      <img src="${esc(track.cover)}" alt="" width="32" height="32" loading="lazy" />
      <span><b>${esc(track.title)}</b><small>${esc(track.artist)}</small></span>
    </button>`
  ).join("");

  function persist() {
    savePrefs({ i: index, vol: audio.volume, open: root.classList.contains("is-open") });
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    peek.setAttribute("aria-expanded", String(open));
    persist();
  }

  function paintPlaying() {
    const on = !audio.paused;
    root.classList.toggle("is-playing", on);
    playBtn.textContent = on ? "❚❚" : "▶";
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
  }

  function bindSession() {
    if (!("mediaSession" in navigator)) return;
    const track = TRACKS[index];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: "Black & White Lo-Fi",
        artwork: [{ src: track.cover, sizes: "300x300", type: "image/jpeg" }],
      });
      navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => load(index - 1, true));
      navigator.mediaSession.setActionHandler("nexttrack", () => load(index + 1, true));
    } catch {
      /* some browsers reject individual handlers */
    }
  }

  function load(next, play) {
    index = (next + TRACKS.length) % TRACKS.length;
    const track = TRACKS[index];
    const wasPlaying = play || !audio.paused;
    audio.src = track.src;
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    art.src = track.cover;
    peek.title = `${track.title} by ${track.artist}`;
    list.querySelectorAll(".radio-track").forEach((btn, i) => {
      btn.classList.toggle("on", i === index);
    });
    list.querySelector(".radio-track.on")?.scrollIntoView({ block: "nearest" });
    seek.value = "0";
    elapsedEl.textContent = "0:00";
    leftEl.textContent = "0:00";
    persist();
    bindSession();
    if (wasPlaying) audio.play().catch(() => paintPlaying());
    else paintPlaying();
  }

  peek.addEventListener("click", () => setOpen(!root.classList.contains("is-open")));
  hide.addEventListener("click", () => setOpen(false));
  bindDock(root, { name: "radio", peek, isOpen: () => root.classList.contains("is-open"), setOpen, focusOnOpen: hide });
  playBtn.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  prevBtn.addEventListener("click", () => load(index - 1, true));
  nextBtn.addEventListener("click", () => load(index + 1, true));
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-track]");
    if (!btn) return;
    load(Number(btn.dataset.track), true);
  });

  vol.addEventListener("input", () => {
    audio.volume = Number(vol.value) / 100;
    persist();
  });
  vol.addEventListener("change", () => {
    audio.volume = Number(vol.value) / 100;
    persist();
  });
  const setVolFromPoint = (e) => {
    const box = vol.getBoundingClientRect();
    if (!box.width) return;
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    const pct = Math.min(1, Math.max(0, (point.clientX - box.left) / box.width));
    vol.value = String(Math.round(pct * 100));
    audio.volume = pct;
    persist();
  };
  vol.addEventListener("pointerdown", (e) => {
    try {
      vol.setPointerCapture(e.pointerId);
    } catch {
      /* iOS */
    }
    setVolFromPoint(e);
  });
  vol.addEventListener("pointermove", (e) => {
    if (e.buttons) setVolFromPoint(e);
  });
  vol.addEventListener("touchstart", (e) => {
    e.preventDefault();
    setVolFromPoint(e);
  }, { passive: false });
  vol.addEventListener("touchmove", (e) => {
    e.preventDefault();
    setVolFromPoint(e);
  }, { passive: false });

  seek.addEventListener("pointerdown", () => {
    seeking = true;
  });
  seek.addEventListener("input", () => {
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    elapsedEl.textContent = clock((Number(seek.value) / 1000) * dur);
  });
  const commitSeek = () => {
    const dur = audio.duration;
    seeking = false;
    if (!Number.isFinite(dur) || dur <= 0) return;
    audio.currentTime = (Number(seek.value) / 1000) * dur;
  };
  seek.addEventListener("pointerup", commitSeek);
  seek.addEventListener("change", commitSeek);

  audio.addEventListener("play", paintPlaying);
  audio.addEventListener("pause", paintPlaying);
  audio.addEventListener("ended", () => load(index + 1, true));
  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    const dur = audio.duration;
    const t = audio.currentTime || 0;
    elapsedEl.textContent = clock(t);
    leftEl.textContent = Number.isFinite(dur) ? clock(dur) : "0:00";
    if (Number.isFinite(dur) && dur > 0) seek.value = String(Math.round((t / dur) * 1000));
  });

  // Music stays off until the player presses play; the track and volume are
  // still remembered from last time.
  load(index, false);
}
