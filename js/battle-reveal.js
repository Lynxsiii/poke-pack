/* Pack battles: the reveal engine.

   The table owns every lane's frame; this module owns what happens inside
   each lane's stage (`.tb-stage`): a sealed pack waiting, the tear, the deal,
   the hits, the end state of a round, and the finale where the losers' cards
   fly to the winners.

   One round, every lane at once:
     tremble   the sealed wrapper shivers once or twice
     tear      the top strip peels off along a rough line (three hinged
               pieces of the same wrapper art, like js/tear.js's lid but
               driven by a clock), flips to its silver inside and is thrown
               clear; the torn edge flashes once
     rise      the stack of cards (card backs) rises out as the pack drops
     deal      the cards turn one by one on the stack and tuck into a fan
               behind it: quick for bulk, slower towards the rare slot
     hits      Double Rare and up: a charged pause, a clean burst of light
               from behind, the card rising to the front; chase cards get a
               tremble, a ring and a sweep across the face as well
     end       the round's best card face up in front (a real .tcg that
               tilts with the pointer), the rest fanned behind it

   Performance: only transform and opacity move (Web Animations API), the
   whole round is scheduled on the animation timeline up front so a busy
   main thread cannot push the choreography apart, faces are decoded while
   the pack trembles, a lane holds at most MAX_CARD_ELS card elements, and
   at the end every card is flattened back to a plain 2D transform with no
   animation left on it. The flip is a single rotating layer whose two faces
   swap at the edge-on moment, so nothing relies on preserve-3d. */
import { coins, hitTier, isBulk, wrapperArt } from "./battle-kit.js";

const CARD_RATIO = 88 / 63;
const PACK_RATIO = 0.575; // booster wrapper art, width / height
const MAX_CARD_ELS = 12;

const EASE = {
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  soft: "cubic-bezier(0.3, 0.7, 0.35, 1)",
  in: "cubic-bezier(0.55, 0, 0.85, 0.35)",
  inOut: "cubic-bezier(0.45, 0, 0.25, 1)",
  spring: "cubic-bezier(0.3, 1.35, 0.6, 1)",
  turn: "cubic-bezier(0.32, 0.06, 0.22, 1)",
  snap: "cubic-bezier(0.1, 0.75, 0.25, 1)",
  lin: "linear",
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A card pose inside a stage: centre x/y in px, rotation in degrees, scale. */
const pose = (x, y, a = 0, s = 1) => ({ x, y, a, s });
const tf = (p) => `translate(${r2(p.x)}px, ${r2(p.y)}px) rotate(${r2(p.a)}deg) scale(${Math.round(p.s * 1000) / 1000})`;
const mix = (p, q, t) => pose(lerp(p.x, q.x, t), lerp(p.y, q.y, t), lerp(p.a, q.a, t), lerp(p.s, q.s, t));

const flashOk = () => !document.body.classList.contains("no-flash");
const cardValue = (card) => Number(card?.value) || 0;

/* ---- Geometry ------------------------------------------------------------ */

function geometry(W, H) {
  const cw = clamp(Math.min(W * 0.6, (H * 0.6) / CARD_RATIO), 30, 280);
  const ch = cw * CARD_RATIO;
  const heroX = W / 2;
  const heroY = Math.min(H * 0.6, H - ch / 2 - Math.max(4, H * 0.025));
  const fanS = 0.8;
  const fanY = heroY - ch * 0.34;
  const R = ch * fanS;
  const ph = Math.min(H * 0.86, (W * 0.74) / PACK_RATIO);
  const pw = ph * PACK_RATIO;
  const packY = Math.min(H * 0.53, H - ph / 2 - 2);
  // The widest the fan may open and still sit inside the stage.
  const fw = (cw * fanS) / 2;
  const fh = (ch * fanS) / 2;
  let maxA = 16;
  while (maxA > 2) {
    const a = (maxA * Math.PI) / 180;
    if (R * Math.sin(a) + fw * Math.cos(a) + fh * Math.sin(a) <= W / 2 - 2) break;
    maxA -= 0.5;
  }
  return { W, H, cw, ch, heroX, heroY, fanS, fanY, R, pw, ph, packX: W / 2, packY, maxA, big: cw > 150 };
}

/** Slot k of m in the fan behind the front card. */
function fanPose(g, k, m) {
  if (m <= 1) return pose(g.heroX, g.fanY, 0, g.fanS);
  const spread = Math.min(g.maxA, 2.4 * (m - 1));
  const a = -spread + (2 * spread * k) / (m - 1);
  const rad = (a * Math.PI) / 180;
  return pose(g.heroX + g.R * Math.sin(rad), g.fanY + g.R * (1 - Math.cos(rad)), a, g.fanS);
}

const deckPose = (g, depth) => pose(g.heroX + depth * 0.35, g.heroY + depth * 0.7, 0, 1);
const heroPose = (g) => pose(g.heroX, g.heroY, 0, 1);
const liftPose = (g) => pose(g.heroX, g.heroY - g.ch * 0.045, 0, 1.035);

/* ---- Tear line ----------------------------------------------------------- */

/** A rough, wandering tear line across the pack (px, pack space). */
function tearLine(pw, ph) {
  const pts = [];
  const base = ph * 0.082;
  let x = 0;
  let wander = 0;
  let drift = 0;
  while (x < pw) {
    drift = clamp(drift + (Math.random() - 0.5) * 0.5, -0.45, 0.45);
    wander = clamp(wander + drift, -1.3, 1.3);
    let rough = (Math.random() - 0.5) * 0.6;
    if (Math.random() < 0.12) rough += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.8);
    pts.push([x, base + (ph * (wander + rough)) / 100]);
    x += pw * (0.012 + Math.random() * (Math.random() < 0.25 ? 0.05 : 0.025));
  }
  pts.push([pw, base + (ph * wander * 0.6) / 100]);
  return pts;
}

function lineY(line, x) {
  for (let i = 0; i < line.length - 1; i += 1) {
    const [x0, y0] = line[i];
    const [x1, y1] = line[i + 1];
    if (x >= x0 && x <= x1) return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return line[x <= 0 ? 0 : line.length - 1][1];
}

/** The line between two x positions, walking from `from` to `to`, pushed down by `dy`. */
function lineBetween(line, from, to, dy = 0) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const mids = line.filter(([x]) => x > lo + 0.01 && x < hi - 0.01);
  if (from > to) mids.reverse();
  return [[from, lineY(line, from) + dy], ...mids.map(([x, y]) => [x, y + dy]), [to, lineY(line, to) + dy]];
}

