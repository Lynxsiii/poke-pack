/**
 * Pokedex achievements: collections by Pokémon name. They read the owned card
 * names through ctx.countName(name) and ctx.species([names]) (how many of the
 * listed names you own at least one card of), so a "Charizard" counts Charizard
 * ex, Radiant Charizard, Lance's Charizard V and Mega Charizard X ex alike.
 */
import { ach, EEVEELUTIONS } from "./achievement-kit.js";
import { hasSets } from "./achievement-eras.js";

const say = (list) => {
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

/** Own at least one card of `goal` of the named Pokémon (all of them by default). */
function group(tier, id, name, list, coins, extra = {}) {
  const goal = extra.goal || list.length;
  const note = extra.note || `Own a card of ${goal === list.length ? "each of " : `${goal} of `}${say(list)}.`;
  const more = extra.title ? { title: extra.title } : {};
  return ach("dex", tier, id, name, note, goal, (c) => c.species(list), coins, { mark: extra.mark || String(goal), ...more });
}

/** Own `goal` different cards with `name` in their name. */
function pile(tier, id, name, pokemon, goal, coins, extra = {}) {
  const note = extra.note || `Own ${goal} different ${pokemon} cards.`;
  return ach("dex", tier, id, name, note, goal, (c) => c.countName(pokemon), coins, { mark: extra.mark });
}

export const STARTERS = {
  Kanto: ["Bulbasaur", "Charmander", "Squirtle"],
  Johto: ["Chikorita", "Cyndaquil", "Totodile"],
  Hoenn: ["Treecko", "Torchic", "Mudkip"],
  Sinnoh: ["Turtwig", "Chimchar", "Piplup"],
  Unova: ["Snivy", "Tepig", "Oshawott"],
  Kalos: ["Chespin", "Fennekin", "Froakie"],
  Alola: ["Rowlet", "Litten", "Popplio"],
  Galar: ["Grookey", "Scorbunny", "Sobble"],
  Paldea: ["Sprigatito", "Fuecoco", "Quaxly"],
};
export const ALL_STARTERS = Object.values(STARTERS).flat();

export const LEGEND_GROUPS = {
  birds: ["Articuno", "Zapdos", "Moltres"],
  beasts: ["Raikou", "Entei", "Suicune"],
  eon: ["Latias", "Latios"],
  weather: ["Kyogre", "Groudon", "Rayquaza"],
  lake: ["Uxie", "Mesprit", "Azelf"],
  creation: ["Dialga", "Palkia", "Giratina"],
  regis: ["Regirock", "Regice", "Registeel", "Regigigas"],
  swords: ["Cobalion", "Terrakion", "Virizion"],
  tao: ["Reshiram", "Zekrom", "Kyurem"],
  aura: ["Xerneas", "Yveltal", "Zygarde"],
  tapu: ["Tapu Koko", "Tapu Lele", "Tapu Bulu", "Tapu Fini"],
  moon: ["Solgaleo", "Lunala", "Necrozma"],
  galar: ["Zacian", "Zamazenta", "Eternatus"],
  ruin: ["Wo-Chien", "Chien-Pao", "Ting-Lu", "Chi-Yu"],
  paradox: ["Koraidon", "Miraidon"],
};
export const ALL_LEGENDS = Object.values(LEGEND_GROUPS).flat();

/** Sun & Moon's Ultra Beasts. Not part of LEGEND_GROUPS: that list sets the goal of a shipped achievement. */
export const ULTRA_BEASTS = [
  "Nihilego", "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana",
  "Guzzlord", "Necrozma", "Poipole", "Naganadel", "Stakataka", "Blacephalon",
];

/** Shining Legends' six Shining Pokémon. */
export const SHINING_SIX = ["Shining Genesect", "Shining Volcanion", "Shining Mew", "Shining Jirachi", "Shining Rayquaza", "Shining Arceus"];

/** Rows that need cards from particular sets appear once those sets are playable. */
const when = (ok, rows) => (ok ? rows : []);

export const MYTHICALS = [
  "Mew", "Celebi", "Jirachi", "Manaphy", "Victini", "Darkrai", "Shaymin",
  "Deoxys", "Genesect", "Diancie", "Hoopa", "Volcanion", "Marshadow", "Zeraora",
];

export const PSEUDO_LEGENDS = [
  "Dragonite", "Tyranitar", "Salamence", "Metagross", "Garchomp",
  "Hydreigon", "Goodra", "Kommo-o", "Dragapult", "Baxcalibur",
];

export const CAST = [
  "Cynthia", "Marnie", "Iono", "Lillie", "Arven", "Ethan", "Hop",
  "Misty", "Erika", "Steven", "Giovanni", "Kieran", "Nemona",
];

export const DEX = [
  // Eevee and its family
  pile(1, "eevee-5", "Eevee fan", "Eevee", 5, 60),
  pile(2, "eevee-15", "Eevee army", "Eevee", 15, 200),
  pile(3, "eevee-30", "Eevee horde", "Eevee", 30, 500),
  group(2, "eeveelution-4", "Eeveelution quartet", EEVEELUTIONS, 150, { goal: 4, note: "Own cards of 4 different Eeveelutions." }),
  group(3, "eeveelution-8", "Eevee's family", EEVEELUTIONS, 600, { note: "Own a card of every Eeveelution, all eight." }),

  // Starters, region by region
  ...Object.entries(STARTERS).map(([region, list]) =>
    group(1, `starters-${region.toLowerCase()}`, `${region} starters`, list, 60, {
      note: `Own all three ${region} starters: ${say(list)}.`,
    })
  ),
  group(4, "starters-all", "Every starter", ALL_STARTERS, 1500, {
    note: "Own all 27 starters from Kanto to Paldea.",
    mark: "27",
  }),
  group(2, "kanto-finals", "Kanto finals", ["Venusaur", "Charizard", "Blastoise"], 120),
  group(3, "kanto-lines", "Kanto lines", ["Bulbasaur", "Ivysaur", "Venusaur", "Charmander", "Charmeleon", "Charizard", "Squirtle", "Wartortle", "Blastoise"], 350, {
    note: "Own every stage of all three Kanto starter lines, nine Pokémon in all.",
  }),

  // Legendaries
  group(2, "legend-birds", "Legendary birds", LEGEND_GROUPS.birds, 150),
  group(2, "legend-beasts", "Legendary beasts", LEGEND_GROUPS.beasts, 150),
  group(2, "legend-eon", "Eon duo", LEGEND_GROUPS.eon, 120),
  group(2, "legend-weather", "Weather trio", LEGEND_GROUPS.weather, 180),
  group(2, "legend-lake", "Lake guardians", LEGEND_GROUPS.lake, 180),
  group(2, "legend-creation", "Creation trio", LEGEND_GROUPS.creation, 180),
  group(2, "legend-regis", "The Regis", LEGEND_GROUPS.regis, 220),
  group(2, "legend-swords", "Swords of Justice", LEGEND_GROUPS.swords, 180),
  group(2, "legend-tao", "Tao trio", LEGEND_GROUPS.tao, 180),
  group(2, "legend-aura", "Life and destruction", LEGEND_GROUPS.aura, 180),
  group(2, "legend-tapu", "Tapu guardians", LEGEND_GROUPS.tapu, 220),
  group(2, "legend-moon", "Sun, moon and beyond", LEGEND_GROUPS.moon, 180),
  group(2, "legend-galar", "Galar legends", LEGEND_GROUPS.galar, 180),
  group(3, "legend-ruin", "Treasures of Ruin", LEGEND_GROUPS.ruin, 300),
  group(2, "legend-paradox", "Paradox riders", LEGEND_GROUPS.paradox, 120),
  group(2, "legend-hunter-15", "Legend hunter", ALL_LEGENDS, 350, {
    goal: 15,
    note: "Own 15 different legendary Pokémon from the groups above.",
  }),
  group(3, "legend-hunter-30", "Legend chaser", ALL_LEGENDS, 900, {
    goal: 30,
    note: "Own 30 different legendary Pokémon from the groups above.",
  }),
  group(4, "legend-hunter-all", "Legend keeper", ALL_LEGENDS, 2500, {
    note: "Own every legendary Pokémon from the groups above.",
    mark: String(ALL_LEGENDS.length),
    title: "Legend Keeper",
  }),
  group(2, "mythical-5", "Mythical curiosity", MYTHICALS, 250, {
    goal: 5,
    note: "Own 5 different mythical Pokémon, Mew to Zeraora.",
  }),
  group(3, "mythical-10", "Mythical hunter", MYTHICALS, 700, {
    goal: 10,
    note: "Own 10 different mythical Pokémon, Mew to Zeraora.",
  }),
  group(4, "mythical-all", "Myth keeper", MYTHICALS, 1500, {
    note: "Own every mythical Pokémon, Mew to Zeraora.",
    mark: String(MYTHICALS.length),
  }),

  // Pikachu
  pile(1, "pikachu-1", "Pika pal", "Pikachu", 1, 30, { note: "Own a Pikachu card." }),
  pile(1, "pikachu-10", "Pikachu pack", "Pikachu", 10, 100),
  pile(2, "pikachu-25", "Pikachu parade", "Pikachu", 25, 250),
  pile(3, "pikachu-50", "Pikachu party", "Pikachu", 50, 600),
  group(2, "pikachu-line", "Pika family", ["Pichu", "Pikachu", "Raichu"], 120),

  // Charizard
  pile(1, "charizard-1", "Charizard fan", "Charizard", 1, 60, { note: "Own a Charizard card." }),
  pile(2, "charizard-5", "Charizard cabinet", "Charizard", 5, 200),
  pile(3, "charizard-15", "Charizard vault", "Charizard", 15, 600),
  pile(4, "charizard-30", "Charizard shrine", "Charizard", 30, 1200),
  group(3, "charizard-mega", "Two flames", ["Mega Charizard X", "Mega Charizard Y"], 250, {
    note: "Own a Mega Charizard X card and a Mega Charizard Y card.",
  }),
  group(1, "charmander-line", "Charmander line", ["Charmander", "Charmeleon", "Charizard"], 80, {
    note: "Own Charmander, Charmeleon and Charizard.",
  }),

  // Mew and Mewtwo
  group(2, "mew-mewtwo", "Genetic pair", ["Mew", "Mewtwo"], 120, { note: "Own a Mew card and a Mewtwo card." }),
  pile(2, "mew-5", "Mew fan", "Mew", 5, 150),
  pile(2, "mewtwo-5", "Mewtwo strikes back", "Mewtwo", 5, 150),

  // Ghosts, dragons and other favourites
  group(1, "ghost-line", "Ghost line", ["Gastly", "Haunter", "Gengar"], 80, { note: "Own Gastly, Haunter and Gengar." }),
  pile(1, "gengar-5", "Gengar fan", "Gengar", 5, 80),
  pile(2, "gengar-15", "Gengar gang", "Gengar", 15, 250),
  group(1, "dragon-line", "Dragon line", ["Dratini", "Dragonair", "Dragonite"], 80, { note: "Own Dratini, Dragonair and Dragonite." }),
  group(2, "pseudo-5", "Pseudo club", PSEUDO_LEGENDS, 250, {
    goal: 5,
    note: "Own 5 different pseudo legendaries, Dragonite to Baxcalibur.",
  }),
  group(4, "pseudo-all", "Six hundred club", PSEUDO_LEGENDS, 1500, {
    note: "Own all ten pseudo legendaries, Dragonite to Baxcalibur.",
    mark: "10",
  }),
  pile(1, "snorlax-5", "Nap time", "Snorlax", 5, 80),
  pile(2, "snorlax-15", "Sleeping giants", "Snorlax", 15, 250),
  pile(2, "lucario-10", "Aura reader", "Lucario", 10, 200),
  group(2, "gardevoir-family", "Gardevoir family", ["Ralts", "Kirlia", "Gardevoir", "Gallade"], 150),
  pile(2, "mimikyu-10", "Disguise master", "Mimikyu", 10, 200),
  pile(1, "umbreon-5", "Night watch", "Umbreon", 5, 80),
  group(1, "splash", "Splash to splash", ["Magikarp", "Gyarados"], 50, { note: "Own a Magikarp card and a Gyarados card." }),
  pile(1, "ditto-5", "Ditto duplicates", "Ditto", 5, 60),
  pile(2, "meowth-10", "That is right", "Meowth", 10, 150),

  // Trainers, villains and regional forms
  pile(2, "rocket-10", "Rocket recruit", "Team Rocket's", 10, 150, { note: "Own 10 different Team Rocket's cards." }),
  pile(3, "rocket-30", "Rocket crew", "Team Rocket's", 30, 450, { note: "Own 30 different Team Rocket's cards." }),
  pile(1, "professor-10", "Teacher's pet", "Professor", 10, 100, { note: "Own 10 different Professor cards." }),
  group(2, "cast-6", "Familiar faces", CAST, 200, { goal: 6, note: "Own a card of 6 signature trainers, Cynthia to Nemona." }),
  group(3, "cast-10", "Cast list", CAST, 500, { goal: 10, note: "Own a card of 10 signature trainers, Cynthia to Nemona." }),
  group(4, "cast-all", "Full cast", CAST, 900, { note: "Own a card of all 13 signature trainers, Cynthia to Nemona.", mark: "13" }),
  pile(2, "cynthia-10", "Champion's fan", "Cynthia", 10, 200, { note: "Own 10 different Cynthia's cards." }),
  pile(1, "galarian-10", "Galar tour", "Galarian", 10, 80, { note: "Own 10 different Galarian forms." }),
  pile(2, "galarian-40", "Galar native", "Galarian", 40, 300, { note: "Own 40 different Galarian forms." }),
  pile(1, "alolan-10", "Alola trip", "Alolan", 10, 100, { note: "Own 10 different Alolan forms." }),
  ...when(hasSets("sm2", "sm4", "sm9", "sm11"), [
    pile(2, "alolan-40", "Alola native", "Alolan", 40, 300, { note: "Own 40 different Alolan forms." }),
  ]),
  group(2, "ultra-beast-6", "Beast hunter", ULTRA_BEASTS, 200, {
    goal: 6,
    note: "Own 6 different Ultra Beasts, Nihilego to Blacephalon.",
  }),
  ...when(hasSets("sm4"), [
    group(3, "ultra-beast-all", "Beast keeper", ULTRA_BEASTS, 600, {
      note: "Own every Ultra Beast, Nihilego to Blacephalon, all twelve.",
      mark: "12",
    }),
  ]),
  ...when(hasSets("sm1"), [
    group(2, "alola-finals", "Alola finals", ["Decidueye", "Incineroar", "Primarina"], 120),
    group(3, "alola-lines", "Alola lines", ["Rowlet", "Dartrix", "Decidueye", "Litten", "Torracat", "Incineroar", "Popplio", "Brionne", "Primarina"], 350, {
      note: "Own every stage of all three Alola starter lines, nine Pokémon in all.",
    }),
  ]),
  ...when(hasSets("sm35"), [
    group(3, "shining-six", "Shining six", SHINING_SIX, 400, {
      note: "Own all six Shining Pokémon of Shining Legends: Genesect, Volcanion, Mew, Jirachi, Rayquaza and Arceus.",
    }),
  ]),
  pile(1, "paldean-10", "Paldea trip", "Paldean", 10, 100, { note: "Own 10 different Paldean forms." }),
  pile(2, "hisuian-20", "Hisui trek", "Hisuian", 20, 200, { note: "Own 20 different Hisuian forms." }),
  pile(1, "mega-10", "Mega debut", "Mega", 10, 100, { note: "Own 10 different Mega cards." }),
  pile(2, "mega-40", "Mega fan", "Mega", 40, 350, { note: "Own 40 different Mega cards." }),
  pile(2, "radiant-5", "Radiant collection", "Radiant", 5, 200, { note: "Own 5 different Radiant Pokémon." }),
];
