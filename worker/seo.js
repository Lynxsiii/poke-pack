/**
 * What search engines and link previews see.
 *
 * Chat apps (Discord, iMessage, X, WhatsApp) build a link's preview from the
 * HTML they fetch and never run the app, so every address used to show the
 * home page's title and image. Here the Worker writes the head of index.html
 * for the addresses worth sharing:
 *
 *   /packs/<set>   that set's name, blurb and its own 1200x630 image
 *                  (assets/og/sets/<set>-v2.jpg, scripts/make_og_sets.mjs)
 *   /pull/<card>   a pull someone shares: the card's scan, its rarity, set and
 *                  value, and "@handle pulled ..." when the link carries ?by=
 *   /u/<handle>    a trainer's profile, with their first showcase card
 *
 * It also answers /robots.txt, /sitemap.xml and /manifest.webmanifest, which
 * used to fall through to the home page with a 200.
 *
 * The page itself is unchanged: the app still routes on the client.
 */
import { ALL_SETS, PLAYABLE_SETS, RARITY_LABEL, sellValue, money } from "../js/catalog.js";
import { canPullReverse } from "../js/engine.js";

export const SITE = "https://poke-pack.rip";
const SITE_NAME = "poke-pack.rip";
const DEFAULT_IMAGE = `${SITE}/assets/og-v2.jpg`;
const DEFAULT_IMAGE_ALT = "Five Pokémon TCG chase cards fanned out under the poke-pack.rip wordmark";
const HOME_TITLE = "poke-pack.rip | rip packs, fill the binder";
const HOME_DESCRIPTION =
  "Open Pokémon TCG booster packs with printed pull rates, real card scans, and market-based values. Free, fan-made, no real money.";
export const SET_IMAGE_VERSION = 2;

/** Pages that only make sense signed in: kept out of search results. */
const PRIVATE_PAGES = /^\/(account|settings|cart|signin|login|signup|auth|social(\/.*)?|bulk(\/sealed)?|sealed|collection(\/sealed)?|binder)$/;

/** Plain pages with their own title and line. */
const PAGES = {
  "/packs": {
    title: `Pokémon TCG booster packs, every set | ${SITE_NAME}`,
    description: (n) => `Open booster packs from ${n} Pokémon TCG sets, from Base Set to Mega Evolution, with the printed pull rates and real card scans. Free, no real money.`,
  },
  "/catalog": {
    title: `Packs | ${SITE_NAME}`,
    description: (n) => `All ${n} Pokémon TCG sets on poke-pack.rip by era: booster sets, promos, special packs, decks and kits.`,
  },
  "/notes": {
    title: `Patch notes | ${SITE_NAME}`,
    description: () => "What's new on poke-pack.rip: new sets, holos, battles and fixes, newest first.",
  },
  "/patch-notes": {
    title: `Patch notes | ${SITE_NAME}`,
    description: () => "What's new on poke-pack.rip: new sets, holos, battles and fixes, newest first.",
    canonical: "/notes",
  },
  "/battles": {
    title: `Pack battles | ${SITE_NAME}`,
    description: () => "Pack battles on poke-pack.rip: everyone rips the same packs and the best pulls take the lot.",
  },
  "/grading": {
    title: `Grading | ${SITE_NAME}`,
    description: () => "Send your pulls off for a grade and get them back in a slab, from a 1 to a Black Label 10.",
  },
  "/terms": { title: `Terms | ${SITE_NAME}`, description: () => "The terms for using poke-pack.rip." },
  "/privacy": { title: `Privacy | ${SITE_NAME}`, description: () => "What poke-pack.rip keeps about you and why." },
  "/legal": { title: `Legal | ${SITE_NAME}`, description: () => "Who runs poke-pack.rip, what it is and what it is not." },
};

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const xmlEsc = (value) => esc(value).replace(/'/g, "&apos;");

/** Cut a line at a word near `max` characters. */
function clip(text, max = 200) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,.;:\s]+$/, "")}…`;
}

function coinsText(n) {
  const v = money(n);
  const whole = Number.isInteger(v);
  return `${v.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })} coins`;
}

function monthYear(released) {
  const d = new Date(released);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The set a card id belongs to: the longest set id it starts with. */
export function setForCardId(id) {
  return (
    ALL_SETS.slice()
      .sort((a, b) => b.id.length - a.id.length)
      .find((set) => id.startsWith(`${set.id}-`)) || null
  );
}

/** Is this a page address (not an API call or a file)? */
export function isPagePath(pathname) {
  if (/^\/(api|assets|css|js|data|\.well-known)\//.test(pathname)) return false;
  const last = pathname.split("/").pop() || "";
  return !last.includes(".") || last === "index.html";
}

/* ---------- robots, sitemap, manifest ---------- */

export function robotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /account",
    "Disallow: /settings",
    "Disallow: /cart",
    "Disallow: /social",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml() {
  const pages = ["/", "/packs", "/catalog", "/battles", "/grading", "/notes", "/terms", "/privacy", "/legal"];
  const rows = pages.map((path) => ({ loc: `${SITE}${path === "/" ? "/" : path}`, priority: path === "/" ? "1.0" : path === "/packs" ? "0.9" : "0.5" }));
  for (const set of PLAYABLE_SETS) {
    rows.push({ loc: `${SITE}/packs/${set.id}`, priority: "0.8" });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.map((row) => `  <url><loc>${xmlEsc(row.loc)}</loc><priority>${row.priority}</priority></url>`).join("\n")}
</urlset>
`;
}

