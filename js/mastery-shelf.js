/**
 * The mastery shelf on a profile: every set a player has mastered, as a row of
 * seals standing on a ledge, newest first, with how many of the game's sets
 * that is. One self-contained block (css/pages/mastery-shelf.css) the profile
 * page drops into a single slot, for your own page and anyone else's.
 *
 * Pure function, no DOM. It keys off PLAYABLE_SETS, so a set added tomorrow
 * counts in the total and shows its seal the day someone masters it; a set id
 * it does not know (an old save, a retired set) is skipped.
 */
import { PLAYABLE_SETS } from "./catalog.js";
import { isMasteryBanner, masteryEmblemHtml } from "./mastery.js";
import { masteryBannerHtml } from "./mastery-banner.js";

const SET_BY_ID = new Map(PLAYABLE_SETS.map((set) => [set.id, set]));

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const fmt = (n) => Number(n).toLocaleString("en-US");

function seal(set) {
  return `<li class="msh-seal" title="${esc(set.name)} Master">
    ${masteryEmblemHtml(set.id, { size: "lg", name: set.name, label: false })}
    <span class="msh-name">${esc(set.name)}</span>
  </li>`;
}

/**
 * opts:
 *   banner  the banner id the profile has equipped. When it is already a mastery
 *           banner the header shows that art, so the shelf does not repeat it;
 *           otherwise the newest mastered set's banner sits above the seals.
 *   limit   seals shown before "See all" (default 8)
 *   mine    true on your own page: an empty shelf says how to fill it
 * Returns "" when there is nothing to show on someone else's page.
 */
export function masteryShelfProfileHtml(setIds, opts = {}) {
  const seen = new Set();
  const sets = [];
  for (const raw of Array.isArray(setIds) ? setIds : []) {
    const set = SET_BY_ID.get(String(raw));
    if (set && !seen.has(set.id)) {
      seen.add(set.id);
      sets.push(set);
    }
  }
  const total = PLAYABLE_SETS.length;
  if (!sets.length) {
    return opts.mine
      ? `<section class="msh msh-empty" aria-label="Set mastery"><div class="acct-sec-head"><div><h2>Mastery</h2><p>Own every card in a set and claim it for a seal, a title and a banner.</p></div></div></section>`
      : "";
  }
  const newest = sets.slice().reverse();
  const limit = Math.max(1, Math.floor(Number(opts.limit) || 8));
  const shown = newest.slice(0, limit);
  const rest = newest.slice(limit);
  const pct = Math.min(100, (sets.length / total) * 100);
  const showBanner = !isMasteryBanner(opts.banner);
  const banner = showBanner
    ? `<div class="msh-banner">${masteryBannerHtml(newest[0].id, { variant: "wide", className: "msh-art", eager: false })}<p class="msh-cap">Latest: <b>${esc(newest[0].name)}</b></p></div>`
    : "";
  return `<section class="msh" aria-label="Set mastery">
    <div class="acct-sec-head">
      <div>
        <h2>Mastery</h2>
        <p><b>${fmt(sets.length)}</b> of ${fmt(total)} sets mastered</p>
      </div>
    </div>
    <div class="msh-meter" role="img" aria-label="${fmt(sets.length)} of ${fmt(total)} sets mastered"><i style="width:${pct.toFixed(1)}%"></i></div>
    ${banner}
    <ol class="msh-row">${shown.map(seal).join("")}</ol>
    ${
      rest.length
        ? `<details class="qa-fold msh-more"><summary><span>See all ${fmt(sets.length)}</span></summary><ol class="msh-row">${rest.map(seal).join("")}</ol></details>`
        : ""
    }
  </section>`;
}
