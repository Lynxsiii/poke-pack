/* A real-feeling coin for the casino: a struck metal token in CSS 3D (reeded edge
   built from facets, bevelled rim, embossed emblem) and a toss driven by the Web
   Animations API. Presentational only: the caller decides heads or tails (the
   server does), this file only makes the coin land on it. Styles live in
   css/casino-coin.css. No network, no dependencies.

     coinStageHTML({ heads, tails, size })  coin + table shadow, ready to drop in
     coinHTML({ heads, tails, size, rest }) the bare 3D coin (.cf-coin)
     coinFaceHTML(coin, label)              one flat face, for lists and chips
     houseFaceSVG("heads"|"tails")          the house coin's face art alone (the gear page)
     flipCoin(coinEl, "heads"|"tails", { ms, motion })  -> Promise<boolean>
     restCoin(coinEl, "heads"|"tails")      instant resting pose

   `coin` is null (the house coin: Meowth, see HOUSE_COIN_ART) or
   { id, name, image } for a promo coin. */

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let uid = 0;

/* ---------- faces ---------- */

// The house coin is Meowth's: Pay Day, the Pokémon that makes coins. Heads is
// Meowth struck in relief, tails the three koban charms it scatters. The
// emblems are one transparent sheet (heads left, tails right, 512px a face,
// rendered by scripts/build_house_coin.py) laid over the CSS field; the rim,
// beads and legends stay vector so they are crisp at 60px and at 240px.
export const HOUSE_COIN_ART = "assets/casino/house-coin-v1.webp";

function houseFace(kind, label) {
  const n = ++uid;
  const top = `cf-t${n}`;
  const bot = `cf-b${n}`;
  const clip = `cf-c${n}`;
  const heads = kind !== "tails";
  const words = label ? esc(String(label).toUpperCase()) : heads ? "HEADS" : "TAILS";
  return `<svg class="cf-art-svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <defs>
      <path id="${top}" d="M100 100m-69 0a69 69 0 1 1 138 0"/>
      <path id="${bot}" d="M100 100m-76 0a76 76 0 0 0 152 0"/>
      <clipPath id="${clip}"><circle cx="100" cy="100" r="64"/></clipPath>
    </defs>
    <circle class="cf-inner-ring" cx="100" cy="100" r="61"/>
    <circle class="cf-beads-sh" cx="101" cy="101.2" r="86"/>
    <circle class="cf-beads" cx="100" cy="100" r="86"/>
    <text class="cf-legend cf-legend-sh" dy="2" dx="0.8"><textPath href="#${top}" startOffset="50%" text-anchor="middle">POKE-PACK.RIP</textPath></text>
    <text class="cf-legend"><textPath href="#${top}" startOffset="50%" text-anchor="middle">POKE-PACK.RIP</textPath></text>
    <text class="cf-legend cf-legend-low cf-legend-sh" dy="2" dx="0.8"><textPath href="#${bot}" startOffset="50%" text-anchor="middle">${words}</textPath></text>
    <text class="cf-legend cf-legend-low"><textPath href="#${bot}" startOffset="50%" text-anchor="middle">${words}</textPath></text>
    <image class="cf-emblem" href="${HOUSE_COIN_ART}" x="${heads ? 0 : -200}" y="0" width="400" height="200" clip-path="url(#${clip})" decoding="async"/>
  </svg>`;
}

/** The house coin's face as a standalone SVG (the gear page shows the same
    coin flat). `kind` is "heads" or "tails". */
export const houseFaceSVG = (kind = "heads") => houseFace(kind === "tails" ? "tails" : "heads", "");

/** One flat face. `coin` null = the house coin (the emblem follows `label`
    "tails", anything else is heads); { image } = a promo coin. `label` is also
    the accessible name and the small word struck on the house coin. */
export function coinFaceHTML(coin, label = "") {
  const sheen = `<i class="cf-shade"></i><i class="cf-sheen"></i>`;
  const aria = label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"';
  if (coin && coin.image) {
    const alt = esc(coin.name || label || "Coin");
    return `<span class="cf-face-flat cf-has-art"${aria}>
      <span class="cf-field"></span>
      <img class="cf-art" src="${esc(coin.image)}" alt="${alt}" draggable="false" decoding="async">
      <i class="cf-lip"></i>${sheen}</span>`;
  }
  const kind = String(label).toLowerCase() === "tails" ? "tails" : "heads";
  return `<span class="cf-face-flat cf-house cf-${kind}"${aria}>
    <span class="cf-field"></span>${houseFace(kind, label && !/^(heads|tails)$/i.test(label) ? label : "")}<i class="cf-lip"></i>${sheen}</span>`;
}

/* ---------- the coin ---------- */

const EDGE_ROOMY = 56; // facets around the edge; fewer on small coins, they are not visible there
const px = (n) => `${Math.round(n * 100) / 100}px`;

