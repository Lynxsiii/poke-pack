/* Site search rules: turn what a person types into ranked cards and sealed products.

   Pure functions only (no DOM, no network), so scripts/test-search.mjs can run them.
   js/search.js is the screen; data/search-index.json is the card list (scripts/build_search_index.mjs).

   A query is split into words. A word that looks like a card number ("177", "177/132",
   "tg05", "#12") matches the number printed bottom-left on the card; a number with a
   slash also has to match the set's printed total. Every other word has to start a word
   of the card's name, its set's name or its rarity. A bare number can also start a set
   name ("151"), but a card whose number matches always ranks above one that only shares
   a word. Newer sets come before older ones when everything else is equal. */

/** Lowercase, no accents, no apostrophes or dots, every other symbol a space ("Flabébé", "Farfetch'd", "M Charizard-EX"). */
export function norm(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/♀/g, " f ")
    .replace(/♂/g, " m ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const NUMBERISH = /^#?([a-z]{0,5})0*(\d{1,4})(?:\s*\/\s*[a-z]{0,5}0*(\d{1,4}))?$/;

/**
 * The parts of a query. `words` are the normalised words; `numbers[i]` is the card
 * number a word could be ({ p: letters before the digits, n, t: total or 0 }) or null.
 * "177/132" arrives as one word because the slash is what makes it a number.
 */
export function parseQuery(raw) {
  const joined = String(raw ?? "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/");
  const words = [];
  const numbers = [];
  for (const part of joined.split(/\s+/).filter(Boolean)) {
    const m = NUMBERISH.exec(part.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    if (m && /\d/.test(part)) {
      words.push(part.includes("/") ? String(Number(m[2])) : norm(part));
      numbers.push({ p: m[1] || "", n: Number(m[2]), t: m[3] ? Number(m[3]) : 0 });
      continue;
    }
    const w = norm(part);
    for (const piece of w.split(" ").filter(Boolean)) {
      words.push(piece);
      numbers.push(null);
    }
  }
  return { words, numbers, empty: !words.length };
}

/** "TG05" is { p: "tg", n: 5 }; "177" is { p: "", n: 177 }; "9-cosmos" is { p: "", n: 9 }. null when there are no digits. */
export function parseNumber(number) {
  const m = /^\s*([a-z]*)0*(\d+)/i.exec(String(number ?? ""));
  return m ? { p: m[1].toLowerCase(), n: Number(m[2]) } : null;
}

/** The total in a printed number such as "136/165", else 0. */
function printedTotalOf(printed) {
  const m = /\/\s*[a-z]*0*(\d+)\s*$/i.exec(String(printed ?? ""));
  return m ? Number(m[1]) : 0;
}

/** Does a word that starts a word of `hay` (the haystack's words are space separated)? */
function startsWord(hay, word) {
  return hay.startsWith(word) || hay.includes(` ${word}`);
}

/**
 * How well a card's number fits a number in the query: 0 no, 1 the number, 2 the number and the total.
 * Letters in the query ("tg05") must match the card's letters; digits alone also fit a lettered number, a little less well.
 */
function numberFit(card, q) {
  if (!q) return 0;
  let best = 0;
  const tries = [{ ...card.num, t: card.total }];
  if (card.printedNum) tries.push({ ...card.printedNum, t: printedTotalOf(card.printed) || card.total });
  for (const c of tries) {
    if (!c || c.n !== q.n) continue;
    if (q.p && q.p !== c.p) continue;
    if (q.t && q.t !== c.t) continue;
    best = Math.max(best, q.t ? 2 : 1);
  }
  return best;
}

/**
 * Make the searchable list out of data/search-index.json.
 * `setOf(homeSetId)` answers { name, printedTotal, released (ms) } or null for a set the site does not know,
 * `homeOf(cardId)` the set a card is counted under (js/card-home.js homeSetId), `rarityLabel(rarity)` the words a player sees.
 */
export function buildCardList(raw, { setOf, homeOf, rarityLabel = (r) => r }) {
  const names = raw.names.map((name) => ({ name, key: norm(name) }));
  const rarities = raw.rarities.map((rarity) => ({ rarity, label: rarityLabel(rarity) || rarity }));
  rarities.forEach((r) => (r.key = norm(r.label)));
  const cards = [];
  for (const [dataSetId, rows] of Object.entries(raw.sets)) {
    const dataSet = setOf(dataSetId);
    for (const [number, nameAt, rarityAt, printed, extra] of rows) {
      const id = (extra && extra.id) || `${dataSetId}-${number}`;
      const homeId = homeOf(id);
      const home = setOf(homeId) || dataSet;
      if (!home) continue;
      const nm = names[nameAt];
      const rar = rarities[rarityAt];
      cards.push({
        id,
        setId: homeId,
        dataSetId,
        name: nm.name,
        nameKey: nm.key,
        rarity: rar.rarity,
        rarityLabel: rar.label,
        number,
        num: parseNumber(number),
        printed: printed || "",
        printedNum: printed ? parseNumber(printed) : null,
        total: Number(dataSet?.printedTotal) || 0,
        setName: home.name,
        released: Number(home.released) || 0,
        hay: `${nm.key} ${norm(home.name)} ${rar.key}`,
        setKey: norm(home.name),
        image: (extra && extra.img) || `assets/cards/${dataSetId}/${number}-sm.webp`,
      });
    }
  }
  return cards;
}

/**
 * The cards a query finds, best first. Every word must be a number the card carries, or start a word of the
 * name, set name or rarity. Returns { total, hits } where hits is the first `limit` cards.
 */
export function searchCards(cards, query, { limit = 500, rank = () => 0 } = {}) {
  const q = typeof query === "string" ? parseQuery(query) : query;
  if (q.empty) return { total: 0, hits: [] };
  const scored = [];
  for (const card of cards) {
    let score = 0;
    let ok = true;
    const said = []; // the words that landed on the name
    for (let i = 0; i < q.words.length && ok; i++) {
      const word = q.words[i];
      const fit = numberFit(card, q.numbers[i]);
      if (fit) {
        score += 400 + fit * 100;
        continue;
      }
      // "177/132" can only be a number; a bare "151" may also begin a set name.
      if (q.numbers[i]?.t) {
        ok = false;
        break;
      }
      if (startsWord(card.nameKey, word)) {
        said.push(word);
        score += card.nameKey.startsWith(word) ? 60 : 40;
      } else if (startsWord(card.setKey, word)) score += 18;
      else if (startsWord(card.hay, word)) score += 10;
      else if (word.length >= 3 && card.nameKey.includes(word)) score += 6;
      else ok = false;
    }
    if (!ok) continue;
    // The name said whole ("mew ex" is Mew ex, not Mewtwo ex) beats a name only begun.
    const lead = said.join(" ");
    if (lead && card.nameKey === lead) score += 300;
    else if (lead && card.nameKey.startsWith(lead)) score += 120;
    scored.push({ card, score: score + rank(card) });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.card.released - a.card.released ||
      a.card.setName.localeCompare(b.card.setName) ||
      compareNumbers(a.card, b.card)
  );
  return { total: scored.length, hits: scored.slice(0, limit).map((s) => s.card) };
}

function compareNumbers(a, b) {
  const x = a.num?.n ?? 1e9;
  const y = b.num?.n ?? 1e9;
  return x - y || String(a.number).localeCompare(String(b.number));
}

/** Words a player uses for a product type, so "etb" finds "Elite Trainer Box" and "booster box" finds "Box". */
const KIND_WORDS = {
  boosterBox: "booster box display case",
  eliteTrainerBox: "elite trainer box etb",
  boosterBundle: "booster bundle",
  etb: "elite trainer box etb",
  premium: "premium collection box",
  collection: "collection box",
  tin: "tin",
  blister: "blister pack three pack",
  deck: "deck theme deck battle deck",
  battle: "build and battle box",
  bundle: "bundle",
  event: "promo card",
  pack: "booster pack single pack",
};
export const PRODUCT_WORDS = new Set(
  ["box", "etb", "elite", "trainer", "bundle", "tin", "blister", "collection", "deck", "pack", "booster", "case", "display", "premium", "sealed"]
);

/** Make the sealed list searchable. Items: { setId, id, name, kind, short, price, cart, ... } and `setOf(setId)`. */
export function buildSealedList(items, setOf) {
  return items
    .map((item) => {
      const set = setOf(item.setId);
      if (!set) return null;
      const setKey = norm(set.name);
      const nameKey = norm(item.name);
      // Standard boxes are called "Booster Box" on the set's own page; out here they need the set's name.
      const title = nameKey.includes(setKey) ? item.name : `${set.name} ${item.name}`;
      return {
        ...item,
        title,
        setName: set.name,
        released: Number(set.released) || 0,
        nameKey: norm(title),
        setKey,
        hay: `${norm(title)} ${norm(item.short || "")} ${KIND_WORDS[item.kind] || ""}`,
      };
    })
    .filter(Boolean);
}

/** The products a query finds, best first: every word must start a word of the product's title, kind or set. */
export function searchSealed(list, query, { limit = 200 } = {}) {
  const q = typeof query === "string" ? parseQuery(query) : query;
  // "177/132" is a printed card number; no product is named like that.
  if (q.empty || q.numbers.some((n) => n?.t)) return { total: 0, hits: [] };
  const words = q.words;
  const lead = words.join(" ");
  // "bundles" finds "Bundle", "boxes" finds "Box".
  const stem = (w) => (w.length > 3 ? w.replace(/(?:es|s)$/, "") : w);
  const hit = (hay, w) => startsWord(hay, w) || (stem(w) !== w && startsWord(hay, stem(w)));
  const scored = [];
  for (const item of list) {
    let score = 0;
    let ok = true;
    for (const word of words) {
      if (item.nameKey.startsWith(word)) score += 40;
      else if (hit(item.nameKey, word)) score += 30;
      else if (hit(item.hay, word)) score += 14;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (item.nameKey.startsWith(lead)) score += 60;
    if (item.cart) score += 4;
    scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.item.released - a.item.released ||
      Number(b.item.price || 0) - Number(a.item.price || 0) ||
      a.item.title.localeCompare(b.item.title)
  );
  return { total: scored.length, hits: scored.slice(0, limit).map((s) => s.item) };
}

/** True when a query names a kind of product ("etb", "booster box"), so sealed results are worth showing first. */
export function asksForProduct(query) {
  const q = typeof query === "string" ? parseQuery(query) : query;
  return q.words.some((w, i) => !q.numbers[i] && PRODUCT_WORDS.has(w));
}
