/**
 * Build data/search-index.json, the compact card list behind the site search (js/search.js).
 *
 * The search bar cannot load every set's data file (22 MB), so this keeps one row
 * per card: the fields a person types (name, number, printed number, rarity) and
 * nothing else. Sets are read from data/<set>.json, the same files the shop loads.
 * Trainer Kit copies ("xytk7a-3") are left out, as the dex leaves them out (js/card-home.js dexId).
 *
 * Shape: { v, names: [name], rarities: [rarity], sets: { <dataSetId>: [row] } }
 *   row = [number, nameIndex, rarityIndex, printedNumber, extra]
 *   id          `${dataSetId}-${number}`, or extra.id when the card's id is not that
 *   image       `assets/cards/${dataSetId}/${number}-sm.webp`, or extra.img
 *   home set    homeSetId(id) in js/card-home.js (promos sit in other sets' files)
 * `extra` is 0 for nearly every card and an object { id?, img? } for the few that differ.
 *
 * Run: node scripts/build_search_index.mjs   (scripts/test-search.mjs fails when the file is stale)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dexId } from "../js/card-home.js";

export async function buildSearchIndex(dir = "data") {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const names = [];
  const nameAt = new Map();
  const rarities = [];
  const rarityAt = new Map();
  const slot = (list, at, value) => {
    if (!at.has(value)) {
      at.set(value, list.length);
      list.push(value);
    }
    return at.get(value);
  };
  const sets = {};
  for (const file of files) {
    let list;
    try {
      list = JSON.parse(await readFile(`${dir}/${file}`, "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(list) || !list.length || !list[0] || !("number" in list[0]) || !("rarity" in list[0])) continue;
    const setId = file.slice(0, -5);
    const rows = [];
    for (const card of list) {
      if (!card?.id || card.energy || dexId(card.id) !== card.id) continue;
      const number = String(card.number);
      const extra = {};
      if (card.id !== `${setId}-${number}`) extra.id = card.id;
      const img = card.imageSmall || card.image || "";
      if (img !== `assets/cards/${setId}/${number}-sm.webp`) extra.img = img;
      rows.push([
        number,
        slot(names, nameAt, String(card.name)),
        slot(rarities, rarityAt, String(card.rarity || "")),
        card.printedNumber ? String(card.printedNumber) : "",
        Object.keys(extra).length ? extra : 0,
      ]);
    }
    if (rows.length) sets[setId] = rows;
  }
  return { v: 1, names, rarities, sets };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = await buildSearchIndex();
  const text = JSON.stringify(index);
  await writeFile("data/search-index.json", text + "\n");
  const cards = Object.values(index.sets).reduce((n, rows) => n + rows.length, 0);
  console.log(`data/search-index.json: ${cards} cards in ${Object.keys(index.sets).length} sets, ${index.names.length} names, ${(text.length / 1024).toFixed(0)} KB`);
}
