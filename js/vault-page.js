/* The Sealed collection page (/bulk/sealed): kept sealed product, open later.

   OWNER: sealed collection agent. Contract: /mnt/project-files/cart-sealed/CONTRACT.md.

   initVault(deps) -> { show(path), hide(), tabsHtml(active) }
     tabsHtml("cards" | "sealed") returns the "Cards / Sealed (N)" strip the
     Collection page also draws (words with an ink line, not pills).
   deps (wired in js/app.js; ask the lead before adding keys):
     root                 the #view-vault element
     api                  fetch helper (js/api.js)
     user()               the signed-in account or null
     kept()               save.vaultKept (total kept sealed products)
     offerFor(setId, productId), productImage(setId, productId), getSet(setId), packPicture(wrap, alt, set)
     applySave(save)      take a save from the server
     showOpened(opened, { title })  hand an OpenResult to the batch opener
     navigate(path), signIn(), toast(message), coin(n) -> "1,234.50" */
export function initVault(deps) {
  const { root } = deps;
  return {
    show() {
      root.innerHTML = '<div class="section-head"><div><h2>Sealed collection</h2><p>Coming together.</p></div></div>';
    },
    hide() {},
    tabsHtml: () => "",
  };
}