export function manifestJson() {
  return JSON.stringify(
    {
      name: "poke-pack.rip",
      short_name: "poke-pack",
      description: "Rip Pokémon TCG packs with the printed pull rates and fill the binder. Free, fan-made, no real money.",
      start_url: "/home",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#eef2f3",
      theme_color: "#eef2f3",
      icons: [
        { src: "/assets/icon-192-v2.png", sizes: "192x192", type: "image/png" },
        { src: "/assets/icon-512-v2.png", sizes: "512x512", type: "image/png" },
        { src: "/assets/icon-512-maskable-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2
  );
}

/* ---------- the head ---------- */

/**
 * Swap the title, description, canonical, Open Graph and Twitter tags in
 * index.html for `meta`. Everything else in the page (the Impact
 * verification tag included) is left exactly as it is.
 */
export function rewriteHead(html, meta) {
  const url = `${SITE}${meta.path}`;
  const canonical = `${SITE}${meta.canonical ?? meta.path}`;
  const image = meta.image || DEFAULT_IMAGE;
  const alt = meta.imageAlt || (image === DEFAULT_IMAGE ? DEFAULT_IMAGE_ALT : meta.title);
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.noindex ? `<meta name="robots" content="noindex, follow" />` : "",
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.ogDescription || meta.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    meta.imageType ? `<meta property="og:image:type" content="${esc(meta.imageType)}" />` : "",
    meta.imageWidth ? `<meta property="og:image:width" content="${meta.imageWidth}" />` : "",
    meta.imageHeight ? `<meta property="og:image:height" content="${meta.imageHeight}" />` : "",
    `<meta property="og:image:alt" content="${esc(alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.ogDescription || meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(alt)}" />`,
  ].filter(Boolean);
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/, "")
    .replace(/<meta\s+(?:name="description"|name="robots"|property="og:[^"]+"|name="twitter:[^"]+")[\s\S]*?\/>\s*/g, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/, "");
  return stripped.replace(/(<base href="\/" \/>\s*)/, `$1${tags.join("\n    ")}\n    `);
}

/* ---------- which head for which address ---------- */

const imageSeen = new Map();

/** Whether a static image is really in the upload (a missing file answers with index.html). */
async function hasImage(env, origin, path) {
  if (imageSeen.has(path)) return imageSeen.get(path);
  let ok = false;
  try {
    const res = await env.ASSETS.fetch(new Request(new URL(path, origin), { method: "GET" }));
    ok = res.ok && /^image\//.test(res.headers.get("content-type") || "");
    res.body?.cancel?.();
  } catch {
    ok = false;
  }
  imageSeen.set(path, ok);
  return ok;
}

function setMetaLine(set) {
  const when = monthYear(set.released);
  return [set.era || set.edition, when, set.totalCount ? `${set.totalCount} cards` : ""].filter(Boolean).join(", ");
}

async function setMeta(env, origin, set, path) {
  const promo = Boolean(set.promoSet) || !set.packSize;
  const title = promo ? `${set.name} | ${SITE_NAME}` : `Open ${set.name} packs | ${SITE_NAME}`;
  const tail = promo
    ? "Every promo comes in its box, free on poke-pack.rip."
    : "Rip it free on poke-pack.rip with the printed pull rates and real card scans.";
  const imagePath = `/assets/og/sets/${set.id}-v${SET_IMAGE_VERSION}.jpg`;
  const own = await hasImage(env, origin, imagePath);
  return {
    path,
    title,
    description: clip(`${set.blurb || setMetaLine(set)} ${tail}`, 300),
    ogDescription: clip(`${setMetaLine(set)}. ${set.oddsLine && !promo ? `${set.oddsLine.replace(/ · /g, ", ")}. ` : ""}${tail}`, 220),
    image: own ? `${SITE}${imagePath}` : DEFAULT_IMAGE,
    imageType: "image/jpeg",
    imageWidth: 1200,
    imageHeight: 630,
    imageAlt: promo ? `${set.name} on poke-pack.rip` : `${set.name} booster packs and chase cards on poke-pack.rip`,
  };
}

const REVERSE_WORD = { 1: "Reverse holo", pokeball: "Poké Ball reverse", masterball: "Master Ball reverse" };

async function pullMeta(env, origin, cardId, url, findCard) {
  const set = setForCardId(cardId);
  if (!set) return null;
  let card = null;
  try {
    card = await findCard(cardId);
  } catch {
    card = null;
  }
  if (!card || !card.image) return null;
  const by = (url.searchParams.get("by") || "").toLowerCase();
  const handle = /^[a-z0-9_]{3,16}$/.test(by) ? by : "";
  // A reverse the set's packs cannot deal (Base Set has none) is ignored, as the page does.
  const reverse = (canPullReverse(set, card) && REVERSE_WORD[url.searchParams.get("r") || ""]) || "";
  const rarity = [reverse, RARITY_LABEL[card.rarity] || card.rarity].filter(Boolean).join(" ");
  const value = coinsText(sellValue(card));
  const what = `${card.name}, ${rarity}`;
  const title = handle ? `@${handle} pulled ${what} | ${SITE_NAME}` : `${what} | ${SITE_NAME}`;
  const description = `${card.name} from ${set.name}${card.number ? `, number ${card.number}` : ""}. ${rarity}, worth ${value} on poke-pack.rip. Rip ${set.name} packs free and chase your own.`;
  const query = new URLSearchParams();
  if (handle) query.set("by", handle);
  if (reverse) query.set("r", url.searchParams.get("r"));
  const qs = query.toString();
  return {
    path: `/pull/${cardId}${qs ? `?${qs}` : ""}`,
    canonical: `/pull/${cardId}`,
    title,
    description,
    image: `${SITE}/${String(card.image).replace(/^\//, "")}`,
    imageType: /\.png$/i.test(card.image) ? "image/png" : /\.jpe?g$/i.test(card.image) ? "image/jpeg" : "image/webp",
    imageAlt: `${card.name} (${set.name}), ${rarity}`,
    noindex: true,
  };
}

async function profileMeta(env, handle, path, findCard) {
  let user = null;
  try {
    user = await env.DB?.prepare("SELECT handle, name, bio, showcase FROM users WHERE handle = ?").bind(handle).first();
  } catch {
    user = null;
  }
  if (!user) return { path, title: `Trainer | ${SITE_NAME}`, description: HOME_DESCRIPTION, noindex: true };
  let image = "";
  let imageAlt = "";
  try {
    const list = JSON.parse(user.showcase || "[]");
    const first = Array.isArray(list) ? list.map((row) => (typeof row === "string" ? row : row?.id)).find(Boolean) : "";
    if (first) {
      const card = await findCard(String(first));
      if (card?.image) {
        image = `${SITE}/${String(card.image).replace(/^\//, "")}`;
        imageAlt = `${card.name}, in @${user.handle}'s showcase`;
      }
    }
  } catch {
    image = "";
  }
  const named = user.name && user.name.toLowerCase() !== user.handle ? `${user.name} (@${user.handle})` : `@${user.handle}`;
  const bio = clip(user.bio, 140);
  return {
    path,
    canonical: `/u/${user.handle}`,
    title: `${named} | ${SITE_NAME}`,
    description: `${bio ? `${bio} ` : ""}See @${user.handle}'s binder, slabs and best pulls on poke-pack.rip.`,
    image: image || DEFAULT_IMAGE,
    imageType: image ? "image/webp" : "image/jpeg",
    imageWidth: image ? undefined : 1200,
    imageHeight: image ? undefined : 630,
    imageAlt: imageAlt || DEFAULT_IMAGE_ALT,
  };
}

/** The head this address wants, or null to serve index.html as it is. */
export async function metaForPath(env, url, { findCard }) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = url.origin;
  if (path === "/" || path === "/index.html") return null;
  if (path === "/home") return { path: "/home", canonical: "/", title: HOME_TITLE, description: HOME_DESCRIPTION, imageType: "image/jpeg", imageWidth: 1200, imageHeight: 630 };

  const packs = path.match(/^\/(?:packs|shop)\/([a-z0-9]+)$/i);
  if (packs) {
    const id = packs[1].toLowerCase();
    const set = PLAYABLE_SETS.find((s) => s.id === id);
    if (set) return setMeta(env, origin, set, `/packs/${set.id}`);
    return { path, title: `Packs | ${SITE_NAME}`, description: HOME_DESCRIPTION, noindex: true };
  }

  const pull = path.match(/^\/pull\/([a-z0-9]+-[a-z0-9-]+)$/i);
  if (pull) {
    const meta = await pullMeta(env, origin, pull[1].toLowerCase(), url, findCard);
    return meta || { path, title: `Pull | ${SITE_NAME}`, description: HOME_DESCRIPTION, noindex: true };
  }

  const profile = path.match(/^\/u\/([a-z0-9_]{3,16})(?:\/binder\/[1-9]\d{0,2})?$/i);
  if (profile) return profileMeta(env, profile[1].toLowerCase(), path, findCard);

  const page = PAGES[path];
  if (page) {
    return {
      path,
      canonical: page.canonical,
      title: page.title,
      description: page.description(PLAYABLE_SETS.length),
      imageType: "image/jpeg",
      imageWidth: 1200,
      imageHeight: 630,
    };
  }
  if (PRIVATE_PAGES.test(path)) {
    return { path, title: HOME_TITLE, description: HOME_DESCRIPTION, noindex: true, imageType: "image/jpeg", imageWidth: 1200, imageHeight: 630 };
  }
  return null;
}

