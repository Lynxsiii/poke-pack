/**
 * Rarity chases, the market, battles, friends and quests. Rarity rows read
 * ctx.count(rarity), the number of different owned cards at that rarity.
 * Market, battle, social and quest rows read the lifetime counters the Worker
 * keeps in save.stats (ctx.stat, ctx.friends).
 */
import { ach } from "./achievement-kit.js";
import { hasSets, anySets, RARITIES_IN_PRINT, XY_EX_SETS } from "./achievement-eras.js";

/** One row per finish the older tables do not already cover. */
function finish(tier, id, rarity, mark, name, note, coins, extra = {}) {
  return ach("rarity", tier, id, name, note, 1, (c) => c.count(rarity), coins, { mark, ...extra });
}

/** Own `goal` different cards at `rarity`. */
function depth(tier, id, rarity, name, goal, coins, noun) {
  return ach("rarity", tier, id, name, `Own ${goal} different ${noun}.`, goal, (c) => c.count(rarity), coins);
}

/**
 * Rows that need cards only some sets print appear once those sets are
 * playable: `when` is hasSets(...) or anySets(...), so the table never asks
 * for a card the catalog cannot give (test-achievements checks it).
 */
const when = (ok, rows) => (ok ? rows : []);

export const RARITY = [
  // One of each finish
  finish(1, "rare-holo", "Rare Holo", "★", "Holo rare", "Own a Rare Holo.", 30),
  finish(1, "promo", "Promo", "P", "Black star", "Own a black star promo.", 30),
  // Sun & Moon
  finish(2, "rare-gx", "Rare Holo GX", "GX", "Pokémon-GX", "Own a Pokémon-GX.", 50),
  ach("rarity", 2, "tag-team", "Tag team", "Own a Tag Team GX, two Pokémon on one card.", 1, (c) => c.tagTeams, 120, { mark: "TAG" }),
  ...when(anySets("sm5", "sm6", "sm7", "sm75", "sm8", "sm9"), [
    finish(3, "prism-star", "Rare Prism Star", "◇", "Prism Star", "Own a Prism Star.", 200),
  ]),
  ...when(anySets("sm35", "dp7", "pl1", "pl3", "pl4"), [
    finish(3, "rare-shining", "Rare Shining", "SH", "Shining Pokémon", "Own a Shining Pokémon, from Shining Legends or the Diamond & Pearl and Platinum sets.", 250),
  ]),
  ...when(anySets("sm115"), [
    finish(3, "shiny-gx", "Rare Shiny GX", "SGX", "Shiny GX", "Own a Shiny Vault GX from Hidden Fates.", 350),
  ]),
  // XY
  ...when(anySets(...XY_EX_SETS), [finish(2, "rare-ex", "Rare Holo EX", "EX", "Pokémon-EX", "Own a Pokémon-EX, Mega EX included.", 50)]),
  ...when(anySets("xy8", "xy9", "xy10", "xy11", "xy12"), [finish(3, "rare-break", "Rare BREAK", "BRK", "BREAK", "Own a BREAK card.", 200)]),
  // Black & White (its Pokémon-EX share the "rare-ex" row above)
  ...when(anySets("bw7", "bw8", "bw9", "bw10"), [finish(3, "rare-ace", "Rare ACE", "ACE", "Ace Spec", "Own a Black & White Ace Spec.", 150)]),
  // Diamond & Pearl to Call of Legends
  ...when(anySets("dp1", "dp2", "dp3", "dp4", "dp5", "dp6", "dp7", "pl1", "pl2", "pl3", "pl4"), [finish(2, "rare-lvx", "Rare Holo LV.X", "LV.X", "Level up", "Own a Pokémon LV.X.", 60)]),
  ...when(anySets("hgss1", "hgss2", "hgss3", "hgss4"), [
    finish(3, "rare-prime", "Rare Prime", "PRIME", "Pokémon Prime", "Own a Pokémon Prime.", 150),
    finish(3, "rare-legend", "LEGEND", "LGND", "Two halves", "Own a LEGEND card, either half of the pair.", 200),
  ]),
  finish(2, "rare-v", "Rare Holo V", "V", "Pokémon V", "Own a Pokémon V.", 50),
  finish(2, "rare-vmax", "Rare Holo VMAX", "VMAX", "Max power", "Own a Pokémon VMAX.", 90),
  finish(2, "rare-vstar", "Rare Holo VSTAR", "VSTAR", "Star power", "Own a Pokémon VSTAR.", 90),
  finish(2, "rare-ultra", "Rare Ultra", "☆", "Full art", "Own a Rare Ultra, the full art of the Sword & Shield and Sun & Moon years.", 120),
  finish(2, "pikachu-rare", "Pikachu Rare", "PK", "Pika print", "Own a Pikachu Rare.", 100),
  finish(2, "poke-ball", "Poké Ball", "◓", "Poké Ball print", "Own a Poké Ball pattern card.", 80),
  finish(2, "shiny-rare", "Shiny Rare", "☆", "Shiny", "Own a Shiny Rare.", 150),
  finish(2, "ace-spec", "ACE SPEC Rare", "ACE", "Ace in the hole", "Own an ACE SPEC Rare.", 150),
  finish(3, "amazing-rare", "Amazing Rare", "AR", "Amazing", "Own an Amazing Rare.", 200),
  finish(3, "radiant-rare", "Radiant Rare", "R", "Radiant", "Own a Radiant Rare.", 200),
  finish(3, "shiny-vault", "Rare Shiny", "SV", "Shiny Vault", "Own a Shiny Vault card.", 250),
  finish(3, "trainer-gallery", "Trainer Gallery Rare Holo", "TG", "Trainer Gallery", "Own a Trainer Gallery holo.", 250),
  finish(3, "rare-rainbow", "Rare Rainbow", "☆", "Rainbow", "Own a Rainbow Rare.", 300),
  finish(3, "rare-secret", "Rare Secret", "☆☆", "Secret rare", "Own a Secret Rare.", 300),
  finish(3, "shiny-ultra", "Shiny Ultra Rare", "☆☆", "Shiny ultra", "Own a Shiny Ultra Rare.", 300),
  finish(3, "master-ball", "Master Ball", "◓", "Master Ball print", "Own a Master Ball pattern card.", 350),
  finish(3, "mega-attack", "Mega Attack Rare", "★☆", "Mega attack", "Own a Mega Attack Rare.", 350),
  finish(3, "classic-collection", "Classic Collection", "◈", "Classic", "Own a Classic Collection card.", 400),
  finish(3, "hyper-rare", "Hyper Rare", "◈", "Gold card", "Own a Hyper Rare.", 400),
  finish(4, "mega-hyper", "Mega Hyper Rare", "◈", "Mega gold", "Own a Mega Hyper Rare.", 1000),
  finish(4, "futuristic-rare", "Futuristic Rare", "FR", "Futuristic", "Own a Futuristic Rare.", 1500),
  finish(4, "rgb-rare", "RGB Rare", "RGB", "Three colours", "Own an RGB Rare, the rarest card in the catalog.", 3000),

  // Depth
  depth(2, "double-10", "Double Rare", "Double trouble", 10, 200, "Double Rares"),
  depth(3, "double-50", "Double Rare", "Twin towers", 50, 600, "Double Rares"),
  depth(2, "v-25", "Rare Holo V", "V collection", 25, 300, "Pokémon V cards"),
  depth(2, "gx-25", "Rare Holo GX", "GX collection", 25, 300, "Pokémon-GX cards"),
  ...when(hasSets("sm1", "sm2", "sm3", "sm8"), [depth(3, "gx-75", "Rare Holo GX", "GX armory", 75, 800, "Pokémon-GX cards")]),
  ach("rarity", 2, "tag-team-10", "Tag team roster", "Own 10 different Tag Team GX cards.", 10, (c) => c.tagTeams, 250),
  ach("rarity", 3, "tag-team-25", "Tag team league", "Own 25 different Tag Team GX cards.", 25, (c) => c.tagTeams, 600),
  ...when(anySets(...XY_EX_SETS), [depth(2, "ex-25", "Rare Holo EX", "EX collection", 25, 300, "Pokémon-EX cards")]),
  // TODO(lead): the EX line has about 150 cards in the 16 XY sets; check the goals below against the built data.
  ...when(hasSets("xy4", "xy5", "xy7", "xy9"), [depth(3, "ex-75", "Rare Holo EX", "EX armory", 75, 800, "Pokémon-EX cards")]),
  ...when(anySets("xy8", "xy9", "xy10", "xy11", "xy12"), [depth(3, "break-10", "Rare BREAK", "BREAK ranks", 10, 400, "BREAK cards")]),
  // TODO(lead): the Black & White era prints 13 Ace Specs (bw7 4, bw8 3, bw9 2, bw10 4); 8 is a guess.
  ...when(hasSets("bw7", "bw8", "bw9", "bw10"), [depth(3, "ace-8", "Rare ACE", "Ace Spec squad", 8, 400, "Ace Spec cards")]),
  // TODO(lead): the 16 sets print 56 LV.X (dp1 3, dp2 3, dp3 2, dp4 4, dp5 4, dp6 7, dp7 5 = 28, Platinum 28), 26 Primes (6, 6, 6, 8)
  // and 18 LEGEND halves (4, 6, 4, 4); the goals are guesses against the real data.
  ...when(hasSets("dp1", "dp2", "dp4", "dp5", "dp6", "dp7"), [depth(3, "lvx-25", "Rare Holo LV.X", "Level-up armory", 25, 600, "Pokémon LV.X cards")]),
  ...when(hasSets("hgss1", "hgss2"), [depth(3, "prime-10", "Rare Prime", "Prime time", 10, 500, "Pokémon Prime cards")]),
  ...when(hasSets("hgss2"), [depth(3, "legend-6", "LEGEND", "Legendary line-up", 6, 600, "LEGEND cards")]),
  ...when(hasSets("sm9", "sm12"), [ach("rarity", 4, "tag-team-75", "Tag team dynasty", "Own 75 different Tag Team GX cards.", 75, (c) => c.tagTeams, 1500)]),
  ...when(hasSets("sm5", "sm6"), [depth(3, "prism-10", "Rare Prism Star", "Prism collection", 10, 500, "Prism Star cards")]),
  ...when(anySets("sm115"), [depth(3, "shiny-gx-10", "Rare Shiny GX", "Shiny GX hunter", 10, 400, "Shiny Vault GX cards")]),
  depth(3, "ultra-10", "Ultra Rare", "Ultra stack", 10, 350, "Ultra Rares"),
  depth(2, "illustration-10", "Illustration Rare", "Gallery wall", 10, 250, "Illustration Rares"),
  depth(3, "illustration-25", "Illustration Rare", "Gallery wing", 25, 600, "Illustration Rares"),
  depth(4, "illustration-100", "Illustration Rare", "Museum of art", 100, 2000, "Illustration Rares"),
  depth(3, "special-5", "Special Illustration Rare", "Special five", 5, 500, "Special Illustration Rares"),
  depth(4, "special-25", "Special Illustration Rare", "Special edition", 25, 1500, "Special Illustration Rares"),
  depth(4, "hyper-5", "Hyper Rare", "Gold rush", 5, 1000, "Hyper Rares"),
  depth(3, "master-ball-10", "Master Ball", "Master collection", 10, 500, "Master Ball cards"),
  depth(2, "poke-ball-25", "Poké Ball", "Ball pit", 25, 250, "Poké Ball pattern cards"),
  depth(3, "trainer-gallery-10", "Trainer Gallery Rare Holo", "Gallery regular", 10, 400, "Trainer Gallery holos"),
  depth(3, "rainbow-10", "Rare Rainbow", "Over the rainbow", 10, 500, "Rainbow Rares"),
  depth(3, "shiny-25", "Shiny Rare", "Shiny hunter", 25, 500, "Shiny Rares"),
  depth(2, "pikachu-rare-10", "Pikachu Rare", "Pika prints", 10, 200, "Pikachu Rares"),

  // How many different finishes you own
  ach("rarity", 1, "finishes-5", "Five finishes", "Own cards of 5 different rarities.", 5, (c) => c.raritiesOwned, 60),
  ach("rarity", 2, "finishes-10", "Ten finishes", "Own cards of 10 different rarities.", 10, (c) => c.raritiesOwned, 200),
  ach("rarity", 3, "finishes-15", "Fifteen finishes", "Own cards of 15 different rarities.", 15, (c) => c.raritiesOwned, 500),
  ach("rarity", 3, "finishes-20", "Twenty finishes", "Own cards of 20 different rarities.", 20, (c) => c.raritiesOwned, 900),
  ach("rarity", 4, "finishes-25", "Twenty five finishes", "Own cards of 25 different rarities.", 25, (c) => c.raritiesOwned, 1600),
  ach("rarity", 4, "finishes-30", "Thirty finishes", "Own cards of 30 different rarities.", 30, (c) => c.raritiesOwned, 2500, { title: "Finish Line" }),
  ...when(RARITIES_IN_PRINT.length >= 35, [
    ach("rarity", 4, "finishes-35", "Thirty five finishes", "Own cards of 35 different rarities.", 35, (c) => c.raritiesOwned, 3200),
  ]),
];

