// Shared definitions only; randomness, balances and awards belong to the Worker.
export const BATTLE_LIMITS = { players: [2, 3, 4], maxPacks: 72, maxRounds: 96, maxCardsPerPlayer: 1200 };
export function battleSettings(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Choose valid battle settings.');
  for (const key of ['teams', 'fast', 'skipCommons', 'private']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') throw new Error(`Choose true or false for ${key}.`);
  }
  const players = Number(raw.players ?? 2);
  if (!BATTLE_LIMITS.players.includes(players)) throw new Error('Choose 2, 3 or 4 players.');
  const mode = raw.mode ?? 'standard';
  const scoring = raw.scoring ?? 'total';
  if (!['standard', 'crazy', 'shared'].includes(mode)) throw new Error('Unknown battle mode.');
  if (!['total', 'last', 'best'].includes(scoring)) throw new Error('Unknown scoring rule.');
  if (raw.teams && players !== 4) throw new Error('Teams need four seats.');
  return { players, teams: Boolean(raw.teams), mode, scoring,
    fast: Boolean(raw.fast), skipCommons: Boolean(raw.skipCommons), private: Boolean(raw.private) };
}
export const cardCents = card => Math.round(Number(card.value || 0) * 100);
export function roundScores(rounds, settings, count = rounds.length) {
  const scores = Array(settings.players).fill(0);
  for (const round of rounds.slice(0, count)) {
    for (const pull of round.pulls) {
      const value = settings.scoring === 'best'
        ? Math.max(0, ...pull.cards.map(cardCents))
        : pull.cards.reduce((n, card) => n + cardCents(card), 0);
      scores[pull.seat] = settings.scoring === 'last' ? value
        : settings.scoring === 'best' ? Math.max(scores[pull.seat], value)
        : scores[pull.seat] + value;
    }
  }
  return scores.map(n => n / 100);
}
export function battleResult(rounds, settings, seats) {
  const scores = roundScores(rounds, settings);
  const groups = settings.teams ? [[0, 1], [2, 3]] : seats.map(s => [s.seat]);
  const groupScores = groups.map(group => group.reduce((n, seat) => n + Math.round(scores[seat] * 100), 0));
  const target = settings.mode === 'crazy' ? Math.min(...groupScores) : Math.max(...groupScores);
  const winners = settings.mode === 'shared' ? [] : groups.flatMap((g, i) => groupScores[i] === target ? g : []);
  const recipients = settings.mode === 'shared' ? seats.map(s => s.seat) : winners;
  const allocations = recipients.map(seat => ({ seat, userId: seats.find(s => s.seat === seat)?.userId || null, cards: [], cents: 0 }));
  // Cards are indivisible. A stable descending-value, least-value-first deal
  // balances shared pots, tied seats and teammates without favouring a human over a bot.
  const cards = rounds.flatMap(r => r.pulls.flatMap(p => p.cards)).map((card, order) => ({ card, order }))
    .sort((a, b) => cardCents(b.card) - cardCents(a.card) || a.order - b.order);
  for (const { card } of cards) {
    const next = [...allocations].sort((a, b) => a.cents - b.cents || a.cards.length - b.cards.length || a.seat - b.seat)[0];
    next.cards.push(card); next.cents += cardCents(card);
  }
  return { winners, scores, allocations: allocations.map(a => ({ ...a, cardCount: a.cards.length, value: a.cents / 100 })) };
}
