/**
 * The Social page is one place with a row of words across the top: your
 * friends and messages, the rankings, and the lounge (who's on and the global
 * chat). Each word is a plain link, so a new section is one more entry here.
 */
export const SOCIAL_TABS = [
  { key: "friends", label: "Friends", href: "/social" },
  { key: "rankings", label: "Rankings", href: "/rankings" },
  { key: "lounge", label: "Lounge", href: "/lounge" },
];

/** The path a social sub-page lives at, or "" when the path is not one. */
export function socialTabFromPath(path) {
  if (path === "/rankings" || path === "/leaderboard" || path === "/leaderboards") return "rankings";
  if (path === "/lounge" || path === "/chat") return "lounge";
  if (path === "/social" || /^\/social\/[a-z0-9_]{3,16}$/i.test(path)) return "friends";
  return "";
}

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/** The page head: the title, then the words. `extra` is any count to show after a word ({ friends: 2 }). */
export function hubHeadHtml(active, extra = {}) {
  const words = SOCIAL_TABS.map((tab) => {
    const on = tab.key === active;
    const count = Number(extra[tab.key]) || 0;
    return `<a class="hub-word${on ? " on" : ""}" href="${esc(tab.href)}"${on ? ` aria-current="page"` : ""}>${esc(tab.label)}${
      count ? ` <b class="hub-count" aria-label="${count} new">${count > 99 ? "99+" : count}</b>` : ""
    }</a>`;
  }).join("");
  return `<div class="hub-head">
    <h2 class="page-title">Social</h2>
    <nav class="hub-words" aria-label="Social">${words}</nav>
  </div>`;
}
