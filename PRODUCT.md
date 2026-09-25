# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Pokémon TCG collectors and fans who want to open virtual boosters, chase specific cards, and keep a collection without spending real money. Players return to collect across sets, display cards, and talk with other people on the site.

## Product Purpose
poke-pack.rip is a free, fan-made pack simulator. Its central experience is choosing a printed expansion, opening a booster, seeing the cards one by one, and keeping or selling pulls to build a binder. This overhaul prioritizes making that opening journey immediate, satisfying, and easy to navigate.

## Positioning
The simulator pairs set-specific printed pull odds with real card scans and market-derived values while using only virtual coins and no checkout.

## Operating Context
Players use the site on desktop and mobile web. They browse expansions, spend virtual coins on packs, inspect reveals, manage bulk and binder pages, complete quests, and use on-site social features. The existing site is a static ES-module frontend served by a Cloudflare Worker with D1 account and progress data.

## Capabilities and Constraints
Preserve existing accounts, owned cards, binder pages, pull history, coins, and other saved progress. Preserve card data, set-specific odds, and the no-real-money model. The site has pack, collection, binder, catalog, account, quests, social, notes, and settings areas. Keep English copy and the card foil effects. Current player feedback also asks for booster-box and ETB opening, more sets, and a better reveal interaction; those requests inform prioritization but are not promises to invent unavailable printed products or card data.

## Brand Commitments
Keep the poke-pack.rip name and its fan-made Pokémon TCG identity. Existing logos, pack art, card scans, and foil treatments are real assets to use where appropriate; the existing layout and palette are open to redesign.

## Evidence on Hand
Set metadata and card data are in `js/catalog.js` and `data/`; pack art and site marks are in `assets/`; pull-rate logic is in `js/engine.js`; account and progress logic is in `worker/` and `js/state.js`. Player feedback came from the site's chat and a private feedback thread the owner authorized reading. No real-money pricing or purchase flow exists.

## Product Principles
- Put a playable pack within reach of a new visitor immediately.
- Make each pull legible and exciting without obscuring the card itself.
- Make progress and next actions clear after every opening.
- Preserve player trust in odds, values, and saved collections.
