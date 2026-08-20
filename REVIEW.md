# poke-pack.rip — code & product review

Reviewed the whole tree: `index.html`, `css/app.css` (2,218 lines), `js/{app,catalog,engine,state}.js` (~2,750 lines), the set data, and the server log. I also ran it headless at 1440px / 768px / 390px and simulated 200,000 packs against your real engine.

**Overall:** this is genuinely good work. The tear interaction, the foil/glare system, the rarity-pip fidelity, the newest-first roadmap framing — that's a real product, not a toy. The engine is clean and the odds are correct. Most of what follows is about shipping it, not fixing it.

---

## 1. Ship blockers (do these before the domain goes live)

### 1.1 The daily bonus is still on test settings
`js/state.js`:
```js
const DAILY_BONUS = 15000;
/** Testing: 1s cooldown. Restore 24 * 60 * 60 * 1000 when done. */
const DAILY_COOLDOWN_MS = 1000;
```
15,000 coins every second is infinite money — the whole economy is decorative right now. This also leaks into the UI: `renderHeader()` hardcodes the string `"Ready in 1s"`. Pick real numbers before launch (see §3 for what the math says they should be), and make the cooldown label compute from the actual remaining time instead of a literal.

### 1.2 Account and Settings are unreachable on a phone
At 390px the `.nav` is 518px wide. `body { overflow-x: hidden }` hides the overflow rather than fixing it, so the last two nav buttons are clipped off the right edge with no way to scroll to them. The `@media (max-width: 860px)` block sets `.site-header { flex-wrap: wrap }` but never touches `.nav` itself.

Two options — either works:
```css
@media (max-width: 620px) {
  .nav { width: 100%; overflow-x: auto; scrollbar-width: none; justify-content: flex-start; }
  .nav::-webkit-scrollbar { display: none; }
}
```
…or collapse to a bottom tab bar on mobile, which suits this app better. Also: `.home-pack-float` sticks out past the viewport at **both** 390px and 768px (measured `right: 784` on a 768px viewport) — that's what's actually creating the sideways scroll that `overflow-x: hidden` is papering over.

### 1.3 No git repo
There's no `.git`, no `.gitignore`, no README. ~5,000 lines of hand-tuned CSS and animation code with no history is one bad afternoon away from gone. `git init` today. `.gitignore` should cover `server.*.log` and `scripts/.cache/` (122 stale scraped HTML files are sitting in the project dir right now).

### 1.4 Save export with no import
The Account panel says "Download a copy to be safe" and gives you a JSON file — but there is no code path to load it back. Right now that button produces a souvenir, not a backup. Add a file input that validates and merges into `state`, or drop the promise.

### 1.5 Zero SEO / share metadata
A site named **poke-pack.rip** will get pasted into Discord and Twitter constantly, and it currently unfurls as nothing. `<head>` has no description, no Open Graph, no Twitter card, no canonical. Add:
```html
<meta name="description" content="Rip Pokémon TCG booster packs with real printed odds and real card scans. Free, fan-made, no real money." />
<meta property="og:title" content="poke-pack.rip — rip packs, fill the binder" />
<meta property="og:description" content="Real booster odds. Real card scans. No real money." />
<meta property="og:image" content="https://poke-pack.rip/og.png" />
<meta name="twitter:card" content="summary_large_image" />
```
Make the OG image a torn wrapper with a gold hit sliding out. That image *is* your marketing.

### 1.6 Hotlinked third-party image CDNs
Every card face comes live from `images.pokemontcg.io`, plus `images.scrydex.com` and `s3.limitlesstcg.com` for catalog logos. On localhost that's invisible; on a public domain with traffic it's a dependency you don't control — rate limits, hotlink blocking, or a CDN change all break your site silently, and none of those hosts owe you bandwidth. Mirror the card images you actually use to your own storage (you already do exactly this for wrapper art via `scripts/crop_base1_packs.py`), or put a caching proxy in front. At minimum add an `onerror` fallback to a placeholder so a dead CDN degrades instead of showing broken frames.

---

## 2. Bugs and correctness

**`state.reverses` is write-only.** `addPull` increments it, nothing ever decrements it. So once you pull any reverse of a card, `withOwnedFoil()` renders *every* copy you own as a reverse forever — including after you `sellOne()` the reverse away. Track counts of both prints, or accept it and drop the reverse flag from the binder.

**`sellOne` can't sell your last copy, by design — but nothing says so.** The button just doesn't render at `count === 1`, which reads as a bug to a player who wants to dump a duplicate-free common. Either allow it with a confirm, or add a one-line note in the binder.

**`esc()` doesn't escape single quotes**, and its output goes straight into a single-quoted CSS url:
```js
style="--art:url('${esc(src)}')"
```
Your data is self-generated so this isn't a live XSS, but the day a card name or an image path contains `'`, that style silently breaks. Add `.replaceAll("'", "&#39;")`.

**`setInterval(renderHeader, 250)` runs forever**, rewriting five DOM nodes four times a second for the entire session — purely to tick down a daily cooldown label. Once the cooldown is 24h, drive it with a single `setTimeout` scheduled to the exact unlock moment.

**Focus rings are removed without replacement** in a few places — `.tear-handle:focus { outline: none }` and line 777. Elsewhere you do use `:focus-visible` properly, so this is inconsistency rather than intent. Keyboard players currently can't see where they are on the pack.

**The overlays aren't dialogs.** `#overlay` and `#inspect` have no `role="dialog"`, no `aria-modal`, no focus trap, and no focus return on close. Tab from an open pack and you land in the header nav behind it. This is a ~15-line fix and it's the single biggest accessibility gap.

---

## 3. Game balance — what the simulation says

