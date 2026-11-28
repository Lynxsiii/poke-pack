/**
 * Shiny profile pictures are earned (Noah, 2026-11-28). Two ways:
 *   - hold a Black Label of any card of that Pokémon, or
 *   - master a set, which gives one shiny pick from the Pokémon in that set.
 * A shiny, once unlocked, is kept for good, and it covers every form of that
 * Pokémon (its Mega, its regional form). Shared by the site and the Worker.
 *
 * This file answers one question both sides need: which Pokémon is on a card.
 */
import { AVATAR_GROUPS } from "./avatar-dex.js";

const plain = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/♀/g, " f")
    .replace(/♂/g, " m")
    // "Zekrom-GX", "Mew-EX": the suffix is not part of the name. ("Ho-Oh", "Porygon-Z", "Kommo-o" keep their hyphens.)
    .replace(/-(gx|ex)\b/g, " ")
    .replace(/[^a-z0-9'.:\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let NAMES = null; // plain name -> Pokédex number
let SPECIES = null; // avatar id -> Pokédex number
let MAX_WORDS = 1;

function tables() {
  if (NAMES) return;
  NAMES = new Map();
  SPECIES = new Map();
  for (const group of AVATAR_GROUPS) {
    for (const [id, name, , of] of group.list) {
      if (id <= 10000) {
        const key = plain(name);
        NAMES.set(key, id);
        MAX_WORDS = Math.max(MAX_WORDS, key.split(" ").length);
        SPECIES.set(id, id);
      } else if (of) SPECIES.set(id, of);
    }
  }
  // The cards print Nidoran with its sign; some scans spell it out.
  for (const [alias, name] of [["nidoran female", "nidoran f"], ["nidoran male", "nidoran m"], ["ash-greninja", "greninja"]]) {
    if (NAMES.has(name)) NAMES.set(alias, NAMES.get(name));
  }
}

/** The Pokédex number an avatar id stands for: itself, or the Pokémon a form belongs to. 0 when unknown. */
export function avatarSpecies(id) {
  tables();
  return SPECIES.get(Number(id)) || 0;
}

/**
 * The Pokémon named on a card, as Pokédex numbers: "Dark Charizard" is [6],
 * "Pikachu & Zekrom-GX" is [25, 644], "Professor's Research" is []. The longest
 * name wins where two overlap ("Mr. Mime" over "Mime Jr.", "Porygon-Z" over "Porygon").
 */
export function cardSpecies(name) {
  tables();
  const words = plain(name).split(" ").filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; ) {
    let hit = 0;
    let used = 1;
    for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1 && !hit; n--) {
      const key = words.slice(i, i + n).join(" ");
      // A possessive ("Blaine's Charizard") or a trailing dot never hides the name itself.
      hit = NAMES.get(key) || NAMES.get(key.replace(/'s$/, "")) || 0;
      if (hit) used = n;
    }
    if (hit && !out.includes(hit)) out.push(hit);
    i += used;
  }
  return out;
}

/** Every Pokémon with a card in a list of cards (a set), as sorted Pokédex numbers. */
export function speciesInCards(cards) {
  const seen = new Set();
  for (const card of cards || []) {
    if (card?.supertype && card.supertype !== "Pokémon") continue;
    for (const id of cardSpecies(card?.name)) seen.add(id);
  }
  return [...seen].sort((a, b) => a - b);
}
