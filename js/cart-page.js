/* The /cart page: line list, per-line Open now / Keep sealed, one checkout.

   OWNER: cart agent. Contract: /mnt/project-files/cart-sealed/CONTRACT.md.

   initCart(deps) -> { show(path), hide() }
   deps (wired in js/app.js; ask the lead before adding keys):
     root                 the #view-cart element
     api                  fetch helper (js/api.js), throws ApiError with .status/.message and the JSON body on .data when present
     user()               the signed-in account or null
     coins()              the player's coins
     offerFor(setId, productId)     catalog offer (price, name, packs, ...) or null
     productImage(setId, productId) box photo url or ""
     getSet(setId)        the set record (name, wrappers, ...)
     packPicture(wrap, alt, set)    html for a booster wrapper
     eligible(setId, productId)     cart-eligible offer check (ORDER rules)
     applySave(save)      take a save from the server (updates state and header)
     showOpened(opened, { title })  hand an OpenResult to the batch opener
     navigate(path)       client-side route change
     signIn()             open the sign-in screen
     toast(message)
   The header count badge and add-to-cart controls subscribe to cartStore. */
export function initCart(deps) {
  const { root } = deps;
  return {
    show() {
      root.innerHTML = '<div class="section-head"><div><h2>Cart</h2><p>Coming together.</p></div></div>';
    },
    hide() {},
  };
}
