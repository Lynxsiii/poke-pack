/* The battles hall (/battles) and the builder (/battles/new). Stub: the hall agent replaces this. */
export function createHall(ctx) {
  return {
    show(mode) { ctx.root.innerHTML = `<div class="bt-stub"><h1>Pack battles</h1><p>${mode}</p></div>`; },
    hide() {},
  };
}
