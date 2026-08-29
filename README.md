# poke-pack.rip

A fan-made Pokémon TCG booster pack simulator. Real printed pull rates, real
card scans, no real money.

Not affiliated with Nintendo, Game Freak, Wizards of the Coast, or
The Pokémon Company.

## Running it

No build step — it is static files and ES modules, so it needs a server only
because modules will not load over `file://`.

```
start.bat            # Windows: serves on http://127.0.0.1:5173
python -m http.server 5173
```

## Layout

```
index.html            markup for every view; views are sections toggled by .hidden
css/app.css           all styling, including the foil/glare and pack-tear visuals
js/app.js             views, rendering, the tear interaction, reveal flow
js/catalog.js         set definitions, rarity tables, sell values, roadmap
js/engine.js          pack generation — slot tables and pull odds
js/state.js           localStorage save, coins, daily bonus, collection
js/achievements.js    achievement table, progress, and claim rewards
js/titles.js          titles, including the ones an achievement hands over
worker/bots.js        the ambient roster and its once-a-minute tick
data/<set>.json       card data per set
assets/packs/<set>/   booster wrapper art (avif with png fallback)
scripts/              python builders that generate data/ and crop wrapper art
```

## Brand assets

`py scripts/make_avatar.py` renders the square profile icon into
`assets/avatar.png` (plus a pre-rounded `assets/avatar-round.png`). The card
trio and tagline for each look live in `VARIANTS` at the top of the script;
`--variant neon|classic|warm` picks one and `--all` writes every look to
`scripts/_debug/` to compare. Everything is laid out inside the inscribed
circle, because avatars get cropped round.

`--mark` renders the same trio without the wordmark into `assets/mark.png`,
`icon-180.png` and `icon-32.png` — the tile the header, the account card, the
favicon and the home-screen icon use. The lockup is for places that show it
large; anywhere under about 64px takes the mark, because type that small is
mush and the header says the name in real text beside it anyway.

## Adding a set

1. Build `data/<id>.json` with the scripts in `scripts/`.
2. Add a set object in `js/catalog.js` (slots, odds line, wrappers, hero ids)
   and push it into `PLAYABLE_SETS`.
3. Drop wrapper art into `assets/packs/<id>/` and register it in
   `assets/packs/sources.json`.
4. Remove the set from `ROADMAP` so it does not appear twice in the catalog.
5. Run `py scripts/make_owner_masks.py` if the set has "Trainer's Pokemon"
   cards. It recovers each owner portrait from the scans and writes its foil
   window into `assets/masks/owner/`, stamping `ownerMask` onto the cards that
   use it. `--debug` drops a contact sheet in `scripts/_debug/` to check the
   cuts by eye.

## Pull rates

Odds live in each set's `slots` table in `js/catalog.js`. Pitch Black's are
taken from the TCGplayer Authentication Center sample (~4,000 packs) and a
200,000-pack simulation of `ripPack()` reproduces them within noise:

| Pull | Simulated | Printed |
|---|---|---|
| Double Rare | 1 in 4.7 | 1/5 |
| Ultra Rare | 1 in 12.1 | 1/12 |
| Illustration Rare | 1 in 9.1 | 1/9 |
| Special Illustration Rare | 1 in 81.6 | 1/80 |
| Mega Hyper Rare | 1 in 1,047 | 1/1081 |

Note that `pick()` shares a `used` set across a pack, so a single pack can
never contain a duplicate — a deliberate softening of real pack behaviour.

## Card values

`sellValue()` in `js/catalog.js` prefers a per-card `market` number (USD) from
`data/<set>.json` when one is present, converting at `COINS_PER_USD`. Cards
without a market price fall back to the flat rarity table.

## Achievements

`js/achievements.js` holds the table: each row has a `goal`, an `at(ctx)` that
reads progress out of a save, a coin reward, and sometimes a `title`. The worker
imports the same file, so `POST /api/achievements/claim` recomputes progress
server-side and pays out from the table — the client only names which row to
check. Claimed ids live in `profiles.claimed`, and the award titles at the
bottom of `js/titles.js` unlock by reading that list.

## Ambient population

`worker/bots.js` runs a roster of trainer accounts so the lounge is not empty
for the first real visitor. A cron trigger fires `scheduled()` once a minute
and each bot gets at most one action: read the lounge (which is what marks it
online), claim the hourly stack, sell a double, or rip a pack. Every call goes
back through `handleApi()` in-process, so their coins, collections, and titles
are earned through the same checks a browser hits and cost no subrequests.

