/* Batch opening: the combined results of an order, and a way to watch it pack by pack.

   OWNER: batch opening agent. Contract: /mnt/project-files/cart-sealed/CONTRACT.md.

   initBatchOpen(deps) -> { show(opened, { title, onClose }), hide() }
     opened = OpenResult (see the contract): slim cards, boxes[], totals.
   deps (wired in js/app.js; ask the lead before adding keys):
     root                 the #batch-open element (a full-screen layer)
     findCard(id)         full card record once its set is loaded
     loadSetData(set)     fetch a set's cards (js/app.js); getSet(setId) resolves ids
     getSet(setId), setForCard(card)
     cardFace(card, opts) holo face html (tcgFace)
     inspect(card)        open the card inspector
     sellValue(card)      market sell value of a card
     playBox(box, { onDone })   run the normal pack-by-pack opening for one box of the order
     coin(n), toast(message), navigate(path) */
export function initBatchOpen(deps) {
  const { root } = deps;
  return {
    show(opened) {
      root.classList.remove("hidden");
      root.textContent = `Opened ${opened?.totals?.products ?? 0} products.`;
    },
    hide() {
      root.classList.add("hidden");
      root.textContent = "";
    },
  };
}
