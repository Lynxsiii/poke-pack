/**
 * Share a pull: a picture of the card with its rarity, value and set, and a
 * link (poke-pack.rip/pull/<card>) whose preview is the card itself
 * (worker/seo.js writes that page's head).
 *
 * The picture is drawn on a canvas from the card's own scan (same origin, so
 * the canvas stays readable), 1080x1350, the size a phone's share sheet and
 * every chat app take without cropping. On a phone the Share button hands
 * the picture and the link to the system share sheet; elsewhere it saves the
 * picture and Copy link copies the link. Nothing is posted by the site.
 */

const W = 1080;
const H = 1350;
// The Rotom menu look (DESIGN.md): ink stage, cyan slabs, a light panel, one yellow.
const C = {
  ink: "#14171b",
  ground: "#eef2f3",
  k2: "#566069",
  darkK2: "#aab4bc",
  cy: "#00b4c8",
  cy2: "#008fa6",
  yel: "#ffd21f",
  white: "#ffffff",
};
// The rarity colours of css/rotom.css (.rt-type[data-ty]).
const TY = {
  common: "#7d8890", uncommon: "#3f9f52", rare: "#2f7fd6", holo: "#1aa5b8", double: "#ee7b2c", ultra: "#c2449f",
  illus: "#8a56d8", sir: "#5a63d8", hyper: "#c79a00", promo: "#f5333f", secret: "#14171b",
};
const XC = '"Kanit Title", "Kanit", "Arial Black", sans-serif';
const SC = '"Kanit", "Arial Rounded MT Bold", sans-serif';
const TEXT = '"M PLUS Rounded 1c", system-ui, sans-serif';
const TAN = Math.tan((14 * Math.PI) / 180);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The address a pull is shared at. */
export function pullUrl(card, { by = "", reverseKind = "" } = {}) {
  const url = new URL(`/pull/${encodeURIComponent(card.id)}`, "https://poke-pack.rip");
  if (by) url.searchParams.set("by", by);
  if (card.reverse) url.searchParams.set("r", reverseKind === "pokeball" || reverseKind === "masterball" ? reverseKind : "1");
  return url.toString();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrink a font until `text` fits `max` pixels. */
function fit(ctx, text, weight, family, size, max, min = 24) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > min && ctx.measureText(text).width > max) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

/** A band leaning like every slab on the site: `x` is its left edge at `y1`, the bottom. */
function slab(ctx, x, w, y0, y1, color) {
  const lean = (y1 - y0) * TAN;
  ctx.beginPath();
  ctx.moveTo(x + lean, y0);
  ctx.lineTo(x + lean + w, y0);
  ctx.lineTo(x + w, y1);
  ctx.lineTo(x, y1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** The four-point star round a hit. */
function star(ctx, cx, cy, r, color) {
  const k = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + k, cy - k);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx + k, cy + k);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - k, cy + k);
  ctx.lineTo(cx - r, cy);
  ctx.lineTo(cx - k, cy - k);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** The dot grid of the ground, in a rect. */
