/* Cart store: the lines a player has put in their cart, kept in localStorage.

   OWNER: cart agent. The contract is /mnt/project-files/cart-sealed/CONTRACT.md.

   A line is { setId, productId, qty }; prices are never stored (they are read
   from the loaded catalog each time). One cart per account:
   `pokepack.cart.v1.<userId>`. Reads and writes are wrapped in try/catch, so
   the page works with storage blocked.

   Exports the app and the pages share (keep these names):
     cartStore.setUser(userId | null)       switch accounts (the cart follows the account)
     cartStore.lines()                      [{ setId, productId, qty }]
     cartStore.count()                      total products (sum of qty)
     cartStore.qty(setId, productId)        0 when not in the cart
     cartStore.add(setId, productId, n = 1) clamps to ORDER_LIMITS
     cartStore.setQty(setId, productId, n)  0 removes
     cartStore.remove(setId, productId)
     cartStore.clear()
     cartStore.subscribe(fn)                fn() on any change (also from another tab); returns unsubscribe */
export const cartStore = {
  setUser() {},
  lines: () => [],
  count: () => 0,
  qty: () => 0,
  add() {},
  setQty() {},
  remove() {},
  clear() {},
  subscribe: () => () => {},
};
