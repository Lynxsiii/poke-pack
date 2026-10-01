/**
 * Secret achievements. They show as a locked "???" tile with only `hint` until
 * they are done, then reveal their name and note and can be claimed. Every one
 * reads progress that can only grow (counters, sets, ownership), never a
 * moment in time like "hold exactly 777 coins", so nobody misses one by
 * looking away.
 */
import { PLAYABLE_SETS } from "./catalog.js";
import { RARITIES_IN_PRINT, isPrinted } from "./achievement-eras.js";
import { secret, EEVEELUTIONS, SWSH_FINISHES, SM_FINISHES, SV_FINISHES, XY_FINISHES, BW_FINISHES } from "./achievement-kit.js";

const GHOSTS = [
  "Gastly", "Haunter", "Gengar", "Mimikyu", "Sableye", "Gholdengo",
  "Spiritomb", "Dusknoir", "Banette", "Froslass", "Chandelure", "Misdreavus",
];

const finishesOwned = (c, list) => list.filter((rarity) => c.count(rarity) > 0).length;

export const SECRETS = [
  secret("rip", 2, "dry-spell", "40", "Dry spell", "Some streaks are better left unmeasured.", "Go 40 packs in a row without a hit.", 40, (c) => c.stat("maxDrought"), 300),
  secret("rip", 3, "desert-crossing", "75", "Desert crossing", "It can get much drier than that.", "Go 75 packs in a row without a hit.", 75, (c) => c.stat("maxDrought"), 800, { title: "Drought Survivor" }),
  secret("rip", 3, "lucky-sevens", "777", "Lucky sevens", "Three lucky numbers in a row.", "Rip 777 packs.", 777, (c) => c.packs, 1200),
  secret("rip", 3, "set-loyalist", "250", "Set loyalist", "Do not stray from the path.", "Rip 250 packs of a single set.", 250, (c) => c.bestSetPacks, 1500),

  secret("collect", 2, "so-close", "-1", "So close", "Sometimes the missing piece is only one.", "Get within one card of finishing a set of 100 cards or more.", 1, (c) => c.setsAlmost, 300, { title: "Almost There" }),
  secret("collect", 3, "pile-of-one", "x25", "Pile of one", "The same face, over and over.", "Own 25 copies of a single card.", 25, (c) => c.maxCopies, 500),

  secret("dex", 2, "sun-and-moon", "☾", "Sun and moon", "One for the day, one for the night.", "Own 10 different Umbreon cards and 10 different Espeon cards.", 2, (c) => (c.countName("Umbreon") >= 10 ? 1 : 0) + (c.countName("Espeon") >= 10 ? 1 : 0), 400),
  secret("dex", 2, "ghost-gang", "BOO", "Ghost gang", "Who are you going to call?", "Own a card of each of Gastly, Haunter, Gengar, Mimikyu, Sableye, Gholdengo, Spiritomb, Dusknoir, Banette, Froslass, Chandelure and Misdreavus.", GHOSTS.length, (c) => c.species(GHOSTS), 500),
  secret("dex", 3, "shining-pair", "★★", "Shining pair", "Two lights from a generation long gone.", "Own Shining Magikarp and Shining Celebi.", 2, (c) => c.species(["Shining Magikarp", "Shining Celebi"]), 500),
  secret("dex", 3, "rocket-raid", "R", "Rocket raid", "Prepare for trouble.", "Own 75 different Team Rocket's cards.", 75, (c) => c.countName("Team Rocket's"), 900),
  secret("dex", 3, "mega-mania", "100", "Mega mania", "More is more.", "Own 100 different Mega cards.", 100, (c) => c.countName("Mega"), 1000),
  secret("dex", 4, "pikachu-overload", "100", "Pikachu overload", "Static in the air.", "Own 100 different Pikachu cards.", 100, (c) => c.countName("Pikachu"), 1500),
  secret("dex", 4, "charizard-hoard", "45", "Charizard hoard", "It burns the whole room.", "Own 45 different Charizard cards.", 45, (c) => c.countName("Charizard"), 2000, { title: "Flame Hoarder" }),

  secret("rarity", 4, "sword-sweep", "SWSH", "Sword sweep", "One era, every finish it ever printed.", `Own every Sword & Shield finish: ${SWSH_FINISHES.join(", ")}.`, SWSH_FINISHES.length, (c) => finishesOwned(c, SWSH_FINISHES), 2000),
  // Needs every finish printed by a playable set (Prism Stars, the Shining Pokémon and the
  // Shiny Vault each come from their own sets), so it appears with the last of them.
  ...(SM_FINISHES.every(isPrinted)
    ? [secret("rarity", 4, "alola-sweep", "SM", "Alola sweep", "Every shine the islands ever printed.", `Own every Sun & Moon finish: ${SM_FINISHES.join(", ")}.`, SM_FINISHES.length, (c) => finishesOwned(c, SM_FINISHES), 2000)]
    : []),
  // Needs the EX and BREAK finishes printed by a playable set, so it appears with the first BREAK set.
  ...(XY_FINISHES.every(isPrinted)
    ? [secret("rarity", 4, "kalos-sweep", "XY", "Kalos sweep", "Every shine Kalos ever printed.", `Own every XY finish: ${XY_FINISHES.join(", ")}.`, XY_FINISHES.length, (c) => finishesOwned(c, XY_FINISHES), 2000)]
    : []),
  // Needs the EX and Ace Spec finishes printed by a playable set, so it appears with Boundaries Crossed.
  ...(BW_FINISHES.every(isPrinted)
    ? [secret("rarity", 4, "unova-sweep", "BW", "Unova sweep", "Every shine Unova ever printed.", `Own every Black & White finish: ${BW_FINISHES.join(", ")}.`, BW_FINISHES.length, (c) => finishesOwned(c, BW_FINISHES), 2000)]
    : []),
  secret("rarity", 4, "scarlet-sweep", "SV", "Scarlet sweep", "One era, every finish it ever printed.", `Own every Scarlet & Violet finish: ${SV_FINISHES.join(", ")}.`, SV_FINISHES.length, (c) => finishesOwned(c, SV_FINISHES), 1800),
  secret("rarity", 4, "full-spectrum", "ALL", "Full spectrum", "Every finish there is.", "Own a card of every rarity in the game.", RARITIES_IN_PRINT.length, (c) => c.raritiesOwned, 4000, { title: "Full Spectrum" }),

  secret("sets", 4, "grand-tour", "ALL", "Grand tour", "See the whole shelf.", "Own at least one card from every playable set.", PLAYABLE_SETS.length, (c) => c.setsStarted, 3000, { title: "Globetrotter" }),
  secret("sets", 2, "happy-ending", "MCD", "Happy ending", "The toy was included.", "Complete a McDonald's set.", 1, (c) => c.editionDone("McDonald's"), 600),
  secret("sets", 2, "trick-and-treat", "TT", "Trick and treat", "Knock knock.", "Complete a Trick or Trade set.", 1, (c) => c.editionDone("Trick or Trade"), 600),

  secret("market", 4, "liquidator", "2.5K", "Liquidator", "Everything must go.", "Sell 2,500 cards.", 2500, (c) => c.stat("sold"), 3000),
  secret("quests", 4, "year-of-quests", "365", "Year of quests", "A full trip around the sun.", "Claim quests 365 days in a row.", 365, (c) => c.stat("streakBest"), 5000, { title: "Evergreen" }),

  secret("trainer", 1, "nice", "69", "Nice", "A number that makes people giggle.", "Rip 69 packs.", 69, (c) => c.packs, 69),
  secret("trainer", 2, "leet", "1337", "Elite", "Speak like a hacker.", "Pull 1,337 cards.", 1337, (c) => c.pulls, 1337),
];
