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
 * static fixed layer, #profile-room, drawn with light CSS gradients. Nothing
 * here animates.
 */
import { holdAmbient } from "./fx.js";
import { dominantAccents, hexToHsl, hexToRgb, hslToHex } from "./card-accent.js";
import { colorHex, COLOR_FROM_CARDS } from "./binder-looks.js";
import { normalizeProfileLook } from "./profile-look.js";
import { coinAmount } from "./money.js?v=1";

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

/** The colour a backdrop pattern is drawn in: the room's light, brightened when it is dark so ink and navy still show a pattern. */
export function roomInk(rgb) {
  const top = Math.max(...rgb, 1);
  const k = top < 150 ? 150 / top : 1;
  return rgb.map((v) => Math.min(255, Math.round(v * k)));
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
  document.body.classList.toggle("profile-roomed", Boolean(rgb));
  if (look.backdrop === "none") {
    roomEl?.remove();
    roomEl = null;
    return;
  }
  if (!roomEl) {
    roomEl = document.createElement("div");
    roomEl.id = "profile-room";
    roomEl.className = "room-bd";
    roomEl.setAttribute("aria-hidden", "true");
    document.body.append(roomEl);
  }
  roomEl.dataset.backdrop = look.backdrop;
  roomEl.style.setProperty("--room", rgb ? rgb.join(" ") : "var(--ambient)");
  roomEl.style.setProperty("--room-ink", rgb ? roomInk(rgb).join(" ") : "var(--ambient)");
}

export function leaveProfileRoom() {
  holdAmbient(null);
  document.body.classList.remove("profile-roomed");
  roomEl?.remove();
  roomEl = null;
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

function showcaseSlotHtml(slot, i, { esc, findCard, tcgFace, inspectAttrs }) {
  const known = findCard(slot.id);
  const face = known
    ? tcgFace({ ...known, reverse: slot.reverse }, { small: true, stamp: false, lazy: true })
    : `<img src="${esc(slot.image)}" alt="${esc(slot.name)}" />`;
  const worth = Number(slot.value) > 0 ? `<span>${coinAmount(slot.value)}</span>` : "";
  return `<figure class="showcase-slot${i === 0 ? " best" : ""}">
    <button type="button" class="mini-card" ${known ? inspectAttrs({ ...known, reverse: slot.reverse }) : ""} aria-label="${esc(slot.name)}">${face}</button>
    <figcaption><b>${esc(slot.name)}</b>${worth}</figcaption>
  </figure>`;
}

function showcaseSection({ user, mine, look, deps, pinned, data }) {
  const { esc, showcaseMax } = deps;
  // Preserve the collector's chosen order, including favourite commons.
  const slots = pinned.map((slot, i) => showcaseSlotHtml(slot, i, deps));
  const style = look.showcase;
  let stageBody = "";
  if (slots.length) {
    stageBody =
      style === "stage" && slots.length > 1
        ? `<div class="showcase-row">${slots[0]}<div class="showcase-rest">${slots.slice(1).join("")}</div></div>`
        : `<div class="showcase-row">${slots.join("")}</div>`;
  }
  const max = entitlement(data, "showcaseSlots", showcaseMax);
  return `<section class="profile-showcase" data-section="showcase">
    <div class="acct-sec-head">
      <div>
        <h2>Showcase</h2>
        <p>${
          pinned.length
            ? `${pinned.length} ${pinned.length === 1 ? "card" : "cards"} ${esc(user.name)} picked to show off.`
            : mine
              ? `Open any card you own and choose Pin to showcase. Up to ${max === 6 ? "six" : max} sit here.`
              : `${esc(user.name)} hasn't pinned any cards yet.`
        }</p>
      </div>
    </div>
    ${stageBody ? `<div class="showcase-stage" data-style="${esc(style)}">${stageBody}</div>` : ""}
  </section>`;
}

/** The Graded section: slabs the trainer chose to show, drawn with the real face. */
function gradedSection({ user, mine, deps, gradedSlabs, data }) {
  const { esc, num, findCard, setForCardId, tcgFace, slabHTML, gradeWord, roomLine } = deps;
  const room = roomLine("slabs", user.level, gradedSlabs.length, deps.gradedMax);
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
        <figcaption><b>${esc(card.name)}</b><span class="graded-grade">${slab.grade} ${esc(gradeWord(slab.grade))}</span>${worth}${mine ? `<a href="/grading/${Number(slab.id)}">Open slab</a>` : ""}</figcaption>
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
    ${graded ? `<div class="graded-stage"><div class="graded-row">${graded}</div></div>` : ""}
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
        <p>${mine ? "Notes other trainers left you." : `Leave ${esc(user.name)} a note.`}</p>
      </div>
    </div>
    ${comments ? `<ol class="comment-list">${comments}</ol>` : `<p class="panel-empty">No notes yet.${signed && !mine ? " Be the first." : ""}</p>`}
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
  const figures = [
    stats.packs != null ? [num(stats.packs), "Packs ripped"] : null,
    stats.pulls != null ? [num(stats.pulls), "Cards pulled"] : null,
    stats.unique != null ? [num(stats.unique), "Unique cards"] : null,
    stats.coins != null ? [coinAmount(stats.coins), "Coins", "money"] : null,
    user.createdAt ? [joinedOn(user.createdAt), "Collecting since"] : null,
  ].filter(Boolean);
  const plain = look.hero === "plain";
  return `<header class="acct-hero profile-hero" data-hero="${plain ? "plain" : "banner"}">
    ${plain ? "" : bannerBlock(user.banner, { className: "acct-banner profile-banner", eager: true })}
    <div class="acct-hero-body profile-id">
      ${faceHtml({ ...user, online: data.online }, "lg")}
      <div class="acct-copy profile-copy">
        <h1 class="acct-name">${esc(user.name)}${levelBadge(user.level, { size: "xl" })}</h1>
        ${look.chasing ? `<p class="profile-chasing"><span>Chasing:</span> ${esc(look.chasing)}</p>` : ""}
        <p class="acct-meta">
          <span class="account-handle">@${esc(user.handle)}</span>
          <span>${num(friends)} ${friends === 1 ? "friend" : "friends"}</span>
          ${data.online ? `<span class="live-tag">Online now</span>` : ""}
        </p>
        <p class="acct-chips"><span class="account-title">${esc(user.title || "Rookie")}</span></p>
        ${user.bio ? `<p class="account-bio">${esc(user.bio)}</p>` : ""}
      </div>
      <div class="acct-hero-actions profile-actions">${friendBtn}</div>
    </div>
    ${
      figures.length
        ? `<dl class="acct-figures">${figures
            .map(([value, label, cls]) => `<div class="acct-fig${cls ? ` ${cls}` : ""}"><dt>${esc(label)}</dt><dd>${value}</dd></div>`)
            .join("")}</dl>`
        : ""
    }
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

