/**
 * What the achievement tables need to know about each playable set, read once
 * from the catalog so a new set shows up in every era and set total without
 * anyone editing an achievement file.
 */
import { PLAYABLE_SETS } from "./catalog.js";

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
