/**
 * The general achievements: ripping, chasing, collecting, wealth, the account.
 * The first row of each block is the original set, unchanged in id, goal and
 * coins because players have already claimed them (only name and note text was
 * polished). Everything after it is new.
 */
import { ach } from "./achievement-kit.js";
import { ERA_NAMES } from "./achievement-eras.js";

export const RIP = [
  { id: "first-pack", cat: "rip", tier: 1, mark: "1", name: "First rip", note: "Open your first booster.", goal: 1, at: (c) => c.packs, coins: 25 },
  { id: "ten-packs", cat: "rip", tier: 1, mark: "10", name: "Warming up", note: "Rip ten packs.", goal: 10, at: (c) => c.packs, coins: 60 },
  ach("rip", 1, "pack-25", "Pack habit", "Rip 25 packs.", 25, (c) => c.packs, 100),
  { id: "box-worth", cat: "rip", tier: 2, mark: "36", name: "Box worth", note: "Rip 36 packs, a sealed booster box.", goal: 36, at: (c) => c.packs, coins: 150, title: "Box Breaker" },
  ach("rip", 2, "pack-50", "Fifty deep", "Rip 50 packs.", 50, (c) => c.packs, 220),
  { id: "century", cat: "rip", tier: 2, mark: "100", name: "Century", note: "Rip 100 packs.", goal: 100, at: (c) => c.packs, coins: 300 },
  { id: "marathon", cat: "rip", tier: 3, mark: "250", name: "Marathon", note: "Rip 250 packs.", goal: 250, at: (c) => c.packs, coins: 700 },
  { id: "case-cracker", cat: "rip", tier: 4, mark: "500", name: "Case cracker", note: "Rip 500 packs, six boxes deep.", goal: 500, at: (c) => c.packs, coins: 1500, title: "Case Cracker" },
  ach("rip", 3, "pack-750", "Pack mule", "Rip 750 packs.", 750, (c) => c.packs, 1000),
  ach("rip", 4, "pack-1000", "Thousand club", "Rip 1,000 packs.", 1000, (c) => c.packs, 2000, { title: "Thousand Club" }),
  ach("rip", 4, "pack-2000", "Bulk buyer", "Rip 2,000 packs.", 2000, (c) => c.packs, 3000),
  ach("rip", 4, "pack-5000", "Pack factory", "Rip 5,000 packs.", 5000, (c) => c.packs, 4000, { title: "Pack Factory" }),

  ach("rip", 1, "loyal-10", "Set loyalty", "Rip 10 packs of the same set.", 10, (c) => c.bestSetPacks, 80),
  ach("rip", 2, "loyal-36", "Deep dive", "Rip 36 packs of the same set, a whole box of one flavour.", 36, (c) => c.bestSetPacks, 250),
  ach("rip", 3, "loyal-100", "Devoted", "Rip 100 packs of the same set.", 100, (c) => c.bestSetPacks, 700),

  ach("rip", 1, "sampler-3", "Sampler", "Rip packs from 3 different sets.", 3, (c) => c.setsRipped, 60),
  ach("rip", 2, "sampler-10", "Tasting flight", "Rip packs from 10 different sets.", 10, (c) => c.setsRipped, 250),
  ach("rip", 3, "sampler-20", "Set hopper", "Rip packs from 20 different sets.", 20, (c) => c.setsRipped, 700),
  ach("rip", 4, "sampler-30", "Around the shelf", "Rip packs from 30 different sets.", 30, (c) => c.setsRipped, 1500),
  ach("rip", 2, "era-hopper", "Time traveler", `Rip a pack from every era: ${ERA_NAMES.join(", ")}.`, ERA_NAMES.length, (c) => c.erasRipped, 200, { mark: "ERA" }),
];

