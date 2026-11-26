# Playing the card game: plan

Started 2026-11-26. Noah wants players to play the real game with the cards
they own, against bots and against each other, with wager matches, using only
the cards, sleeves, coins and playmats they have bought in-game.

## What is in (phase 1, at /play, in no menu yet)

- **Rules engine** (`js/tcg/engine.js`): setup and mulligans, the coin flip
  for first turn, Basic Pokémon, evolution, one Energy a turn, attacks,
  Weakness and Resistance, retreat, prizes (2 or 3 for the cards whose rule
  says so), winning by prizes, by an empty Bench, by an empty deck, a tie when
  both happen at once. The player who goes first doesn't attack on turn 1.
- **Card data** (`js/tcg/cards.js`, `data/tcg/rules.json`): our card files had
  no weakness, resistance or retreat cost. `scripts/build_tcg_rules.mjs` adds
  them for 17,986 of 18,121 Pokémon from the open pokemon-tcg-data set.
- **Attack text** (`js/tcg/effects.js`): text is compiled to steps. Read so
  far: coin flips for more damage, for nothing, for damage per heads, until
  tails; heal self; damage to self; discard Energy (own or theirs); draw;
  discard from their deck; the five Special Conditions (with the checkup
  between turns); damage that skips Weakness, Resistance or effects; damage
  that counts counters or Energy; effects that last a turn (can't attack,
  can't use one attack, less damage, no damage, protected, can't retreat,
  flip to attack). A text of several sentences is read when every sentence
  is. Also damage to Benched or chosen Pokémon and switching, which can
  leave a choice open (`pending` of type "pick"). Of 29,147 attacks, 7,645
  print no text and 8,867 more are read. The
  rest land their printed damage
  and the screen says their text isn't live.
- **Decks** (`js/tcg/decks.js`): Full deck (60 cards, 6 prizes, 4 of a name)
  and Half deck (30, 3, 2). Only cards you own, as many as you own. Basic
  Energy is free. "Build it for me" makes a legal deck from your collection.
- **Bot** (`js/tcg/bot.js`): plays by the same actions as a person. Its deck
  is built from the ordinary one-prize cards of the set most of your deck
  comes from.
- **Table** (`js/tcg-page.js`, `css/pages/tcg.css`): phone first. Your sleeve
  is your card back, your coin makes the flips. A hand card can be tapped then
  placed, or dragged (touch or mouse) onto the field or a Pokémon. A match is kept on the device
  and picks up where it stopped. Motion: the table is repainted whole, so
  cards in flight, the turn banner and impacts live in a layer beside it
  (`.tg-fx`); transform, opacity and filter only.
- **Lesson** (`js/tcg/tutorial.js`): a practice match on borrowed Base Set
  cards with both decks stacked, and a coach that waits for one action at a
  time. The hub offers it until it has been finished once. The test suite
  plays it through, so a bot or engine change that breaks the script fails
  there.
- **Tests**: `node scripts/test-tcg.mjs` (rule cases, then every set's bot
  deck played out bot against bot), `--coverage` for the numbers above.

Kept on the device for now (localStorage, per account): decks, the match in
progress, wins and losses. Nothing touches the Worker or the save, and
nothing pays out.

## How it is built, and why

- The engine is pure: `createGame`, `legalActions`, `apply`, `viewFor`. No
  DOM, no clock, no network. Random numbers come from a seed held in the
  state, so a match is its seed plus its list of actions. That is what lets
  the Worker referee a match later with the same file the page runs today.
- The state holds ids and numbers only, so it is JSON: it saves, resumes, and
  crosses the wire as is.
- `viewFor(state, player)` strips the other hand, both decks and the prizes.
  A client in a match between two people only ever gets its own view.
- The screen never decides a rule. It asks `legalActions` what to light up
  and sends an action; the bot does the same.

## Rules audit (2026-11-26, against the current rulebook)

Checked and right: 60 cards and 6 prizes (the official Half Deck is 30 cards,
3 prizes, 2 copies), 7-card hand, mulligans shown, Bench of 5, one Energy a
turn, one Supporter a turn and none for the first player on turn 1, no attack
for the first player on turn 1, no evolving on a player's first turn or the
turn a Pokémon came into play, one retreat a turn (not while Asleep or
Paralyzed), Weakness and Resistance on the Active Pokémon only, the checkup
(Poison 10, Burn 20 then a flip, Sleep flip, Paralysis gone after its owner's
next turn), Confusion 30 to itself, the three ways to win, the defending
player choosing a new Active first.

Fixed that day:
- The winner of the opening flip now chooses to go first or second (`order`).
- Mulligans both players took cancel out; only the difference is drawn.
- Prize counts no longer depend on the source's rule box alone: Mega ex 3,
  VMAX and TAG TEAM 3, ex / EX / GX / V / VSTAR 2 (`prizesFor` in cards.js).
  Before, 46 Mega ex gave 2 or 1 and a few promo ex and V gave 1.
- A double Knock Out where one player meets more win conditions is theirs.
- Deck limits: one Radiant Pokémon, one ACE SPEC card, one of each Prism Star.

