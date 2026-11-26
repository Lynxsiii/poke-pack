/**
 * The lesson: a practice match with both decks stacked, so every new player
 * meets the same cards in the same order and the coach can name them.
 *
 *   createLesson(names, defs) -> state     a game ready for setup, the player first
 *   LESSON                                 the steps, in order
 *
 * A step is one of
 *   { say }                 the coach talks; "Next" moves on
 *   { say, pick(def) }      setup: the hand card to tap
 *   { say, want(action) }   the one action the coach is waiting for
 *   { say, free: true }     the last word; the match is the player's from here
 * `nudge` is what the coach says when the player tries something else.
 *
 * The cards are on loan from Base Set (LESSON_SET must be loaded before
 * createLesson). scripts/test-tcg.mjs plays the lesson through, so a change to
 * the bot or the engine that breaks the script fails there, not on a new player.
 */

import { ACTIVE, createGame } from "./engine.js";

export const LESSON_SET = "base1";

const C = {
  hitmonchan: "base1-7", machop: "base1-52", machoke: "base1-34", diglett: "base1-47", dugtrio: "base1-19", onix: "base1-56", sandshrew: "base1-62",
  rattata: "base1-61", voltorb: "base1-67", pikachu: "base1-58", magnemite: "base1-53", electabuzz: "base1-20",
  F: "energy-fighting", L: "energy-lightning",
};

// In the order they are met: the opening hand (7), the prize cards (3), then each draw.
const MINE = [
  C.hitmonchan, C.machop, C.F, C.F, C.F, C.F, C.F,
  C.F, C.onix, C.F,
  C.F, C.machoke, C.diglett, C.F, C.onix, C.F, C.sandshrew, C.F, C.dugtrio, C.F,
  C.machop, C.F, C.hitmonchan, C.F, C.machoke, C.F, C.diglett, C.F, C.sandshrew, C.F,
];
const THEIRS = [
  C.rattata, C.L, C.L, C.L, C.L, C.L, C.L,
  C.L, C.pikachu, C.L,
  C.voltorb, C.pikachu, C.L, C.magnemite, C.L, C.electabuzz, C.L, C.rattata, C.L, C.voltorb,
  C.L, C.magnemite, C.L, C.electabuzz, C.L, C.L, C.L, C.L, C.L, C.L,
];

export const LESSON_CARDS = [...new Set([...MINE, ...THEIRS])];

export function createLesson(names, defs) {
  const state = createGame({ decks: [MINE, THEIRS], names, format: "half", seed: 151 }, defs);
  // Undo the shuffle and the coin: uids were dealt out in list order (a1, a2, ...).
  state.players.forEach((side, p) => {
    const uids = (p ? THEIRS : MINE).map((_, i) => `${p ? "b" : "a"}${i + 1}`);
    side.hand = uids.slice(0, 7);
    side.deck = uids.slice(7);
    side.mulligans = 0;
  });
  state.first = 0;
  state.opening = [{ t: "first", p: 0 }];
  return state;
}

export const LESSON = [
  { say: "This is a practice match with cards on loan. You win by taking all 3 of your prize cards, and you take one each time you Knock Out one of their Pokémon." },
  { say: "Tap Hitmonchan in your hand to make it your Active Pokémon, the one that does the fighting.", pick: (def) => def.name === "Hitmonchan", nudge: "Tap Hitmonchan first." },
  { say: "Now tap Machop to put it on your Bench. Benched Pokémon step in when your Active is Knocked Out.", pick: (def) => def.name === "Machop", nudge: "Tap Machop." },
  { say: "That's your side set up. Tap Start and both players turn their cards face up.", want: (a) => a.type === "place", nudge: "Tap Start." },
  { say: "You draw a card at the start of every turn. Attacks are paid for with Energy, and you may attach one Energy a turn." },
  { say: "Tap a Fighting Energy in your hand, then tap Hitmonchan.", want: (a) => a.type === "attach" && a.spot === ACTIVE, nudge: "Attach an Energy to Hitmonchan, your Active Pokémon." },
  { say: "Whoever goes first can't attack on the first turn. Tap End turn.", want: (a) => a.type === "end", nudge: "Tap End turn." },
  { say: "Rattata bit Hitmonchan for 20. Damage stays on a Pokémon, and when its HP reaches 0 it is Knocked Out." },
  { say: "You drew Machoke, which evolves from Machop. Evolving gives more HP and stronger attacks. A Pokémon can't evolve on the turn it comes into play." },
  { say: "Tap Machoke in your hand, then tap Machop on your Bench.", want: (a) => a.type === "evolve", nudge: "Tap Machoke in your hand, then Machop." },
  { say: "Machoke's attacks cost three Energy. Attach this turn's Energy to it while it waits on the Bench.", want: (a) => a.type === "attach" && a.spot !== ACTIVE, nudge: "Attach an Energy to Machoke on your Bench." },
  { say: "Rattata's Weakness is Fighting (it's printed at the bottom of the card), so a Fighting attack does double damage to it. Attacking ends your turn." },
  { say: "Tap Hitmonchan, then Jab.", want: (a) => a.type === "attack", nudge: "Tap Hitmonchan, then Jab." },
  { say: "Rattata was Knocked Out and you took a prize card. Two to go." },
  { say: "If your Active is ever in trouble, tap it and choose Retreat: you pay the cost in Energy and a Benched Pokémon takes its place." },
  { say: "The rest is yours. Tap any card to read it, and take your last 2 prize cards to win.", free: true },
];
