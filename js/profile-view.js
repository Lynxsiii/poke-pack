/**
 * The public profile page, drawn as a hero and then the trainer's sections in
 * the trainer's order (see PROFILE_SECTIONS and normalizeProfileLook in
 * js/profile-look.js). Everything that needs the app (card faces, the slab
 * drawing, the binder pager, formatting) comes in through `deps`, so this file
 * imports nothing from js/app.js.
 *
 *   profilePageHtml({ data, deps, ... })   the whole page as a string
 *   applyProfileRoom(look, cards, opts)    paint the room (tint + still backdrop) while the profile is open
 *   leaveProfileRoom()                     give the room back (call when the route leaves /u/<handle>)
 *   roomRgb(look, cards, accents)          the [r,g,b] light a look asks for, or null for the site's own
 *   roomCards(data)                        the cards "Cards" tint leans on: showcase plus shown binder pages
 *
 * The room: tint sets --ambient on <body> through holdAmbient() in js/fx.js
 * (so a wrapper loading elsewhere cannot repaint it); the backdrop is one
 * static layer at the top of the page, #profile-room, drawn with CSS gradients. Nothing
 * here animates.
 */
import { holdAmbient } from "./fx.js";
import { dominantAccents, hexToHsl, hexToRgb, hslToHex } from "./card-accent.js";
import { colorHex, COLOR_FROM_CARDS } from "./binder-looks.js";
import { normalizeProfileLook } from "./profile-look.js";
import { coinAmount, coinText } from "./money.js?v=1";

/* ---- Room ---------------------------------------------------------------- */

/**
 * The light a tinted room throws. The colour is lifted out of the mud (a navy
 * or a wine would vanish into the near-black page) and held below a ceiling so
 * a pale colour (bone, blush, mint) cannot wash the page out under the text.
 */
export function roomLight(hex) {
  const [h, s, l] = hexToHsl(hex);
  const lifted = s > 0.25 ? Math.min(0.54, Math.max(0.4, l)) : Math.min(0.5, l);
  return hexToRgb(hslToHex(h, Math.min(1, s * 1.05), lifted));
}

/** The colour a backdrop is drawn in: the room's light, brightened when it is dark so ink and navy still show. */
export function roomInk(rgb) {
  const top = Math.max(...rgb, 1);
  const k = top < 150 ? 150 / top : 1;
  return rgb.map((v) => Math.min(255, Math.round(v * k)));
}

/** The room's light turned toward white, for the glints (a sleeve's sheen, the paper's fibres). */
export function roomHi(rgb) {
  return roomInk(rgb).map((v) => Math.round(v + (255 - v) * 0.55));
}

const WALL = [34, 30, 26]; // --wall, the page's own ground
const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luma = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** The brightest the ground may get behind a caption, as relative luminance (about rgb 70): muted text keeps 4.5:1 on it. */
const GROUND_MAX = 0.058;
/** The strongest backdrop alpha (what the Glow look peaks at, before --kr). */
const PEAK = 0.42;

/**
 * How hard a backdrop is drawn for this light (the --kr multiplier). The most the room colour may lift the
 * ground is the alpha at which the ground behind the header's captions still gives them 4.5:1, so a pale
 * colour is drawn gently and a dark one (navy, plum, forest) as hard as the pools and lines can go.
 * `rgb` is null for the site's own light (its default is a bright warm white).
 */
export function roomStrength(rgb) {
  const ink = rgb ? roomInk(rgb) : [255, 214, 160];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const ground = WALL.map((w, k) => w + (ink[k] - w) * mid);
    if (luma(ground) <= GROUND_MAX) lo = mid;
    else hi = mid;
  }
  return Math.round(Math.min(1.5, Math.max(0.3, lo / PEAK)) * 100) / 100;
}

/** [r,g,b] for a look's tint, or null when it uses the site's own light. `accents` refines "cards" from art when given. */
export function roomRgb(lookValue, cards = [], accents) {
  const look = normalizeProfileLook(lookValue);
  if (!look.tint) return null;
  if (look.tint === COLOR_FROM_CARDS) {
    const dom = dominantAccents(cards, accents);
    return dom ? roomLight(dom.a) : null;
  }
  const hex = colorHex(look.tint);
  return hex ? roomLight(hex) : null;
}

/** The cards a "Cards" room leans on: the pinned showcase, then every shown binder page. */
export function roomCards({ showcase = [], binderPages = [] } = {}, findCard = () => null) {
  const ids = [];
  for (const slot of showcase) if (slot?.id) ids.push(slot.id);
  for (const page of binderPages) for (const slot of page?.slots || []) if (slot?.id) ids.push(slot.id);
  return ids.map((id) => findCard(id) || { id });
}

