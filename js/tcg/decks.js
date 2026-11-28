/**
 * Decks: what makes one legal, building one for the player, building one for the bot.
 * Pure rules, shared with the Worker later (a wager match must check both decks
 * against what each player owns, docs/tcg-plan.md).
 *
 *   deck  { id, name, format: "standard" | "expanded" | "unlimited" (an old "half" deck is shown as not legal), cards: { catalogId: copies } }
 *
 * A player may only use cards they own, as many copies as they own. Basic
 * Energy is the one thing nobody has to own (js/tcg/cards.js FREE_ENERGY), the
 * way every table has a pile of it.
 */

import { FORMATS } from "./engine.js";
import { FREE_ENERGY, isFreeEnergy } from "./cards.js";
import { trainerAim } from "./trainers.js";

export const MAX_DECKS = 12;

export function deckSize(deck) {
  return Object.values(deck.cards || {}).reduce((n, c) => n + c, 0);
}

/** The deck as the engine wants it: one catalog id per physical card. */
export function deckList(deck) {
  return Object.entries(deck.cards || {}).flatMap(([id, n]) => Array(n).fill(id));
}

const isBasicEnergy = (def) => def?.kind === "energy" && def.basic;

/** The format's rules; a deck of a format no one can build for any more (the old Half deck) is held to Unlimited's. */
export const rulesOf = (format) => (FORMATS[format]?.pick ? FORMATS[format] : FORMATS.unlimited);

/** Why this card can't go in a deck of this format, or "" (js/tcg/formats.js, on the card as `legal`). */
export const notLegal = (def, format) => (FORMATS[format]?.pick ? def?.legal?.[format] ?? "" : "");

/**
 * How many copies of each name the deck already holds. The limit is by name, not by print:
 * reprints count together, and so do "Gengar" and "Gengar LV.X" (`deckName`). A card that
 * says you may have as many of it as you like (`any`) is left out.
 */
export function copiesByName(deck, defs) {
  const names = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const def = defs(id);
    if (!def || isBasicEnergy(def) || def.any) continue;
    const name = def.deckName || def.name;
    names[name] = (names[name] || 0) + n;
  }
  return names;
}

/** How many cards of a one-per-deck kind (a Radiant Pokémon, an ACE SPEC card) the deck holds. */
function clubCount(deck, club, defs) {
  return Object.entries(deck.cards || {}).reduce((n, [id, c]) => n + (defs(id)?.club === club ? c : 0), 0);
}

/** How many more copies of a card this deck can take: by the name limit, by what is owned, by room. */
export function roomFor(deck, id, owned, defs) {
  const rules = rulesOf(deck.format);
  const def = defs(id);
  if (!def?.playable || notLegal(def, deck.format)) return 0;
  const have = deck.cards[id] || 0;
  const space = rules.deckSize - deckSize(deck);
  if (isBasicEnergy(def)) return isFreeEnergy(id) ? space : Math.min(space, (owned[id] || 0) - have);
  const name = def.deckName || def.name;
  const byName = def.any ? Infinity : (def.cap || rules.copies) - (copiesByName(deck, defs)[name] || 0);
  const club = def.club ? 1 - clubCount(deck, def.club, defs) : Infinity;
  return Math.max(0, Math.min(space, byName, club, (owned[id] || 0) - have));
}

/**
 * { ok, problems: [text], size, need }. `owned` is { catalogId: copies }. The deck rules of every
 * Constructed format (Tournament Handbook 4; js/tcg/formats.js): exactly 60 cards, at most 4 of a
 * name except basic Energy (and the cards that say you may have as many as you like), 1 of each
 * Prism Star card, 1 ACE SPEC, 1 Radiant Pokémon, 1 Pokémon ★, at least one Basic Pokémon, and
 * every card legal in the format.
 */
