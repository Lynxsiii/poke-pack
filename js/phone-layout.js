/**
 * Phone layout helpers (css/pages/phone.css). On a phone the Collection's two
 * filter rows live in a sheet behind one Filter key, and Sell duplicates sits
 * beside the card count. The rows themselves are moved, not copied, so the
 * handlers in js/app.js keep working; a wider screen gets them back in place.
 */
const phone = window.matchMedia("(max-width: 640px)");

function setupCollection() {
  const view = document.getElementById("view-collection");
  const filters = view?.querySelector(".coll-filters");
  const tools = filters?.querySelector(".coll-tools");
  const hud = view?.querySelector(".coll-hud");
  const sort = document.getElementById("coll-sort");
  const note = document.getElementById("binder-note");
  const foot = document.getElementById("coll-hud-foot");
  const owned = document.getElementById("owned-filter");
  const groups = document.getElementById("rarity-groups");
  const rarities = document.getElementById("rarity-filter");
  if (!filters || !tools || !hud || !sort || !note || !foot || !owned || !groups || !rarities) return;

  const key = document.createElement("button");
  key.type = "button";
  key.className = "coll-filter-key";
  key.setAttribute("aria-haspopup", "dialog");
  key.setAttribute("aria-expanded", "false");
  key.innerHTML = "<span>Filter</span><i></i>";
  tools.insertBefore(key, sort);

  const dim = document.createElement("div");
  dim.className = "ph-dim";
  dim.hidden = true;
  const sheet = document.createElement("div");
  sheet.className = "ph-sheet";
  sheet.id = "coll-sheet";
  sheet.hidden = true;
  sheet.tabIndex = -1;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Filter cards");
  sheet.innerHTML =
    '<span class="ph-sheet-grab" aria-hidden="true"></span><h3>Show</h3><h3>Rarity</h3><button type="button" class="solid ph-sheet-done">Done</button>';
  const [showHead, rarityHead] = sheet.querySelectorAll("h3");
  const done = sheet.querySelector(".ph-sheet-done");
  document.body.append(dim, sheet);

  const noteRow = document.createElement("div");
  noteRow.className = "coll-noterow";

  const isOpen = () => !sheet.hidden;
  function close(refocus = true) {
    if (!isOpen()) return;
    sheet.hidden = true;
    dim.hidden = true;
    document.documentElement.classList.remove("ph-locked");
    key.setAttribute("aria-expanded", "false");
    if (refocus) key.focus({ preventScroll: true });
  }
  function open() {
    sheet.hidden = false;
    dim.hidden = false;
    document.documentElement.classList.add("ph-locked");
    key.setAttribute("aria-expanded", "true");
    sheet.focus({ preventScroll: true });
  }
  key.addEventListener("click", () => (isOpen() ? close() : open()));
  dim.addEventListener("click", () => close());
  done.addEventListener("click", () => close());
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // The key counts the filters that are on; the sheet's key says how many cards they leave.
  function paint() {
    const on = [
      [owned, "owned"],
      [groups, "group"],
      [rarities, "rarity"],
    ].filter(([host, name]) => {
      if (host.hidden) return false;
      const pressed = host.querySelector('[aria-pressed="true"]');
      return pressed && pressed.dataset[name] && pressed.dataset[name] !== "all";
    }).length;
    key.querySelector("i").textContent = on ? String(on) : "";
    key.setAttribute("aria-label", on ? `Filter, ${on} on` : "Filter");
    const count = /^\s*([\d,.]+)\s+cards?\b/i.exec(note.textContent || "");
    done.textContent = count ? `Show ${count[1]} ${count[1] === "1" ? "card" : "cards"}` : "Done";
  }
  const watch = new MutationObserver(paint);
  for (const host of [owned, groups, rarities])
    watch.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed", "hidden"] });
  watch.observe(note, { childList: true, characterData: true, subtree: true });

  function place() {
    if (phone.matches) {
      showHead.after(owned);
      rarityHead.after(groups, rarities);
      if (!noteRow.isConnected) note.before(noteRow);
      noteRow.append(note, foot);
      key.hidden = false;
    } else {
      close(false);
      filters.insertBefore(owned, tools);
      filters.insertBefore(groups, tools);
      filters.insertBefore(rarities, tools);
      if (noteRow.isConnected) {
        noteRow.before(note);
        noteRow.remove();
      }
      hud.append(foot);
      key.hidden = true;
    }
    paint();
  }
  phone.addEventListener("change", place);
  place();

  // Leaving the page closes the sheet.
  new MutationObserver(() => {
    if (isOpen() && document.body.dataset.view !== "collection") close(false);
  }).observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
}

setupCollection();

// Trades: "How trades work" folds shut on a phone; its heading opens it.
document.addEventListener("click", (e) => {
  if (!phone.matches) return;
  const head = e.target.closest(".trades-view .tr-rules .plate-head");
  if (head) head.closest(".tr-rules").classList.toggle("is-open");
});

// Your picture sits in the middle of the tab bar on a phone, where the thumb
// rests, and opens the menu from there. It goes back to the top bar on wider screens.
{
  const me = document.getElementById("hud-me");
  const bar = document.querySelector("nav.tabbar");
  const rip = document.getElementById("tab-rip");
  const head = document.querySelector(".site-header .header-right");
  if (me && bar && rip && head) {
    const place = () => {
      if (phone.matches) { if (me.parentElement !== bar) bar.insertBefore(me, rip); }
      else if (me.parentElement !== head) head.prepend(me);
    };
    phone.addEventListener("change", place);
    place();
  }
}