function edgeHTML(size) {
  const n = size >= 120 ? EDGE_ROOMY : size >= 84 ? 40 : 28;
  const r = size / 2 - 0.3;
  const w = 2 * r * Math.tan(Math.PI / n) + 0.9;
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i;
    // fixed light from the upper left, baked per facet: the facets turn with the
    // coin, so the shading crawls along the edge as it spins.
    const lit = 0.5 + 0.5 * Math.cos(((a - 40) * Math.PI) / 180);
    const sh = (0.06 + 0.5 * (1 - lit)).toFixed(3);
    out += `<i style="transform:rotateZ(${a.toFixed(2)}deg) translateY(${px(-r)}) rotateX(90deg);--s:${sh}"></i>`;
  }
  return `<span class="cf-edge" style="--cf-w:${px(w)}">${out}</span>`;
}

/** The bare 3D coin. Wrap it in .cf-coin-stage (see coinStageHTML) to get the
    table shadow and room to toss. `rest` is the face showing at rest. */
export function coinHTML({ heads = null, tails = null, size = 168, rest = "heads" } = {}) {
  const custom = (heads && heads.image) || (tails && tails.image);
  const dim = Math.max(24, Number(size) || 168);
  return `<div class="cf-coin${custom ? " cf-custom" : ""}" data-rest="${rest === "tails" ? "tails" : "heads"}" style="--cf-size:${dim}px">
    ${edgeHTML(dim)}
    <div class="cf-face cf-front">${coinFaceHTML(heads, "Heads")}</div>
    <div class="cf-face cf-back">${coinFaceHTML(tails, "Tails")}</div>
  </div>`;
}

/** Coin plus its table shadow inside a stage with headroom for the toss. */
export function coinStageHTML(opts = {}) {
  const dim = Math.max(24, Number(opts.size) || 168);
  return `<div class="cf-coin-stage" style="--cf-size:${dim}px"><span class="cf-shadow"></span>${coinHTML({ ...opts, size: dim })}</div>`;
}

/* ---------- motion ---------- */

const reduced = () =>
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ||
  document.body?.classList.contains("no-motion");

const sizeOf = (coinEl) => coinEl.offsetWidth || parseFloat(getComputedStyle(coinEl).getPropertyValue("--cf-size")) || 168;
const shadowOf = (coinEl) => coinEl.parentElement?.querySelector(":scope > .cf-shadow") || null;
const sheensOf = (coinEl) => ({
  front: [...coinEl.querySelectorAll(".cf-front .cf-sheen")],
  back: [...coinEl.querySelectorAll(".cf-back .cf-sheen")],
  frontShade: [...coinEl.querySelectorAll(".cf-front .cf-shade")],
  backShade: [...coinEl.querySelectorAll(".cf-back .cf-shade")],
});

function stopAnimations(coinEl) {
  for (const a of coinEl._cfAnims || []) {
    try { a.cancel(); } catch { /* already gone */ }
  }
  coinEl._cfAnims = [];
  try { coinEl._cfAnim?.cancel(); } catch { /* already gone */ }
  coinEl._cfAnim = null;
}

/** Set the resting pose at once, no animation. Cancels any toss in the air. */
export function restCoin(coinEl, result = "heads") {
  if (!coinEl) return;
  stopAnimations(coinEl);
  coinEl.dataset.rest = result === "tails" ? "tails" : "heads";
}

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Toss the coin so it lands showing `result`. Resolves true once it has come to
    rest, or false if a later flip / restCoin took over first. Never rejects. */