export const CHASE = [
  { id: "first-hit", cat: "chase", tier: 1, mark: "★", name: "Hit", note: "Pull anything at hit rarity.", goal: 1, at: (c) => c.hits, coins: 40 },
  { id: "double-up", cat: "chase", tier: 1, mark: "★★", name: "Double up", note: "Own a Double Rare.", goal: 1, at: (c) => c.count("Double Rare"), coins: 40 },
  { id: "reverse", cat: "chase", tier: 1, mark: "◆", name: "Shiny back", note: "Pull a reverse holo.", goal: 1, at: (c) => c.reverses, coins: 25 },
  { id: "ultra", cat: "chase", tier: 2, mark: "☆☆", name: "Ultra", note: "Own an Ultra Rare.", goal: 1, at: (c) => c.count("Ultra Rare"), coins: 90 },
  { id: "illustrator", cat: "chase", tier: 2, mark: "☆", name: "Illustrator", note: "Own an Illustration Rare.", goal: 1, at: (c) => c.count("Illustration Rare"), coins: 110 },
  { id: "special-art", cat: "chase", tier: 3, mark: "☆☆", name: "Special art", note: "Own a Special Illustration Rare.", goal: 1, at: (c) => c.count("Special Illustration Rare"), coins: 260, title: "Artisan" },
  { id: "hit-stack", cat: "chase", tier: 3, mark: "25", name: "Hit stack", note: "Own 25 cards at hit rarity.", goal: 25, at: (c) => c.hits, coins: 450, title: "Chase Addict" },
  { id: "monochrome", cat: "chase", tier: 4, mark: "★☆", name: "Black and white", note: "Own a Black White Rare.", goal: 1, at: (c) => c.count("Black White Rare"), coins: 400, title: "Monochrome" },
  { id: "gold-chase", cat: "chase", tier: 4, mark: "◈", name: "Gold chase", note: "Own a gold Hyper Rare.", goal: 1, at: (c) => c.count("Mega Hyper Rare") + c.count("Hyper Rare"), coins: 500, title: "Goldsmith" },

  ach("chase", 1, "hits-5", "Warm streak", "Own 5 different hit cards.", 5, (c) => c.hits, 90),
  ach("chase", 2, "hits-10", "Chase habit", "Own 10 different hit cards.", 10, (c) => c.hits, 180),
  ach("chase", 3, "hits-50", "Hit factory", "Own 50 different hit cards.", 50, (c) => c.hits, 700),
  ach("chase", 3, "hits-100", "Hit parade", "Own 100 different hit cards.", 100, (c) => c.hits, 1200),
  ach("chase", 4, "hits-250", "Hit museum", "Own 250 different hit cards.", 250, (c) => c.hits, 2200),
  ach("chase", 4, "hits-500", "Hit vault", "Own 500 different hit cards.", 500, (c) => c.hits, 3000),

  ach("chase", 1, "pulled-hits-10", "First ten", "Pull 10 hits out of packs, duplicates included.", 10, (c) => c.stat("hitsPulled"), 80),
  ach("chase", 2, "pulled-hits-100", "Hundred hits", "Pull 100 hits out of packs, duplicates included.", 100, (c) => c.stat("hitsPulled"), 350),
  ach("chase", 3, "pulled-hits-500", "Five hundred hits", "Pull 500 hits out of packs, duplicates included.", 500, (c) => c.stat("hitsPulled"), 1000),
  ach("chase", 4, "pulled-hits-1000", "Thousand hits", "Pull 1,000 hits out of packs, duplicates included.", 1000, (c) => c.stat("hitsPulled"), 2200),

  ach("chase", 1, "reverses-10", "Foil fan", "Own reverse holos of 10 different cards.", 10, (c) => c.reverses, 60),
  ach("chase", 2, "reverses-25", "Foil folder", "Own reverse holos of 25 different cards.", 25, (c) => c.reverses, 140),
  ach("chase", 2, "reverses-50", "Foil binder", "Own reverse holos of 50 different cards.", 50, (c) => c.reverses, 260),
  ach("chase", 3, "reverses-100", "Foil hoard", "Own reverse holos of 100 different cards.", 100, (c) => c.reverses, 500),
  ach("chase", 4, "reverses-250", "Foil vault", "Own reverse holos of 250 different cards.", 250, (c) => c.reverses, 1200),
  ach("chase", 4, "reverses-500", "Foil museum", "Own reverse holos of 500 different cards.", 500, (c) => c.reverses, 2200),
];

