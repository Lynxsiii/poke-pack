// Foil lab: renders real cards with the site's own DOM and stylesheets, so a
// texture can be tuned and screenshotted without clicking through the app.
//
// Markup mirrors tcgFace() in js/app.js. The class logic below is a trimmed
// copy of foilClass() / foilPattern() / foilLayout() from there; keep it in
// step if those change, or the lab will show a card the site never draws.
//
// Query string:
//   set=me55              data/<set>.json to read
//   cards=1,23,157        card numbers (default: one of each rarity and layout);
//                         r59 is card 59's reverse holo, 59-pb and 59-mb its
//                         Prismatic Poké Ball and Master Ball prints
//   proof=split|on|off    show each card as the site draws it, with lab.css's
//                         proof recipes, or both side by side (default split)
//   rev=chain             reverse kind for cards listed as r<number>
//   w=240                 card width in px
//   poses=rest,50:50,...  one row per pose, pinned (x:y in 0-100, or "rest").
//                         Without it the cards follow the pointer.
//   maps=1                proof cells use TCG Live's foil map for the card as
//                         their mask: the site's shipped copy in
//                         /assets/foil/maps/<set>/ if there is one, else the raw
//                         map scripts/fetch_foil_maps.py put in ./cache/<set>/
import { createCardMotion } from "/js/card-motion.js";
import { HIT_RARITIES } from "/js/engine.js";
import { rarityKey } from "/js/catalog.js";
import { foilExtras } from "/js/foil-maps.js";

const params = new URLSearchParams(location.search);
const setId = params.get("set") || "me55";
const proof = params.get("proof") || "split";
const width = Number(params.get("w")) || 240;
const ALL_FOIL = new Set(["me55"]);
const CLASSIC_FULL_FOIL = /(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND)$/i;