export function flipCoin(coinEl, result = "heads", opts = {}) {
  if (!coinEl) return Promise.resolve(false);
  const { ms = 3200, motion = true } = opts;
  const want = result === "tails" ? "tails" : "heads";
  const from = coinEl.dataset.rest === "tails" ? 180 : 0;
  stopAnimations(coinEl);
  coinEl.dataset.rest = want; // if anything cancels the toss the coin already shows the result

  if (!motion || reduced() || typeof coinEl.animate !== "function") {
    if (typeof coinEl.animate !== "function") return Promise.resolve(true);
    return new Promise((resolve) => {
      const fade = coinEl.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
      coinEl._cfAnim = fade;
      coinEl._cfAnims = [fade];
      fade.onfinish = () => { if (coinEl._cfAnim === fade) coinEl._cfAnim = null; resolve(true); };
      fade.oncancel = () => resolve(false);
    });
  }

  const size = sizeOf(coinEl);
  const persp = size * 5;
  const to = want === "tails" ? 180 : 0;
  const turns = Math.max(2, Math.round((ms / 1000) * 1.7) + Math.floor(Math.random() * 2));
  const dir = 1;
  const sweep = dir * (360 * turns + ((((to - from) * dir) % 360) + 360) % 360);
  const overshoot = 26 * dir; // the coin lands a little tilted and rocks flat
  const wob = Math.random() < 0.5 ? 1 : -1;
  const drift = (Math.random() * 2 - 1) * 0.06;

  // Timeline, in fractions of ms: a parabolic flight, two dying bounces, and a
  // rattle that runs to the end.
  const F = 0.6, B1 = 0.105, B2 = 0.065;
  const N = 96;
  // Spin holds steady in the air and eases a touch before it hits the table.
  const vel = (p) => (p < 0.8 ? 1 : 1 - 0.62 * ((p - 0.8) / 0.2));
  const cum = [0];
  for (let i = 1; i <= 200; i++) cum.push(cum[i - 1] + vel(i / 200));
  const spin = (p) => cum[Math.round(clamp(p, 0, 1) * 200)] / cum[200];

  const body = [], shadow = [], sheenF = [], sheenB = [], shadeF = [], shadeB = [], faceF = [], faceB = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let h = 0, ang, wy, wz, dx;
    if (u < F) {
      const p = u / F;
      h = 4 * p * (1 - p);
      const env = Math.pow(Math.sin(Math.PI * p), 0.6);
      ang = from + (sweep + overshoot) * spin(p);
      wy = wob * 10 * Math.sin(2 * Math.PI * 1.35 * p) * env;
      wz = 7 * Math.sin(2 * Math.PI * 0.9 * p + 0.7) * env;
      dx = drift * size * Math.sin(Math.PI * p);
    } else {
      const s = (u - F) / (1 - F);
      const ub = u - F;
      if (ub < B1) h = 0.1 * 4 * (ub / B1) * (1 - ub / B1);
      else if (ub < B1 + B2) { const q = (ub - B1) / B2; h = 0.032 * 4 * q * (1 - q); }
      const decay = Math.exp(-4.4 * s);
      ang = from + sweep + overshoot * decay * Math.cos(2 * Math.PI * 2.15 * s);
      wy = wob * 3.5 * decay * Math.sin(2 * Math.PI * 3.1 * s);
      wz = 2.2 * decay * Math.sin(2 * Math.PI * 2.4 * s + 1);
      dx = 0;
    }
    if (i === N) { ang = from + sweep; wy = 0; wz = 0; dx = 0; h = 0; }
    const y = -0.46 * size * h;
    const z = 1.12 * size * h;
    body.push({
      offset: u,
      transform: `perspective(${px(persp)}) translate3d(${px(dx)},${px(y)},${px(z)}) rotateZ(${wz.toFixed(2)}deg) rotateY(${wy.toFixed(2)}deg) rotateX(${ang.toFixed(2)}deg)`,
    });
    const c = Math.cos(rad(ang));
    const sn = Math.sin(rad(ang));
    const thin = clamp(Math.abs(c), 0.07, 1);
    const k = 1 - 0.3 * h;
    shadow.push({
      offset: u,
      opacity: +(0.62 - 0.36 * Math.min(h, 1)).toFixed(3),
      transform: `translate(${px(size * (0.045 + 0.09 * h))},${px(size * (0.075 + 0.16 * h))}) scale(${(k * 0.98).toFixed(3)},${(k * thin).toFixed(3)})`,
      filter: `blur(${(size * (0.018 + 0.05 * h)).toFixed(2)}px)`,
    });
    // A band of light slides over each face as it turns (faces are laid out at 2x, so doubled px), and the face darkens as it turns away.
    const bandF = `translateY(${px(-size * 0.68 - size * 1.9 * sn)})`;
    const bandB = `translateY(${px(-size * 0.68 + size * 1.9 * sn)})`;
    sheenF.push({ offset: u, transform: bandF });
    sheenB.push({ offset: u, transform: bandB });
    const dark = +(0.04 + 0.5 * Math.pow(1 - Math.abs(c), 1.3)).toFixed(3);
    shadeF.push({ offset: u, opacity: dark });
    shadeB.push({ offset: u, opacity: dark });
    // The face turned away is also switched off outright, so the coin reads
    // right even where an engine flattens the 3D (no backface culling): at
    // rest the stylesheet does this from data-rest, in the air the keyframes do.
    const frontUp = c >= 0;
    faceF.push({ offset: u, visibility: frontUp ? "visible" : "hidden" });
    faceB.push({ offset: u, visibility: frontUp ? "hidden" : "visible" });
  }

  const easing = "linear"; // the samples already carry the physics
  const timing = { duration: ms, easing, fill: "none" };
  const anims = [];
  const main = coinEl.animate(body, timing);
  anims.push(main);
  const sh = shadowOf(coinEl);
  if (sh) anims.push(sh.animate(shadow, timing));
  const s = sheensOf(coinEl);
  s.front.forEach((el) => anims.push(el.animate(sheenF, timing)));
  s.back.forEach((el) => anims.push(el.animate(sheenB, timing)));
  s.frontShade.forEach((el) => anims.push(el.animate(shadeF, timing)));
  s.backShade.forEach((el) => anims.push(el.animate(shadeB, timing)));
  const front = coinEl.querySelector(":scope > .cf-front");
  const back = coinEl.querySelector(":scope > .cf-back");
  if (front) anims.push(front.animate(faceF, timing));
  if (back) anims.push(back.animate(faceB, timing));
  coinEl._cfAnim = main;
  coinEl._cfAnims = anims;

  return new Promise((resolve) => {
    main.onfinish = () => {
      if (coinEl._cfAnim === main) { coinEl._cfAnim = null; coinEl._cfAnims = []; }
      resolve(true);
    };
    main.oncancel = () => resolve(false);
  });
}
