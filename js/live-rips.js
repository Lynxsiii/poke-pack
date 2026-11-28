/**
 * Home's "Live rips": the newest big pulls and Black Label slabs from every
 * trainer who shares them, as a row you swipe. GET /api/rips/live
 * (worker/live-rips.js) is the same feed our Discord gets, so a trainer who
 * turned sharing off in Settings is in neither. Only a handle and a card show.
 *
 * The row asks again every minute while Home is on screen; a pull that was not
 * there last time slides in at the front.
 */

const REFRESH_MS = 60_000;

/** "now", "4m", "3h", "2d": how long ago, short enough for a tile. */
export function agoWords(at, now = Date.now()) {
  const diff = Math.max(0, now - (Number(at) || 0));
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

/** The small scan beside a card's big one (assets/cards/<set>/<n>.webp has <n>-sm.webp). */
export const smallImage = (path) =>
  /^assets\/cards\/.+\.webp$/.test(path || "") && !/-sm\.webp$/.test(path) ? path.replace(/\.webp$/, "-sm.webp") : path || "";

export function initLiveRips(deps) {
  const { root, esc, coinAmount, coinText, toCoins, openCard, load, onScreen } = deps;
  let rips = null;
  let seen = new Set();
  let asked = 0;
  let timer = 0;

  const tileHtml = (rip, i, fresh) => {
    const black = rip.kind === "blacklabel";
    const coins = toCoins(rip.card.price);
    const what = black ? "graded a Black Label 10" : "pulled";
    const said = `@${rip.handle} ${what} ${rip.card.name}${rip.card.set ? `, ${rip.card.set}` : ""}, ${coinText(coins)} coins`;
    const big = rip.card.image || "";
    return `<button type="button" class="lr-tile${black ? " is-black" : ""}${fresh ? " is-new" : ""}" style="--i:${i}" data-rip-card="${esc(rip.card.id)}" aria-label="${esc(said)}">
        <span class="lr-art"><img src="${esc(smallImage(big))}" data-full="${esc(big)}" alt="" loading="lazy" decoding="async" /></span>
        <span class="lr-body">
          <span class="lr-who"><b>@${esc(rip.handle)}</b><time>${esc(agoWords(rip.at))}</time></span>
          <span class="lr-card">${black ? `<i class="lr-bl">Black Label</i>` : ""}${esc(rip.card.name)}</span>
          <span class="lr-meta"><span class="lr-price">${coinAmount(coins)}</span>${rip.more ? `<span class="lr-more">+${rip.more} more</span>` : rip.card.set ? `<span class="lr-set">${esc(rip.card.set)}</span>` : ""}</span>
        </span>
      </button>`;
  };

  function draw() {
    if (!root) return;
    if (!rips?.length) {
      root.hidden = true;
      root.innerHTML = "";
      return;
    }
    const first = !root.querySelector(".lr-row");
    root.hidden = false;
    root.innerHTML = `<header class="lr-head"><h2 id="home-rips-h"><i class="lr-dot" aria-hidden="true"></i>Live rips</h2></header>
      <div class="lr-row" role="group" aria-labelledby="home-rips-h">${rips.map((rip, i) => tileHtml(rip, i, !first && !seen.has(rip.id))).join("")}</div>`;
    seen = new Set(rips.map((rip) => rip.id));
  }

  function refresh() {
    asked = Date.now();
    return load()
      .then((data) => {
        const list = Array.isArray(data?.rips) ? data.rips.filter((rip) => rip?.card?.id && rip.handle) : [];
        const same = rips && list.length === rips.length && list.every((rip, i) => rip.id === rips[i].id);
        rips = list;
        // Nothing new: leave the row alone (and where the player swiped it to), only the times move on.
        if (same && root.querySelector(".lr-row")) {
          root.querySelectorAll(".lr-who time").forEach((el, i) => (el.textContent = agoWords(rips[i].at)));
        } else draw();
      })
      .catch(() => {
        if (!rips) rips = [];
      });
  }

  /** Called whenever Home is drawn: shows what is known and asks again when that is a minute old. */
  function render() {
    if (!root) return;
    if (rips) draw();
    if (Date.now() - asked >= REFRESH_MS) refresh();
    if (!timer) {
      timer = window.setInterval(() => {
        if (onScreen() && Date.now() - asked >= REFRESH_MS) refresh();
      }, REFRESH_MS / 4);
    }
  }

  root?.addEventListener("click", (event) => {
    const tile = event.target.closest("[data-rip-card]");
    if (tile) openCard(tile.dataset.ripCard);
  });
  // A card with no small scan: fall back to the big one, once.
  root?.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img?.tagName === "IMG" && img.dataset.full && img.getAttribute("src") !== img.dataset.full) img.src = img.dataset.full;
    },
    true
  );

  return { render };
}
