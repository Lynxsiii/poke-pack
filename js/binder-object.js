/**
 * The binder as an object: builds the wrapper around the pages (cover, hardware,
 * name plate) and keeps its look attributes current. Pure strings plus one DOM
 * helper, so the /binder page, the profile and the editor preview all draw the
 * same thing. CSS lives in css/binder/materials.css (cover, hardware, plate)
 * and css/binder/editions.css (animated layers).
 *
 *   binderObjectHtml({ innerHtml, resolved, id? })   a complete .binder-object
 *   applyBinderLook(el, resolved)                    update attributes and vars in place
 *
 * `resolved` is resolveBinderLook(look, { cards }) from js/binder-looks.js.
 * The classic material draws no cover, hardware or plate, so a look that never
 * left the default renders as the bare page it always was.
 */
import { binderFxHtml } from "./binder-editions.js";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function binderObjectHtml({ innerHtml = "", resolved, id = "" }) {
  const { look, attrs, style } = resolved;
  const attrText = Object.entries(attrs)
    .map(([key, value]) => `${key}="${esc(value)}"`)
    .join(" ");
  const classic = look.material === "classic";
  const plate = !classic && look.name ? `<div class="binder-plate"><span>${esc(look.name)}</span></div>` : "";
  return `<div class="binder-object"${id ? ` id="${esc(id)}"` : ""} ${attrText} style="${esc(style)}">
    <div class="binder-cover" aria-hidden="true"><span class="binder-fx">${binderFxHtml(look.edition)}</span></div>
    <div class="binder-hardware" aria-hidden="true"></div>
    ${plate}
    ${innerHtml}
  </div>`;
}

/** Update an existing .binder-object to a new resolved look (attributes, variables, plate, fx layer). */
export function applyBinderLook(el, resolved) {
  if (!el) return;
  const { look, attrs, vars } = resolved;
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  for (const [key, value] of Object.entries(vars)) el.style.setProperty(key, value);
  const fx = el.querySelector(".binder-fx");
  if (fx && fx.dataset.edition !== look.edition) {
    fx.dataset.edition = look.edition;
    fx.innerHTML = binderFxHtml(look.edition);
  }
  let plate = el.querySelector(".binder-plate");
  const wantPlate = look.material !== "classic" && look.name;
  if (wantPlate && !plate) {
    plate = document.createElement("div");
    plate.className = "binder-plate";
    plate.append(document.createElement("span"));
    el.querySelector(".binder-hardware")?.after(plate);
  }
  if (wantPlate) plate.firstElementChild.textContent = look.name;
  else plate?.remove();
}
