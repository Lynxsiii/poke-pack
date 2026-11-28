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
- **Decks** (`js/tcg/decks.js`, `js/tcg/formats.js`): the official tournament formats,
  Standard (marks H, I, J), Expanded (Black & White on, minus the ban list) and Unlimited:
  60 cards, 6 prizes, 4 of a name, 1 ACE SPEC, 1 Radiant, 1 of each Prism Star. Marks per
  print are data/tcg/legal.json (scripts/build_tcg_legal.mjs); sources in
  /mnt/project-files/tcg-rules/formats-2026-11.md. Only cards you own, as many as you own. Basic
  Energy is free. "Build it for me" makes a legal deck from your collection.
- **Bot** (`js/tcg/bot.js`): plays by the same actions as a person. Its deck
  is built from the ordinary one-prize cards of the set most of your deck
  comes from, the way a person writes a list (`buildBotDeck` in decks.js): a
  main attacker's whole line (4-3-3), a partner line on the same Energy, an
  Ability Pokémon that draws or searches, Trainers by job (draw, search,
  switch, gust, heal), about 13 Energy. The table names it ("Charizard deck").
  Strategy: Benches what evolves first, powers up toward the Stage 2 it will
  become, feeds the next attacker when the Active one is about to fall,
  retreats or Switches when a Benched one hits much harder or can Knock Out,
  gusts out a Benched Pokémon it can Knock Out, digs for a Basic when its Bench
  is empty, and doesn't waste Potions, Full Heals or Energy Removal. In a
  1,080-match duel it plays even with the old bot (49.8%), so these read as a
  person's choices more than they win more; real gains need expected damage
  from attack effects.
- **Energy symbols**: the real printed symbols, transparent PNGs in
  `assets/tcg/energy/<type>-v1.png`, from pokewiki.de's `<Type>Symbol_TCG.png`
  files (cropped, 96 px).
- **Table** (`js/tcg-page.js`, `css/pages/tcg.css`): phone first, redrawn 2026-11-28 as a
  playmat seen from your seat (Noah picked it from two mockups). The mat (`.tg-field`) is tilted
  as a whole and takes the theme's slab colour: their half far and deeper, yours near, the two
  Active Pokémon face to face on the centre line, each with an ink name plate beside it (never
  over a card). Prize cards lie face down left of each Bench, the deck and the discard count
  right of it, and each Bench shows its five places. Attached Energy never overlaps: every
  symbol while there are few, then one symbol and a count per type (`pipRow`). The hand is a
  fan sorted by kind, with copies of one card as a pile and a count; cards that can't be played
  go dark, and yellow marks only the chosen card and where it can go. The bar at the bottom
  says what to do, shows what is left this turn (Energy, Supporter, Retreat) and holds the key
  that moves the turn on. Your sleeve is your card back, your coin makes the flips. A hand card
  can be tapped then placed, or dragged. A match is kept on the device and picks up where it
  stopped. Motion: the table is repainted whole, so cards in flight, the turn plate and
  impacts live in a layer beside it (`.tg-fx`); transform, opacity and filter only. Drawn cards
  and prizes leave their pile face down and turn over on the way; a Knocked Out card is thrown
  to its discard pile.
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
   (`use`, action `stadium`). 23 Stadiums so far.
   Third batch (2026-11-26): 955 of 2,888 Trainers playable (434 Items,
   456 Supporters, 23 Tools, 42 Stadiums). Searches name more: "A or B" and
   "any combination of A and B" (`fits` reads "pokemon|basicEnergy"), an HP
   cap ("basic@70"), no Rule Box ("pokemon!rule", `def.rule` from
   `cards.js`), no Pokémon-ex ("basic!ex"), "an Item card and a Pokémon Tool
   card" (a search each), Evolution Pokémon of a type. A look at the top
   cards that takes some (`topTake`) and discards (`mill`), shuffles, or
   bottoms (`under`) the rest; cards shuffled back from the discard pile
   (`recycle`, choose effect `toDeck`); a Basic Pokémon from the discard
   pile onto the Bench. Conditions (`holds`, `condOf`): "You can use this
   card only if ..." (`only`), and draws that change with Prize counts, a
   Knock Out during the opponent's last turn (`side.lostOn`, kept by
   `resolveKnockOuts`), the first turn, going second, a lone Active
   Pokémon, your own Stadium; a step's `when` is checked as it runs.
   Supporters that may be played on the very first turn (`early`). Hands to
   the bottom of the deck (Iono, Marnie: `handBottom`, `drawPrizes`); the
   other player's hand only (`foeShuffle`). Special Energy only, or one
   from each (`hammer { special, each }`), an Energy back to their hand
   (`toHand`). Healing that cures (`heal { cure }`), Max Potion and
   Pokémon Center (`strip`), healing by type. "Switch ... If you do"
   (`need`: the first step must be possible). One of your Pokémon back to
   the hand (`bounce`: with its cards, its Pokémon cards, or only the Basic
   one; never the last one in play). More damage this turn (`boost` in
   `state.boosts`, all attacks, by attacker type, or only against Pokémon
   ex; `boostOf` adds it, and a Tool's `plusVs` against GX/EX or V). Prices
   in a kind of card ("discard a Fire Energy card"), "Discard 2 cards. If
   you do", "in order to"; Stadium prices count the whole hand (`spare: 0`).
   Discarding a Stadium (`dropStadium`). The ACE SPEC rule line is dropped
   before reading (`tidy`; the deck limit comes from the subtype).
   Fourth batch (2026-11-26): 1,061 of 2,888 Trainers playable (498 Items,
   498 Supporters, 23 Tools, 42 Stadiums). Evolving by a Trainer: Rare Candy
   and Pokémon Breeder (`candy`: a Stage 2 from the hand straight onto the
   Basic Pokémon it comes from; the old Rare Candy takes a Stage 1 too), and
   Evosoda, Wally, Wally's Training, Salvatore (`evolveDeck`: a card from the
   deck). The card is chosen first (`choose` effect `evolveFrom`), then the
   Pokémon when more than one can take it (`pick` effect `evolveHeld`); the
   usual timing holds (not on the first turn, not on a Pokémon put into play
   this turn) unless the card lifts it (`how.lift`), and `how.noEx` /
   `how.noAbility` narrow it. `canEvolveOnto(state, slot, def, defs, how)`,
   `mayEvolve`, `evolveSpots` and `evolveSlot` are shared with the plain
   `evolve` action. A Stage 2 knows its Basic Pokémon through `def.roots`,
   from `lines` in data/tcg/trainers.json (Stage 1 names to what they evolve
   from, `scripts/build_tcg_lines.mjs`, from our own card files); `def.line`
   is 1 or 2. Cards in play discarded (`dropInPlay`, choose zone "play"):
   Tool Scrapper, Field Blower (the Stadium too), Xerosic (a Tool or a
   Special Energy, either side), Blowtorch and Dangerous Drill (theirs, or the
   Stadium); Ruffian (`hammer { special, tool }`). Cards from the hand into
   the deck (`stash`, choose effects `toTop` / `toBottom`, shuffled for
   "into"): Pokémon Communication, Maintenance, Bill's Maintenance, Bebe's
   Search, Professor Oak's Visit, Mary. Energy from the hand or the discard
   pile onto a Pokémon the card names, the player choosing the card
   (`attachPick`: Bede, Dark Patch and the other Patches, Welder, Philippe,
   Zinnia, Raihan, Mela). `viewFor` now shows Tools and the Stadium in play,
   and the cards a player is choosing from.
   Next: choices between two effects ("Choose 1:": the engine needs a way
   to name the one picked, and the page a sheet to offer them), Lost Zone,
   Fossils, "put them on top in any order".
