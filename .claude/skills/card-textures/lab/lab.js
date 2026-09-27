// Foil lab: renders real cards with the site's own DOM and stylesheets, so a
// texture can be tuned and screenshotted without clicking through the app.
//
// Markup mirrors tcgFace() in js/app.js. The class logic below is a trimmed
// copy of foilClass() / foilPattern() / foilLayout() from there; keep it in
// step if those change, or the lab will show a card the site never draws.
//
// Query string:
//   set=me55              data/<set>.json to read
//   cards=1,23,157        card numbers (default: one of each rarity and layout)
//   proof=split|on|off    show each card as the site draws it, with lab.css's
//                         proof recipes, or both side by side (default split)
//   w=240                 card width in px
//   poses=rest,50:50,...  one row per pose, pinned (x:y in 0-100, or "rest").
//                         Without it the cards follow the pointer.
//   maps=1                proof cells use TCG Live's foil map for the card as
//                         their mask, where scripts/fetch_foil_maps.py has put
//                         one in ./cache/ (local reference only, never shipped)
import { createCardMotion } from "/js/card-motion.js";
import { HIT_RARITIES } from "/js/engine.js";
import { rarityKey } from "/js/catalog.js";

const params = new URLSearchParams(location.search);
const setId = params.get("set") || "me55";
const proof = params.get("proof") || "split";
const width = Number(params.get("w")) || 240;
const ALL_FOIL = new Set(["me55"]);
// Site set id -> TCG Live set key, for ./cache/<key>/<n>.foil.png.
const TCGL = { me55: "me5-5" };
const CLASSIC_FULL_FOIL = /(-?EX|-?GX|\bV|VMAX|VSTAR|LV\.X|BREAK|LEGEND)$/i;

const isEx = (c) => (c.subtypes || []).some((s) => String(s).toLowerCase() === "ex") || /(^|\s)ex$/i.test(c.name || "");
const hasEvo = (c) => (c.subtypes || []).some((s) => s === "Stage 1" || s === "Stage 2") || Boolean(c.evolvesFrom);
const allFoil = (c) => ALL_FOIL.has(setId) && !c.energy && c.supertype !== "Energy";

function foilClass(c) {
  if (c.reverse) return "rare-glow";
  if (HIT_RARITIES.has(c.rarity) || c.rarity === "Rare" || c.rarity === "Pikachu Rare" || allFoil(c)) return "holo";
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
  const r = c.rarity;
  if (r === "Mega Hyper Rare" || r === "Hyper Rare") return "foil-gold";
  if (r === "Special Illustration Rare") return "foil-sir";
  if (r === "Illustration Rare") return "foil-ir";
  if (r === "Ultra Rare") return "foil-ultra";
  if (r === "Mega Attack Rare") return "foil-mega-attack";
  if (r === "Black White Rare") return "foil-bwr";
  if (r === "Futuristic Rare" || r === "RGB Rare") return "foil-future";
  if (r === "Classic Collection") return CLASSIC_FULL_FOIL.test(c.name || "") ? "foil-ultra" : "foil-holo";
  if (r === "Pikachu Rare" || r === "ACE SPEC Rare") return "foil-holo";
  if (isEx(c) && (HIT_RARITIES.has(r) || r === "Rare")) return "foil-ex";
  if (c.supertype === "Trainer" && HIT_RARITIES.has(r)) return "foil-ex";
  if (HIT_RARITIES.has(r) || r === "Rare" || allFoil(c)) return "foil-holo";
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

// TCG Live foil maps already in the local cache, by card id.
async function foilMaps(list) {
  const key = TCGL[setId];
  if (!params.get("maps") || !key) return {};
  const found = await Promise.all(list.filter((c) => /^\d+$/.test(c.number)).map(async (c) => {
    const url = `./cache/${key}/${c.number}.foil.png`;
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    return res?.ok ? [c.id, url] : null;
  }));
  return Object.fromEntries(found.filter(Boolean));
}

const abs = (path) => new URL(path, location.href).href;

function face(c, stamp, maps, withProof) {
  const s = stamp[c.id];
  const map = withProof ? maps[c.id] : null;
  const vars = [`--art:url('${abs(`/${c.image}`)}')`];
  if (s) {
    vars.push(`--stamp-mask:url('${abs("./masks/stamp30.png")}')`, `--stamp-pos:${s.position}`, `--stamp-size:${s.size}`);
    if (s.cutout) vars.push(`--stamp-cut:url('${abs(`./masks/${s.cutout}`)}')`);
  }
  if (map) vars.push(`--foil-map:url('${abs(map)}')`);
  const classes = ["tcg", rarityKey(c.rarity), foilClass(c), foilPattern(c), foilLayout(c),
    s ? "has-stamp" : "", s?.cutout ? "has-stamp-cut" : "", map ? "has-foil-map" : ""].filter(Boolean).join(" ");
  return `<figure class="lab-cell ${withProof ? "lab-proof" : "lab-site"}" style="--w:${width}px">
    <div class="${classes}" data-finish="${finishOf(c)}" style="${vars.join(";")}">
      <img src="/${c.image}" alt="${c.name}" decoding="async" />
      <span class="foil" aria-hidden="true"></span>
      <span class="glare" aria-hidden="true"></span>
    </div>
    <figcaption>${withProof ? (map ? "proof + TCG Live map" : "proof") : "site"} · ${c.number} ${c.name}<br>${c.rarity}</figcaption>
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

function rest(root = document) {
  for (const el of root.querySelectorAll(".tcg")) {
    el.classList.remove("lit", "settling");
    for (const name of [...el.style]) {
      if (name !== "--art" && !name.startsWith("--stamp")) el.style.removeProperty(name);
    }
  }
}

async function render() {
  const [cards, stamp] = await Promise.all([
    fetch(`/data/${setId}.json`).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : d.cards)),
    stamps(),
  ]);
  const wanted = (params.get("cards") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const list = wanted.length
    ? wanted.map((n) => cards.find((c) => String(c.number) === n)).filter(Boolean)
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