let roomEl = null;
let roomWatch = null;

/** Keep the layer no taller than the page: it hangs from the top of the document and would otherwise make a short page scroll. */
function capRoom() {
  roomWatch?.disconnect();
  roomWatch = null;
  if (!roomEl) return;
  const cap = () => roomEl?.style.setProperty("--room-cap", `${document.body.getBoundingClientRect().height}px`);
  cap();
  if (typeof ResizeObserver === "function") {
    roomWatch = new ResizeObserver(cap);
    roomWatch.observe(document.body);
  }
}

/**
 * Paint the room for `look` while the profile is on screen: the tint holds
 * --ambient, the backdrop is one still layer behind the page. Safe to call
 * again for another profile or an edited look; a look with neither tint nor
 * backdrop gives everything back.
 */
export function applyProfileRoom(lookValue, cards = [], { accents } = {}) {
  const look = normalizeProfileLook(lookValue);
  const rgb = roomRgb(look, cards, accents);
  holdAmbient(rgb);
  if (look.backdrop === "none" && !rgb) {
    roomEl?.remove();
    roomEl = null;
    capRoom();
    document.body.classList.remove("profile-roomed");
    return;
  }
  document.body.classList.add("profile-roomed");
  if (!roomEl) {
    roomEl = document.createElement("div");
    roomEl.id = "profile-room";
    roomEl.className = "room-bd";
    roomEl.setAttribute("aria-hidden", "true");
    document.body.append(roomEl);
    capRoom();
  }
  roomEl.dataset.backdrop = look.backdrop;
  roomEl.style.setProperty("--room", rgb ? rgb.join(" ") : "var(--ambient)");
  roomEl.style.setProperty("--room-ink", rgb ? roomInk(rgb).join(" ") : "var(--ambient)");
  if (rgb) roomEl.style.setProperty("--room-hi", roomHi(rgb).join(" "));
  else roomEl.style.removeProperty("--room-hi");
  roomEl.style.setProperty("--kr", String(roomStrength(rgb)));
}

export function leaveProfileRoom() {
  holdAmbient(null);
  document.body.classList.remove("profile-roomed");
  roomEl?.remove();
  roomEl = null;
  capRoom();
}

/* ---- Section registry ----------------------------------------------------- */

/**
 * Each renderer takes one context and returns the section's HTML ("" to draw
 * nothing). ctx = { data, user, mine, signed, look, deps, pinned, gradedSlabs }.
 * The order and the on/off state come from the trainer's profileLook, never
 * from here; an id the trainer's look names that has no renderer is skipped.
 *
 * To give another thread a place on the page: add the id to PROFILE_SECTIONS in
 * js/profile-look.js (the Worker validates against it too) and a renderer below.
 */
const SECTION_RENDERERS = {
  showcase: showcaseSection,
  graded: gradedSection,
  binder: (ctx) => ctx.deps.binderSection(),
  wall: wallSection,
  mastery: masterySection,
};

