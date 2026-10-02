/* The binder's "Choose a card": turn the player's spare cards into rows, the filters they can use, and the
   list a search, a filter and a sort leave. Pure functions (no DOM, no network), so scripts/test-card-picker.mjs
   can run them; js/card-picker.js is the screen.

   Matching follows the site search (js/search-rules.js): every word has to be a number the card carries or start a
   word of its name, set, rarity or type. "177" and "177/132" are card numbers (the second also has to match the
   set's printed total), "tg05" a lettered number. */
import { norm, parseQuery, parseNumber } from "./search-rules.js?v=1";

export const SORTS = [
  ["value", "Value"],
  ["newest", "Newest"],
  ["name", "Name"],
  ["rarity", "Rarity"],
];

/** The words a player filters on: the card's supertype or, for a Pokémon, its first type. */
export function kindOf(card) {
  if (card.energy || card.supertype === "Energy") return "Energy";
  if (card.supertype === "Trainer") return "Trainer";
  return card.types?.[0] || "Other";
}

const KIND_ORDER = ["Trainer", "Energy", "Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy", "Dragon", "Colorless", "Other"];

/**
 * Rows from the spare cards. `spares` is [{ card, spare }]; `deps` supplies
 *   setOf(card)       -> { id, name, printedTotal, released } (released is a date string or ms)
 *   rarityLabel(r)    -> the words a player sees
 *   rarityRank(r)     -> position in the rarity ladder (higher is rarer)
 *   value(card)       -> the card's worth in coins
 */
export function buildRows(spares, { setOf, rarityLabel = (r) => r, rarityRank = () => 0, value = () => 0 }) {
  return spares.map(({ card, spare }) => {
    const set = setOf(card) || {};
    const label = rarityLabel(card.rarity) || card.rarity || "";
    const kind = kindOf(card);
    const released = typeof set.released === "number" ? set.released : Date.parse(set.released) || 0;
    return {
      card,
      spare,
      value: value(card),
      setId: set.id || "",
      setName: set.name || "",
      released,
      total: Number(set.printedTotal) || 0,
      rarity: card.rarity || "",
      rarityLabel: label,
      rank: rarityRank(card.rarity),
      kind,
      nameKey: norm(card.name),
      setKey: norm(set.name),
      hay: `${norm(card.name)} ${norm(set.name)} ${norm(label)} ${norm(kind)}`,
      num: parseNumber(card.number),
    };
  });
}

/** The options each filter can offer, with how many rows each holds. Sets newest first, rarities rarest first. */
export function buildFacets(rows) {
  const sets = new Map();
  const rarities = new Map();
  const kinds = new Map();
  for (const row of rows) {
    const s = sets.get(row.setId) || { id: row.setId, name: row.setName || "Other", released: row.released, count: 0 };
    s.count++;
    sets.set(row.setId, s);
    const r = rarities.get(row.rarity) || { id: row.rarity, name: row.rarityLabel || "Card", rank: row.rank, count: 0 };
    r.count++;
    rarities.set(row.rarity, r);
    const k = kinds.get(row.kind) || { id: row.kind, name: row.kind, count: 0 };
    k.count++;
    kinds.set(row.kind, k);
  }
  const kindAt = (id) => {
    const i = KIND_ORDER.indexOf(id);
    return i < 0 ? KIND_ORDER.length : i;
  };
  return {
    sets: [...sets.values()].sort((a, b) => b.released - a.released || a.name.localeCompare(b.name)),
    rarities: [...rarities.values()].sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)),
    kinds: [...kinds.values()].sort((a, b) => kindAt(a.id) - kindAt(b.id) || a.name.localeCompare(b.name)),
  };
}

function startsWord(hay, word) {
  return hay.startsWith(word) || hay.includes(` ${word}`);
}

/** How well a row fits a query (0 = not at all). Every word has to land somewhere. */
function scoreRow(row, q) {
  let score = 0;
  const said = [];
  for (let i = 0; i < q.words.length; i++) {
    const word = q.words[i];
    const n = q.numbers[i];
    if (n && row.num && row.num.n === n.n && (!n.p || n.p === row.num.p) && (!n.t || n.t === row.total)) {
      score += 500;
      continue;
    }
    if (n?.t) return 0; // "177/132" can only be a number
    if (startsWord(row.nameKey, word)) {
      said.push(word);
      score += row.nameKey.startsWith(word) ? 60 : 40;
    } else if (startsWord(row.setKey, word)) score += 18;
    else if (startsWord(row.hay, word)) score += 10;
    else if (word.length >= 3 && row.nameKey.includes(word)) score += 6;
    else return 0;
  }
  const lead = said.join(" ");
  if (lead && row.nameKey === lead) score += 300; // "mew" is Mew, not Mewtwo
  else if (lead && row.nameKey.startsWith(lead)) score += 120;
  return score || 1;
}

const byValue = (a, b) => b.value - a.value || a.card.name.localeCompare(b.card.name);
const byNumber = (a, b) => (a.num?.n ?? 1e9) - (b.num?.n ?? 1e9) || String(a.card.number).localeCompare(String(b.card.number));
const SORTERS = {
  value: byValue,
  newest: (a, b) => b.released - a.released || a.setName.localeCompare(b.setName) || byNumber(a, b),
  name: (a, b) => a.card.name.localeCompare(b.card.name) || b.released - a.released || byNumber(a, b),
  rarity: (a, b) => b.rank - a.rank || byValue(a, b),
};

/**
 * The rows that pass `{ query, set, rarity, kind }`, in order. A query puts the better matches first and the chosen
 * `sort` orders the ties; with no query the sort alone decides.
 */
export function filterRows(rows, { query = "", set = "", rarity = "", kind = "", sort = "value" } = {}) {
  const q = parseQuery(query);
  const sorter = SORTERS[sort] || SORTERS.value;
  const kept = [];
  for (const row of rows) {
    if (set && row.setId !== set) continue;
    if (rarity && row.rarity !== rarity) continue;
    if (kind && row.kind !== kind) continue;
    if (q.empty) {
      kept.push({ row, score: 0 });
      continue;
    }
    const score = scoreRow(row, q);
    if (score) kept.push({ row, score });
  }
  kept.sort((a, b) => b.score - a.score || sorter(a.row, b.row));
  return kept.map((k) => k.row);
}

/** True when anything narrows the list, so the screen can offer "Clear". */
export function isFiltered({ query = "", set = "", rarity = "", kind = "" } = {}) {
  return Boolean(parseQuery(query).words.length || set || rarity || kind);
}