export function checkDeck(deck, owned, defs) {
  const rules = rulesOf(deck.format);
  const problems = [];
  const size = deckSize(deck);
  let basics = 0;
  const illegal = new Map();
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const def = defs(id);
    if (!def) {
      problems.push("A card in this deck couldn't be found.");
      continue;
    }
    if (!def.playable) problems.push(`${def.name} can't be played yet.`);
    const why = notLegal(def, deck.format);
    if (why && !illegal.has(`${def.name} ${why}`)) illegal.set(`${def.name} ${why}`, `${def.name} isn't legal in ${rules.name}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
    if (def.kind === "pokemon" && def.stage === "basic") basics += n;
    if (!isFreeEnergy(id) && (owned[id] || 0) < n) problems.push(`You own ${owned[id] || 0} of ${def.name}, the deck has ${n}.`);
  }
  problems.push(...illegal.values());
  const caps = {};
  const clubs = {};
  for (const [id, n] of Object.entries(deck.cards || {})) {
    const def = defs(id);
    if (def?.cap) caps[def.deckName || def.name] = def.cap;
    if (def?.club) clubs[def.club] = (clubs[def.club] || 0) + n;
  }
  for (const [name, n] of Object.entries(copiesByName(deck, defs))) {
    const limit = caps[name] || rules.copies;
    if (n > limit) problems.push(`${n} copies of ${name}, the limit is ${limit}.`);
  }
  for (const [club, n] of Object.entries(clubs)) if (n > 1) problems.push(`A deck can hold only 1 ${club}, this one has ${n}.`);
  if (size !== rules.deckSize) problems.unshift(size < rules.deckSize ? `${rules.deckSize - size} more card${rules.deckSize - size === 1 ? "" : "s"} to go.` : `${size - rules.deckSize} too many cards.`);
  if (!basics) problems.push("Add at least one Basic Pokémon.");
  if (!FORMATS[deck.format]?.pick) problems.unshift(`${FORMATS[deck.format]?.name || "This kind of deck"} isn't a tournament format: switch the deck to Standard, Expanded or Unlimited, 60 cards.`);
  return { ok: !problems.length, problems, size, need: rules.deckSize };
}

/* ---------- building a deck ---------- */

const needsOf = (def) => new Set(def.attacks.flatMap((a) => a.cost).filter((c) => c !== "Colorless"));
const fits = (def, types) => [...needsOf(def)].every((t) => types.includes(t));

/** How good a Pokémon is at simply hitting: its best damage for its cost, and its HP. */
function worth(def) {
  const hit = Math.max(0, ...def.attacks.map((a) => a.damage / (a.cost.length + 1)));
  return hit * 2 + def.hp / 10;
}

/**
 * Build a deck from a pool of [{ def, owned }]: the strongest one or two Energy
 * types the pool supports, evolution lines kept together, the rest Energy.
 * Returns { cards, types } or null when the pool has no Basic Pokémon to lead with.
 * `prefer` forces the first type (the bot's themed decks).
 */
export function buildDeck(pool, format = "standard", { prefer = "", rand = Math.random } = {}) {
  const rules = rulesOf(format);
  pool = pool.filter((p) => p.def && !notLegal(p.def, format));
  const mons = pool.filter((p) => p.def?.kind === "pokemon" && p.def.playable && p.owned > 0);
  const basics = mons.filter((p) => p.def.stage === "basic");
  if (!basics.length) return null;

  // Which Energy type carries the most good Basic Pokémon?
  const tally = {};
  for (const { def, owned } of basics) {
    const needs = [...needsOf(def)];
    if (needs.length > 1) continue;
    const share = worth(def) * Math.min(owned, rules.copies);
    // Basic Fairy Energy left Standard with the Fairy type.
    for (const type of needs.length ? needs : FREE_ENERGY.map((e) => e.type).filter((t) => format !== "standard" || t !== "Fairy")) tally[type] = (tally[type] || 0) + share * (needs.length ? 1 : 0.25);
  }
  const ranked = Object.keys(tally).sort((a, b) => tally[b] - tally[a] || (rand() < 0.5 ? -1 : 1));
  const first = prefer && tally[prefer] ? prefer : ranked[0];
  if (!first) return null;

  const target = Math.round(rules.deckSize * 0.5);
  const cards = {};
  const names = {};
  let count = 0;
  const defById = new Map(pool.map((p) => [p.def?.id, p.def]));
  const clubs = new Set();
  const add = (id, printed, n, owned) => {
    const def = defById.get(id);
    const name = def?.deckName || printed;
    if (def?.club && clubs.has(def.club)) return 0;
    const take = Math.max(0, Math.min(n, owned - (cards[id] || 0), (def?.cap || rules.copies) - (names[name] || 0), def?.club ? 1 : Infinity, target - count));
    if (!take) return 0;
    if (def?.club) clubs.add(def.club);
    cards[id] = (cards[id] || 0) + take;
    names[name] = (names[name] || 0) + take;
    count += take;
    return take;
  };
  const evolutionsOf = (name, types) => mons.filter((p) => p.def.evolvesFrom === name && fits(p.def, types)).sort((a, b) => worth(b.def) - worth(a.def));

  const fill = (types) => {
    const line = (p) => worth(p.def) + (evolutionsOf(p.def.name, types)[0] ? 12 : 0);
    const leads = basics.filter((p) => fits(p.def, types)).sort((a, b) => line(b) - line(a));
    for (const lead of leads) {
      if (count >= target) break;
      const base = add(lead.def.id, lead.def.name, lead.owned, lead.owned);
      // One fewer of each stage up the line, as far as the player owns them.
      let below = names[lead.def.deckName || lead.def.name] || base;
      let from = lead.def.name;
      for (let step = 0; step < 2 && below > 0; step += 1) {
        const next = evolutionsOf(from, types)[0];
        if (!next) break;
        const took = add(next.def.id, next.def.name, Math.max(1, below - 1), next.owned);
        if (!took) break;
        below = took;
        from = next.def.name;
      }
    }
  };

  const types = [first];
  fill(types);
  if (count < target) {
    const second = ranked.find((t) => t !== first);
    if (second) {
      types.push(second);
      fill(types);
    }
  }
  if (!Object.keys(cards).some((id) => mons.find((p) => p.def.id === id)?.def.stage === "basic")) return null;

  // Trainers the pool holds and the game can read: about a seventh of the deck, card draw first.
  const aimAt = (def) => (def.sub === "tool" ? 3.5 : def.sub === "stadium" ? 6.5 : order[trainerAim(def.fx)] ?? 9);
  const order = { draw: 0, search: 1, refresh: 2, trade: 3, heal: 4, switch: 5, gust: 6, recover: 7, cure: 8, hammer: 9 };
  const trainers = pool.filter((p) => p.def?.kind === "trainer" && p.def.playable && p.owned > 0).sort((a, b) => aimAt(a.def) - aimAt(b.def));
  let room = Math.round(rules.deckSize * 0.14);
  for (const { def, owned } of trainers) {
    if (def.club && clubs.has(def.club)) continue;
    const name = def.deckName || def.name;
    const take = Math.max(0, Math.min(owned, def.club ? 1 : 2, (def.cap || rules.copies) - (names[name] || 0), room));
    if (!take) continue;
    if (def.club) clubs.add(def.club);
    cards[def.id] = take;
    names[name] = (names[name] || 0) + take;
    count += take;
    room -= take;
  }

  // Energy: in proportion to the symbols the chosen attacks ask for.
  const asks = {};
  for (const [id, n] of Object.entries(cards)) {
    const mon = mons.find((p) => p.def.id === id);
    if (!mon) continue;
    for (const type of needsOf(mon.def)) if (types.includes(type)) asks[type] = (asks[type] || 0) + n;
  }
  if (!Object.keys(asks).length) asks[first] = 1;
  const energy = rules.deckSize - count;
  const total = Object.values(asks).reduce((a, b) => a + b, 0);
  let left = energy;
  const byAsk = Object.keys(asks).sort((a, b) => asks[b] - asks[a]);
  byAsk.forEach((type, i) => {
    const n = i === byAsk.length - 1 ? left : Math.round((energy * asks[type]) / total);
    const id = FREE_ENERGY.find((e) => e.type === type).id;
    cards[id] = Math.min(left, n);
    left -= cards[id];
  });
  return { cards, types };
}

/**
 * A deck for the house bot, put together the way a person builds one out of a single
 * set: a main attacker's whole evolution line, a partner line on the same Energy, a
 * Pokémon whose Ability helps (draw, search, Energy), then Trainers by job (draw, search,
 * switch, gust, healing) and the rest Energy. Only one-prize Pokémon, so its strength
 * tracks the set and not luck. Returns { cards, types, theme } or null, where `theme`
 * is the main attacker's name ("Charizard"), for the table to show.
 */
export function buildBotDeck(setDefs, format, rand = Math.random, { level = "normal" } = {}) {
  // Hard: the deck a collector with every card of the set would build, Pokémon ex and V included.
  if (level === "hard") return hardDeck(setDefs, format, rand);
  const rules = rulesOf(format);
  const scale = rules.deckSize / 60;
  const n = (x) => Math.max(1, Math.min(rules.copies, Math.round(x * scale)));
  const total = (x) => Math.round(x * scale);
  // The strongest print of each name, of the cards legal in the format. No one-per-deck
  // Pokémon (Radiant, ★, Prism Star) and no LV.X, which shares its name with what it levels up from.
  const best = new Map();
  const trainers = [];
  const specials = [];
  const nameOf = (def) => def.deckName || def.name;
  for (const def of setDefs) {
    if (!def?.playable || notLegal(def, format)) continue;
    if (def.kind === "trainer") {
      if (!trainers.some((t) => nameOf(t) === nameOf(def))) trainers.push(def);
    } else if (def.kind === "energy") {
      if (!def.basic && !specials.some((t) => nameOf(t) === nameOf(def))) specials.push(def);
    } else if (def.kind === "pokemon" && def.prizes === 1 && !def.club && !def.cap && !/ LV\.X$/.test(def.name)) {
      const had = best.get(nameOf(def));
      if (!had || worth(def) > worth(had)) best.set(nameOf(def), def);
    }
  }
  const mons = [...best.values()];
  const basics = mons.filter((d) => d.stage === "basic");
  if (!basics.length) return null;
  const from = (name) => mons.filter((d) => d.evolvesFrom === name);
  const helps = (def) => {
    const use = def.ability?.use;
    if (!use) return 0;
    const aim = trainerAim(use.steps);
    return { draw: 6, search: 6, energize: 8, heal: 3, recover: 2 }[aim] || 0;
  };

  // Every evolution line the set can make, scored by what its last stage hits for.
  const lines = [];
  for (const basic of basics) {
    lines.push([basic]);
    for (const one of from(basic.name)) {
      lines.push([basic, one]);
      for (const two of from(one.name)) lines.push([basic, one, two]);
    }
  }
  const typeOf = (line) => [...needsOf(line[line.length - 1])][0] || "";
  const score = (line) => {
    const top = line[line.length - 1];
    if (needsOf(top).size > 1) return 0;
    return worth(top) * (1 + 0.12 * (line.length - 1)) + line.reduce((a, d) => a + helps(d), 0);
  };
  const ranked = lines.filter((l) => score(l) > 0).sort((a, b) => score(b) - score(a));
  if (!ranked.length) return null;
  // A little variety: one of the three best lines leads.
  const lead = ranked[Math.floor(rand() * Math.min(3, ranked.length))];
  const type = typeOf(lead) || ranked.map(typeOf).find(Boolean) || FREE_ENERGY[0].type;
  const used = new Set();
  const cards = {};
  let count = 0;
  const put = (def, k) => {
    if (!def || used.has(nameOf(def)) && !cards[def.id]) return 0;
    const take = Math.min(k, rules.copies - (cards[def.id] || 0));
    if (take <= 0) return 0;
    used.add(nameOf(def));
    cards[def.id] = (cards[def.id] || 0) + take;
    count += take;
    return take;
  };
  const putLine = (line, counts) => line.forEach((def, i) => put(def, n(counts[i])));
  const SIZES = { main: [[4], [4, 3], [4, 3, 3]], partner: [[4], [4, 3], [4, 2, 2]], support: [[2], [2, 2], [2, 1, 1]] };
  putLine(lead, SIZES.main[lead.length - 1]);
  const free = (line) => !line.some((d) => used.has(nameOf(d)));
  const partner = ranked.find((l) => free(l) && [...needsOf(l[l.length - 1])].every((t) => t === type));
  if (partner) putLine(partner, SIZES.partner[partner.length - 1]);
  const support = lines
    .filter((l) => free(l) && helps(l[l.length - 1]) && [...needsOf(l[l.length - 1])].every((t) => t === type))
    .sort((a, b) => helps(b[b.length - 1]) - helps(a[a.length - 1]) || a.length - b.length)[0];
  if (support) putLine(support, SIZES.support[support.length - 1]);
  // A deck needs enough Basic Pokémon to start with: top up with the sturdiest that fit.
  const monCount = () => Object.entries(cards).reduce((a, [id, k]) => a + (mons.some((d) => d.id === id) ? k : 0), 0);
  const basicCount = () => Object.entries(cards).reduce((a, [id, k]) => a + (mons.find((d) => d.id === id)?.stage === "basic" ? k : 0), 0);
  const extras = basics.filter((d) => !used.has(nameOf(d)) && fits(d, [type])).sort((a, b) => worth(b) - worth(a));
  for (const def of extras) {
    if (basicCount() >= total(16) && monCount() >= total(16)) break;
    put(def, n(2));
  }

  // A small set leaves few to choose from: more copies of what is in, then any Basic that hits for Colorless.
  for (const def of mons.filter((d) => cards[d.id] && d.stage === "basic")) if (basicCount() < total(12)) put(def, rules.copies);
  for (const def of basics.filter((d) => !used.has(nameOf(d)) && needsOf(d).size === 0)) if (basicCount() < total(12)) put(def, n(3));
  for (const def of mons.filter((d) => cards[d.id])) if (monCount() < total(14)) put(def, rules.copies);

  // Trainers by job, the way a list is written: cards first, then search, switching, gusting.
  const QUOTA = [["draw", 6], ["refresh", 4], ["search", 7], ["switch", 3], ["gust", 2], ["energize", 3], ["heal", 2], ["tool", 3], ["stadium", 2], ["trade", 2], ["recover", 2], ["hammer", 2], ["cure", 1]];
  const jobOf = (def) => (def.sub === "tool" ? "tool" : def.sub === "stadium" ? "stadium" : trainerAim(def.fx));
  const clubs = new Set();
  const ENERGY = total(13);
  let room = rules.deckSize - count - ENERGY;
  // Only one Supporter goes down a turn: past about ten, the rest would sit in the hand.
  let supporters = 0;
  const putTrainer = (def, k) => {
    if (def.club && (clubs.has(def.club) || cards[def.id])) return 0;
    const take = Math.max(0, Math.min(def.club ? 1 : def.cap || rules.copies, rules.copies) - (cards[def.id] || 0));
    const got = Math.min(take, k, room, def.sub === "supporter" ? total(10) - supporters : Infinity);
    if (got <= 0) return 0;
    if (def.club) clubs.add(def.club);
    cards[def.id] = (cards[def.id] || 0) + got;
    if (def.sub === "supporter") supporters += got;
    count += got;
    room -= got;
    return got;
  };
  // Within a job: a Supporter that draws more, a search that finds Pokémon over one that finds Energy.
  const pickFirst = (def) => {
    const steps = def.fx || [];
    const draw = steps.find((st) => st.op === "draw");
    const search = steps.find((st) => st.op === "search");
    return (draw?.n || 0) + (search ? (/energy/i.test(String(search.what)) ? 0 : 3) + (search.n || 1) : 0);
  };
  for (const [job, want] of QUOTA) {
    let left = n(want);
    for (const def of trainers.filter((t) => jobOf(t) === job).sort((a, b) => pickFirst(b) - pickFirst(a))) if (left > 0) left -= putTrainer(def, left);
  }
  // Room left over: another line on the same Energy, then the useful Trainers up to a full playset.
  const more = ranked.filter((l) => free(l) && [...needsOf(l[l.length - 1])].every((t) => t === type));
  for (const line of more) {
    if (room <= line.length || monCount() >= total(22)) break;
    if (!free(line)) continue;
    const before = count;
    putLine(line, SIZES.partner[line.length - 1]);
    room -= count - before;
  }
  for (const job of ["draw", "refresh", "search", "switch", "energize"]) for (const def of trainers.filter((t) => jobOf(t) === job && cards[t.id])) putTrainer(def, room);
  // A set short on Trainers would leave a pile of Energy: past about 18, more Pokémon and more Trainers instead.
  const spare = () => rules.deckSize - count - total(18);
  const lineSize = (line) => SIZES.partner[line.length - 1].reduce((a, k) => a + n(k), 0);
  for (const line of more) if (spare() >= lineSize(line) && free(line)) putLine(line, SIZES.partner[line.length - 1]);
  for (const def of basics.filter((d) => !used.has(nameOf(d)) && needsOf(d).size === 0)) if (spare() > 0) put(def, Math.min(n(3), spare()));
  for (const def of basics.filter((d) => cards[d.id])) if (spare() > 0) put(def, Math.min(rules.copies, spare()));
  room = spare();
  for (const def of trainers.filter((t) => cards[t.id])) putTrainer(def, room);

  // Energy: a Special Energy that suits the attackers, then basic Energy for the rest.
  let plain = 0;
  let typed = 0;
  for (const [id, k] of Object.entries(cards)) {
    const def = mons.find((d) => d.id === id);
    if (!def) continue;
    for (const c of def.attacks.flatMap((a) => a.cost)) if (c === "Colorless") plain += k;
    else typed += k;
  }
  for (const def of specials) {
    const gives = def.provides || [];
    const only = def.special?.only?.types;
    if (only && !only.includes(type)) continue;
    const suits = gives.includes(type) || (gives.length > 1 && gives.every((g) => g === "Colorless") && plain > typed / 2);
    if (!suits || gives.some((g) => g !== type && g !== "Colorless")) continue;
    const take = Math.min(def.club ? 1 : rules.copies, n(gives.length > 1 ? 4 : 2), rules.deckSize - count - total(8));
    if (take <= 0 || (def.club && clubs.has(def.club))) continue;
    if (def.club) clubs.add(def.club);
    cards[def.id] = take;
    count += take;
  }
  const energyType = type || "Colorless";
  const energy = FREE_ENERGY.find((e) => e.type === energyType) || FREE_ENERGY[0];
  cards[energy.id] = (cards[energy.id] || 0) + rules.deckSize - count;

  return { cards, types: [energy.type], theme: lead[lead.length - 1].name };
}

function hardDeck(setDefs, format, rand) {
  const pool = setDefs.filter(Boolean).map((def) => ({ def, owned: 4 }));
  const built = buildDeck(pool, format, { rand });
  if (!built) return null;
  const defOf = new Map(setDefs.filter(Boolean).map((d) => [d.id, d]));
  // Named after its hardest hitter among the cards it runs several of.
  const weight = (d) => worth(d) * Math.min(3, built.cards[d.id]);
  const lead = Object.keys(built.cards).map((id) => defOf.get(id)).filter((d) => d?.kind === "pokemon").sort((a, b) => weight(b) - weight(a))[0];
  return { ...built, theme: lead?.name || "" };
}