/** Level perks the server may send as data.entitlements; absent or malformed means the defaults. */
export function entitlement(data, key, fallback) {
  const value = Number(data?.entitlements?.[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** One pinned card in the case: a top-loader on the glass shelf with the price tag clipped to it. */
function showcaseSlotHtml(slot, i, { esc, findCard, tcgFace, inspectAttrs }) {
  const known = findCard(slot.id);
  const face = known
    ? tcgFace({ ...known, reverse: slot.reverse }, { small: true, stamp: false, lazy: true })
    : `<img src="${esc(slot.image)}" alt="${esc(slot.name)}" />`;
  const priced = Number(slot.value) > 0;
  return `<li class="loader${i === 0 ? " best" : ""}">
    <button type="button" class="loader-card" ${known ? inspectAttrs({ ...known, reverse: slot.reverse }) : ""} aria-label="${esc(slot.name)}${priced ? `, ${coinText(slot.value)} coins` : ""}">${face}</button>
    ${priced ? `<span class="price-tag loader-tag" aria-hidden="true">${coinText(slot.value)}</span>` : ""}
    <p class="loader-cap"><b>${esc(slot.name)}</b></p>
  </li>`;
}

/** The showcase stands in the glass case from Home; the trainer's layout picks how the cards are arranged in it. */
function showcaseSection({ user, mine, look, deps, pinned, data }) {
  const { esc, showcaseMax } = deps;
  // Preserve the collector's chosen order, including favourite commons.
  const slots = pinned.map((slot, i) => showcaseSlotHtml(slot, i, deps));
  const style = look.showcase;
  const max = entitlement(data, "showcaseSlots", showcaseMax);
  const line = pinned.length
    ? `${pinned.length} ${pinned.length === 1 ? "card" : "cards"} ${esc(user.name)} picked to show off.`
    : mine
      ? `Open any card you own and choose Pin to showcase. Up to ${max === 6 ? "six" : max} sit here.`
      : `${esc(user.name)} hasn't pinned any cards yet.`;
  if (!slots.length) {
    return `<section class="profile-showcase" data-section="showcase">
      <div class="acct-sec-head"><h2>Showcase</h2></div>
      <p class="panel-empty">${line}</p>
    </section>`;
  }
  const body =
    style === "stage" && slots.length > 1
      ? `<div class="case-stage"><ul class="case-loaders case-best">${slots[0]}</ul><ul class="case-loaders case-rest">${slots.slice(1).join("")}</ul></div>`
      : `<ul class="case-loaders">${slots.join("")}</ul>`;
  return `<section class="profile-showcase" data-section="showcase">
    <div class="glass-case profile-case" data-style="${esc(style)}">
      <div class="case-in">
        <h2 class="case-h">Showcase</h2>
        <p class="case-sub">${line}</p>
        ${body}
      </div>
    </div>
  </section>`;
}

/** The Graded section: slabs the trainer chose to show, drawn with the real face. */
function gradedSection({ user, mine, deps, gradedSlabs, data }) {
  const { esc, num, findCard, setForCardId, tcgFace, slabHTML, gradeWord, roomLine } = deps;
  const room = roomLine("slabs", user.perks?.unlockLevel ?? user.level, gradedSlabs.length, deps.gradedMax);
  const graded = gradedSlabs
    .map((slab) => {
      const known = findCard(slab.cardId);
      const set = setForCardId(slab.cardId);
      const card = known || { id: slab.cardId, name: slab.name, rarity: slab.rarity };
      const face = known
        ? tcgFace({ ...known, reverse: slab.reverse }, { small: true, stamp: false, lazy: true })
        : `<img src="${esc(slab.image)}" alt="${esc(slab.name)}" loading="lazy" />`;
      const worth = Number(slab.value) > 0 ? `<span class="graded-worth">${coinAmount(slab.value)}</span>` : "";
      return `<figure class="graded-slot">
        ${slabHTML({ face, card, slab, set, size: "grid" })}
        <figcaption><b>${esc(card.name)}</b><span class="graded-grade">${slab.grade} ${esc(gradeWord(slab.grade, slab.blackLabel))}</span>${worth}${mine ? `<a href="/grading/${Number(slab.id)}">Open slab</a>` : ""}</figcaption>
      </figure>`;
    })
    .join("");
  const gradedTotal = Number(data.gradedCount) || gradedSlabs.length;
  if (!gradedSlabs.length && !mine) return "";
  return `<section class="acct-sec profile-graded" data-section="graded">
    <div class="acct-sec-head">
      <div>
        <h2>Graded</h2>
        <p>${
          gradedSlabs.length
            ? `${gradedSlabs.length} of the ${num(gradedTotal)} ${gradedTotal === 1 ? "card" : "cards"} ${esc(user.name)} had slabbed.`
            : `Open one of your slabs and choose Show on profile. Up to ${room.cap} sit here.${room.more}`
        }</p>
      </div>
      ${mine ? `<a class="ghost sm" href="/grading/graded">Your slabs</a>` : ""}
    </div>
    ${graded ? `<div class="graded-row">${graded}</div>` : ""}
  </section>`;
}

function wallSection({ data, user, mine, signed, deps }) {
  const { esc, faceHtml, formatWhen, levelTag } = deps;
  const comments = (data.comments || [])
    .map(
      (row) => `<li class="comment-item">
        <a href="/u/${esc(row.user.handle)}" aria-label="${esc(row.user.name)}">${faceHtml(row.user, "sm")}</a>
        <div>
          <p class="comment-by"><a href="/u/${esc(row.user.handle)}"><b>${levelTag(row.user)}${esc(row.user.name)}</b></a> <time>${esc(formatWhen(row.at))}</time></p>
          <p>${esc(row.body)}</p>
        </div>
      </li>`
    )
    .join("");
  return `<section class="acct-sec profile-wall" data-section="wall">
    <div class="acct-sec-head">
      <div>
        <h2>Wall</h2>
      </div>
    </div>
    ${comments ? `<ol class="comment-list">${comments}</ol>` : `<p class="panel-empty">${signed && !mine ? `Leave ${esc(user.name)} the first note.` : "No notes on this wall."}</p>`}
    ${
      signed
        ? `<form class="comment-form" id="comment-form">
            <textarea name="body" maxlength="220" placeholder="${mine ? "Write on your own wall" : `Leave a note for ${esc(user.name)}`}" aria-label="Your note"></textarea>
            <button class="ghost" type="submit">Post note</button>
          </form>`
        : `<p class="panel-note"><button class="text-btn" type="button" data-open-auth="signin">Sign in</button> to leave a note.</p>`
    }
  </section>`;
}

/** The mastery shelf (js/mastery-shelf.js): the sets this trainer has mastered. Its banner is left out when the header already shows it. */
function masterySection({ data, user, mine, look, deps }) {
  return deps.masteryShelf(data.masteries || [], { banner: look.hero === "plain" ? "" : user.banner, mine });
}

/* ---- Hero ------------------------------------------------------------------ */

function heroHtml({ data, user, look, friendBtn, deps }) {
  const { esc, num, joinedOn, faceHtml, bannerBlock, levelBadge } = deps;
  const stats = data.stats || {};
  const friends = Number(data.friends || 0);
  const plural = (n, one, many) => `${num(n)} ${Number(n) === 1 ? one : many}`;
  // What the trainer chose to share, as one line.
  const facts = [
    stats.packs != null ? `${plural(stats.packs, "pack", "packs")} ripped` : null,
    stats.pulls != null ? `${plural(stats.pulls, "card", "cards")} pulled` : null,
    stats.unique != null ? `${plural(stats.unique, "different card", "different cards")}` : null,
    stats.coins != null ? `holding ${coinAmount(stats.coins)}` : null,
  ].filter(Boolean);
  const plain = look.hero === "plain";
  return `<header class="acct-hero profile-hero" data-hero="${plain ? "plain" : "banner"}">
    ${plain ? "" : bannerBlock(user.banner, { className: "acct-banner profile-banner", eager: true })}
    <div class="acct-hero-body profile-id">
      ${faceHtml({ ...user, online: data.online }, "lg")}
      <div class="acct-copy profile-copy">
        <h1 class="acct-name">${esc(user.name)}${levelBadge(user.level, { size: "xl", prestige: user.prestige })}</h1>
        ${look.chasing ? `<p class="profile-chasing"><span>Chasing:</span> ${esc(look.chasing)}</p>` : ""}
        <p class="acct-meta">
          <span class="account-handle">@${esc(user.handle)}</span>
          <span class="account-title">${esc(user.title || "Rookie")}</span>
          <span>${num(friends)} ${friends === 1 ? "friend" : "friends"}</span>
          ${user.createdAt ? `<span>Collecting since ${esc(joinedOn(user.createdAt))}</span>` : ""}
          ${data.online ? `<span class="live-tag">Online now</span>` : ""}
        </p>
        ${facts.length ? `<p class="acct-facts">${facts.join(", ")}.</p>` : ""}
        ${user.bio ? `<p class="account-bio">${esc(user.bio)}</p>` : ""}
      </div>
      <div class="acct-hero-actions profile-actions">${friendBtn}</div>
    </div>
  </header>`;
}

/* ---- The page -------------------------------------------------------------- */

/**
 * ctx = { data, mine, signed, friendBtn, gradedSlabs, deps }
 * deps = { esc, num, joinedOn, formatWhen, faceHtml, bannerBlock(banner, opts), levelBadge, levelTag, roomLine, masteryShelf(list, opts),
 *          findCard, setForCardId, tcgFace, inspectAttrs, slabHTML, gradeWord,
 *          binderSection(), showcaseMax, gradedMax }
 * Returns { html, look, cards }: the page, the trainer's normalized look, and
 * the cards the room tint leans on.
 */
export function profilePageHtml({ data, mine, signed, friendBtn, gradedSlabs = [], deps }) {
  const user = data.user;
  const look = normalizeProfileLook(user.profileLook);
  const ctx = { data, user, mine, signed, look, deps, gradedSlabs, pinned: (data.showcase || []).slice() };
  const sections = look.sections
    .filter((row) => row.on && SECTION_RENDERERS[row.id])
    .map((row) => SECTION_RENDERERS[row.id](ctx))
    .join("");
  return {
    html: `<div class="profile-page" data-look-hero="${esc(look.hero)}">
      ${heroHtml({ data, user, look, friendBtn, deps })}
      ${sections}
    </div>`,
    look,
    cards: roomCards({ showcase: ctx.pinned, binderPages: data.binderPages || [] }, deps.findCard),
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

