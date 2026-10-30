/* The till's receipt: what a pack, a box or an order paid out, as a carbon
   panel of rows in Semi Condensed figures (styled as .receipt in
   css/opening.css). The markup keeps ordinary case, so a screen reader hears
   words, not letters.

   receiptHtml({ head, groups, totals, total, foot, label })
     head    lines under the shop name: "Pitch Black, pack 12"
     groups  lists of rows with a hairline between them. A row is
             { name, code, tags, value, hit, sub }: value is coins (a number)
             or text, hit prints the row inverted, sub indents it under the
             row above (sub: 2 indents it twice).
     totals  [label, value] pairs under the pulls
     total   [label, value], printed large
     foot    lines at the bottom
   pullRow(card, { value, hit }) turns a pulled card into a row. */
import { coinText } from "./money.js?v=1";

const esc = (value = "") =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Coins print bare, the way a till prints them; the word is there for screen readers. */
const cell = (value) =>
  typeof value === "number" ? `${coinText(value)}<span class="sr-only"> coins</span>` : esc(value ?? "");

/** The short marks a hobby shop's till would print after a hit. */
const RARITY_CODE = {
  "Special Illustration Rare": "SIR",
  "Illustration Rare": "IR",
  "Ultra Rare": "UR",
  "Hyper Rare": "HR",
  "Mega Hyper Rare": "MHR",
  "Mega Attack Rare": "MAR",
  "ACE SPEC Rare": "ACE",
  "Shiny Rare": "SR",
  "Shiny Ultra Rare": "SUR",
  "Black White Rare": "BWR",
};
const REVERSE_CODE = { pokeball: "PB", masterball: "MB" };

/** A card's number the way the card prints it, without the set total: 7 -> "007". */
function cardNo(card) {
  if (!card || card.energy || card.number == null || card.number === "—") return "";
  const n = String(card.number);
  return /^\d+$/.test(n) ? n.padStart(3, "0") : n;
}

export function pullRow(card, { value = 0, hit = false } = {}) {
  const code = [
    RARITY_CODE[card.rarity] || "",
    cardNo(card),
    card.reverse ? REVERSE_CODE[card.reverseKind] || "RH" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { name: card.name, code, tags: card.wasNew ? ["new"] : [], value, hit };
}

function rowHtml(row) {
  const cls = [row.hit ? "hit" : "", row.sub ? "sub" : "", row.sub === 2 ? "sub2" : ""].filter(Boolean).join(" ");
  const tags = (row.tags || []).map((tag) => ` <i>${esc(tag)}</i>`).join("");
  return `<li${cls ? ` class="${cls}"` : ""}><span class="r-name"><span class="r-nm">${esc(row.name)}</span>${
    row.code ? `<span class="r-code"> ${esc(row.code)}</span>` : ""
  }${tags}</span><span class="r-val">${cell(row.value)}</span></li>`;
}

export function receiptHtml({ head = [], groups = [], totals = [], total = null, foot = [], label = "Receipt" } = {}) {
  const lines = (list) => list.filter(Boolean).map(esc).join("<br>");
  const body = groups
    .filter((rows) => rows && rows.length)
    .map((rows) => `<ol class="receipt-rows">${rows.map(rowHtml).join("")}</ol>`)
    .join("<hr>");
  const sums = totals
    .filter(Boolean)
    .map(([name, value]) => `<p class="receipt-line"><span>${esc(name)}</span><span>${cell(value)}</span></p>`)
    .join("");
  return `<div class="receipt" role="group" aria-label="${esc(label)}">
    <p class="receipt-shop">poke-pack.rip</p>
    ${head.length ? `<p class="receipt-head">${lines(head)}</p>` : ""}
    <hr>${body}${body && (sums || total) ? "<hr>" : ""}
    ${sums}
    ${total ? `<p class="receipt-line receipt-total"><span>${esc(total[0])}</span><span>${cell(total[1])}</span></p>` : ""}
    ${foot.length ? `<hr><p class="receipt-foot">${lines(foot)}</p>` : ""}
  </div>`;
}
