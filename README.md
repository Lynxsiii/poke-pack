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
css/app.css           all styling, including the classic foil and pack-tear visuals
css/holo/             the holofoil engine, derived from pokemon-cards-css
js/app.js             views, rendering, the tear interaction, reveal flow
js/catalog.js         set definitions, rarity tables, sell values, roadmap
js/engine.js          pack generation — slot tables and pull odds
js/state.js           localStorage save, coins, daily bonus, collection
js/achievements.js    achievement table, progress, and claim rewards
js/titles.js          titles, including the ones an achievement hands over
worker/bots.js        the ambient roster and its once-a-minute tick
worker/llm.js         the roster's written voice, via NVIDIA NIM
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

## Card effects

Two foil engines ship, switched in Settings → Card effects and by a body
class:

- **Holo** (`body.fx-holo`, `css/holo/`) is derived from
  [pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css). This
  is why the project is GPL-3 — see [NOTICE.md](NOTICE.md).
- **Classic** (`body.fx-classic`, the `.tcg` rules in `css/app.css`) is the
  original per-rarity system. Untouched, and kept because it reads the printed
  holo windows more literally.

Holo uses the upstream glitter and VMAX surface textures from
`assets/foil/reference/`. Double Rares use the star foil in `ex-stars.svg`;
Reshiram and Victini have pearl and red-metal finishes in `finishes.css`.
The older gradients and generated etch maps are restricted to Classic mode.
Holo gets only printed-window geometry from `windows.css`, so the old radial
engraving and glint animation cannot paint over the new materials.
Touch release clears the interaction; reduced-motion mode keeps the light
but removes tilt and spring animation.