Known gaps: Sudden Death (a level double win is a tie); mulligan extra draws
are taken automatically (the rulebook makes them optional); the retreat cost
is paid with Energy the engine picks.

## Phase 2: card effects at scale

Driven by `node scripts/test-tcg.mjs --coverage`, which lists the commonest
wordings the engine can't read. Work down that list:

1. Done 2026-11-26: Special Conditions and the checkup between turns.
2. Done 2026-11-26: effects that last a turn, as marks on a slot
   (`engine.js`, "effects that last a turn").
3. Done 2026-11-26: bench damage, chosen targets and switching, with a
   general choice (`pick`: one Pokémon per action, the turn waits on it).
   Still to come on the same door: searching the deck, discarding from hand,
   moving Energy, damage counters placed freely.
4. **Trainers**. First batch done 2026-11-26: Items and Supporters (one a
   turn, none on the first turn of the match) that draw, refresh the hand,
   heal, switch, pull a Benched Pokémon forward, discard Energy or cure
   (`js/tcg/trainers.js`; text from `data/tcg/trainers.json`, built by
   `scripts/build_tcg_trainers.mjs`). A Trainer whose text isn't read stays
   out of decks. Second batch the same day: choices of cards (pending
   `choose`, action `choose` with the uids): deck searches to the hand or
   the Bench, cards back from the discard pile, a price paid from the hand
   first, a coin flip in front. Steps after a choice ride on it (`then`).
   Pokémon Tools (same day): attached with action `tool`, one to a Pokémon,
   kept on `slot.tool`; `compileTool` reads the ones that change numbers
   (HP, Retreat Cost, damage dealt or taken, no Weakness) and the engine
   asks `toolOf` / `maxHp` / `retreatCost` wherever those numbers are used.
   Stadiums (same day): `state.stadium = { uid, owner }`, one played a
   turn, never the name already in play, the old one to its owner's
   discard pile. `compileStadium` reads standing changes for the Pokémon
   that fit (`field`, folded into `toolOf` with the Tool) and
   "once during each player's turn" texts whose rest reads as a Trainer
   (`use`, action `stadium`). 23 Stadiums so far; 449 of 2,888 Trainers
   playable. Next: Tools and Stadiums with conditions, moving Energy,
   Rare Candy, damage boosts for a turn.
5. **Abilities and Poké-Powers**: a hook per timing (on play, once a turn,
   always on).
6. **Special Energy**, then the odd card types: V-UNION, LEGEND, Restored,
   BREAK keeping its earlier attacks, Lv.X.

Rules for this work: one op per mechanic in `OPS`, wordings mapped to it in
`PATTERNS`, a test per op. Text that isn't fully read stays "not live" rather
than half-working. A card whose text would make it much stronger when ignored
(a drawback we skip) should be listed and held out of wager matches until it
is read.

Era rules to settle here too: first-turn rules changed over the years, and
old cards print Weakness as "×2" while some print "+20". The engine already
uses what each card prints.

## Phase 3: matches between players

- The Worker runs `apply` and is the only one that does. Clients send
  actions and get back `viewFor` their side plus the events to play.
- A match is a row: seed, both deck lists, the action log, whose move, a
  clock. The state is rebuilt from the log or cached beside it.
- Decks move from the device into the save, and the Worker checks every deck
  against what the player owns (`checkDeck`) when a match starts.
- Live updates the way pack battles do them today; a Durable Object per match
  is the upgrade if polling feels slow.
- Turn timer, reconnect, concede, and a loss for leaving.
- Friends first (challenge from the friends list), then a queue.

## Phase 4: wager matches

Noah asked for these. They touch money, so each piece needs his yes before it
ships:

- Stakes in coins, and later cards or slabs like Coinflip takes them. Both
  stakes are locked when the match starts and paid by the Worker when it ends.
- Both decks checked server side. Cards in a deck are locked for the match so
  they can't be sold or traded mid-game.
- No wager against the bot, and no rewards for bot matches beyond what the
  economy review allows: free bot battles were already found to be farmable.
- Two accounts feeding each other is the known Coinflip problem; the same
  guards apply (account age, stake caps, a rake or none: his call).
- Same 13+ gate and free-play line as the rest of the casino. Cards with text
  that isn't live yet stay out of wager decks.

## Phase 5: formats, gear, polish

- **Formats**: Standard by regulation mark, Expanded, an era-locked table
  (Base to Neo), Unlimited. The source data carries legality and marks.
- **Gear**: sleeves and coins already work. Playmats don't exist in the gear
  catalog yet: add them as a third kind, from the products that hold them.
  Sleeve and coin per deck. Use the Energy prints a player owns.
- **Bot**: difficulty steps, themed decks by era.
- **Table**: a desktop layout, a match log, the discard pile to look through,
  sound.
- **Progress**: quests and XP only after the economy review; a ladder.

## Legal

The site already carries the brand risk noted in the legal thread, and a
playable game raises it. What this build does to keep it down: game rules
only (rules aren't ours to copy or theirs to own), our own table layout in
the site's look, none of TCG Live's art, layout or sounds, card images the
site already shows. Card rule text comes from an open data set. No money goes
in or out. Wager matches, when built, sit behind the casino's gates.