export const MARKET = [
  ach("market", 1, "sold-1", "First sale", "Sell a card.", 1, (c) => c.stat("sold"), 30),
  ach("market", 1, "sold-10", "Yard sale", "Sell 10 cards.", 10, (c) => c.stat("sold"), 70),
  ach("market", 2, "sold-50", "Flea market", "Sell 50 cards.", 50, (c) => c.stat("sold"), 200),
  ach("market", 2, "sold-100", "Card shop", "Sell 100 cards.", 100, (c) => c.stat("sold"), 400),
  ach("market", 3, "sold-250", "Dealer", "Sell 250 cards.", 250, (c) => c.stat("sold"), 800),
  ach("market", 3, "sold-500", "Wholesaler", "Sell 500 cards.", 500, (c) => c.stat("sold"), 1400),
  ach("market", 4, "sold-1000", "Clearance event", "Sell 1,000 cards.", 1000, (c) => c.stat("sold"), 2500, { title: "Dealer" }),

  ach("market", 1, "sealed-1", "Shrink wrap", "Open a sealed product.", 1, (c) => c.stat("sealed"), 60),
  ach("market", 1, "sealed-3", "Box habit", "Open 3 sealed products.", 3, (c) => c.stat("sealed"), 150),
  ach("market", 2, "sealed-10", "Sealed regular", "Open 10 sealed products.", 10, (c) => c.stat("sealed"), 400),
  ach("market", 3, "sealed-25", "Case opener", "Open 25 sealed products.", 25, (c) => c.stat("sealed"), 900),
  ach("market", 3, "sealed-50", "Distributor", "Open 50 sealed products.", 50, (c) => c.stat("sealed"), 1600),
  ach("market", 4, "sealed-100", "Warehouse clerk", "Open 100 sealed products.", 100, (c) => c.stat("sealed"), 2800),
];

