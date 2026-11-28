/* The odds and payback of every casino game, as the fairness page and each game's odds sheet show them.
   Every figure comes from the rules modules the Worker settles with, so this page can't drift from the game. */
import { COINFLIP_RULES, JACKPOT_RULES } from './casino-rules.js';
import { UPGRADER_RULES } from './upgrader-rules.js';
import { BETA_RULES, GRASS, ROCKET, grassMultiplier } from './beta-rules.js';

const pct = (x, places = 1) => `${Number((x * 100).toFixed(places))}%`;

/** Rayquaza: the chance a round reaches `m` (P(crash >= m) = 0.95 / m, and every round reaches 1x). */
export const rocketReach = (m) => (m <= 1 ? 1 : m > ROCKET.maxMult ? 0 : Math.min(1, BETA_RULES.edge / m));

/** Tall Grass: the chance of clearing `safe` tiles in a row with `mines` Voltorb hidden among 25. */
export function grassClear(mines, safe) {
  let p = 1;
  for (let i = 0; i < safe; i++) p *= (GRASS.tiles - mines - i) / (GRASS.tiles - i);
  return p;
}

/** Tall Grass's table for one Voltorb count: [{ safe, chance, mult }] for each clear tile. */
export function grassTable(mines) {
  const rows = [];
  for (let safe = 1; safe <= GRASS.tiles - mines; safe++) rows.push({ safe, chance: grassClear(mines, safe), mult: grassMultiplier(mines, safe) });
  return rows;
}

/**
 * Every game: `{ key, name, href, seed, how, payback, rows: [[label, value]] }`.
 * `seed` says which seed decides it: "yours" (your seed pair and the next nonce) or "game" (the game's own seed, revealed
 * when it ends). `payback` is what the game returns on average, as text.
 */
export const GAME_ODDS = [
  {
    key: 'coinflip', name: 'Coinflip', href: '/casino/coinflip', seed: 'game',
    how: 'One draw picks a side: 0 is the host, 1 is the challenger. Against a player it uses the flip’s own seed, mixed with both players’ client seeds. Against a bot it uses your seed pair.',
    payback: `Against a player: 100% (even odds, stakes within ${pct(COINFLIP_RULES.tolerance, 0)} of each other). Against a bot: ${pct(1 - COINFLIP_RULES.botEdge / 2, 0)} to 100%, since the bot stakes up to ${pct(COINFLIP_RULES.botEdge, 0)} less than you.`,
    rows: [['Your chance', '50%'], ['Bot’s stake', `0 to ${pct(COINFLIP_RULES.botEdge, 0)} under yours`]],
  },
  {
    key: 'jackpot', name: 'Jackpot', href: '/casino/jackpot', seed: 'game',
    how: 'One ticket is drawn between 0 and the pot’s value in cents. Seats hold runs of tickets in seat order, one per cent they put in, and the seat holding the ticket takes the pot.',
    payback: `100% against players. Bots put in up to ${pct(COINFLIP_RULES.botEdge, 0)} below the pot minimum, so a pot with bots pays a little under that.`,
    rows: [['Your chance', 'your entry ÷ the whole pot'], ['Seats', `${JACKPOT_RULES.minPlayers} to ${JACKPOT_RULES.maxPlayers}`]],
  },
  {
    key: 'battle', name: 'Pack battles', href: '/battles', seed: 'game',
    how: 'Every pack in the battle is opened from the battle’s own seed, round by round and seat by seat, with the same pull rates as opening that pack in the shop. A tie is split by one more draw per seat.',
    payback: 'Each pack pays what its pulls are worth: the same as opening it yourself. The winner takes every seat’s pulls.',
    rows: [['Pull rates', 'shown on each pack’s page'], ['Your chance', 'depends on the pulls']],
  },
  {
    key: 'upgrader', name: 'Upgrader', href: '/casino/upgrader', seed: 'yours',
    how: 'One roll between 0 and 999,999. You win when the roll is under your chance in millionths.',
    payback: `${pct(1 - UPGRADER_RULES.edgeMillionths / 1e6, 0)} for every target.`,
    rows: [['Your chance', `stake ÷ target × ${1 - UPGRADER_RULES.edgeMillionths / 1e6}`], ['Highest chance', pct(UPGRADER_RULES.maxChance / 1e6, 0)]],
  },
  {
    key: 'grass', name: 'Tall Grass', href: '/casino/grass', seed: 'yours',
    how: 'When the patch starts, the 25 tiles are shuffled (Fisher–Yates, one draw per tile) and the first ones are the Voltorb. The board is fixed before your first tap.',
    payback: `${pct(BETA_RULES.edge, 0)}: each multiplier is ${pct(BETA_RULES.edge, 0)} of the fair odds of getting that far.`,
    rows: [['Voltorb', `${GRASS.minMines} to ${GRASS.maxMines}`], ['Most one round pays', `${BETA_RULES.maxWin.toLocaleString('en-US')} coins`]],
  },
  {
    key: 'tins', name: 'Mystery Tins', href: '/casino/tins', seed: 'yours',
    how: 'One draw per tin walks down the tin’s list of cards and their odds. Opening several at once uses one nonce and one draw per tin, in order.',
    payback: `Set by the shelf, between 65% and ${pct(BETA_RULES.tinMaxEdge, 0)}. Every tin shows its own odds and payback.`,
    rows: [['Odds', 'listed on each tin'], ['Highest payback', pct(BETA_RULES.tinMaxEdge, 0)]],
  },
  {
    key: 'packs', name: 'Packs and boxes', href: '/packs', seed: 'yours',
    how: 'Opening a pack or a box takes one nonce. Every card slot, the god pack chance, promos and box extras are drawn from it in order.',
    payback: 'What the pulls are worth. Pull rates are shown on each pack.',
    rows: [['Pull rates', 'shown on each pack']],
  },
];

export const oddsFor = (key) => GAME_ODDS.find((g) => g.key === key) || null;
