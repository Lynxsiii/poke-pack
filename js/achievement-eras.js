/**
 * What the achievement tables need to know about each playable set, read once
 * from the catalog so a new set shows up in every era and set total without
 * anyone editing an achievement file.
 */
import { PLAYABLE_SETS, RARITY_ORDER } from "./catalog.js";

export const SET_INFO = new Map(
  PLAYABLE_SETS.map((set) => [
    set.id,
    {
      id: set.id,
      name: set.name,
      era: set.era || set.edition || "",
      edition: set.edition || "",
      total: set.totalCount || 0,
      promo: Boolean(set.promoSet),
    },
  ])
);

/** Era names in catalog order, newest first: ["Mega Evolution", "Scarlet & Violet", ...]. */
export const ERA_NAMES = [...new Set(PLAYABLE_SETS.map((set) => set.era || set.edition).filter(Boolean))];

/** Sets that make up one era. */
export function setsInEra(era) {
  return PLAYABLE_SETS.filter((set) => (set.era || set.edition) === era);
}

/** The total card count of an era across its playable sets. */
export function eraTotal(era) {
  return setsInEra(era).reduce((n, set) => n + (set.totalCount || 0), 0);
}

/** True when every one of these sets is playable. A row that needs cards from
 *  particular sets (a Prism Star, the Shiny Vault) only exists once they are. */
export function hasSets(...ids) {
  return ids.every((id) => SET_INFO.has(id));
}

/** True when at least one of these sets is playable. */
export function anySets(...ids) {
  return ids.some((id) => SET_INFO.has(id));
}

/**
 * Finishes that only some sets print, and which sets. A rarity that is in
 * RARITY_ORDER but printed by none of its sets yet is left out of "every
 * rarity" counts, so nobody is asked for a card the catalog cannot give.
 * Every other rarity is treated as printed.
 */
export const FINISH_PRINTERS = {
  "Rare Prism Star": ["sm5", "sm6", "sm7", "sm75", "sm8", "sm9"],
  "Rare Shining": ["sm35"],
  "Rare Shiny GX": ["sm115"],
  // XY: every numbered set but the Kalos Starter Set prints Pokémon-EX; BREAK starts with BREAKthrough.
  // Black & White's Pokémon-EX start with Next Destinies (bw4) and run to Legendary Treasures; the XY and BW EX share the rarity.
  "Rare Holo EX": ["xy1", "xy2", "xy3", "xy4", "xy5", "dc1", "xy6", "xy7", "xy8", "xy9", "g1", "xy10", "xy11", "xy12", "bw4", "bw5", "bw6", "bw7", "bw8", "bw9", "bw10", "bw11"],
  "Rare BREAK": ["xy8", "xy9", "xy10", "xy11", "xy12"],
  // Black & White's Ace Spec: Boundaries Crossed to Plasma Blast.
  "Rare ACE": ["bw7", "bw8", "bw9", "bw10"],
};

/** The XY and Black & White sets that print Pokémon-EX (what an EX row needs one of). */
export const XY_EX_SETS = FINISH_PRINTERS["Rare Holo EX"];

export function isPrinted(rarity) {
  const sets = FINISH_PRINTERS[rarity];
  return !sets || anySets(...sets);
}

/** RARITY_ORDER without the finishes no playable set prints yet. */
export const RARITIES_IN_PRINT = RARITY_ORDER.filter(isPrinted);