export const BATTLE = [
  ach("battle", 1, "battles-1", "First battle", "Play a pack battle.", 1, (c) => c.stat("battles"), 40),
  ach("battle", 1, "battles-10", "Arena regular", "Play 10 pack battles.", 10, (c) => c.stat("battles"), 120),
  ach("battle", 2, "battles-50", "Ring rat", "Play 50 pack battles.", 50, (c) => c.stat("battles"), 400),
  ach("battle", 3, "battles-100", "Battle hardened", "Play 100 pack battles.", 100, (c) => c.stat("battles"), 900),
  ach("battle", 1, "wins-1", "First win", "Win a pack battle.", 1, (c) => c.stat("battleWins"), 60),
  ach("battle", 2, "wins-10", "Winning streak", "Win 10 pack battles.", 10, (c) => c.stat("battleWins"), 300),
  ach("battle", 3, "wins-25", "Arena champion", "Win 25 pack battles.", 25, (c) => c.stat("battleWins"), 800),
  ach("battle", 4, "wins-100", "Hundred wins", "Win 100 pack battles.", 100, (c) => c.stat("battleWins"), 2500, { title: "Arena Legend" }),
];

export const SOCIAL = [
  ach("social", 1, "friends-1", "Friendly", "Add your first friend.", 1, (c) => c.friends, 50),
  ach("social", 1, "friends-3", "Small circle", "Have 3 friends.", 3, (c) => c.friends, 100),
  ach("social", 2, "friends-5", "Study group", "Have 5 friends.", 5, (c) => c.friends, 200),
  ach("social", 2, "friends-10", "Crew", "Have 10 friends.", 10, (c) => c.friends, 400),
  ach("social", 3, "friends-25", "Local celebrity", "Have 25 friends.", 25, (c) => c.friends, 900),
  ach("social", 4, "friends-50", "Whole server", "Have 50 friends.", 50, (c) => c.friends, 2000, { title: "Social Butterfly" }),
];