const poly = (pts) => `polygon(${pts.map(([x, y]) => `${r2(x)}px ${r2(y)}px`).join(",")})`;
const pathD = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${r2(x)} ${r2(y)}`).join("");

/* ---- Light sampled from the art ------------------------------------------ */

const tintCache = new Map();
/** A bright, saturated colour from a decoded card image, as "r g b". White if it can't be read. */
function sampleTint(img) {
  const key = img?.currentSrc || img?.src;
  if (!key) return "255 255 255";
  if (tintCache.has(key)) return tintCache.get(key);
  let out = "255 255 255";
  try {
    const c = document.createElement("canvas");
    c.width = 12;
    c.height = 16;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, 12, 16);
    const d = g.getImageData(0, 0, 12, 16).data;
    let r = 0;
    let gr = 0;
    let b = 0;
    let w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const weight = ((mx - mn) / 255) ** 2 * (mx / 255) + 0.002;
      r += d[i] * weight;
      gr += d[i + 1] * weight;
      b += d[i + 2] * weight;
      w += weight;
    }
    r /= w;
    gr /= w;
    b /= w;
    // Lift it towards a light: keep the hue, push the brightest channel to ~255.
    const m = Math.max(r, gr, b, 1);
    const k = 245 / m;
    const lift = (v) => Math.round(clamp(v * k * 0.8 + 255 * 0.2, 0, 255));
    out = `${lift(r)} ${lift(gr)} ${lift(b)}`;
  } catch {
    /* tainted or undecoded: white light */
  }
  tintCache.set(key, out);
  return out;
}

/* ---- The engine ---------------------------------------------------------- */

export function createReveal(ctx) {
  const stages = new Map(); // stage element -> state
  const rounds = new Set(); // running rounds (playRound / playFinale)
  let resizeObs = null;
  let flyLayer = null;

  const motionOn = () => (typeof ctx.motion === "function" ? ctx.motion() !== false : true);
  const buzz = (p) => {
    try {
      ctx.buzz?.(p);
    } catch {
      /* haptics are optional */
    }
  };

  /* -- Stage state -- */

  function stageFor(el) {
    let st = stages.get(el);
    if (!st) {
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      st = { el, root: null, g: null, deck: null, fx: null, gains: null, pack: null, cards: [], packKey: "", last: null, size: "" };
      stages.set(el, st);
      if (typeof ResizeObserver === "function") {
        resizeObs ||= new ResizeObserver(onResize);
        resizeObs.observe(el);
      }
    }
    if (!st.root || !st.root.isConnected || st.root.parentNode !== el) {
      st.root = document.createElement("div");
      st.root.className = "rv-root";
      el.replaceChildren(st.root);
      st.pack = null;
      st.deck = null;
      st.packKey = "";
    }
    measure(st);
    return st;
  }

  function measure(st) {
    const W = st.el.clientWidth || 172;
    const H = st.el.clientHeight || 244;
    st.size = `${W}x${H}`;
    st.g = geometry(W, H);
    st.root.style.setProperty("--cw", `${r2(st.g.cw)}px`);
    st.root.style.setProperty("--ch", `${r2(st.g.ch)}px`);
    return st.g;
  }

  function onResize(entries) {
    for (const entry of entries) {
      const st = stages.get(entry.target);
      if (!st || st.busy || !st.last || !st.root?.isConnected) continue;
      const W = st.el.clientWidth;
      const H = st.el.clientHeight;
      if (!W || !H || `${W}x${H}` === st.size) continue;
      const { type, lane, skipCommons } = st.last;
      if (type === "packs") mountPack(stageFor(st.el), lane, { force: true });
      else if (type === "round") mountRound(stageFor(st.el), lane, skipCommons);
    }
  }

  function clearStage(st) {
    st.root.replaceChildren();
    st.pack = null;
    st.deck = null;
    st.fx = null;
    st.gains = null;
    st.cards = [];
    st.packKey = "";
  }

  /* -- Pack (and promo sleeve) -- */

  function wrapperOf(lane) {
    return lane.wrapper || lane.image || wrapperArt(lane.setId) || "";
  }

  function packKeyOf(lane, g) {
    return `${lane.kind === "promo" ? "promo" : "pack"}|${wrapperOf(lane)}|${lane.setId || ""}|${r2(g.W)}x${r2(g.H)}`;
  }

  function buildPack(st, lane) {
    const g = st.g;
    const { pw, ph } = g;
    const art = wrapperOf(lane);
    const line = tearLine(pw, ph);
    const stripH = ph * 0.15;
    const below = Math.max(0.8, ph * 0.005);
    const rim = Math.max(1, ph * 0.006);
    const cuts = [0, pw * rand(0.3, 0.38), pw * rand(0.64, 0.72), pw];
    const ov = 0.6;
    const url = `url(&quot;${esc(art)}&quot;)`;
    // Pieces nest right to left: the right third holds the middle, which holds
    // the left. Each hinges on its right end, so the free end curls up first.
    const segHtml = (i) => {
      const x0 = cuts[i];
      const x1 = cuts[i + 1];
      const parentX0 = i < 2 ? cuts[i + 1] : 0;
      const left = i < 2 ? x0 - parentX0 : x0;
      const artClip = poly([[x0 - ov, 0], [x1 + ov, 0], ...lineBetween(line, x1 + ov, x0 - ov, below)]);
      const rimClip = poly([[x0 - ov, 0], [x1 + ov, 0], ...lineBetween(line, x1 + ov, x0 - ov, below + rim)]);
      const layer = (cls, clip, bg) =>
        `<i class="${cls}" style="left:${r2(-x0)}px;width:${r2(pw)}px;height:${r2(ph)}px;clip-path:${clip};-webkit-clip-path:${clip}${bg}"></i>`;
      return `<div class="rv-seg" data-seg="${i}" style="left:${r2(left)}px;width:${r2(x1 - x0)}px;height:${r2(stripH)}px;transform-origin:100% ${r2(ph * 0.045)}px">${layer(
        "rv-seg-rim",
        rimClip,
        ""
      )}${layer("rv-seg-silver", artClip, "")}${layer("rv-seg-art", artClip, `;background-image:${url};background-size:${r2(pw)}px ${r2(ph)}px`)}${i > 0 ? segHtml(i - 1) : ""}</div>`;
    };
    const bodyClip = poly([...lineBetween(line, 0, pw), [pw, ph], [0, ph]]);
    const edge = pathD(lineBetween(line, 0, pw));
    const el = document.createElement("div");
    el.className = "rv-pack idle";
    el.style.cssText = `left:${r2(g.packX - pw / 2)}px;top:${r2(g.packY - ph / 2)}px;width:${r2(pw)}px;height:${r2(ph)}px`;
    el.innerHTML = `<i class="rv-pack-shadow" aria-hidden="true"></i>
      <div class="rv-bob"><div class="rv-shake">
        <img class="rv-body" src="${esc(art)}" alt="" decoding="async" draggable="false" style="clip-path:${bodyClip};-webkit-clip-path:${bodyClip}" />
        <div class="rv-edge" style="height:${r2(stripH * 1.3)}px"><div class="rv-edge-in"><svg viewBox="0 0 ${r2(pw)} ${r2(ph)}" width="${r2(pw)}" height="${r2(ph)}" aria-hidden="true"><path class="rv-edge-shade" d="${edge}" transform="translate(0 ${r2(ph * 0.004)})"/><path class="rv-edge-lit" d="${edge}"/></svg></div></div>
        <div class="rv-lid" style="width:${r2(pw)}px;height:${r2(stripH)}px">${segHtml(2)}</div>
        <svg class="rv-flash" viewBox="0 0 ${r2(pw)} ${r2(ph)}" width="${r2(pw)}" height="${r2(ph)}" aria-hidden="true"><path class="w" d="${edge}"/><path class="m" d="${edge}"/><path class="c" d="${edge}"/></svg>
        <i class="rv-burst" style="left:${r2(pw)}px;top:${r2(lineY(line, pw))}px" aria-hidden="true"></i>
        <div class="rv-glints" aria-hidden="true"></div>
      </div></div>`;
    const segs = [0, 1, 2].map((i) => el.querySelector(`.rv-seg[data-seg="${i}"]`));
    return {
      el,
      kind: "pack",
      line,
      stripH,
      bob: el.querySelector(".rv-bob"),
      shake: el.querySelector(".rv-shake"),
      body: el.querySelector(".rv-body"),
      edge: el.querySelector(".rv-edge"),
      edgeIn: el.querySelector(".rv-edge-in"),
      lid: el.querySelector(".rv-lid"),
      segs,
      flash: el.querySelector(".rv-flash"),
      burst: el.querySelector(".rv-burst"),
      glints: el.querySelector(".rv-glints"),
      shadow: el.querySelector(".rv-pack-shadow"),
    };
  }

  function buildSleeve(st, lane) {
    const g = st.g;
    const w = g.cw * 1.1;
    const h = g.ch * 1.07;
    const el = document.createElement("div");
    el.className = "rv-pack rv-sleeve idle";
    el.style.cssText = `left:${r2(g.heroX - w / 2)}px;top:${r2(g.heroY - h / 2)}px;width:${r2(w)}px;height:${r2(h)}px`;
    el.innerHTML = `<i class="rv-pack-shadow" aria-hidden="true"></i>
      <div class="rv-bob"><div class="rv-shake">
        <div class="rv-sleeve-card">${ctx.cardBack?.(lane.setId) || ""}</div>
        <div class="rv-sleeve-body" aria-hidden="true"></div>
        <div class="rv-sleeve-glint" aria-hidden="true"><i></i></div>
      </div></div>`;
    return {
      el,
      kind: "promo",
      bob: el.querySelector(".rv-bob"),
      shake: el.querySelector(".rv-shake"),
      body: el.querySelector(".rv-sleeve-body"),
      held: el.querySelector(".rv-sleeve-card"),
      glint: el.querySelector(".rv-sleeve-glint > i"),
      shadow: el.querySelector(".rv-pack-shadow"),
    };
  }

  /** The sealed pack waiting in a stage. Keeps an identical pack that is already there. */
  function mountPack(st, lane, { force = false } = {}) {
    const key = packKeyOf(lane, st.g);
    st.last = { type: "packs", lane };
    if (!force && st.pack && st.packKey === key && !st.deck) {
      st.pack.el.classList.toggle("idle", motionOn());
      return st.pack;
    }
    clearStage(st);
    const pack = lane.kind === "promo" ? buildSleeve(st, lane) : buildPack(st, lane);
    pack.el.classList.toggle("idle", motionOn());
    st.root.appendChild(pack.el);
    st.pack = pack;
    st.packKey = key;
    return pack;
  }

  /* -- Cards -- */

  /** Which cards get an element, the round's best card, and the deal's steps. */
  function planCards(lane, skipCommons) {
    const cards = Array.isArray(lane.cards) ? lane.cards : [];
    const n = cards.length;
    let best = -1;
    cards.forEach((card, i) => {
      if (best < 0) {
        best = i;
        return;
      }
      const a = cardValue(card);
      const b = cardValue(cards[best]);
      if (a > b + 1e-9 || (Math.abs(a - b) <= 1e-9 && hitTier(card) >= hitTier(cards[best]))) best = i;
    });
    // Bulk that is skipped, or that would take the lane past its element
    // budget, moves as one squared pile instead of card by card.
    const bulk = cards.map((card, i) => i !== best && isBulk(card));
    const grouped = new Set();
    if (skipCommons) cards.forEach((_, i) => bulk[i] && grouped.add(i));
    const over = n - MAX_CARD_ELS;
    if (over > 0) {
      const extra = cards.map((_, i) => i).filter((i) => bulk[i] && !grouped.has(i));
      extra.slice(0, over + 1).forEach((i) => grouped.add(i));
    }
    // Elements: a pile shows its last few cards; a lane never passes the budget.
    const groupIdx = [...grouped].sort((a, b) => a - b);
    const pileShown = new Set(groupIdx.slice(-3));
    const shown = cards.map((_, i) => !grouped.has(i) || pileShown.has(i));
    let count = shown.filter(Boolean).length;
    for (let i = 0; i < n && count > MAX_CARD_ELS; i += 1) {
      if (shown[i] && i !== best) {
        shown[i] = false;
        grouped.add(i);
        count -= 1;
      }
    }
    const steps = [];
    let group = null;
    cards.forEach((card, i) => {
      if (grouped.has(i)) {
        if (!group) {
          group = { kind: "group", idxs: [], value: 0, tier: 0 };
          steps.push(group);
        }
        group.idxs.push(i);
        group.value += cardValue(card);
      } else {
        steps.push({ kind: "card", idx: i, card, tier: hitTier(card), bulk: isBulk(card), value: cardValue(card) });
      }
    });
    return { cards, n, best, shown, steps };
  }

  function cardHtml(ctxCard, i, isHero, g, setId, faceUp) {
    const face = ctx.cardFace ? ctx.cardFace(ctxCard, { small: !(isHero && g.big), lazy: false, stamp: isHero }) : "";
    const back = faceUp ? "" : `<div class="rv-face rv-back">${ctx.cardBack ? ctx.cardBack(setId) : ""}</div>`;
    return `<div class="rv-card${faceUp ? " up" : ""}" data-card-id="${esc(ctxCard?.id || "")}" data-card-index="${i}"><div class="rv-turn"><div class="rv-face rv-front">${face}</div>${back}</div></div>`;
  }

  function buildCards(st, lane, plan, faceUp) {
    const deck = document.createElement("div");
    deck.className = "rv-deck";
    const html = [];
    plan.cards.forEach((card, i) => {
      if (plan.shown[i]) html.push(cardHtml(card, i, i === plan.best, st.g, lane.setId, faceUp));
    });
    const g = st.g;
    deck.innerHTML = `<i class="rv-halo" style="left:${r2(g.heroX)}px;top:${r2(g.heroY - g.ch * 0.04)}px" aria-hidden="true"></i>${html.join("")}`;
    const els = new Map();
    deck.querySelectorAll(".rv-card").forEach((el) => els.set(Number(el.dataset.cardIndex), el));
    return { deck, els, halo: deck.querySelector(".rv-halo") };
  }

  /** Final positions: the best card in front, every other step fanned behind in pull order. */
  function endLayout(g, plan) {
    const fanSteps = plan.steps.filter((s) => !(s.kind === "card" && s.idx === plan.best));
    const m = fanSteps.length;
    const out = new Map(); // idx -> {p, z}
    fanSteps.forEach((s, k) => {
      const slot = fanPose(g, k, m);
      if (s.kind === "group") {
        const shownIdx = s.idxs.filter((i) => plan.shown[i]);
        shownIdx.forEach((i, q) => {
          const tilt = [-2.2, 1.6, -0.6][q % 3];
          out.set(i, { p: pose(slot.x - q * 0.9, slot.y - q * 1.1, slot.a + tilt, slot.s), z: 2 + k * 3 + q });
        });
      } else {
        out.set(s.idx, { p: slot, z: 2 + k * 3 });
      }
    });
    if (plan.best >= 0) out.set(plan.best, { p: heroPose(g), z: 80 });
    return out;
  }

  function applyPose(el, p, z) {
    el.style.transform = tf(p);
    if (z != null) el.style.zIndex = String(z);
  }

  /** A hit keeps a faint pool of its light behind it once the round is over. */
  function restHalo(halo, plan) {
    const best = plan.cards[plan.best];
    const tier = best ? hitTier(best) : 0;
    halo.classList.toggle("rest", tier >= 2 && flashOk());
  }

  /** The finished round, instantly. */
  function mountRound(st, lane, skipCommons) {
    clearStage(st);
    st.last = { type: "round", lane, skipCommons };
    const plan = planCards(lane, skipCommons);
    if (!plan.n) return plan;
    const built = buildCards(st, lane, plan, true);
    const layout = endLayout(st.g, plan);
    built.els.forEach((el, i) => {
      const at = layout.get(i);
      if (at) applyPose(el, at.p, at.z);
    });
    restHalo(built.halo, plan);
    const bestImg = built.els.get(plan.best)?.querySelector(".rv-front img");
    if (bestImg && hitTier(plan.cards[plan.best]) >= 2) {
      const read = () => built.halo.style.setProperty("--rv-tint", sampleTint(bestImg));
      if (bestImg.complete && bestImg.naturalWidth) read();
      else bestImg.addEventListener("load", read, { once: true });
    }
    st.root.appendChild(built.deck);
    st.deck = built.deck;
    st.cards = [...built.els.values()];
    st.root.classList.add("settled");
    return plan;
  }

  /* -- Round runner: every animation of a round goes through here -- */

  /* Animations are queued with their start time and only created a moment
     before they begin (LEAD ms), so a card becomes a compositor layer when it
     is about to move, not all forty of them in the round's first frame. */
  const LEAD = 260;
  const timelineNow = () => document.timeline?.currentTime ?? performance.now();

  function newRun(duration) {
    const run = { anims: [], timers: [], at: [], queue: [], done: false, resolve: null, stopped: false, duration, t0: timelineNow() + 16 };
    run.promise = new Promise((resolve) => (run.resolve = resolve));
    rounds.add(run);
    return run;
  }

  function A(run, el, frames, delay, duration, easing = EASE.out, extra) {
    if (!el) return;
    run.queue.push({ el, frames, delay: Math.max(0, delay), duration: Math.max(1, duration), easing, extra });
  }

  function create(run, spec) {
    if (run.stopped || !spec.el.isConnected) return;
    const late = timelineNow() - run.t0;
    const a = spec.el.animate(spec.frames, { delay: spec.delay - late, duration: spec.duration, easing: spec.easing, fill: "forwards", ...spec.extra });
    run.anims.push(a);
  }

  /** Call fn at time t on the run's clock (the timeline the animations share). */
  function at(run, t, fn) {
    run.at.push([t, fn]);
  }

  function startTimers(run) {
    // Queue: anything starting soon is created now, the rest in 40ms buckets ahead of time.
    const buckets = new Map();
    for (const spec of run.queue) {
      if (spec.delay < LEAD) create(run, spec);
      else {
        const key = Math.floor((spec.delay - LEAD) / 40) * 40;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(spec);
      }
    }
    run.queue = [];
    for (const [t, specs] of buckets) run.at.push([t, () => specs.forEach((spec) => create(run, spec))]);
    const now = timelineNow();
    for (const [t, fn] of run.at) {
      const id = setTimeout(() => {
        if (!run.stopped) fn();
      }, Math.max(0, run.t0 + t - now));
      run.timers.push(id);
    }
    run.at = [];
  }

  function finishRun(run, value) {
    if (run.done) return;
    run.done = true;
    rounds.delete(run);
    run.resolve(value);
  }

  function cancelRun(run) {
    run.stopped = true;
    run.timers.forEach(clearTimeout);
    run.timers = [];
    run.at = [];
    for (const a of run.anims) {
      try {
        a.cancel();
      } catch {
        /* already gone */
      }
    }
    run.anims = [];
    finishRun(run, { stopped: true });
  }

  /* -- The flip: one layer turns; its faces swap when it is edge-on -- */

  function flip(run, el, delay, dur, easing = EASE.turn) {
    const turn = el.querySelector(".rv-turn");
    const back = el.querySelector(".rv-back");
    const front = el.querySelector(".rv-front");
    A(run, turn, [{ transform: "perspective(520px) rotateY(0deg)" }, { transform: "perspective(520px) rotateY(180deg)" }], delay, dur, easing);
    const hide = [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }];
    const show = [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }];
    A(run, back, hide, delay, dur, easing);
    A(run, front, show, delay, dur, easing);
  }

  /** Flatten a card to its resting 2D pose: no animation, no back, no 3D. */
  function settleCard(el, p, z) {
    for (const a of el.getAnimations({ subtree: true })) {
      try {
        a.cancel();
      } catch {
        /* gone */
      }
    }
    el.querySelector(".rv-back")?.remove();
    el.querySelector(".rv-sweep")?.remove();
    el.classList.add("up");
    el.style.willChange = "";
    applyPose(el, p, z);
  }

  /* -- Value figures -- */

  function gain(run, st, t, value, big = false) {
    if (!(value > 0.004)) return;
    at(run, t, () => {
      if (!st.root.isConnected) return;
      const g = st.g;
      const el = document.createElement("span");
      el.className = `rv-gain${big ? " big" : ""}`;
      el.innerHTML = `+<span aria-hidden="true">✦</span>${coins(value)}`;
      el.style.left = `${r2(g.heroX)}px`;
      el.style.top = `${r2(Math.max(10, g.fanY - (g.ch * g.fanS) / 2 - 4))}px`;
      st.root.appendChild(el);
      const a = el.animate(
        [
          { opacity: 0, transform: "translate(-50%, 6px) scale(0.9)" },
          { opacity: 1, transform: "translate(-50%, -4px) scale(1)", offset: 0.22 },
          { opacity: 1, transform: "translate(-50%, -12px) scale(1)", offset: 0.7 },
          { opacity: 0, transform: "translate(-50%, -18px) scale(1)" },
        ],
        { duration: big ? 1300 : 950, easing: EASE.out, fill: "forwards" }
      );
      run.anims.push(a);
      a.finished.then(() => el.remove(), () => el.remove());
    });
  }

  /* -- Hit light -- */

  function hitFx(run, st, parts, t, tier, tint) {
    if (!flashOk()) return;
    const g = st.g;
    const fx = document.createElement("div");
    fx.className = `rv-hitfx t${tier}`;
    fx.style.cssText = `left:${r2(g.heroX)}px;top:${r2(g.heroY - g.ch * 0.06)}px`;
    const sparks = tier >= 3 ? 10 : 7;
    const reach = g.cw * (tier >= 3 ? 1.05 : 0.85);
    let html = `<i class="rv-ring"></i>${tier >= 3 ? '<i class="rv-ring r2"></i>' : ""}`;
    for (let i = 0; i < sparks; i += 1) html += `<i class="rv-spark"></i>`;
    fx.innerHTML = html;
    parts.deck.appendChild(fx);
    at(run, Math.max(0, t - 400), () => {
      const live = tint();
      fx.style.setProperty("--rv-tint", live);
      parts.halo.style.setProperty("--rv-tint", live);
    });
    const rings = fx.querySelectorAll(".rv-ring");
    rings.forEach((ring, i) =>
      A(run, ring, [{ opacity: 0.95, transform: "scale(0.35)" }, { opacity: 0.4, offset: 0.55 }, { opacity: 0, transform: `scale(${tier >= 3 ? 3.4 : 2.6})` }], t + i * 150, 700, EASE.snap)
    );
    fx.querySelectorAll(".rv-spark").forEach((spark, i) => {
      const ang = (Math.PI * 2 * i) / sparks + rand(-0.25, 0.25);
      const d = reach * rand(0.7, 1.15);
      const x = Math.cos(ang) * d;
      const y = Math.sin(ang) * d;
      A(
        run,
        spark,
        [
          { opacity: 1, transform: "translate(0px, 0px) scale(0.6)" },
          { opacity: 1, transform: `translate(${r2(x * 0.45)}px, ${r2(y * 0.45)}px) scale(1.1)`, offset: 0.25 },
          { opacity: 0, transform: `translate(${r2(x)}px, ${r2(y)}px) scale(0.25)` },
        ],
        t + rand(0, 70),
        rand(700, 900),
        EASE.snap
      );
    });
    at(run, t + 1400, () => fx.remove());
  }

  /* -- Choreography -- */

  /** The fixed part of a round (tremble, tear, rise), in ms at 1x. */
  function introTimes(fast, k, packIn) {
    const s = (ms) => Math.round(ms * k);
    const t0 = packIn ? s(fast ? 220 : 340) : 0;
    if (fast) {
      return {
        packIn: t0,
        tremble: [t0, s(170)],
        peel: [t0 + s(150), s(210)],
        toss: [t0 + s(330), s(380)],
        rise: [t0 + s(380), s(260)],
        drop: [t0 + s(420), s(320)],
        settle: [t0 + s(640), s(220)],
        deal: t0 + s(700),
      };
    }
    return {
      packIn: t0,
      tremble: [t0, s(460)],
      peel: [t0 + s(440), s(330)],
      toss: [t0 + s(750), s(500)],
      rise: [t0 + s(830), s(440)],
      drop: [t0 + s(900), s(480)],
      settle: [t0 + s(1270), s(340)],
      deal: t0 + s(1560),
    };
  }

  function runIntro(run, st, parts, lane, T, fast) {
    const g = st.g;
    const pack = st.pack;
    const flash = flashOk();
    const pk = pack.el;
    pk.classList.remove("idle");
    pk.style.willChange = "transform, opacity";
    if (T.packIn) {
      A(run, pk, [{ opacity: 0, transform: `translateY(${r2(g.ph * 0.28)}px) scale(0.9)` }, { opacity: 1, transform: "none" }], 0, T.packIn, EASE.spring);
    }
    // Tremble: small, quickening shivers, the last one settling.
    const [t0, td] = T.tremble;
    if (flash) {
      const amp = fast ? 1 : 1.4;
      A(
        run,
        pack.shake,
        [
          { transform: "none" },
          { transform: `translate(${-amp}px, 0px) rotate(${-1.2 * amp}deg)`, offset: 0.14 },
          { transform: `translate(${amp}px, -1px) rotate(${1.3 * amp}deg)`, offset: 0.3 },
          { transform: `translate(${-amp}px, 0px) rotate(${-1.6 * amp}deg)`, offset: 0.46 },
          { transform: `translate(${amp * 1.2}px, -1px) rotate(${1.8 * amp}deg)`, offset: 0.62 },
          { transform: `translate(${-amp * 0.8}px, 0px) rotate(${-1.1 * amp}deg)`, offset: 0.78 },
          { transform: `translate(0px, -1px) rotate(0.3deg)`, offset: 0.9 },
          { transform: "none" },
        ],
        t0,
        td,
        EASE.lin
      );
    }
    if (pack.kind === "promo") {
      runSleeve(run, st, parts, T, fast);
      return;
    }
    // Tear: the free end lifts first, then the middle, then the hinge lets go.
    const [p0, pd] = T.peel;
    const [s0, s1, s2] = pack.segs;
    const lift = (el, when, dur, deg) =>
      A(run, el, [{ transform: "none" }, { transform: `rotate(${deg}deg)` }], when, dur, EASE.soft);
    lift(s0, p0, pd * 0.7, 26);
    lift(s1, p0 + pd * 0.3, pd * 0.7, 12);
    lift(s2, p0 + pd * 0.62, pd * 0.5, 6);
    pack.segs.forEach((seg, i) => {
      const rimEl = seg.querySelector(":scope > .rv-seg-rim");
      A(run, rimEl, [{ opacity: 0 }, { opacity: 1 }], p0 + pd * (i * 0.3), pd * 0.25, EASE.lin);
    });
    // The torn edge on the body appears behind the front as it runs across.
    A(run, pack.edge, [{ transform: "translateX(-100%)" }, { transform: "translateX(0)" }], p0, pd, EASE.inOut);
    A(run, pack.edgeIn, [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], p0, pd, EASE.inOut);
    // Toss: up and away along the tear, turning over to its silver inside.
    const [q0, qd] = T.toss;
    A(
      run,
      pack.lid,
      [
        { transform: "perspective(420px) translate(0px, 0px) rotate(0deg) rotateX(0deg)", opacity: 1 },
        { transform: `perspective(420px) translate(${r2(g.pw * 0.12)}px, ${r2(-g.ph * 0.1)}px) rotate(10deg) rotateX(-70deg)`, opacity: 1, offset: 0.38 },
        { transform: `perspective(420px) translate(${r2(g.pw * 0.38)}px, ${r2(-g.ph * 0.26)}px) rotate(24deg) rotateX(-160deg)`, opacity: 0 },
      ],
      q0,
      qd,
      EASE.out
    );
    // The printed side gives way to the silver as the lid passes edge-on.
    pack.segs.forEach((seg) => {
      const artEl = seg.querySelector(":scope > .rv-seg-art");
      const silverEl = seg.querySelector(":scope > .rv-seg-silver");
      A(run, artEl, [{ opacity: 1 }, { opacity: 1, offset: 0.44 }, { opacity: 0, offset: 0.46 }, { opacity: 0 }], q0, qd, EASE.out);
      A(run, silverEl, [{ opacity: 0 }, { opacity: 0, offset: 0.44 }, { opacity: 1, offset: 0.46 }, { opacity: 1 }], q0, qd, EASE.out);
    });
    if (flash) {
      A(
        run,
        pack.flash,
        [
          { opacity: 0, transform: "scaleY(1)" },
          { opacity: 1, transform: "scaleY(1.6)", offset: 0.16 },
          { opacity: 0, transform: "scaleY(1)" },
        ],
        q0 - 20,
        fast ? 360 : 460,
        EASE.out
      );
      A(
        run,
        pack.burst,
        [{ opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.2 }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.8)" }],
        q0 - 30,
        fast ? 380 : 520,
        EASE.out
      );
      // A few flecks of foil thrown off the tear.
      const bits = fast ? 4 : 6;
      let html = "";
      for (let i = 0; i < bits; i += 1) html += `<i class="rv-glint"></i>`;
      pack.glints.innerHTML = html;
      pack.glints.querySelectorAll(".rv-glint").forEach((bit, i) => {
        const x = g.pw * (0.25 + (0.75 * i) / bits) + rand(-4, 4);
        bit.style.left = `${r2(x)}px`;
        bit.style.top = `${r2(lineY(pack.line, x))}px`;
        const gx = rand(8, 40);
        const gy = -rand(14, 46);
        A(
          run,
          bit,
          [{ opacity: 1, transform: "translate(0px, 0px) rotate(0deg)" }, { opacity: 0.9, offset: 0.7 }, { opacity: 0, transform: `translate(${r2(gx)}px, ${r2(gy)}px) rotate(${Math.round(rand(-300, 300))}deg)` }],
          q0 + rand(0, 60),
          rand(420, 620),
          EASE.snap
        );
      });
    }
    riseAndDrop(run, st, parts, T, fast);
  }

  /** The stack rises out of the torn top, the pack drops away, the stack settles. */
  function riseAndDrop(run, st, parts, T, fast) {
    const g = st.g;
    const pack = st.pack;
    const s0 = clamp((g.pw * 0.9) / g.cw, 0.7, 1);
    const tearTop = g.packY - g.ph / 2 + g.ph * 0.082;
    const hidden = tearTop + 5 + (g.ch * s0) / 2 - g.heroY;
    const peek = tearTop - g.ch * (fast ? 0.2 : 0.28) + (g.ch * s0) / 2 - g.heroY;
    const [r0, rd] = T.rise;
    const [d0, dd] = T.drop;
    const [e0, ed] = T.settle;
    parts.deck.style.transform = `translateY(${r2(hidden)}px) scale(${r2(s0)})`;
    parts.deck.style.willChange = "transform";
    A(run, parts.deck, [{ transform: `translateY(${r2(hidden)}px) scale(${r2(s0)})` }, { transform: `translateY(${r2(peek)}px) scale(${r2(s0)})` }], r0, rd, EASE.out);
    A(run, parts.deck, [{ transform: `translateY(${r2(peek)}px) scale(${r2(s0)})` }, { transform: "translateY(0px) scale(1)" }], e0, ed, EASE.inOut);
    A(
      run,
      pack.el,
      [{ transform: "none", opacity: 1 }, { transform: `translateY(${r2(g.ph * 0.16)}px) rotate(2deg)`, opacity: 1, offset: 0.35 }, { transform: `translateY(${r2(g.ph * 0.5)}px) rotate(5deg)`, opacity: 0 }],
      d0,
      dd,
      EASE.in
    );
    at(run, d0 + dd + 30, () => {
      pack.el.remove();
      if (st.pack === pack) st.pack = null;
      parts.deck.style.willChange = "";
    });
  }

  function runSleeve(run, st, parts, T, fast) {
    const g = st.g;
    const pack = st.pack;
    const [p0, pd] = T.peel;
    // A gentle glint runs over the plastic, then the cards slide out of the top.
    A(run, pack.glint, [{ transform: "translateX(-66.7%)" }, { transform: "translateX(0%)" }], p0 - pd * 0.4, pd * 2.2, EASE.inOut);
    const [r0, rd] = T.rise;
    const [d0, dd] = T.drop;
    const [e0, ed] = T.settle;
    const peek = -g.ch * (fast ? 0.42 : 0.55);
    parts.deck.style.willChange = "transform";
    parts.deck.style.transform = "translateY(0px)";
    at(run, r0, () => pack.held?.remove());
    A(run, parts.deck, [{ transform: "translateY(0px)" }, { transform: `translateY(${r2(peek)}px)` }], r0, rd + 80, EASE.out);
    A(run, parts.deck, [{ transform: `translateY(${r2(peek)}px)` }, { transform: "translateY(0px)" }], e0 + 60, ed + 80, EASE.inOut);
    A(run, pack.el, [{ transform: "none", opacity: 1 }, { transform: `translateY(${r2(g.ch * 0.5)}px) scale(0.96)`, opacity: 0 }], d0 + 40, dd, EASE.in);
    at(run, d0 + dd + 80, () => {
      pack.el.remove();
      if (st.pack === pack) st.pack = null;
      parts.deck.style.willChange = "";
    });
  }

  /**
   * Timing of the deal for one lane. Every duration has an ideal and a floor;
   * the lane is fitted into its window by easing from ideal towards the floor,
   * and only below that by squeezing everything evenly.
   */
  function dealTimes(plan, window, fast) {
    const steps = plan.steps;
    const m = steps.length;
    const last = m - 1;
    const rows = steps.map((s, j) => {
      const ramp = m > 1 ? 1 + 0.55 * (j / (m - 1)) ** 2 : 1;
      const tier = s.kind === "group" ? 0 : s.tier;
      const hit = tier >= 2 && flashOk();
      const row = {
        charge: hit ? (tier >= 3 ? [950, 560] : [560, 340]) : j === last && m > 2 ? [260, 120] : [0, 0],
        turn: s.kind === "group" ? [440, 280] : tier >= 2 ? [440, 300] : tier === 1 ? [380 * ramp, 240] : [300 * ramp, 170],
        pop: hit ? (tier >= 3 ? [760, 480] : [540, 360]) : [0, 0],
        hold: s.kind === "group" ? [220, 90] : hit ? [420, 160] : tier === 1 ? [240 * ramp, 90] : [70 * ramp, 10],
      };
      return row;
    });
    const endBeat = [560, 360];
    const sum = (key) => rows.reduce((a, r) => a + r[key][0], 0);
    const sumMin = (key) => rows.reduce((a, r) => a + r[key][1], 0);
    const keys = ["charge", "turn", "pop", "hold"];
    const ideal = keys.reduce((a, k) => a + sum(k), 0) + endBeat[0];
    const floor = keys.reduce((a, k) => a + sumMin(k), 0) + endBeat[1];
    let alpha = 1;
    let squeeze = 1;
    if (ideal > window) {
      if (floor <= window) alpha = (window - floor) / Math.max(1, ideal - floor);
      else {
        alpha = 0;
        squeeze = window / floor;
      }
    } else if (!fast) {
      // Room to spare (a promo round, a short pack): take it a little slower.
      squeeze = Math.min(1.35, window / ideal);
    }
    const pick = ([hi, lo]) => (lo + (hi - lo) * alpha) * squeeze;
    return {
      rows: rows.map((r) => ({ charge: pick(r.charge), turn: pick(r.turn), pop: pick(r.pop), hold: pick(r.hold) })),
      endBeat: pick(endBeat),
    };
  }

  function sweepEl(el, tier) {
    const s = document.createElement("i");
    s.className = `rv-sweep t${tier}`;
    s.innerHTML = "<i></i>";
    el.appendChild(s);
    return s.firstElementChild;
  }

  function deckOrder(plan) {
    // The deck lists shown cards top first, in the order they will be turned.
    const order = [];
    for (const s of plan.steps) {
      if (s.kind === "group") s.idxs.forEach((i) => plan.shown[i] && order.push(i));
      else if (plan.shown[s.idx]) order.push(s.idx);
    }
    return order;
  }

  /** Normal pace: every step turns on the stack, then tucks into the fan. */
  function runDeal(run, st, parts, lane, plan, T0, windowEnd, cb) {
    const g = st.g;
    const { rows, endBeat } = dealTimes(plan, windowEnd - T0, false);
    const layout = endLayout(g, plan);
    const order = deckOrder(plan);
    order.forEach((i, depth) => {
      const el = parts.els.get(i);
      applyPose(el, deckPose(g, depth), 60 - depth);
    });
    const fanM = plan.steps.length - (plan.best >= 0 ? 1 : 0);
    const bestSlot = fanPose(g, Math.floor(fanM / 2), Math.max(1, fanM));
    const heroTemp = pose(bestSlot.x, bestSlot.y - g.ch * 0.04, 0, g.fanS);
    let t = T0;
    let running = 0;
    let bulkRun = 0;
    let bulkEnd = 0;
    let heroEl = null;
    let heroAt = null; // where the best card waits if it is not the last step
    const L = liftPose(g);
    const lastJ = plan.steps.length - 1;
    const tuck = (el, from, to, z, when, dur) => {
      const mid = pose(lerp(from.x, to.x, 0.55), Math.min(from.y, to.y) - g.ch * 0.2, to.a * 0.6, lerp(from.s, to.s, 0.6));
      A(run, el, [{ transform: tf(from) }, { transform: tf(mid), offset: 0.45, easing: EASE.inOut }, { transform: tf(to) }], when, dur, EASE.out);
      at(run, when + dur * 0.42, () => (el.style.zIndex = String(z)));
    };
    plan.steps.forEach((s, j) => {
      const row = rows[j];
      const isLast = j === lastJ;
      const idxs = s.kind === "group" ? s.idxs.filter((i) => plan.shown[i]) : [s.idx];
      const els = idxs.map((i) => parts.els.get(i)).filter(Boolean);
      const tier = s.kind === "group" ? 0 : s.tier;
      const hit = tier >= 2 && flashOk();
      const start = t;
      const turnAt = start + row.charge;
      const from = els.map((el) => deckPose(g, order.indexOf(Number(el.dataset.cardIndex))));
      // Charge: the card lifts off the stack; a hit trembles while light gathers behind it.
      if (row.charge > 1) {
        const C = hit ? pose(g.heroX, g.heroY - g.ch * 0.07, 0, 1.07) : L;
        els.forEach((el, q) => {
          if (hit) {
            const amp = tier >= 3 ? 2.6 : 1.6;
            const frames = [{ transform: tf(from[q]) }];
            const n = tier >= 3 ? 10 : 6;
            for (let f = 1; f < n; f += 1) {
              const k = f / n;
              const jit = amp * k * (f % 2 ? -1 : 1);
              frames.push({ transform: tf(pose(lerp(from[q].x, C.x, k) + jit * 0.8, lerp(from[q].y, C.y, k), jit, lerp(1, C.s, k))), offset: k });
            }
            frames.push({ transform: tf(C) });
            A(run, el, frames, start, row.charge, EASE.lin);
          } else {
            A(run, el, [{ transform: tf(from[q]) }, { transform: tf(C) }], start, row.charge * 0.7, EASE.out);
          }
        });
        if (hit) {
          A(run, parts.halo, [{ opacity: 0, transform: "translate(-50%, -50%) scale(0.5)" }, { opacity: 0.9, transform: "translate(-50%, -50%) scale(1)" }], start, row.charge, "cubic-bezier(0.5, 0, 0.8, 0.4)");
          at(run, start, () => buzz(tier >= 3 ? [8, 60, 8, 60, 8] : 8));
          if (tier >= 3) at(run, start, () => st.root.classList.add("charging"));
        }
      }
      // Turn: lift and flip on top of the stack; a hit rises and swells as it lands.
      const fromTurn = row.charge > 1 ? (hit ? pose(g.heroX, g.heroY - g.ch * 0.07, 0, 1.07) : L) : null;
      els.forEach((el, q) => {
        const f0 = fromTurn || from[q];
        if (hit) {
          const P = pose(g.heroX, g.heroY - g.ch * (tier >= 3 ? 0.11 : 0.09), 0, tier >= 3 ? 1.2 : 1.15);
          const total = row.turn + row.pop;
          A(run, el, [{ transform: tf(f0) }, { transform: tf(P), offset: (row.turn * 0.62) / total }, { transform: tf(L) }], turnAt, total, EASE.out);
        } else {
          A(run, el, [{ transform: tf(f0) }, { transform: tf(L) }], turnAt, row.turn, EASE.out);
        }
        flip(run, el, turnAt, row.turn);
      });
      // Light, sound and money land as the face comes round.
      const faceAt = turnAt + row.turn * 0.5;
      if (s.kind === "group") {
        running += s.value;
        const v = running;
        at(run, faceAt, () => cb.onTick(v));
        gain(run, st, faceAt, s.value);
      } else {
        running += s.value;
        const v = running;
        at(run, faceAt, () => cb.onTick(v));
        if (s.bulk) {
          bulkRun += s.value;
          bulkEnd = faceAt;
        } else {
          if (bulkRun > 0) gain(run, st, Math.max(bulkEnd + 60, faceAt - 200), bulkRun);
          bulkRun = 0;
          gain(run, st, faceAt + (hit ? 80 : 0), s.value, hit);
        }
        if (tier >= 1 && motionOn()) {
          const band = sweepEl(els[0], tier);
          A(run, band, [{ transform: "translateX(-66.7%)", opacity: 1 }, { transform: "translateX(0%)", opacity: 1 }], turnAt + row.turn * 0.8, tier >= 3 ? 900 : 700, EASE.inOut);
        }
      }
      if (hit) {
        const burstAt = turnAt + row.turn * 0.42;
        A(run, parts.halo, [{ opacity: 0.95, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: `translate(-50%, -50%) scale(${tier >= 3 ? 2 : 1.7})` }], burstAt, 620, EASE.snap);
        hitFx(run, st, parts, burstAt, tier, () => s.tint || "255 255 255");
        at(run, burstAt, () => {
          st.root.classList.remove("charging");
          buzz(tier >= 3 ? [24, 40, 60] : [18, 30, 30]);
          cb.onHit(s.card, tier);
        });
        if (tier >= 3) {
          A(
            run,
            st.root,
            [
              { transform: "none" },
              { transform: "translate(-4px, 1px) rotate(-0.5deg)", offset: 0.15 },
              { transform: "translate(4px, -1px) rotate(0.4deg)", offset: 0.32 },
              { transform: "translate(-2px, 0px)", offset: 0.55 },
              { transform: "translate(1px, 0px)", offset: 0.78 },
              { transform: "none" },
            ],
            burstAt,
            520,
            EASE.lin
          );
        }
      }
      const shownAt = turnAt + row.turn + row.pop;
      const next = shownAt + row.hold;
      // Tuck: this step leaves the stack for its place in the fan (the best card waits in front of it).
      if (!isLast) {
        const tk = clamp(row.hold + 160, 220, 380);
        const when = next - tk * 0.35;
        els.forEach((el) => {
          const i = Number(el.dataset.cardIndex);
          if (i === plan.best) {
            heroEl = el;
            heroAt = heroTemp;
            tuck(el, L, heroTemp, 30, when, tk);
          } else {
            const dest = layout.get(i);
            tuck(el, L, dest.p, dest.z, when, tk);
          }
        });
        t = next;
      } else {
        t = shownAt;
      }
      s.times = { start, turnAt, shownAt };
    });
    if (bulkRun > 0) gain(run, st, bulkEnd + 80, bulkRun);
    // The end: the last step settles; the best card comes to the front if it was waiting.
    const lastStep = plan.steps[lastJ];
    const lastEls = lastStep.kind === "group" ? lastStep.idxs.filter((i) => plan.shown[i]).map((i) => parts.els.get(i)) : [parts.els.get(lastStep.idx)];
    const endAt = t + (heroEl ? 120 : 0);
    const beat = endBeat;
    lastEls.forEach((el) => {
      if (!el) return;
      const i = Number(el.dataset.cardIndex);
      const dest = layout.get(i);
      if (i === plan.best) {
        A(run, el, [{ transform: tf(L) }, { transform: tf(dest.p) }], endAt, beat * 0.8, EASE.spring);
      } else {
        tuck(el, L, dest.p, dest.z, endAt, beat * 0.75);
      }
    });
    if (heroEl && heroAt) {
      const dest = layout.get(plan.best);
      const up = pose(g.heroX, heroAt.y - g.ch * 0.16, 0, 0.92);
      A(run, heroEl, [{ transform: tf(heroAt) }, { transform: tf(up), offset: 0.35, easing: EASE.inOut }, { transform: tf(dest.p) }], endAt + beat * 0.2, beat, EASE.out);
      at(run, endAt + beat * 0.2 + beat * 0.35, () => (heroEl.style.zIndex = String(dest.z)));
    }
    const finalAt = endAt + beat * (heroEl ? 1.25 : 0.85);
    return { finalAt, layout, running };
  }

  /** Fast pace: everything but the best card turns and fans out in one move, then the hit beat. */
  function runFast(run, st, parts, lane, plan, T0, windowEnd, cb) {
    const g = st.g;
    const layout = endLayout(g, plan);
    const order = deckOrder(plan).filter((i) => i !== plan.best);
    if (plan.best >= 0 && plan.shown[plan.best]) order.push(plan.best); // the best card waits at the bottom
    order.forEach((i, depth) => applyPose(parts.els.get(i), deckPose(g, depth), 60 - depth));
    const span = windowEnd - T0;
    const k = clamp(span / 1500, 0.45, 1.15);
    const heroCard = plan.cards[plan.best];
    const tier = plan.best >= 0 ? hitTier(heroCard) : 0;
    const hit = tier >= 2 && flashOk();
    const waveDur = 420 * k;
    const stagger = Math.min(34 * k, (260 * k) / Math.max(1, order.length));
    let running = 0;
    let waveValue = 0;
    const others = order.filter((i) => i !== plan.best);
    others.forEach((i, q) => {
      const el = parts.els.get(i);
      const dest = layout.get(i);
      const from = deckPose(g, q);
      const when = T0 + q * stagger;
      const mid = pose(lerp(from.x, dest.p.x, 0.5), Math.min(from.y, dest.p.y) - g.ch * 0.16, dest.p.a * 0.5, lerp(1.02, dest.p.s, 0.5));
      A(run, el, [{ transform: tf(from) }, { transform: tf(mid), offset: 0.45 }, { transform: tf(dest.p) }], when, waveDur, EASE.out);
      flip(run, el, when, waveDur * 0.7);
      at(run, when + waveDur * 0.45, () => (el.style.zIndex = String(dest.z)));
    });
    // The skipped and hidden cards count too; their value lands with the wave.
    plan.cards.forEach((c, i) => {
      if (i !== plan.best) waveValue += cardValue(c);
    });
    const waveEnd = T0 + Math.max(0, others.length - 1) * stagger + waveDur;
    if (waveValue > 0 || others.length) {
      running = waveValue;
      const v = running;
      at(run, T0 + waveDur * 0.6, () => cb.onTick(v));
      gain(run, st, T0 + waveDur * 0.6, waveValue);
    }
    let finalAt = waveEnd;
    if (plan.best >= 0 && parts.els.get(plan.best)) {
      const el = parts.els.get(plan.best);
      const L = liftPose(g);
      const from = deckPose(g, 0);
      const charge = hit ? (tier >= 3 ? 520 : 340) * k : 160 * k;
      const turn = 360 * k;
      const pop = hit ? (tier >= 3 ? 560 : 420) * k : 240 * k;
      const start = Math.max(T0 + waveDur * 0.55, waveEnd - 140 * k);
      const C = hit ? pose(g.heroX, g.heroY - g.ch * 0.07, 0, 1.07) : L;
      if (hit) {
        const amp = tier >= 3 ? 2.4 : 1.4;
        const frames = [{ transform: tf(from) }];
        for (let f = 1; f < 6; f += 1) {
          const kk = f / 6;
          const jit = amp * kk * (f % 2 ? -1 : 1);
          frames.push({ transform: tf(pose(lerp(from.x, C.x, kk) + jit, lerp(from.y, C.y, kk), jit, lerp(1, C.s, kk))), offset: kk });
        }
        frames.push({ transform: tf(C) });
        A(run, el, frames, start, charge, EASE.lin);
        A(run, parts.halo, [{ opacity: 0, transform: "translate(-50%, -50%) scale(0.5)" }, { opacity: 0.9, transform: "translate(-50%, -50%) scale(1)" }], start, charge, "cubic-bezier(0.5, 0, 0.8, 0.4)");
      } else {
        A(run, el, [{ transform: tf(from) }, { transform: tf(C) }], start, charge, EASE.out);
      }
      const turnAt = start + charge;
      const P = hit ? pose(g.heroX, g.heroY - g.ch * 0.1, 0, tier >= 3 ? 1.2 : 1.15) : pose(g.heroX, g.heroY - g.ch * 0.02, 0, 1.03);
      A(run, el, [{ transform: tf(C) }, { transform: tf(P), offset: 0.45 }, { transform: tf(heroPose(g)) }], turnAt, turn + pop, EASE.out);
      flip(run, el, turnAt, turn);
      const faceAt = turnAt + turn * 0.5;
      running += cardValue(heroCard);
      const v = running;
      at(run, faceAt, () => cb.onTick(v));
      gain(run, st, faceAt + 60, cardValue(heroCard), hit);
      if (tier >= 1 && motionOn()) {
        const band = sweepEl(el, tier);
        A(run, band, [{ transform: "translateX(-66.7%)", opacity: 1 }, { transform: "translateX(0%)", opacity: 1 }], turnAt + turn * 0.8, 700 * k, EASE.inOut);
      }
      if (hit) {
        const burstAt = turnAt + turn * 0.42;
        A(run, parts.halo, [{ opacity: 0.95, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.8)" }], burstAt, 560, EASE.snap);
        hitFx(run, st, parts, burstAt, tier, () => plan.steps.find((s) => s.idx === plan.best)?.tint || "255 255 255");
        at(run, burstAt, () => {
          buzz(tier >= 3 ? [24, 40, 60] : [18, 30, 30]);
          cb.onHit(heroCard, tier);
        });
      }
      finalAt = Math.max(finalAt, turnAt + turn + pop);
    }
    return { finalAt, layout, running };
  }

  /** Decode the round's faces and read hit light while the pack trembles. */
  function warm(parts, plan) {
    const jobs = [];
    parts.els.forEach((el) => {
      el.querySelectorAll("img").forEach((img) => {
        if (img.decode) jobs.push(img.decode().catch(() => {}));
      });
    });
    plan.steps.forEach((s) => {
      if (s.kind !== "card" || s.tier < 2) return;
      const img = parts.els.get(s.idx)?.querySelector(".rv-front img");
      if (!img) return;
      const read = () => {
        s.tint = sampleTint(img);
        parts.halo.style.setProperty("--rv-tint", s.tint);
      };
      if (img.complete && img.naturalWidth) read();
      else img.decode?.().then(read, () => {});
    });
    return Promise.all(jobs);
  }

  /* ---- Public API ---------------------------------------------------------- */

  function showPacks({ lanes = [] } = {}) {
    for (const lane of lanes) {
      if (!lane?.el) continue;
      const st = stageFor(lane.el);
      if (st.busy) continue;
      st.root.classList.remove("settled", "playing");
      mountPack(st, lane);
    }
  }

  function showRound({ lanes = [], skipCommons = false } = {}) {
    for (const lane of lanes) {
      if (!lane?.el) continue;
      const st = stageFor(lane.el);
      if (st.run) cancelRun(st.run);
      st.busy = false;
      st.run = null;
      st.root.classList.remove("playing", "charging");
      st.root.style.transform = "";
      mountRound(st, lane, skipCommons);
    }
  }

  async function playRound({ lanes = [], duration = 6000, fast = false, skipCommons = false, onTick, onHit } = {}) {
    const live = lanes.filter((lane) => lane?.el);
    const tick = (lane, v) => {
      try {
        onTick?.(lane.seat, v);
      } catch (error) {
        console.error(error);
      }
    };
    const hitCb = (lane, card, tier) => {
      try {
        onHit?.(lane.seat, card, tier);
      } catch (error) {
        console.error(error);
      }
    };
    const totalOf = (lane) => (Number.isFinite(Number(lane.value)) ? Number(lane.value) : (lane.cards || []).reduce((a, c) => a + cardValue(c), 0));
    const D = Math.max(0, Number(duration) || 0);
    if (!motionOn() || D < 900) {
      showRound({ lanes: live, skipCommons });
      live.forEach((lane) => tick(lane, totalOf(lane)));
      return { instant: true };
    }
    const quick = fast || D < 2300;
    const k = quick ? clamp(D / 2600, 0.5, 1.1) : clamp(D / 6000, 0.55, 1.1);
    const run = newRun(D);
    const setups = [];
    for (const lane of live) {
      const st = stageFor(lane.el);
      if (st.run) cancelRun(st.run);
      st.root.classList.remove("settled", "charging");
      st.root.style.transform = "";
      // Last round's cards clear away while the next pack comes up.
      let packIn = false;
      if (!st.pack || st.deck || st.packKey !== packKeyOf(lane, st.g)) {
        const old = st.deck;
        if (old) {
          old.classList.add("rv-leaving");
          st.deck = null;
          st.root.appendChild(old);
        }
        const oldPack = st.pack;
        st.pack = null;
        st.root.querySelectorAll(":scope > .rv-pack").forEach((p) => p.remove());
        oldPack?.el.remove();
        const pack = lane.kind === "promo" ? buildSleeve(st, lane) : buildPack(st, lane);
        st.root.appendChild(pack.el);
        st.pack = pack;
        st.packKey = packKeyOf(lane, st.g);
        packIn = true;
        if (old) {
          A(run, old, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${r2(st.g.ch * 0.12)}px) scale(0.94)` }], 0, 240 * k, EASE.in);
          at(run, 260 * k, () => old.remove());
        }
      }
      const plan = planCards(lane, skipCommons);
      const built = buildCards(st, lane, plan, false);
      st.root.insertBefore(built.deck, st.pack.el);
      st.deck = built.deck;
      st.cards = [...built.els.values()];
      st.busy = true;
      st.run = run;
      st.last = { type: "round", lane, skipCommons };
      st.root.classList.add("playing");
      setups.push({ lane, st, plan, parts: built, packIn });
    }
    const anyPackIn = setups.some((s) => s.packIn);
    const T = introTimes(quick, k, anyPackIn);
    const hold = quick ? 260 * k : Math.max(420, 900 * k);
    const windowEnd = Math.max(T.deal + 400, D - hold);
    let lastFinal = 0;
    for (const s of setups) {
      warm(s.parts, s.plan);
      if (!s.packIn && anyPackIn) {
        // This lane's pack was already waiting; hold it still while the others come in.
      }
      runIntro(run, s.st, s.parts, s.lane, T, quick);
      if (!s.plan.n) {
        s.final = T.deal;
        continue;
      }
      const cb = { onTick: (v) => tick(s.lane, v), onHit: (card, tier) => hitCb(s.lane, card, tier) };
      const res = quick
        ? runFast(run, s.st, s.parts, s.lane, s.plan, T.deal, windowEnd, cb)
        : runDeal(run, s.st, s.parts, s.lane, s.plan, T.deal, windowEnd, cb);
      s.final = res.finalAt;
      s.layout = res.layout;
      s.sum = res.running;
      lastFinal = Math.max(lastFinal, res.finalAt);
    }
    const endAt = Math.min(D, lastFinal + 40);
    for (const s of setups) {
      at(run, Math.min(endAt, s.final + 40), () => settleLane(s, totalOf(s.lane)));
    }
    at(run, endAt + 10, () => {
      for (const s of setups) {
        s.st.busy = false;
        if (s.st.run === run) s.st.run = null;
        s.st.root.classList.remove("playing", "charging");
        s.st.root.classList.add("settled");
      }
      // Drop every finished animation: the end state is plain inline style now.
      for (const a of run.anims) {
        try {
          a.cancel();
        } catch {
          /* gone */
        }
      }
      run.anims = [];
      finishRun(run, { stopped: false });
    });
    startTimers(run);
    return run.promise;

    function settleLane(s, total) {
      const { st, plan, parts } = s;
      if (!st.root.isConnected) return;
      st.root.style.transform = "";
      parts.deck.style.transform = "";
      parts.deck.style.willChange = "";
      st.pack?.el.remove();
      st.pack = null;
      st.packKey = "";
      parts.halo.style.opacity = "0";
      if (s.layout) {
        parts.els.forEach((el, i) => {
          const pos = s.layout.get(i);
          if (pos) settleCard(el, pos.p, pos.z);
        });
      }
      for (const a of parts.deck.getAnimations({ subtree: true })) {
        try {
          a.cancel();
        } catch {
          /* gone */
        }
      }
      parts.deck.querySelectorAll(".rv-hitfx").forEach((fx) => fx.remove());
      parts.halo.style.opacity = "";
      restHalo(parts.halo, plan);
      if (plan.n && Math.abs((s.sum ?? 0) - total) > 0.001) tick(s.lane, total);
    }
  }

  /* -- Finale: the losers' cards fly to the winners -- */

  function playFinale({ winners = [], losers = [] } = {}) {
    const win = winners.map((el) => stages.get(el) || (el ? stageFor(el) : null)).filter(Boolean);
    const lose = losers.map((el) => stages.get(el)).filter(Boolean);
    if (!win.length || !lose.length) return Promise.resolve({ moved: 0 });
    const flying = [];
    lose.forEach((st) => {
      const cards = [...st.root.querySelectorAll(".rv-card")];
      // Best cards last, so the pile ends with them on top.
      cards.sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
      cards.forEach((el) => flying.push({ el, from: st }));
    });
    if (!flying.length) return Promise.resolve({ moved: 0 });
    const run = newRun(0);
    const animate = motionOn();
    if (!flyLayer || !flyLayer.isConnected) {
      flyLayer = document.createElement("div");
      flyLayer.className = "rv-fly";
      document.body.appendChild(flyLayer);
    }
    const piles = new Map(win.map((st) => [st, st.root.querySelectorAll(".rv-card.piled").length]));
    const stagger = clamp(900 / flying.length, 35, 80);
    const dur = 720;
    let endAt = 0;
    flying.forEach((f, n) => {
      const st = win[n % win.length];
      const g = st.g;
      const k = piles.get(st);
      piles.set(st, k + 1);
      // The pile sits behind the winner's front card, low and a little to the side.
      const side = k % 2 ? 1 : -1;
      const dest = pose(g.heroX + side * rand(g.cw * 0.12, g.cw * 0.3), g.heroY + g.ch * 0.08 - Math.min(k, 12) * 0.9, side * rand(4, 14), 0.78);
      const z = 40 + Math.min(k, 30);
      const fromRect = f.from.el.getBoundingClientRect();
      const toRect = st.el.getBoundingClientRect();
      const cur = parsePose(f.el.style.transform);
      const a0 = pose(fromRect.left + cur.x, fromRect.top + cur.y, cur.a, cur.s);
      const a1 = pose(toRect.left + dest.x, toRect.top + dest.y, dest.a, dest.s);
      if (!animate) {
        st.deck?.appendChild(f.el) || st.root.appendChild(f.el);
        f.el.classList.add("piled");
        applyPose(f.el, dest, z);
        return;
      }
      const when = n * stagger;
      // Carry the card on the fly layer, in viewport coordinates.
      at(run, when, () => {
        const holder = f.el;
        holder.style.width = `${r2(f.from.g.cw)}px`;
        holder.style.height = `${r2(f.from.g.ch)}px`;
        holder.style.margin = `${r2(-f.from.g.ch / 2)}px 0 0 ${r2(-f.from.g.cw / 2)}px`;
        applyPose(holder, a0, null);
        flyLayer.appendChild(holder);
        holder.style.willChange = "transform";
        const lift = Math.min(160, Math.hypot(a1.x - a0.x, a1.y - a0.y) * 0.45 + 40);
        const frames = [];
        const steps = 8;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const e = 1 - (1 - t) ** 2.2;
          const x = lerp(a0.x, a1.x, e);
          const y = lerp(a0.y, a1.y, e) - Math.sin(Math.PI * e) * lift;
          const spin = lerp(a0.a, a1.a + side * 360 * 0, e) + Math.sin(Math.PI * e) * side * 18;
          const sc = lerp(a0.s, a1.s * (g.cw / f.from.g.cw), e) * (1 + Math.sin(Math.PI * e) * 0.12);
          frames.push({ transform: tf(pose(x, y, spin, sc)), offset: t });
        }
        const a = holder.animate(frames, { duration: dur, easing: "cubic-bezier(0.35, 0, 0.3, 1)", fill: "forwards" });
        run.anims.push(a);
      });
      at(run, when + dur, () => {
        const holder = f.el;
        holder.style.width = "";
        holder.style.height = "";
        holder.style.margin = "";
        holder.getAnimations().forEach((a) => a.cancel());
        holder.style.willChange = "";
        holder.classList.add("piled");
        (st.deck || st.root).appendChild(holder);
        applyPose(holder, dest, z);
        const settle = holder.animate(
          [{ transform: tf(pose(dest.x, dest.y - 6, dest.a, dest.s * 1.04)) }, { transform: tf(dest) }],
          { duration: 220, easing: EASE.out }
        );
        run.anims.push(settle);
      });
      endAt = Math.max(endAt, when + dur + 240);
    });
    if (!animate) {
      finishRun(run, { moved: flying.length });
      return run.promise;
    }
    at(run, endAt, () => {
      run.anims.forEach((a) => a.cancel());
      run.anims = [];
      finishRun(run, { moved: flying.length });
    });
    startTimers(run);
    return run.promise;
  }

  function parsePose(transform) {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*rotate\(([-\d.]+)deg\)\s*scale\(([-\d.]+)\)/.exec(transform || "");
    return m ? pose(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])) : pose(0, 0, 0, 1);
  }

  function stop() {
    for (const run of [...rounds]) cancelRun(run);
    for (const st of stages.values()) {
      st.busy = false;
      st.run = null;
      st.root?.classList.remove("playing", "charging");
      if (st.root) st.root.style.transform = "";
    }
    flyLayer?.remove();
    flyLayer = null;
    resizeObs?.disconnect();
    resizeObs = null;
    stages.clear();
  }

  return { showPacks, playRound, showRound, playFinale, stop };
}
