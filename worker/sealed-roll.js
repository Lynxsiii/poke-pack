/**
 * What one sealed product holds, and how opening it credits the player.
 *
 * rollSealedProduct is the only place a physical product is rolled: the "Open
 * box" button (openSealed in worker/index.js), a checkout's "open now" lines and
 * an open from the sealed collection all call it once per copy, so a product
 * kept sealed and opened later gives exactly what it would have at purchase.
 *
 * tallyOpened and bestHistory are the pure credit math openPacks has always
 * done (first copy new, promos first, box cards in copies and never pulls, the
 * drought and packs-since-hit run, history's best 24), shared so a checkout of
 * many products counts the same way one box does.
 */
import { PLAYABLE_SETS, RARITY_ORDER, boxCardList, findOffer, offerPackSets } from "../js/catalog.js";
import { drawPromos, isHit, ripPack } from "../js/engine.js";
import { productGear, rollGear } from "../js/gear.js";
import { loadGearCatalog } from "./gear.js";

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * The live set, the offer and its pack groups for `setId`/`productId`, or a 400
 * with the message openSealed has always given. `deps` are the Worker's asset
 * loaders: { loadSealed, loadProducts }.
 */
export async function resolveSealedOffer(env, request, setId, productId, deps) {
  const live = PLAYABLE_SETS.find((item) => item.id === String(setId || ""));
  if (!live) fail("Unknown set.");
  const offer = findOffer(
    (await deps.loadSealed(env, request))[live.id],
    (await deps.loadProducts(env, request))[live.id],
    productId
  );
  if (!offer) fail("That product isn't sold for this set.");
  // A promo product can hold other sets' packs (the SV Black Star Promos'
  // tins and ex boxes); it isn't sold until every one of those sets is live.
  const groups = offerPackSets(offer, live);
  if (!groups) fail("That product's packs aren't open yet.");
  if (groups.some(({ set }) => !set.wrappers.length)) fail("Unknown pack art.");
  return { live, offer, groups };
}

/**
 * Roll one copy of a product: `{ live, offer, packs: [{ set, wrapper, pulls }],
 * promos, boxCards: [{ ...card, n }], gearItems: [{ kind, id }] }`. Wrappers are
 * mixed, the way a real box is. `deps`: { loadSealed, loadProducts, loadSetCards,
 * loadBoxContents, findCatalogCard }. Pass `resolved` (resolveSealedOffer's
 * answer) to skip looking the offer up again for every copy.
 */
export async function rollSealedProduct(env, request, setId, productId, deps, resolved = null) {
  const { live, offer, groups } = resolved || (await resolveSealedOffer(env, request, setId, productId, deps));
  const catalog = await deps.loadSetCards(env, request, live);
  const packs = [];
  for (const { set, count } of groups) {
    const cards = set.id === live.id ? catalog : await deps.loadSetCards(env, request, set);
    for (let i = 0; i < count; i += 1) {
      packs.push({
        set,
        wrapper: set.wrappers[Math.floor(Math.random() * set.wrappers.length)],
        pulls: ripPack(set, cards),
      });
    }
  }
  for (const [key, count] of Object.entries(offer.special || {})) {
    const special = live.specialPacks?.[key];
    if (!special) fail(`Missing special pack ${key}.`, 500);
    for (let i = 0; i < count; i += 1) {
      packs.push({ set: live, wrapper: special.wrapper, pulls: ripPack({ ...live, slots: special.slots }, catalog) });
    }
  }
  const promos = drawPromos(offer).map((id) => {
    const card = catalog.find((item) => item.id === id);
    if (!card) fail(`Missing promo card ${id}.`, 500);
    return { ...card };
  });
  // The sleeves and coins in the box come with it. What they are is decided
  // here, the same way the promo cards are, and saved in the same purchase.
  const gearItems = rollGear(productGear(await loadGearCatalog(env, request), live.id, offer.id));
  // The rest of the box: a battle deck's other cards, an ETB's Energy. Each
  // one is the card of its own set (or a shared basic Energy), owned in
  // copies, and not a pull.
  const contents = (await deps.loadBoxContents(env, request))[`${live.id}/${offer.id}`];
  const boxCards = [];
  for (const { id, n } of boxCardList(contents, promos.map((card) => card.id))) {
    const card = await deps.findCatalogCard(env, request, id);
    if (!card) fail(`Missing box card ${id} for ${offer.id}.`, 500);
    boxCards.push({ ...card, n });
  }
  return { live, offer, packs, promos, boxCards, gearItems };
}