I ran 200,000 packs through your actual `ripPack()`:

| Pull | Simulated | Your advertised odds |
|---|---|---|
| Double Rare | 1 in 4.7 | 1/5 |
| Ultra Rare | 1 in 12.1 | 1/12 |
| Illustration Rare | 1 in 9.1 | 1/9 |
| Special Illustration Rare | 1 in 81.6 | 1/80 |
| Mega Hyper Rare | 1 in 1,047 | 1/1081 |

**Your odds are honest.** That's the whole promise of the site and it holds up — worth saying out loud somewhere prominent, because it's your differentiator against every other pack sim.

The economy is where it gets interesting:

- Average sell value of a pack: **229.8 coins**. Pack cost: **250**. So liquidating everything loses ~8% — a correct, gentle sink. Good design.
- But: **925 packs to complete Pitch Black** in a single run = **231,250 coins**.

Once you restore a real 24-hour cooldown, that number is the whole game. A 500/day bonus means 460 days to finish one set. A 2,500/day bonus means ~92 days per set — still long, and there are 40+ sets on the roadmap. Right now the *only* coin faucet is the daily and the only sink is packs, so the entire pacing of your product rests on one constant.

Some faucets worth considering, roughly in order of how much they'd help:
- **Completion bounties.** Finishing a rarity tier, or the base 84-card set, pays out. Turns the binder from a progress bar into a goal.
- **Duplicate auto-sell.** A "sell all duplicates" button in the binder — right now dumping extras is a per-card click across 128 slots.
- **First-pull bonus.** Small coin reward the first time you see each card. Rewards early play when you're poorest, tapers naturally.
- **Streak multiplier** on the daily, capped. Cheap retention.

Also worth deciding deliberately: `pick()` uses a shared `used` set, so **a pack can never contain a duplicate**. Real packs can. It makes completion meaningfully faster than reality — fine as a kindness, but it's a silent departure from "real booster math," which is your stated pitch.

---

## 4. Performance

- **The binder re-renders on every keystroke.** `els.search` fires `input` → `renderCollection()` → full `innerHTML` rebuild of 128 `<article>` elements, each with an `<img>`. It's survivable at 128. Ascended Heroes on your roadmap is **295 cards**, and Cosmic Eclipse is 270+. Debounce the search by ~150ms, and consider swapping the filter to a class toggle on already-rendered nodes rather than a rebuild.
- **No `loading="lazy"` on binder card images.** You do it correctly in `catalogCard()` — just not in the binder, where it matters most. All 128 images request immediately.
- **No `width`/`height` on card `<img>`s**, so every grid shifts as images arrive. Cards are a fixed 5:7 aspect — set it explicitly.
- **68KB of CSS and 72KB of JS, unminified and uncompressed**, plus ~98KB of JSON per set. `py -m http.server` sends none of it gzipped and sets no cache headers. Any real static host (Cloudflare Pages, Netlify, Vercel) fixes this for free and would cut first paint substantially.

---

## 5. Product gaps — the ones I'd actually build

**Sound.** This is the biggest one and it's not close. You've built a tactile drag-to-tear interaction with crumbs, a peeling flap, and a hinge that tracks the tear front — and it is completely silent. The foil crinkle, the paper tear, the card slide, a rising tone on a hit. A pack sim without audio is missing half the experience. Add `navigator.vibrate()` on the tear for mobile while you're in there. (Gate it behind a mute toggle in Settings, default on.)

**URLs don't change.** The whole app is one route. You can't link someone to your binder, bookmark the Catalog, or hit the back button to leave a view — and back-from-overlay is the #1 thing mobile users will try. Hash routing would take an hour: `#/binder`, `#/packs/me5`. This also unlocks sharing, which unlocks growth.

**Nothing is shareable.** You built a spread screen that says "Gold Mega Hyper Rare. That's the one." and then offers no way to show anyone. A "share this pull" button that renders the spread to a canvas image is the single highest-leverage growth feature you could add — every good pull becomes a post with your domain on it.

**Pack odds are hardcoded twice.** `HOME_ODDS` in `app.js` duplicates what's already in `liveSet.oddsLine` and the slot tables. When you add set #3 the home page will quietly show Pitch Black's numbers. Derive it from `liveSet.slots`.

**The roadmap is 40+ sets of `cards: "—"`.** Ambitious, and the newest-first framing is a genuinely good hook. But the data pipeline is the real work, and `scripts/build_me4.py` + `enrich_me4.py` are per-set scripts. Generalizing those into one parameterized builder is what makes set #3 through #40 tractable.

---

## 6. Smaller things

- `renderCatalog()` reserves index 0 of `ROADMAP` for live sets — an implicit coupling that will break when a live set isn't in the newest era.
- `LIVE_SET` is exported from `catalog.js` and never imported anywhere.
- The `packTrick` field is carried through legacy save migration but is unused everywhere else.
- `boot()` preloads `liveSet.cardBack` but nothing else; preloading the four wrapper AVIFs would make the first rip feel instant.
- `prefers-reduced-motion` only disables three float animations. The tear, flip, spark burst, and foil shimmer all still run — that's most of the motion on the site.
- No `<noscript>`. A JS-disabled visitor gets a blank page.
- Add a `favicon.ico` — your log shows 10 straight 404s for it.

---

## Suggested order

1. Restore the real daily cooldown and pick actual economy numbers (§1.1, §3)
2. `git init` + `.gitignore` (§1.3)
3. Fix mobile nav and the two overflow sources (§1.2)
4. OG tags + favicon (§1.5)
5. Sound (§5)
6. Self-host card images (§1.6)
7. Hash routing + share-a-pull (§5)
8. Dialog semantics and focus trapping (§2)
