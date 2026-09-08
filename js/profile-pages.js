export const PROFILE_PAGE_LIMIT = 4;
export const PROFILE_PAGE_SIZE = 9;
export const BINDER_MAX_PAGES = 40;

export function normalizeProfilePages(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(n => Number.isInteger(n) && n >= 0 && n < BINDER_MAX_PAGES))]
    .slice(0, PROFILE_PAGE_LIMIT);
}

export function validateProfilePages(value, binder, existing = []) {
  if (!Array.isArray(value)) return "Choose binder pages to display.";
  if (value.length > PROFILE_PAGE_LIMIT) return "Basic profiles can display up to four binder pages.";
  if (new Set(value).size !== value.length) return "A page can only be displayed once.";
  if (value.some(n => !Number.isInteger(n) || n < 0 || n >= BINDER_MAX_PAGES)) return "Choose a valid binder page.";
  if (value.some(n => !existing.includes(n) && !binder.slice(n * PROFILE_PAGE_SIZE, (n + 1) * PROFILE_PAGE_SIZE).some(Boolean)))
    return "Add a card to the page before displaying it.";
  return null;
}

// Always read the current binder. Sharing never copies or grants cards.
export function selectedProfilePages(indices, binder, collection) {
  return normalizeProfilePages(indices).map(index => ({ index,
    slots: Array.from({length: PROFILE_PAGE_SIZE}, (_, i) => {
      const slot = binder[index * PROFILE_PAGE_SIZE + i];
      return slot && (collection[slot.id] || 0) > 0 ? {id:slot.id, reverse:Boolean(slot.reverse)} : null;
    }),
  })).filter(page => page.slots.some(Boolean));
}
