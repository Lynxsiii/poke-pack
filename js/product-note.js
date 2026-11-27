/**
 * The player-facing line under a sealed product in the shop.
 *
 * data/sets/<id>.json keeps each product's research note as it was written
 * (which sites agreed, how sure we were, why a price was derived), because
 * that is what the next person checking the product needs. Players only need
 * what is in the box and what the site leaves out, so this drops the research
 * parts: a bracket, a "; " clause or a whole sentence that names a source,
 * a confidence level, a listing or a price, and turns "the mix is not known,
 * so it opens here as X" into "opened here as X".
 *
 * Keep new notes to the same shape: contents first, then research in
 * brackets or its own sentence, so this keeps working.
 */

const RESEARCH = new RegExp(
  [
    "bulbapedia", "serebii", "tcgplayer", "pricecharting", "pkmn\\.gg", "pokebeach", "collector's cache", "ebay",
    "toywiz", "pokemon\\.com", "pokémon\\.com", "retail", "source", "listing", "excerpt", "confidence", "medium",
    "loosepacks", "blowoutcards", "dacardworld", "totalcards", "joshscards", "wholesalegaming", "warpgate", "tcgcsv",
    "pokellector", "previews world", "rarecards", "pokewiki", "collexy", "elite fourum", "\\bpsa \\d", "pokemon1999",
    "pokumon", "potomac", "deck lists?\\b", "product text", "product page", "research", "document", "not stated",
    "not named", "not recorded", "not found", "unresolved", "does not say", "data error", "derivation", "\\bupc\\b",
    "\\bgroup \\d", "\\$\\d", "market", "\\bpric", "the sources", "disagree", "conflict", "\\bagree", "checked",
    "\\btitles?\\b", "search", "\\bwiki", "only: ", "\\bper one\\b", "\\bstale\\b", "\\bmodelled\\b", "the script",
    "\\btext\\b", "\\bnotes?\\b", "\\blow\\b", "\\bhigh\\b", "a slip", "\\b\\d{5,}\\b", "filed (with|under)",
  ].join("|"),
  "i",
);

// a clause that is about where the facts came from, whatever else it mentions
const RESEARCH_START = /^\W*(?:the )?(?:pack (?:set|mix|count|price)|pack set\/mix|real box's promo count|no source|collector's cache|loosepacks|the sources|sources|the (?:unlimited|1st edition) box has no|tcgplayer|bulbapedia|pricecharting|pkmn\.gg|pokebeach|priced|source)\b/i;

const OPENED = /\b(?:opened|opens|dealt|shown|simulated) here as ([^;,.()]+)|\b(?:dealt|shown|opens) as ([^;,.()]+)/i;

function stripResearch(part) {
  if (!RESEARCH.test(part) && !RESEARCH_START.test(part)) return part;
  const opened = part.match(OPENED);
  if (opened) return `opened here as ${(opened[1] || opened[2]).trim()}`;
  return "";
}

/** One bracketed group: keep the clauses that are about the product. */
function cleanBracket(inner) {
  const kept = inner.split(/;\s*/).map(stripResearch).filter(Boolean);
  return kept.length ? `(${kept.join("; ")})` : "";
}

function cleanSentence(sentence) {
  sentence = sentence.replace(/^\s*pack mix approximate:\s*(?=the real box held)/i, "");
  if (RESEARCH_START.test(sentence)) {
    const opened = sentence.match(OPENED);
    return opened ? `Opened here as ${(opened[1] || opened[2]).trim()}.` : "";
  }
  let s = sentence
    .replace(/\bof a set neither TCGplayer nor Bulbapedia names\b/g, "from a set that isn't known")
    .replace(/\(([^()]*)\)/g, (_, inner) => cleanBracket(inner));
  // "Five packs; the set mix was not found, shown as Phantom Forces packs."
  s = s
    .split(/;\s*/)
    .map((part, i) => (i === 0 && !OPENED.test(part) && !RESEARCH_START.test(part) ? part : stripResearch(part)))
    .filter(Boolean)
    .join("; ");
  s = s.replace(/\s*\b(?:by|per|according to) (?:bulbapedia|serebii|tcgplayer|pokebeach|pkmn\.gg|pokemon1999\.org|pricecharting)\b/gi, "");
  // research after the last colon or comma: cut it off, as often as it repeats
  for (let guard = 0; guard < 4 && RESEARCH.test(s.replace(/\([^()]*\)/g, "")); guard += 1) {
    const cut = s.replace(/[:,;]\s*[^:,;()]*$/, (tail) => (RESEARCH.test(tail) ? "" : tail));
    if (cut === s) break;
    s = cut;
  }
  if (RESEARCH.test(s.replace(/\([^()]*\)/g, ""))) {
    const opened = s.match(OPENED);
    // a sentence that is all research ("TCGplayer has no listing: priced from its packs.")
    if (/^\W*(source|tcgplayer|bulbapedia|serebii|pricecharting|pkmn|pokebeach|priced|price|as the|the one listing|no active)/i.test(s)
      || !/\b(packs?|cards?|deck|coin|promo|figure|pin|sleeves|box|tin|binder|poster|prize|stamp)\b/i.test(s)) {
      return opened ? `Opened here as ${(opened[1] || opened[2]).trim()}.` : "";
    }
  }
  return s;
}

/** Sentences, never split inside a bracket ("pkmn.gg" or "pokemon.com" in a source list). */
function splitSentences(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[.!?]/.test(ch) && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

/** The note with its research parts taken out, or "" when nothing is left. */
export function playerNote(note) {
  const text = String(note || "").trim();
  if (!text) return "";
  const sentences = splitSentences(text);
  const out = sentences
    .map((raw) => {
      const s = raw.trim();
      const c = cleanSentence(s);
      if (c === s) return s;
      if (!c || !/[a-z0-9]/i.test(c)) return "";
      let t = c
        .replace(/\s*\(\s*\)/g, "")
        .replace(/\s+([.,;:!?])/g, "$1")
        .replace(/[;:,]+(\s*[.!?]|$)/g, "$1")
        .replace(/\bis not simulated\b/g, "isn't included")
        .replace(/\bare not simulated\b/g, "aren't included")
        .replace(/\bisn't simulated\b/g, "isn't included")
        .replace(/\bno pack is simulated\b/g, "no pack is included")
        .replace(/\bnot simulated\b/g, "not included")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!/[.!?]$/.test(t)) t += ".";
      return t.charAt(0).toUpperCase() + t.slice(1);
    })
    .filter(Boolean)
    .map((s) => s.replace(/\bis not simulated\b/g, "isn't included").replace(/\bare not simulated\b/g, "aren't included")
      .replace(/\bisn't simulated\b/g, "isn't included").replace(/\bnot simulated\b/g, "not included").replace(/\bsimulated\b/g, "included"));
  return out.join(" ");
}
