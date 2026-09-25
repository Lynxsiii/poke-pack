// Repeatable account goals. Periods reset at 00:00 UTC; weeks start Monday.
export const QUESTS = [
  { id: "daily-bonus", period: "daily", name: "Clock in", note: "Claim an hourly bonus.", kind: "bonus", goal: 1, coins: 25 },
  { id: "daily-rip", period: "daily", name: "First rip", note: "Open a booster pack.", kind: "packs", goal: 1, coins: 10 },
  { id: "daily-five", period: "daily", name: "Five packs", note: "Open five booster packs.", kind: "packs", goal: 5, coins: 30 },
  { id: "daily-spares", period: "daily", name: "Clear the spares", note: "Sell three duplicate copies.", kind: "sold", goal: 3, coins: 20 },
  { id: "weekly-bonus", period: "weekly", name: "Regular collector", note: "Claim five hourly bonuses.", kind: "bonus", goal: 5, coins: 100 },
  { id: "weekly-packs", period: "weekly", name: "Weekend box", note: "Open 25 booster packs.", kind: "packs", goal: 25, coins: 100 },
  { id: "weekly-spares", period: "weekly", name: "Tidy collection", note: "Sell 20 duplicate copies.", kind: "sold", goal: 20, coins: 100 },
];

export function questPeriods(now = Date.now()) {
  const date = new Date(now);
  const daily = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekly = daily - ((date.getUTCDay() + 6) % 7) * 86_400_000;
  return { daily, weekly };
}