function dots(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  for (let y = y0 + 18; y < y1; y += 38) {
    for (let x = x0 + 18; x < x1; x += 38) {
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Draw the share picture. `info` carries what the site already prints for
 * the card: name, rarity (and its badge colour `ty`), the rest of its line
 * (number and set), set name, value (a plain number of coins), the player's
 * handle, and image paths for the scan, the coin and the mark.
 */
export async function drawPullCard(info) {
  await Promise.all(
    [`italic 800 100px ${XC}`, `700 40px ${SC}`, `600 40px ${SC}`, `700 34px ${TEXT}`].map((f) => document.fonts?.load(f).catch(() => null))
  );
  const [scan, coin, mark] = await Promise.all([
    loadImage(info.image),
    loadImage(info.coin).catch(() => null),
    loadImage(info.mark).catch(() => null),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // The stage: ink with its dots, two slabs leaning behind the card.
  const panelTop = 900; // the panel's right end; its left end is 60px lower
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  dots(ctx, 0, 0, W, panelTop + 60, "rgba(255,255,255,0.1)");
  slab(ctx, 120, 640, -20, panelTop + 80, C.cy2);
  slab(ctx, 360, 220, -20, panelTop + 80, C.cy);

  // The head: the mark and the site's name, the set at the right.
  const top = 56;
  if (mark) {
    ctx.save();
    roundRect(ctx, 56, top, 56, 56, 10);
    ctx.clip();
    ctx.drawImage(mark, 56, top, 56, 56);
    ctx.restore();
  }
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.white;
  ctx.font = `italic 800 40px ${XC}`;
  ctx.fillText("poke-pack.rip", mark ? 128 : 56, top + 29);
  ctx.textAlign = "right";
  fit(ctx, info.setName, 700, TEXT, 30, 420);
  ctx.fillStyle = C.white;
  ctx.fillText(info.setName, W - 56, top + 29);
  ctx.textAlign = "left";

  // The card, large and a little tilted, its hard shadow beside it, stars round it.
  const cardH = 690;
  const cardW = Math.round((cardH * scan.naturalWidth) / scan.naturalHeight);
  const cx = W / 2;
  const cy = 160 + cardH / 2;
  const r = Math.round(cardW * 0.045);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-2.5 * Math.PI) / 180);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  roundRect(ctx, -cardW / 2 + 28, -cardH / 2 + 32, cardW, cardH, r);
  ctx.fill();
  roundRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, r);
  ctx.clip();
  ctx.drawImage(scan, -cardW / 2, -cardH / 2, cardW, cardH);
  ctx.restore();
  const hw = cardW / 2;
  star(ctx, cx - hw - 70, cy - 230, 58, C.yel);
  star(ctx, cx + hw + 52, cy - 270, 34, C.white);
  star(ctx, cx + hw + 66, cy + 190, 52, C.yel);
  star(ctx, cx - hw - 56, cy + 150, 28, C.white);

  // The panel: the ground, an ink line along its slanted top.
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 60);
  ctx.lineTo(W, panelTop);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 68);
  ctx.lineTo(W, panelTop + 8);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = C.ground;
  ctx.fill();

  // The name on the yellow plate, over the panel's edge.
  const nameMax = W - 200;
  const namePx = fit(ctx, info.name, "italic 800", XC, 74, nameMax, 40);
  ctx.font = `italic 800 ${namePx}px ${XC}`;
  const nameW = ctx.measureText(info.name).width;
  const plateH = namePx + 44;
  ctx.save();
  ctx.translate(56, panelTop + 30);
  ctx.rotate((-3.2 * Math.PI) / 180);
  ctx.transform(1, 0, -TAN, 1, 0, 0);
  roundRect(ctx, 0, -plateH / 2, nameW + 70, plateH, 12);
  ctx.fillStyle = C.yel;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = C.ink;
  ctx.stroke();
  ctx.transform(1, 0, TAN, 1, 0, 0);
  ctx.fillStyle = C.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(info.name, 34, 4);
  ctx.restore();

  // The rarity as a type badge, then the number and set.
  let y = panelTop + 165;
  ctx.textBaseline = "middle";
  ctx.font = `600 34px ${SC}`;
  const badge = info.rarity || "";
  let x = 56;
  if (badge) {
    const bw = ctx.measureText(badge).width + 48;
    roundRect(ctx, x, y - 30, bw, 60, 10);
    ctx.fillStyle = TY[info.ty] || TY.common;
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.fillText(badge, x + 24, y + 2);
    x += bw + 22;
  }
  if (info.rest) {
    ctx.fillStyle = C.k2;
    fit(ctx, info.rest, 600, SC, 34, W - 56 - x, 24);
    ctx.fillText(info.rest, x, y + 2);
  }

  // What it is worth: the coin and a big figure.
  y += 70;
  ctx.fillStyle = C.k2;
  ctx.font = `700 30px ${TEXT}`;
  ctx.fillText("Worth", 56, y);
  y += 84;
  const coinSize = 84;
  if (coin) ctx.drawImage(coin, 56, y - coinSize / 2, coinSize, coinSize);
  ctx.fillStyle = C.ink;
  ctx.font = `700 124px ${SC}`;
  ctx.textBaseline = "middle";
  ctx.fillText(info.valueText, 56 + (coin ? coinSize + 22 : 0), y + 6);

  // The foot: who pulled it, on an ink band.
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, H - 76, W, 76);
  ctx.textBaseline = "middle";
  ctx.font = `italic 700 32px ${SC}`;
  ctx.fillStyle = C.white;
  ctx.textAlign = "left";
  ctx.fillText(info.by ? `Pulled by @${info.by}` : "Pulled on poke-pack.rip", 56, H - 38);
  ctx.textAlign = "right";
  ctx.fillStyle = C.yel;
  ctx.fillText("Rip packs free", W - 56, H - 38);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No picture"))), "image/png")
  );
}