/**
 * Answer a page request: robots, sitemap and manifest, or index.html with
 * the head this address wants. Returns null for anything else.
 */
export async function seoResponse(request, env, url, { findCard }) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const path = url.pathname;
  const head = request.method === "HEAD";
  if (path === "/robots.txt") return textResponse(robotsTxt(), "text/plain; charset=utf-8", head);
  if (path === "/sitemap.xml") return textResponse(sitemapXml(), "application/xml; charset=utf-8", head);
  if (path === "/manifest.webmanifest") return textResponse(manifestJson(), "application/manifest+json; charset=utf-8", head);
  if (!isPagePath(path)) return null;

  let meta = null;
  try {
    meta = await metaForPath(env, url, { findCard });
  } catch (err) {
    console.error("seo meta", err);
    meta = null;
  }
  if (!meta) return null;
  const page = await env.ASSETS.fetch(new Request(new URL("/", url.origin), { method: "GET" }));
  if (!page.ok || !/text\/html/.test(page.headers.get("content-type") || "")) return null;
  const html = rewriteHead(await page.text(), meta);
  const headers = new Headers(page.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-cache");
  return new Response(head ? null : html, { status: 200, headers });
}

function textResponse(body, type, head) {
  return new Response(head ? null : body, {
    status: 200,
    headers: { "content-type": type, "cache-control": "public, max-age=3600" },
  });
}
