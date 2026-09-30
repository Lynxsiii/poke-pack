/* Pack battles: the router.

   /battles        the hall: live tables, open lobbies, quick battle (js/battle-hall.js)
   /battles/new    the builder, also in the hall module
   /battles/<id>   the table: lobby, reveal arena and result (js/battle-table.js),
                   which hands each round to the reveal engine (js/battle-reveal.js)

   The server owns every pull, balance and award (worker/battles.js). These
   modules only present what it returns. */
import { createHall } from "./battle-hall.js?v=1";
import { createTable } from "./battle-table.js?v=2";

const ID_ROUTE = /^\/battles\/([a-zA-Z0-9-]{1,80})$/;

export function initBattles(deps = {}) {
  const root = deps.root;
  if (!root) return { show() {}, hide() {}, path: "/battles" };
  root.classList.add("battle-view");

  // One server clock for the whole feature: reveals are timed by the server.
  let offset = 0;
  const clock = {
    now: () => Date.now() + offset,
    sync(serverNow) {
      if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
    },
  };
  const motion = () =>
    deps.settings?.()?.motion !== false &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !document.body.classList.contains("no-motion");

  const ctx = { ...deps, root, clock, motion, navigate: (path) => deps.navigate?.(path) };
  const hall = createHall(ctx);
  const table = createTable(ctx);
  let route = "";
  let visible = false;

  function show(path = "/battles") {
    const next = path.replace(/\/$/, "") || "/battles";
    if (visible && route === next) return;
    const was = route;
    route = next;
    visible = true;
    const id = next.match(ID_ROUTE)?.[1];
    if (id && id !== "new") {
      if (!ID_ROUTE.test(was) || was === "/battles/new") hall.hide();
      table.show(id);
    } else {
      table.hide();
      hall.show(next === "/battles/new" ? "builder" : "list");
    }
    document.body.classList.toggle("on-battle-table", Boolean(id && id !== "new"));
  }

  function hide() {
    visible = false;
    route = "";
    hall.hide();
    table.hide();
    document.body.classList.remove("on-battle-table");
  }

  return { show, hide, path: "/battles" };
}