const isEx = (c) => (c.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(c.name || "");
const hasEvo = (c) => (c.subtypes || []).some((s) => s === "Stage 1" || s === "Stage 2") || Boolean(c.evolvesFrom);
const allFoil = (c) => ALL_FOIL.has(setId) && !c.energy && c.supertype !== "Energy";

function foilClass(c) {
  if (c.reverse || c.pattern) return "rare-glow";
  if (HIT_RARITIES.has(c.rarity) || ["Rare", "Pikachu Rare", "Cosmos"].includes(c.rarity) || allFoil(c)) return "holo";
  return "";
}
function foilLayout(c) {
  if (c.energy || c.supertype === "Energy") return "foil-energy";
  if (c.rarity === "ACE SPEC Rare") return "";
  if (c.supertype === "Trainer") return "foil-trainer";
  if (c.ownerMask) return "foil-owner";
  return hasEvo(c) ? "foil-evo" : "";
}
function foilPattern(c) {
  if (c.reverse) return c.reverseKind && c.reverseKind !== "cosmos" ? `foil-reverse foil-rev-${c.reverseKind}` : "foil-reverse";
  const r = c.rarity;
  if (c.pattern) return `foil-reverse foil-rev-${c.pattern} foil-prism`;
  if (r === "Shiny Ultra Rare") return "foil-ultra foil-shiny";
  if (r === "Shiny Rare") return "foil-holo foil-shiny";
  if (c.finish === "scodix") return "foil-gold foil-scodix";
  if (r === "Mega Hyper Rare" || r === "Hyper Rare") return "foil-gold";
  if (c.foilMap && (c.subtypes || []).includes("Tera") && (r === "Double Rare" || r === "Ultra Rare")) {
    return r === "Ultra Rare" ? "foil-ultra foil-tera" : "foil-ex foil-tera";
  }
  if (r === "Special Illustration Rare") return "foil-sir";
  if (r === "Illustration Rare") return "foil-ir";
  if (r === "Ultra Rare") return "foil-ultra";
  if (r === "Mega Attack Rare") return "foil-mega-attack";
  if (r === "Black White Rare") return "foil-bwr";
  if (r === "Futuristic Rare") return "foil-future";
  if (r === "RGB Rare") return "foil-future foil-rgb";
  if (r === "Classic Collection") return `${CLASSIC_FULL_FOIL.test(c.name || "") ? "foil-ultra" : "foil-holo"} foil-classic`;
  if (r === "Pikachu Rare") return "foil-holo foil-pikachu";
  if (r === "Cosmos") return "foil-holo foil-cosmos";
  if (r === "ACE SPEC Rare") return c.foilMap ? "foil-holo foil-acespec" : "foil-holo";
  if (isEx(c) && (HIT_RARITIES.has(r) || r === "Rare")) return c.foilMap && r === "Double Rare" ? "foil-ex foil-sunpillar" : "foil-ex";
  if (c.supertype === "Trainer" && HIT_RARITIES.has(r)) return "foil-ex";
  if (r === "Rare" && c.foilMap) return "foil-holo foil-svholo";
  if (HIT_RARITIES.has(r) || r === "Rare") return "foil-holo";
  if (allFoil(c)) return c.foilMap ? "foil-holo foil-rainbow" : "foil-holo";
  return "foil-none";
}
function finishOf(c) {
  if (c.rarity === "RGB Rare") return { R: "red", G: "green", B: "blue" }[c.number] || "";
  return "";
}

// Per-card placements written by scripts/find_overlay.py into ./masks/.
async function stamps() {
  try {
    const res = await fetch("./masks/stamp30.json");
    return res.ok ? (await res.json()).cards : {};
  } catch {
    return {};
  }
}

// TCG Live foil maps by card id: { url, lum }. Shipped copies are alpha
// masks; the raw PNGs in the cache are luminance.
async function foilMaps(list) {
  if (!params.get("maps")) return {};
  const exists = (url) => fetch(url, { method: "HEAD" }).then((r) => r.ok, () => false);
  const found = await Promise.all(list.map(async (c) => {
    const shipped = `/assets/foil/maps/${setId}/${c.number}.webp`;
    if (await exists(shipped)) return [c.id, { url: shipped, lum: false }];
    const raw = `./cache/${setId}/${c.number}.foil.png`;
    return (await exists(raw)) ? [c.id, { url: raw, lum: true }] : null;
  }));
  return Object.fromEntries(found.filter(Boolean));
}

const abs = (path) => new URL(path, location.href).href;

// Promo cards borrow another rarity's finish (foilLook() in js/app.js): the
// classes come from the borrowed rarity, the caption keeps the card's own.
function foilLook(c) {
  if (!c?.promo || !c.foilAs || c.reverse) return c;
  if (c.foilAs === "Frame") return { ...c, rarity: "Common", reverse: true, reverseKind: "cosmos" };
  return { ...c, rarity: c.foilAs };
}

function face(shown, stamp, maps, withProof) {
  const c = foilLook(shown);
  // The site's own per-card extras (foil maps, stamp, cast-and-cure coat), on
  // both copies. The proof-only extras below are the lab's older experiments.
  const extra = foilExtras(c, (path) => abs(`/${path}`));
  const s = withProof && !c.foilMap ? stamp[c.id] : null;
  const map = withProof && !c.foilMap ? maps[c.id] : null;
  const vars = [`--art:url('${abs(`/${c.image}`)}')`];
  if (extra.style) vars.push(extra.style);
  if (s) {
    vars.push(`--stamp-mask:url('${abs("./masks/stamp30.png")}')`, `--stamp-pos:${s.position}`, `--stamp-size:${s.size}`);
    if (s.cutout) vars.push(`--stamp-cut:url('${abs(`./masks/${s.cutout}`)}')`);
  }
  if (map) vars.push(`--foil-map:url('${abs(map.url)}')`);
  const classes = ["tcg", rarityKey(c.rarity), foilClass(c), foilPattern(c), c.reverse ? "reverse" : "", foilLayout(c), extra.classes,
    s ? "has-stamp" : "", s?.cutout ? "has-stamp-cut" : "", map ? "has-foil-map" : "", map?.lum ? "foil-map-lum" : ""].filter(Boolean).join(" ");
  return `<figure class="lab-cell ${withProof ? "lab-proof" : "lab-site"}" style="--w:${width}px">
    <div class="${classes}" data-finish="${finishOf(c)}" style="${vars.join(";")}">
      <img src="/${c.image}" alt="${c.name}" decoding="async" />
      <span class="foil" aria-hidden="true"></span>
      ${extra.cure ? `<span class="cure" aria-hidden="true"></span>` : ""}
      <span class="glare" aria-hidden="true"></span>
    </div>
    <figcaption>${withProof ? (map ? `proof + ${map.lum ? "raw" : "shipped"} foil map` : "proof") : "site"} · ${c.number} ${c.name}<br>${shown.rarity}${shown.foilAs ? ` as ${shown.foilAs}` : ""}${shown.variant ? ` · ${shown.variant}` : ""}</figcaption>
  </figure>`;
}

function pickDefault(cards) {
  const seen = new Set();
  return cards.filter((c) => {
    const key = `${c.rarity}|${hasEvo(c)}|${c.supertype}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The same writes js/card-motion.js makes each frame, so a pinned pose is
// exactly what a pointer at (x, y) produces once the springs settle.
function pose(x, y, { light = 1, tilt = true, root = document } = {}) {
  const px = x / 100, py = y / 100;
  const radius = Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2);
  const rx = tilt ? (0.5 - px) * 28 : 0, ry = tilt ? (py - 0.5) * 28 : 0;
  const set = {
    "--pointer-x": `${x}%`, "--pointer-y": `${y}%`,
    "--pointer-from-left": px, "--pointer-from-top": py, "--pointer-from-center": radius,
    "--card-opacity": light, "--card-scale": tilt ? 1.05 : 1,
    "--rotate-x": `${rx}deg`, "--rotate-y": `${ry}deg`,
    "--background-x": `${37 + px * 26}%`, "--background-y": `${33 + py * 34}%`,
    "--mx": `${x}%`, "--my": `${y}%`, "--px": px, "--py": py, "--hyp": radius,
    "--tilt-x": `${ry}deg`, "--tilt-y": `${rx}deg`,
  };
  for (const el of root.querySelectorAll(".tcg")) {
    for (const [k, v] of Object.entries(set)) el.style.setProperty(k, String(v));
    el.classList.add("lit");
    el.classList.remove("settling");
  }
}

// Per-card properties set in the markup, which a reset must not strip.
const KEEP = /^--(art|stamp|foil-map|etch-map|etch-angle|seed|rev-pattern)/;

function rest(root = document) {
  for (const el of root.querySelectorAll(".tcg")) {
    el.classList.remove("lit", "settling");
    for (const name of [...el.style]) {
      if (!KEEP.test(name)) el.style.removeProperty(name);
    }
  }
}

async function render() {
  const [cards, stamp] = await Promise.all([
    fetch(`/data/${setId}.json`).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : d.cards)),
    stamps(),
  ]);
  const wanted = (params.get("cards") || "").split(",").map((s) => s.trim()).filter(Boolean);
  // "r12" draws card 12 as a reverse holo (kind from rev=, default the
  // card's own); a card id without the set prefix works too (energy-grass).
  const revKind = params.get("rev") || "";
  const find = (n) => cards.find((c) => String(c.number) === n || c.id === `${setId}-${n}`);
  const list = wanted.length
    ? wanted.map((n) => {
      const rev = /^r\d/.test(n);
      const c = find(rev ? n.slice(1) : n);
      return c && rev ? { ...c, reverse: true, reverseKind: revKind || c.reverseKind || "" } : c;
    }).filter(Boolean)
    : pickDefault(cards);
  const maps = await foilMaps(list);
  const modes = proof === "split" ? [false, true] : [proof === "on"];
  const cells = list.map((c) => modes.map((m) => face(c, stamp, maps, m)).join("")).join("");
  const poses = (params.get("poses") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const grid = document.querySelector("#grid");
  grid.innerHTML = (poses.length ? poses : ["live"]).map((p) =>
    `<section class="lab-row" data-pose="${p}"><h2>${p === "live" ? "move the pointer over a card" : `pose ${p}`}</h2><div class="lab-cards">${cells}</div></section>`
  ).join("");
  for (const row of grid.querySelectorAll(".lab-row")) {
    const p = row.dataset.pose;
    if (p === "rest" || p === "live") continue;
    const [x, y] = p.split(":").map(Number);
    pose(x, y, { root: row });
  }
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  document.body.dataset.ready = "1";
  return poses.length > 0;
}

window.lab = { pose, rest, render };

const pinned = await render();
if (!pinned) {
  createCardMotion({
    settings: () => ({ shine: true, tilt: true }),
    reducedMotion: () => false,
    blocked: () => false,
  });
}