They are off unless `BOT_SECRET` is bound:

```
wrangler secret put BOT_SECRET     # production
echo BOT_SECRET=anything > .dev.vars   # local, gitignored
```

Editing a persona's avatar, banner, or bio in `ROSTER` reaches accounts that
already exist: `syncLook()` compares a stamp on the `bots` row and re-PATCHes
the profile once when they differ, so a face is not frozen at whatever it was
on the day that bot signed up.

Passwords are HMAC'd from that secret and never stored. Rotating it is safe:
`reclaim()` re-stamps the new hash onto the roster's own rows, so the accounts
and everything they have collected survive. It only ever touches rows flagged
`users.bot`, which never reaches `publicUser()` — a handle collision with a
real trainer leaves that persona offline rather than taking the account over.

Two rules the roster is built around:

- **They only ever answer each other.** No DMs, no friend responses, no
  profile comments, and a bot will not reply to a handle that is not on the
  roster. A busy-looking room is set dressing; an account that holds up its
  end of a conversation is a person being told they made a friend.
- **They never say anything a visitor could check and find false.** Packs
  opened, coins, and the collection are all on the public profile, so chat
  lines assert nothing countable — anything with a number in it goes through
  `MILESTONE_LINES`, which only fire on a value the save actually holds.

`BOT_SETS` excludes sv5–sv10 while that card data and art are being redone,
since a bot's binder and showcase are public.

### Everyone is somebody

Each persona hunts one specific line — Otto is after Metagross, Vic after
Gardevoir — and `chase.sets` names the sets that line is actually printed in,
checked against `data/`, so nobody is chasing a card that cannot drop. That one
field drives most of what a bot does:

- **What it opens.** `pickSet()` reaches for a chase set `CHASE_SET_BIAS` of the
  time, and the choice is made once when a session starts, because someone who
  switches set every minute for an hour is not someone.
- **What it keeps.** Chase card ids are recorded on the `bots` row, and the
  sell branch will not touch them or anything currently on the profile. It
  dumps off the deepest dupe stacks instead, the way anyone clears bulk.
- **What it shows.** `CHASE_SLOTS` of the six showcase slots are held for the
  line it collects; the rest rank by sell value. A Metagross collector leading
  with a Wailord is not a collector.
- **What it says.** `CHASE_LINES` render against the persona's own chase, so
  twelve templates give every bot twelve lines no other bot has. Landing one is
  the only thing it will interrupt itself to talk about, and hearing someone
  else name it is the only thing it will nearly always answer.

`mood` picks which register a bot answers the room in — warm, salty, dry,
hyped, or calm read the same pull very differently — while `chatty` scales how
often it speaks and `stamina` how long it stays.

### No line twice on one screen

The old rule was per-bot: don't repeat yourself within ten lines. That still let
two dozen accounts take turns posting "same" down a single screen, which is the
repetition a regular actually notices. So the rule is now the room's, not the
bot's: `pickFresh()` refuses any line already visible in the lounge, whoever
said it, and returns nothing when the pool is exhausted — a persona with
nothing fresh stays quiet rather than echoing. Over five simulated days and 455
messages the board never repeats a line inside its own window.

### Coins

Bots spend their hourly stack the way a player does, and `TEMPERS` decides
which kind of player. `ripChance()` scales the odds with how many packs the
balance covers, from a floor and toward a ceiling that temper sets, and a saver
refuses to open at all until it is holding a buffer. So a spender's profile is
a big packs-opened count next to nothing in the bank, a saver's is the reverse,
and a flipper churns the dupe pile to fund the chase. Held flat, every bot
earned 100 coins an hour, opened about six packs with it, and grew a balance no
real trainer would sit on — and every profile looked identical doing it.

Balance and the hourly stamp are cached on the `bots` row, because `/api/me`
returns the whole save — every card the bot owns — and that read only gets
more expensive as a collection grows. Responses that already carry a save
refresh the cache instead.

`MAX_ONLINE`, the `TEMPERS` ceilings, and the session timings are the
write-budget knobs. Presence costs one D1 row per bot per minute; a pack rip
costs about 36 once the card, history, and trim writes are counted, which puts
the roster near 50k rows a day. Presence is what fills the online list, and it
is the cheap half.

To empty the roster, drop `BOT_SECRET` first — otherwise the next tick rebuilds
whatever is missing:

```
wrangler d1 execute poke-pack --command "DELETE FROM users WHERE bot = 1"
```

## Known gaps

- Card art is hotlinked from third-party image CDNs.
- The app is a single route — no deep links to a set or the binder.