export const COLLECT = [
  { id: "unique-10", cat: "collect", tier: 1, mark: "10", name: "Getting started", note: "Own ten different cards.", goal: 10, at: (c) => c.unique, coins: 30 },
  { id: "binder-page", cat: "collect", tier: 1, mark: "9", name: "First page", note: "Fill nine binder pockets.", goal: 9, at: (c) => c.binder, coins: 70 },
  ach("collect", 1, "unique-25", "Growing pile", "Own 25 different cards.", 25, (c) => c.unique, 70),
  { id: "unique-50", cat: "collect", tier: 2, mark: "50", name: "Binder rat", note: "Own fifty different cards.", goal: 50, at: (c) => c.unique, coins: 120 },
  ach("collect", 2, "unique-100", "Triple digits", "Own 100 different cards.", 100, (c) => c.unique, 250),
  { id: "halfway", cat: "collect", tier: 2, mark: "50%", name: "Halfway", note: "Reach 50% on any live set.", goal: 50, at: (c) => c.bestSet, coins: 200 },
  { id: "binder-three", cat: "collect", tier: 2, mark: "27", name: "Three pages", note: "Fill twenty-seven binder pockets.", goal: 27, at: (c) => c.binder, coins: 220, title: "Curator" },
  { id: "unique-150", cat: "collect", tier: 3, mark: "150", name: "Dex keeper", note: "Own 150 different cards.", goal: 150, at: (c) => c.unique, coins: 400, title: "Dex Keeper" },
  ach("collect", 3, "unique-250", "Shoebox", "Own 250 different cards.", 250, (c) => c.unique, 600),
  ach("collect", 3, "unique-500", "Shop shelf", "Own 500 different cards.", 500, (c) => c.unique, 1000),
  ach("collect", 4, "unique-1000", "Thousand faces", "Own 1,000 different cards.", 1000, (c) => c.unique, 1800),
  ach("collect", 4, "unique-2000", "Warehouse", "Own 2,000 different cards.", 2000, (c) => c.unique, 2500),
  ach("collect", 4, "unique-3000", "Archive", "Own 3,000 different cards.", 3000, (c) => c.unique, 3000),
  ach("collect", 4, "unique-5000", "The whole library", "Own 5,000 different cards.", 5000, (c) => c.unique, 4000, { title: "Librarian" }),
  { id: "master-set", cat: "collect", tier: 4, mark: "100%", name: "Master set", note: "Complete any live set.", goal: 100, at: (c) => c.bestSet, coins: 1200, title: "Set Master" },
  { id: "double-master", cat: "collect", tier: 4, mark: "x2", name: "Double master", note: "Complete two live sets.", goal: 2, at: (c) => c.setsDone, coins: 3000, title: "Completionist" },

  ach("collect", 2, "binder-54", "Six pages", "Fill 54 binder pockets.", 54, (c) => c.binder, 350),
  ach("collect", 3, "binder-108", "Twelve pages", "Fill 108 binder pockets.", 108, (c) => c.binder, 700),
  ach("collect", 3, "binder-180", "Half a binder", "Fill 180 binder pockets.", 180, (c) => c.binder, 1000),
  ach("collect", 4, "binder-270", "Thirty pages", "Fill 270 binder pockets.", 270, (c) => c.binder, 1600),
  ach("collect", 4, "binder-360", "Full binder", "Fill all 360 binder pockets, every page.", 360, (c) => c.binder, 2500, { title: "Bindermaster" }),

  ach("collect", 1, "copies-100", "Doubles", "Hold 100 cards in total, copies included.", 100, (c) => c.copies, 60),
  ach("collect", 2, "copies-500", "Stacks", "Hold 500 cards in total, copies included.", 500, (c) => c.copies, 200),
  ach("collect", 2, "copies-1000", "Piles", "Hold 1,000 cards in total, copies included.", 1000, (c) => c.copies, 400),
  ach("collect", 3, "copies-5000", "Card hoard", "Hold 5,000 cards in total, copies included.", 5000, (c) => c.copies, 1200),
  ach("collect", 4, "copies-10000", "Card dragon", "Hold 10,000 cards in total, copies included.", 10000, (c) => c.copies, 2200),

  ach("collect", 1, "playset", "Playset", "Own 4 copies of one card.", 4, (c) => c.maxCopies, 60, { mark: "x4" }),
  ach("collect", 2, "ten-of-one", "Bulk of one", "Own 10 copies of one card.", 10, (c) => c.maxCopies, 150, { mark: "x10" }),
];

