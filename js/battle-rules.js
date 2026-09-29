// Shared definitions only; randomness, balances and awards belong to the Worker.
export const BATTLE_LIMITS = { players: [2, 3, 4], maxPacks: 72, maxRounds: 96, maxCardsPerPlayer: 1200 };
// startsAt = start + introMs (the 3-2-1); round i is revealed at startsAt + i * roundMs.
export const BATTLE_TIMING = { introMs: 3500, roundMs: 6000, fastRoundMs: 2600 };
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
// `rank` breaks ties in the deal. The Worker passes a random order: a fixed one
// (lowest seat first) would hand the host, always seat 0, the single best card
// of every shared or tied pot, and with free bots that beats a solo rip.
export function battleResult(rounds, settings, seats, rank = seat => seat) {
  const scores = roundScores(rounds, settings);
  const groups = settings.teams ? [[0, 1], [2, 3]] : seats.map(s => [s.seat]);
  const groupScores = groups.map(group => group.reduce((n, seat) => n + Math.round(scores[seat] * 100), 0));
  const target = settings.mode === 'crazy' ? Math.min(...groupScores) : Math.max(...groupScores);
  const winners = settings.mode === 'shared' ? [] : groups.flatMap((g, i) => groupScores[i] === target ? g : []);
  const recipients = settings.mode === 'shared' ? seats.map(s => s.seat) : winners;
  const allocations = recipients.map(seat => ({ seat, userId: seats.find(s => s.seat === seat)?.userId || null, cards: [], cents: 0 }));
  // Cards are indivisible. A descending-value, least-value-first deal balances
  // shared pots, tied seats and teammates; `rank` decides who is dealt first.
  const cards = rounds.flatMap(r => r.pulls.flatMap(p => p.cards)).map((card, order) => ({ card, order }))
    .sort((a, b) => cardCents(b.card) - cardCents(a.card) || a.order - b.order);
  for (const { card } of cards) {
    const next = [...allocations].sort((a, b) => a.cents - b.cents || a.cards.length - b.cards.length || rank(a.seat) - rank(b.seat))[0];
    next.cards.push(card); next.cents += cardCents(card);
  }
  return { winners, scores, allocations: allocations.map(a => ({ ...a, cardCount: a.cards.length, value: a.cents / 100 })) };
}

// Bot seats. Calling one is always free: a bot pays no entry and its winnings
// are discarded. A seat stores the persona's name, `bot:<id>` as its handle
// and the persona's ring colour; the avatar is looked up here by id.
export const BOT_PERSONAS = [
  { id: 'sparky', name: 'Sparky', avatar: '25', color: 'gold' },
  { id: 'cinder', name: 'Cinder', avatar: '4', color: 'ember' },
  { id: 'tide', name: 'Tide', avatar: '7', color: 'aqua' },
  { id: 'sprout', name: 'Sprout', avatar: '1', color: 'lime' },
  { id: 'haunt', name: 'Haunt', avatar: '94', color: 'ghost' },
  { id: 'nova', name: 'Nova', avatar: '151', color: 'fairy' },
  { id: 'onyx', name: 'Onyx', avatar: '197', color: 'night' },
  { id: 'volt', name: 'Volt', avatar: '135', color: 'thunder' },
  { id: 'drake', name: 'Drake', avatar: '149', color: 'dragon' },
  { id: 'frost', name: 'Frost', avatar: '144', color: 'ice' },
  { id: 'blade', name: 'Blade', avatar: '212', color: 'flame' },
  { id: 'psy', name: 'Psy', avatar: '150', color: 'violet' },
];
export const botPersona = seat => {
  const id = String(seat?.handle || '').replace(/^bot:/, '');
  return BOT_PERSONAS.find(p => p.id === id) || null;
};
