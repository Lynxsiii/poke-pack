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
import { luminance } from "./card-accent.js";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/**
 * What the name plate needs beyond the contract's variables: a label that
 * reads on any cover is the cover's "on" colour as paper with the opposite ink
 * on it (cream label, deep ink on a dark cover; dark label, pale ink on a light one).
 */
function plateVars(vars) {
  const light = luminance(vars["--b-on"]) > 0.5;
  return { "--b-plate": vars["--b-on"], "--b-plate-ink": light ? vars["--b-deep"] : vars["--b-light"] };
}

const hasPlate = (look) => look.material !== "classic" && Boolean(look.name);

export function binderObjectHtml({ innerHtml = "", resolved, id = "" }) {
  const { look, attrs, vars } = resolved;
  const attrText = Object.entries(attrs)
    .map(([key, value]) => `${key}="${esc(value)}"`)
    .join(" ");
  const style = Object.entries({ ...vars, ...plateVars(vars) }).map(([k, v]) => `${k}:${v}`).join(";");
  const plate = hasPlate(look) ? `<div class="binder-plate"><span>${esc(look.name)}</span></div>` : "";
  return `<div class="binder-object"${id ? ` id="${esc(id)}"` : ""} ${attrText}${plate ? " data-plate" : ""} style="${esc(style)}">
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
  for (const [key, value] of Object.entries({ ...vars, ...plateVars(vars) })) el.style.setProperty(key, value);
  const fx = el.querySelector(".binder-fx");
  if (fx && fx.dataset.edition !== look.edition) {
    fx.dataset.edition = look.edition;
    fx.innerHTML = binderFxHtml(look.edition);
  }
  let plate = el.querySelector(".binder-plate");
  const wantPlate = hasPlate(look);
  el.toggleAttribute("data-plate", wantPlate);
  if (wantPlate && !plate) {
    plate = document.createElement("div");
    plate.className = "binder-plate";
    plate.append(document.createElement("span"));
    el.querySelector(".binder-hardware")?.after(plate);
  }
  if (wantPlate) plate.firstElementChild.textContent = look.name;
  else plate?.remove();
}
