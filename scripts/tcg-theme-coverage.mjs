// Which cards in the shop's pre-made 60-card decks (Theme Decks, Battle Decks) the TCG can't play yet.
//   node scripts/tcg-theme-coverage.mjs [rows]
import { readFileSync, readdirSync } from "node:fs";
import { createDefs } from "../js/tcg/cards.js";
import { boxCardList } from "../js/catalog.js";
const rules = JSON.parse(readFileSync("data/tcg/rules.json", "utf8"));
const byId = new Map();
for (const file of readdirSync("data")) {
  if (!file.endsWith(".json")) continue;
  let list; try { list = JSON.parse(readFileSync(`data/${file}`, "utf8")); } catch { continue; }
  if (Array.isArray(list)) for (const c of list) if (c?.id) byId.set(c.id, c);
  else if (Array.isArray(list?.cards)) for (const c of list.cards) if (c?.id) byId.set(c.id, c);
}
const trainers = JSON.parse(readFileSync("data/tcg/trainers.json", "utf8"));
const defs = createDefs((id) => byId.get(id), rules, trainers);
const products = JSON.parse(readFileSync("data/products.json", "utf8"));
const box = JSON.parse(readFileSync("data/box-contents.json", "utf8"));
let decks = 0, ready = 0; const missing = new Map();
for (const [set, list] of Object.entries(products)) {
  if (!Array.isArray(list)) continue;
  for (const o of list) {
    if (o.kind !== "deck" || /trainer kit/i.test(o.name)) continue;
    const e = box[`${set}/${o.id}`]; if (!e) continue;
    const promos = (o.promos || []).slice(0, 1).map((p) => (Array.isArray(p) ? p[0] : p));
    const promoIds = promos.map((p) => (String(p).startsWith(set + "-") || String(p).includes("-") && byId.has(p) ? p : `${set}-${p}`));
    const cards = boxCardList(e, promoIds, () => 0);
    const all = [...promoIds.map((id) => ({ id, n: 1 })), ...cards];
    if (all.reduce((a, c) => a + c.n, 0) !== 60) continue;
    decks++;
    const bad = [];
    for (const { id } of all) { const d = defs(id); if (!d) bad.push(`?${id}`); else if (!d.playable) bad.push(`${d.name}|${d.why}|${id}`); }
    if (!bad.length) ready++;
    for (const b of new Set(bad)) missing.set(b, (missing.get(b) || 0) + 1);
  }
}
console.log({ decks, ready });
console.log([...missing].sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[2] || 60)).map(([k, v]) => `${v}\t${k}`).join("\n"));
console.log("distinct", missing.size);