export const WEALTH = [
  { id: "clocked-in", cat: "wealth", tier: 1, mark: "✦", name: "Clocked in", note: "Claim an hourly stack.", goal: 1, at: (c) => (c.hourly ? 1 : 0), coins: 25 },
  { id: "loaded", cat: "wealth", tier: 1, mark: "250", name: "Loaded", note: "Hold ✦ 250 at once.", goal: 250, at: (c) => c.coins, coins: 60 },
  ach("wealth", 1, "coins-500", "Half a grand", "Hold ✦ 500 at once.", 500, (c) => c.coins, 120),
  { id: "banked", cat: "wealth", tier: 2, mark: "1K", name: "Banked", note: "Hold ✦ 1,000 at once.", goal: 1000, at: (c) => c.coins, coins: 240, title: "High Roller" },
  ach("wealth", 2, "coins-2500", "Comfortable", "Hold ✦ 2,500 at once.", 2500, (c) => c.coins, 500),
  { id: "vaulted", cat: "wealth", tier: 3, mark: "5K", name: "Vaulted", note: "Hold ✦ 5,000 at once.", goal: 5000, at: (c) => c.coins, coins: 900, title: "Vaulted" },
  ach("wealth", 3, "coins-10k", "Five figures", "Hold ✦ 10,000 at once.", 10000, (c) => c.coins, 1200),
  ach("wealth", 3, "coins-25k", "Nest egg", "Hold ✦ 25,000 at once.", 25000, (c) => c.coins, 2000),
  ach("wealth", 4, "coins-50k", "War chest", "Hold ✦ 50,000 at once.", 50000, (c) => c.coins, 3000),
  ach("wealth", 4, "coins-100k", "Six figures", "Hold ✦ 100,000 at once.", 100000, (c) => c.coins, 4000, { title: "Six Figures" }),
  ach("wealth", 4, "coins-250k", "Dragon hoard", "Hold ✦ 250,000 at once.", 250000, (c) => c.coins, 5000),

  ach("wealth", 1, "bonus-5", "Regular", "Claim the hourly stack 5 times.", 5, (c) => c.stat("bonus"), 50),
  ach("wealth", 1, "bonus-25", "Clockwork", "Claim the hourly stack 25 times.", 25, (c) => c.stat("bonus"), 150),
  ach("wealth", 2, "bonus-100", "Shift worker", "Claim the hourly stack 100 times.", 100, (c) => c.stat("bonus"), 400),
  ach("wealth", 3, "bonus-250", "Company person", "Claim the hourly stack 250 times.", 250, (c) => c.stat("bonus"), 900),
  ach("wealth", 3, "bonus-500", "Lifer", "Claim the hourly stack 500 times.", 500, (c) => c.stat("bonus"), 1500),
  ach("wealth", 4, "bonus-1000", "Never miss", "Claim the hourly stack 1,000 times.", 1000, (c) => c.stat("bonus"), 2500, { title: "Never Miss" }),
];

export const TRAINER = [
  { id: "named", cat: "trainer", tier: 1, mark: "@", name: "Named trainer", note: "Make an account.", goal: 1, at: (c) => (c.signed ? 1 : 0), coins: 50 },
  ach("trainer", 1, "pulls-100", "Hundred pulls", "Pull 100 cards.", 100, (c) => c.pulls, 80),
  { id: "pull-machine", cat: "trainer", tier: 2, mark: "500", name: "Pull machine", note: "Pull 500 cards.", goal: 500, at: (c) => c.pulls, coins: 250 },
  ach("trainer", 2, "pulls-1000", "Thousand pulls", "Pull 1,000 cards.", 1000, (c) => c.pulls, 450),
  { id: "conveyor", cat: "trainer", tier: 3, mark: "2K", name: "Conveyor", note: "Pull 2,000 cards.", goal: 2000, at: (c) => c.pulls, coins: 800, title: "Conveyor" },
  ach("trainer", 3, "pulls-5000", "Card river", "Pull 5,000 cards.", 5000, (c) => c.pulls, 1400),
  ach("trainer", 4, "pulls-10000", "Card avalanche", "Pull 10,000 cards.", 10000, (c) => c.pulls, 2200),
  ach("trainer", 4, "pulls-25000", "Card ocean", "Pull 25,000 cards.", 25000, (c) => c.pulls, 3000),

  ach("trainer", 1, "trophies-10", "Trophy shelf", "Claim 10 achievements.", 10, (c) => c.claimed.size, 100),
  ach("trainer", 2, "trophies-25", "Trophy case", "Claim 25 achievements.", 25, (c) => c.claimed.size, 300),
  ach("trainer", 3, "trophies-50", "Hall of fame", "Claim 50 achievements.", 50, (c) => c.claimed.size, 700),
  ach("trainer", 4, "trophies-100", "Museum wing", "Claim 100 achievements.", 100, (c) => c.claimed.size, 1500),
  ach("trainer", 4, "trophies-200", "Living legend", "Claim 200 achievements.", 200, (c) => c.claimed.size, 3000, { title: "Living Legend" }),
];