The difference that matters is not in the gradients — both use the same family
of counter-tracked bars under `color-dodge`. It is that Holo runs the pointer
through a **damped spring** (`Spring` in `js/app.js`, stiffness 0.066, damping
0.25, matching svelte/motion's integrator) before it reaches the CSS
variables. Reading the pointer straight, which is what Classic does and what
this file used to do everywhere, pins the highlight to the cursor exactly, and
a highlight that cannot lag or overshoot reads as a texture sliding under
glass rather than light moving on foil. The release uses a looser spring
(0.01 / 0.06) so a card drifts home instead of snapping. The overshoot is the
point; it is not a bug to damp out.

Rarity mapping is in the header of `css/holo/rarities.css`. Upstream is built
for Sword & Shield rarity names, so each effect is matched to the printing it
most resembles rather than to a name.

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

Passwords are HMAC'd from that secret and never stored. Rotating it is safe:
`reclaim()` re-stamps the new hash onto the roster's own rows, so the accounts
and everything they have collected survive. It only ever touches rows flagged
`users.bot`, which never reaches `publicUser()` — a handle collision with a
real trainer leaves that persona offline rather than taking the account over.

Each persona carries its own pool of idle lines — 192 across the roster, none
shared — and a recent list on the `bots` row keeps a bot off anything it said
lately. Hit and milestone lines are tracked by template rather than by text,
since they interpolate a card name and would otherwise repeat their shape.
Bots answer each other, picked by the `kind` the other bot last posted, and
they befriend each other so profiles do not all read "0 friends".

`say()` waits a random moment before posting: the cron fires on the same
second every minute, so without it every message in the lounge landed in the
same six-second band while real trainers scatter across the minute.

Two rules the roster is built around:

- **They can answer visitors.** Online bots can reply in the lounge, accept incoming friend requests, and answer friends-only DMs. Outgoing friend requests stay within the roster. AI replies are bounded and omitted if generation fails.
- **They never say anything a visitor could check and find false.** Packs
  opened, coins, and the collection are all on the public profile, so chat
  lines assert nothing countable — anything with a number in it goes through
  `milestoneLine()`, which only fires on a value the save actually holds.

`BOT_SETS` excludes sv5–sv10 while that card data and art are being redone,
since a bot's binder and showcase are public.

### Written voice

`worker/llm.js` writes the lines, via NVIDIA NIM's OpenAI-compatible endpoint.
It is off unless `NVIDIA_API_KEY` is bound, and every function in it returns
null on a bad key, a timeout, or a refusal — the pools in `bots.js` are the
fallback, so the lounge never goes quiet because a third party had a bad
minute. Keys are free from build.nvidia.com and start with `nvapi-`.

```
wrangler secret put NVIDIA_API_KEY          # production
echo NVIDIA_API_KEY=nvapi-... >> .dev.vars  # local, gitignored
```

`NVIDIA_MODEL` overrides the default (`nvidia/nemotron-3-ultra-550b-a55b`). `NVIDIA_FALLBACK_MODEL` overrides the retry model (`nvidia/nemotron-3-super-120b-a12b`).

Idle chatter is **batched**: one call writes a dozen lines for a persona into
`bots.line_pool`, and each message shifts one off, so the common case costs no
request. Pulls and replies are generated live, because they are the only two
with a real subject — a bot naming the card it just opened is most of why the
room reads as people. Bios are rewritten every few days.

Three budgets keep a tick inside its minute: `MAX_LIVE_PER_TICK` caps
completions across the whole roster, `MAX_REFILL_PER_TICK` allows one batch,
and an eleven-second timeout bounds each request. Transient failures retry once on the fallback model; the tick stops starting AI work after its twenty-second budget.

Generated lines are cleaned of preambles and speaker labels, checked for length, and checked against cached stats for numeric claims. The prompt supplies site facts to visitor replies. These checks reduce bad output but do not guarantee every generated statement is correct.

Run `node scripts/test-bot-voice.mjs` for mocked service-failure, output-cleaning, stats, and visitor-reply regression checks.

Repetition is tracked room-wide, not just per bot. A tick carries a `said` set
of lines and a `tags` set of template shapes; every bot reads both before
picking and writes to them after posting. Without it the per-bot list only
stopped an account repeating *itself*, and twenty-four accounts drawing on
sixteen hit templates still landed "selling doubles to fund the next one"
three times in forty messages. Shapes are seeded from the last `ROOM_VOICES`
speakers rather than every row's whole history — seed it from everything and
the set covers all sixteen shapes at once, and the filter silently stops
filtering.

Bots spend their hourly stack the way a player does. `ripChance()` scales the
odds with how many packs the balance covers, so one fresh off the bonus opens
most minutes and one down to its last coins slows to a trickle — about sixteen
packs out of a 100-coin stack. Left flat they earned far more than they spent,
and a public profile showing a big balance beside a low packs-opened count is
the sort of mismatch that reads as fake.

Balance and the hourly stamp are cached on the `bots` row, because `/api/me`
returns the whole save — every card the bot owns — and that read only gets
more expensive as a collection grows. Responses that already carry a save
refresh the cache instead.

`MAX_ONLINE`, `RIP_CEIL`, and the session timings are the write-budget knobs.
Presence costs one D1 row per bot per minute; a pack rip costs about 36 once
the card, history, and trim writes are counted, which puts the roster near
50k rows a day. Presence is what fills the online list, and it is the cheap
half.

To empty the roster, drop `BOT_SECRET` first — otherwise the next tick rebuilds
whatever is missing:

```
wrangler d1 execute poke-pack --command "DELETE FROM users WHERE bot = 1"
```

## Known gaps

- Card art is hotlinked from third-party image CDNs.
- The app is a single route — no deep links to a set or the binder.

### Collector identities and responsiveness

The roster targets six online collectors (up to twelve), with 45–100 minute sessions and shorter breaks. Visitor chat and DMs run in a first pass before ambient activity. Replies receive recent conversation context; named questions stay with the named collector and empty acknowledgements are rejected. Scheduled replies normally arrive on the next minute tick, subject to model availability.

`worker/personalities.js` defines each favourite Pokémon, evolution family, voice and profile bio. Pack choices use sets containing that family. A versioned profile refresh rebuilds showcases from owned cards, preferring favourites and family members over market value; it never grants cards. Ambient chat is capped at two messages and pack opening at one pack per tick to contain noise and database writes.