export const QUESTS = [
  ach("quests", 1, "quests-1", "Errand", "Claim a quest.", 1, (c) => c.stat("questsClaimed"), 40),
  ach("quests", 1, "quests-10", "Odd jobs", "Claim 10 quests.", 10, (c) => c.stat("questsClaimed"), 120),
  ach("quests", 2, "quests-25", "Reliable", "Claim 25 quests.", 25, (c) => c.stat("questsClaimed"), 250),
  ach("quests", 2, "quests-50", "Quest regular", "Claim 50 quests.", 50, (c) => c.stat("questsClaimed"), 450),
  ach("quests", 3, "quests-100", "Task master", "Claim 100 quests.", 100, (c) => c.stat("questsClaimed"), 900),
  ach("quests", 3, "quests-250", "Board sweeper", "Claim 250 quests.", 250, (c) => c.stat("questsClaimed"), 1600),
  ach("quests", 4, "quests-500", "Guild veteran", "Claim 500 quests.", 500, (c) => c.stat("questsClaimed"), 2500, { title: "Guild Veteran" }),

  ach("quests", 1, "streak-2", "Back again", "Claim quests two days in a row.", 2, (c) => c.stat("streakBest"), 40, { mark: "2d" }),
  ach("quests", 1, "streak-3", "Three in a row", "Claim quests three days in a row.", 3, (c) => c.stat("streakBest"), 80, { mark: "3d" }),
  ach("quests", 2, "streak-7", "Full week", "Claim quests seven days in a row.", 7, (c) => c.stat("streakBest"), 250, { mark: "7d" }),
  ach("quests", 2, "streak-14", "Fortnight", "Claim quests fourteen days in a row.", 14, (c) => c.stat("streakBest"), 500, { mark: "14d" }),
  ach("quests", 3, "streak-30", "Month of quests", "Claim quests thirty days in a row.", 30, (c) => c.stat("streakBest"), 1200, { mark: "30d" }),
  ach("quests", 4, "streak-60", "Two months", "Claim quests sixty days in a row.", 60, (c) => c.stat("streakBest"), 2200, { mark: "60d" }),
  ach("quests", 4, "streak-100", "Hundred days", "Claim quests a hundred days in a row.", 100, (c) => c.stat("streakBest"), 3000, { mark: "100d", title: "Devoted" }),
];