/**
 * Credit math for opening `boxes` ([{ packs: [{ set, wrapper, pulls }], promos,
 * boxCards }]) in order, starting from what the player owns (`qty`,
 * `reverseQty`: card id -> copies) and their current dry run (`run`). Within a
 * box the promos come first (they sit on top of it), then the box's other cards
 * (in copies; only the first can be new), then its packs. `wasNew` runs across
 * every box, so only the first copy of a card in the whole opening is new.
 *
 * Returns the boxes with `cards`/`wasNew` filled in, the owned maps after the
 * opening, `pulled` (pack cards and promos, never box cards), `sinceHit` (-1
 * when nothing hit, else the dry packs after the last hit), `hits`, `fresh`
 * (new pulls and promos), `reverses`, `drought` (the longest dry run, the
 * current one included) and `run` (the dry run after the last pack).
 */
export function tallyOpened(boxes, { qty: ownedQty = {}, reverseQty: ownedReverse = {}, run: startRun = 0 } = {}) {
  const qty = { ...ownedQty };
  const reverseQty = { ...ownedReverse };
  let run = startRun;
  let pulled = 0;
  let sinceHit = -1;
  const tally = { hits: 0, fresh: 0, reverses: 0, drought: 0 };
  const out = boxes.map(({ packs = [], promos = [], boxCards = [] }) => {
    // Promos first: they sit on top of the box, so they are the new copy.
    const promoCards = promos.map((card) => {
      const wasNew = !(qty[card.id] > 0);
      qty[card.id] = (qty[card.id] || 0) + 1;
      return { ...card, reverse: false, wasNew };
    });
    // The box's other cards come in copies; only the first copy can be new.
    const boxOut = boxCards.map((card) => {
      const wasNew = !(qty[card.id] > 0);
      qty[card.id] = (qty[card.id] || 0) + card.n;
      return { ...card, reverse: false, wasNew };
    });
    pulled += promoCards.length;
    tally.fresh += promoCards.filter((card) => card.wasNew).length;
    const opened = packs.map((pack) => {
      const cards = [];
      let hits = 0;
      for (const card of pack.pulls) {
        const wasNew = !(qty[card.id] > 0);
        qty[card.id] = (qty[card.id] || 0) + 1;
        if (card.reverse) reverseQty[card.id] = (reverseQty[card.id] || 0) + 1;
        if (isHit(card)) hits += 1;
        if (wasNew) tally.fresh += 1;
        if (card.reverse) tally.reverses += 1;
        cards.push({ ...card, reverse: Boolean(card.reverse), wasNew });
      }
      tally.hits += hits;
      if (hits > 0) {
        tally.drought = Math.max(tally.drought, run);
        run = 0;
      } else {
        run += 1;
      }
      pulled += cards.length;
      sinceHit = hits > 0 ? 0 : sinceHit < 0 ? sinceHit : sinceHit + 1;
      return { set: pack.set, wrapper: pack.wrapper, cards };
    });
    return { packs: opened, promos: promoCards, boxCards: boxOut };
  });
  return {
    boxes: out,
    qty,
    reverseQty,
    pulled,
    sinceHit,
    hits: tally.hits,
    fresh: tally.fresh,
    reverses: tally.reverses,
    drought: Math.max(tally.drought, run),
    run,
  };
}

/**
 * History only keeps 24 rows, so an opening records its best 24 cards, in pull
 * order: `[{ card, wrapperId }]` over tallyOpened's boxes (promos as "promo").
 */
export function bestHistory(boxes) {
  const rank = (card) => RARITY_ORDER.indexOf(card.rarity) + (card.reverse ? 0 : 0.5);
  const all = boxes.flatMap((box) => [
    ...box.promos.map((card) => ({ card, wrapperId: "promo" })),
    ...box.packs.flatMap((pack) => pack.cards.map((card) => ({ card, wrapperId: pack.wrapper.id }))),
  ]);
  const kept = new Set(
    all
      .map((entry, i) => i)
      .sort((a, b) => rank(all[b].card) - rank(all[a].card) || a - b)
      .slice(0, 24)
  );
  return all.filter((entry, i) => kept.has(i));
}