5. **Abilities and Poké-Powers**: a hook per timing (on play, once a turn,
   always on).
   First batch live (2026-11-26, `js/tcg/abilities.js`, `compileAbility`):
   standing ones fold into `toolOf` (less damage, Retreat Cost, HP, auras
   for the owner's Pokémon); ones that answer an attack (hit back, coin
   flip to block, no damage from ex/V/Basic attackers, safe on the Bench,
   hang on from full HP); ones you use (action `ability { spot }`, once a
   turn unless "as often as you like", `slot.used`), read through
   `compileTrainer` plus `energize`, `switchSelf`, `counters`; and "when
   you play this Pokémon" ones, asked as an optional pick (`effect.op:
   "ability"`). 682 of 4,214 Pokémon with an Ability have it live.
   Second batch (2026-11-26): moving Energy and damage counters (two picks,
   `moveEnergyFrom` then `moveEnergyTo`, asked only when there is a choice),
   Energy from the deck onto a Pokémon (`fetchEnergy`: this one, one picked,
   or a pick per card), form changes (`formChange`: another card of the name
   takes the slot), Special Conditions on their Active Pokémon, pushing their
   Active Pokémon out (they choose), searches by type ("a Water Pokémon",
   "Basic Fire Energy", Tools, Stadiums; `fits` reads "basic:Water"), and the
   flags around a use: VSTAR Power once a game (`side.vstarUsed`), "your turn
   ends", "this Pokémon is Knocked Out", "can't be used with a Special
   Condition". Standing ones: immune to some or all Special Conditions,
   Bench guard for the team, a coin flip to hang on, the other Active
   Pokémon's Retreat Cost raised, early evolution, mending between turns,
   no effects of attacks except damage, no damage while Asleep. 1,073 live.
   Third batch (2026-11-26): triggers and locks. "When this Pokémon moves
   from your Bench to the Active Spot" (`rise`, asked as an optional pick on
   a retreat, switch or promotion during its owner's turn, once a turn);
   "move any amount of Energy from your other Pokémon to it" (`gather`: an
   optional pick a card until the player stops). Knocked Out by damage from
   an attack (`ko`: a search, back to the hand, counters on the Attacking
   Pokémon, cards off their deck or at random from their hand; the engine
   marks `slot.hit` with the turn an opponent's attack damaged it and clears
   it before the checkup). "Whenever your opponent attaches an Energy"
   (`foeAttach`). Terms on a use (`use.need`): first turn only, after a Knock
   Out during the opponent's last turn (`side.lostOn`), a Stadium in play,
   their Prizes left. Locks (`lock`, folded into `abilityOn`): the other
   side's or everyone's, Active or Benched only, Basic, by rule box, damaged
   ones, except a name, old Poké-Power/Poké-Body locks, Garbotoxin with a
   Tool, Abilities that Knock Out themselves. Wards: "prevent all effects of
   your opponent's Pokémon's Abilities" (`ward`, also keeps off locks and
   their standing auras) and of their Items and Supporters (`trainerWard`);
   the source rides on the Trainer context as `src`. Also: +HP with Special
   Energy, more damage at low HP (`when.hpMax`), walls against attackers
   with Special Energy or an Ability, "your Pokémon have no Retreat Cost",
   their Active Pokémon doing less damage, and searches for "Pokémon with N
   HP or less" (Trainers too). 1,251 live; 1,275 with the third Trainer batch (Ability text that reads like a Trainer).
   Next: attack costs that change, more Energy from the discard pile,
   "Once during your turn, if this Pokémon has ... Energy attached",
   Abilities that work from the hand or discard pile.
   `node scripts/test-tcg.mjs --coverage` lists the commonest unread texts.

6. **Special Energy**. First batch live (2026-11-26, `js/tcg/energy.js`,
   `compileSpecialEnergy`, text in `data/tcg/trainers.json` beside the
   Trainers). Read a sentence at a time; one unread sentence keeps the card
   out of decks. What it provides (`provides`; "Any" is every type at once,
   "Fire|Water" one of those), who it can go on (`special.only`: types,
   Evolved, not ex), standing changes to the holder folded into `toolOf`
   (HP, more or less damage, less damage taken, no Weakness, immune), and
   what it does when attached from the hand (`special.attach`: draw, heal,
   cure, a damage counter, switch, search). 89 of 214 Special Energy cards.
   Second batch (2026-11-26): 113 of 214. Energy that gives more on some
   Pokémon (`special.alt`, read by `energyOf` and a retreat's payment):
   Prism on a Basic Pokémon, δ Rainbow on δ Pokémon, Twin on a Pokémon that
   isn't V or GX, Counter while behind on Prizes. "When you attach ... to a
   Lightning Pokémon" (`attach.type`), anything a Trainer could do on attach
   (Enriching, Telepathic), healing on attach (Medical), no Retreat Cost,
   more damage by type, less damage from the opponent's Pokémon, and old
   Darkness/Metal/Rainbow/Warp wordings.
   Next: end-of-turn discards (Boost, Triple Acceleration), Scramble, Multi,
   Holon Energy, "Discard a Special Energy" attacks. Then the odd card types: V-UNION, LEGEND,
   Restored, BREAK keeping its earlier attacks, Lv.X.

   **Standard fully read (2026-11-28).** Every Standard Ability and Trainer is
   now read. Engine features added for the last 26: more than one Tool on a
   Pokémon (`slot.extraTools`, Multi Adapter/Dual Core room, `toolsIn`),
   a Bench that grows and shrinks (`benchMax`: Area Zero Underdepths with a
   Tera in play; extra Pokémon are discarded when it shrinks, owner picks),
   Stadium rules (Legendary Trench double healing, Battle Cage, Neutralization
   Zone, Grand Tree evolving twice), devolving (Strange Timepiece), Double Type,
   face-up Prize cards (Bother-Bot), Tyme's two-step guess, "can't be put back
   from the discard pile" cards (Adventure Lantern-style text), and Abilities
   used from the hand or on a coin flip while retreating.
   Calls made without asking: Huntail's "may" happens automatically, Bother-Bot
   turns a random Prize face up, Prizes are still taken from the front.
   Every Standard attack text is read too (#496 #498 #499 #500 #501, 2026-11-28).

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

First cut built 2026-11-26 (still hidden, no menu entry, no patch note):
`worker/tcg.js`, table `tcg_matches` (migration 0038, also applied by the
Worker itself). A row holds both user ids, the seed, both deck lists, the
action log and the cached state. Challenges go to friends only, with a deck;
the accept carries the other deck; both are checked with `checkDeck` against
what each player owns (raw and graded), the challenger's again at the accept.
Each decision has 90 s (setup 180 s, an open challenge 15 min); running out
is a loss, settled on any read and by the scheduled Worker (`maintainTcg`);
nobody setting up ends the match with no winner. The page (`/play/friends`,
`/play/online/<id>`) sends actions, polls every 1.5 s, and plays the steps it
gets back (`{ seq, action, events, view }`, rebuilt by replaying the log)
through the same path as a bot match; it never runs `apply` itself and takes
what is legal from the Worker. No stakes, no records, no rewards.
`node scripts/test-tcg-pvp.mjs` plays matches through the API. Not yet: a
queue, decks in the save, a Durable Object, rematch, spectating.

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