/**
 * The share sheet: the picture, Share (or Save picture where the browser
 * can't share files) and Copy link. `deps` brings the app's dialog helpers
 * and toast so it stacks and closes like every other dialog.
 */
export function createShareSheet({ openDialog, closeDialog, toast }) {
  let root = null;
  let blob = null;
  let objectUrl = "";
  let current = null;

  function build() {
    root = document.createElement("div");
    root.className = "overlay hidden share-pull";
    root.id = "share-pull";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "share-pull-title");
    root.innerHTML = `
      <div class="share-pull-panel">
        <div class="share-pull-head">
          <h2 id="share-pull-title">Share this pull</h2>
          <button class="ghost sm" type="button" data-share-close>Close</button>
        </div>
        <div class="share-pull-pic"><p class="share-pull-wait">Drawing it</p></div>
        <div class="share-pull-actions">
          <button class="solid" type="button" data-share-go disabled>Share</button>
          <button class="ghost" type="button" data-share-copy>Copy link</button>
        </div>
        <p class="share-pull-url"></p>
      </div>`;
    document.body.appendChild(root);
    root.addEventListener("click", (e) => {
      if (e.target === root || e.target.closest("[data-share-close]")) close();
      else if (e.target.closest("[data-share-go]")) go();
      else if (e.target.closest("[data-share-copy]")) copy();
    });
  }

  function canShareFile(file) {
    try {
      return Boolean(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch {
      return false;
    }
  }

  function fileName() {
    return `poke-pack-${String(current?.id || "pull").replace(/[^a-z0-9-]/gi, "")}.png`;
  }

  async function go() {
    if (!blob || !current) return;
    const file = new File([blob], fileName(), { type: "image/png" });
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: current.title, text: `${current.title} ${current.url}` });
      } catch (err) {
        if (err?.name !== "AbortError") toast("Couldn't open the share sheet.");
      }
      return;
    }
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.url);
      toast("Link copied.");
    } catch {
      toast(current.url);
    }
  }

  function close() {
    if (!root || root.classList.contains("hidden")) return false;
    closeDialog(root);
    return true;
  }

  async function open(info) {
    if (!root) build();
    current = info;
    blob = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = "";
    const pic = root.querySelector(".share-pull-pic");
    const goBtn = root.querySelector("[data-share-go]");
    pic.innerHTML = `<p class="share-pull-wait">Drawing it</p>`;
    goBtn.disabled = true;
    root.querySelector(".share-pull-url").textContent = info.url.replace(/^https:\/\//, "");
    openDialog(root, root.querySelector("[data-share-copy]"));
    try {
      const made = await drawPullCard(info);
      if (current !== info) return;
      blob = made;
      objectUrl = URL.createObjectURL(blob);
      pic.innerHTML = `<img src="${objectUrl}" width="1080" height="1350" alt="${esc(info.title)}" />`;
      const file = new File([blob], fileName(), { type: "image/png" });
      goBtn.textContent = canShareFile(file) ? "Share" : "Save picture";
      goBtn.disabled = false;
    } catch {
      if (current !== info) return;
      pic.innerHTML = `<p class="share-pull-wait">Couldn't draw the picture. The link still works.</p>`;
    }
  }

  return { open, close, isOpen: () => Boolean(root && !root.classList.contains("hidden")) };
}
