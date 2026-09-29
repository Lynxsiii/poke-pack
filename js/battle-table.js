/* One battle table (/battles/<id>): lobby, arena, result. Stub: the table agent replaces this. */
export function createTable(ctx) {
  return {
    show(id) { ctx.root.innerHTML = `<div class="bt-stub"><h1>Battle ${id}</h1></div>`; },
    hide() {},
  };
}
