/**
 * RIP Grading slab: a card sealed in a clear case with a branded label.
 *
 * slabHTML() draws the case around a card face that app.js already produced
 * (`tcgFace(card)`); the face goes in untouched so its holo layers, tilt and
 * `.lit` behaviour keep working. revealSlab() runs the grade reveal on a slab
 * that is already in the document. Styles: css/slab.css.
 */
import { RARITY_LABEL } from "./catalog.js";

import { BLACK_LABEL, GRADE_WORDS, GUARDS } from "./grading-rules.js";

const GUARD_IDS = new Set(GUARDS.map((g) => g.id));

/** The word on a slab's grade plate: a Black Label is a 10 that says so. */
export function gradeWord(grade, blackLabel = false) {
  if (blackLabel && Number(grade) === 10) return BLACK_LABEL.word;
  return GRADE_WORDS[Number(grade)] || "";
}

export function guardName(id) {
  return GUARDS.find((g) => g.id === id)?.name || "";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** "199/165" the way the card prints it (mirrors numberLine in app.js). */
function numberLine(card, set) {
  if (!card) return "";
  if (card.energy || card.number === "—") return "Energy";
  if (card.printedNumber) return card.printedNumber;
  if (!set?.printedTotal) return String(card.number ?? "");
  const total = String(set.printedTotal);
  const width = Math.max(3, total.length);
  return `${String(card.number).padStart(width, "0")}/${total.padStart(width, "0")}`;
}

/** The variant line: the reverse finish when the slab holds one, else the rarity. */
function variantLine(card, slab) {
  if (slab?.reverse) return "Reverse holo";
  if (!card) return "";
  const label = RARITY_LABEL[card.rarity] || card.rarity || "";
  if (card.pattern && card.printedRarity) return `${label} · ${RARITY_LABEL[card.printedRarity] || card.printedRarity}`;
  return label;
}

/** Four-digit year from set.released ("July 17, 2026"); empty when unknown, never guessed. */
function yearOf(set) {
  const match = String(set?.released || "").match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function certOf(slab) {
  if (slab?.cert) return String(slab.cert);
  if (slab?.id != null) return `RIP-${String(slab.id).padStart(7, "0")}`;
  return "";
}

function tierOf(grade, blackLabel = false) {
  return grade >= 10 ? (blackLabel ? "black" : "gem") : grade === 9 ? "mint" : "plain";
}

/** The four perfect subgrades a Black Label prints under the card's details. */
function subgradesHTML() {
  return `<span class="slab-subs" aria-hidden="true">${BLACK_LABEL.subgrades.map((name) => `<i><em>${name.slice(0, 3)}</em>10</i>`).join("")}</span>`;
}

/**
 * @param {object} o
 * @param {string} o.face   HTML string of the `.tcg` from cardFace(card), inserted as is
 * @param {object} o.card   catalog card
 * @param {object} o.slab   { id, cert, grade, reverse, guard, ... }
 * @param {object} o.set    catalog set (name, released, printedTotal)
 * @param {"grid"|"inspect"|"hero"} o.size
 * @param {string} o.cls    extra classes on the root
 */
export function slabHTML({ face = "", card, slab = {}, set, size = "grid", cls = "" }) {
  const grade = Math.max(1, Math.min(10, Math.round(Number(slab.grade) || 0)));
  const guard = GUARD_IDS.has(slab.guard) ? slab.guard : "";
  const black = grade === 10 && Boolean(slab.blackLabel);
  const word = gradeWord(grade, black);
  const setName = set?.name || "";
  const name = card?.name || "";
  const variant = variantLine(card, slab);
  // Energy prints have no number; the variant line already says so.
  const numbered = numberLine(card, set);
  const number = numbered === variant ? "" : numbered;
  const year = yearOf(set);
  const cert = certOf(slab);
  const meta = [variant, year].filter(Boolean).join(" · ");
  const setLine = `${esc(setName)}${setName && number ? `<span class="slab-no"> · ${esc(number)}</span>` : esc(number)}`;
  const alt = `${name} graded RIP ${grade} ${black ? `${BLACK_LABEL.grade} ${word}` : word}`.trim();
  return `<div class="slab slab-${esc(size)}${cls ? ` ${esc(cls)}` : ""}" data-grade="${grade}"${guard ? ` data-guard="${esc(guard)}"` : ""}${slab.id != null ? ` data-slab="${esc(slab.id)}"` : ""} data-tier="${tierOf(grade, black)}">
    ${guard ? `<span class="slab-guard" aria-hidden="true"></span>` : ""}
    <div class="slab-case">
      <span class="slab-edge" aria-hidden="true"></span>
      <div class="slab-label" role="img" aria-label="${esc(alt)}">
        <span class="slab-brand"><b>RIP</b><i>Grading</i></span>
        <span class="slab-info">
          <span class="slab-set">${setLine}</span>
          <span class="slab-name">${esc(name)}</span>
          <span class="slab-var">${esc(meta)}</span>
          <span class="slab-cert">${esc(cert)}</span>
          ${black ? subgradesHTML() : ""}
        </span>
        <span class="slab-grade"><b class="slab-num">${grade}</b><span class="slab-word">${esc(word)}</span><i class="slab-glint" aria-hidden="true"></i></span>
      </div>
      <div class="slab-well">${face}</div>
      <span class="slab-glass" aria-hidden="true"><i class="slab-sweep"></i></span>
    </div>
  </div>`;
}

const REVEAL_MS = { black: 3250, gem: 2650, mint: 2400, plain: 1950 };
const SPARK_AT = 1820;

function motionAllowed() {
  if (typeof document === "undefined") return false;
  if (document.body.classList.contains("no-motion")) return false;
  return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** A fixed handful of sparks out of the grade plate, the site's hit-burst pattern. */
function burst(slabEl, tier) {
  const plate = slabEl.querySelector(".slab-grade");
  if (!plate) return () => {};
  const host = document.createElement("span");
  host.className = "slab-burst";
  // Anchored on the slab root (the plate and the label clip their overflow).
  const box = slabEl.getBoundingClientRect();
  const at = plate.getBoundingClientRect();
  if (box.width && box.height) {
    host.style.setProperty("--bx", `${(((at.left + at.width / 2) - box.left) / box.width * 100).toFixed(2)}%`);
    host.style.setProperty("--by", `${(((at.top + at.height / 2) - box.top) / box.height * 100).toFixed(2)}%`);
  }
  const big = tier === "gem" || tier === "black";
  const count = tier === "black" ? 18 : big ? 14 : 6;
  const reach = Math.max(70, slabEl.getBoundingClientRect().width * (tier === "black" ? 0.7 : big ? 0.55 : 0.32));
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("i");
    spark.className = `slab-spark${big && i % 2 === 1 ? " streak" : ""}`;
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const dist = reach * (0.7 + Math.random() * 0.5);
    spark.style.setProperty("--sx", `${(Math.cos(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--sy", `${(Math.sin(angle) * dist).toFixed(1)}px`);
    spark.style.setProperty("--ang", `${((angle * 180) / Math.PI).toFixed(1)}deg`);
    spark.style.setProperty("--dly", `${Math.round(Math.random() * 110)}ms`);
    host.appendChild(spark);
  }
  if (big) {
    const ring = document.createElement("i");
    ring.className = "slab-ring";
    host.appendChild(ring);
  }
  slabEl.appendChild(host);
  return () => host.remove();
}

/**
 * The grade reveal on a rendered slab: the case rises with a blank label, a
 * light streak sweeps the glass, the label prints, the grade stamps in; a 10
 * gets a gold glint and a spark burst, a Black Label a longer beat with a bigger burst, a 9 a smaller silver glint.
 * Skippable with a tap or a key; instant under reduced motion or body.no-motion.
 * Transform, opacity and filter only. Resolves when the slab is at rest.
 */
export function revealSlab(slabEl, { motion = true } = {}) {
  return new Promise((resolve) => {
    if (!slabEl) { resolve(); return; }
    const tier = slabEl.dataset.tier || tierOf(Number(slabEl.dataset.grade));
    const timers = [];
    let clearBurst = () => {};
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      clearBurst();
      slabEl.classList.remove("is-revealing");
      slabEl.classList.add("is-revealed");
      slabEl.removeEventListener("pointerdown", finish);
      slabEl.removeEventListener("keydown", finish);
      resolve();
    };
    if (!motion || !motionAllowed()) { finish(); return; }
    slabEl.classList.remove("is-revealed");
    slabEl.classList.add("is-revealing");
    slabEl.addEventListener("pointerdown", finish, { once: true });
    slabEl.addEventListener("keydown", finish, { once: true });
    if (tier !== "plain") timers.push(setTimeout(() => { clearBurst = burst(slabEl, tier); }, SPARK_AT));
    timers.push(setTimeout(finish, REVEAL_MS[tier] || REVEAL_MS.plain));
  });
}

export const SLAB_REVEAL_MS = REVEAL_MS;
