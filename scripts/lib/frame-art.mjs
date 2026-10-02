/**
 * Helpers for drawing avatar frames as SVG (scripts/make-frames.mjs).
 *
 * Every frame is drawn in a 200 x 200 box. The avatar is a disc in the middle
 * with radius `ra`, which depends on how far the frame sticks out (`of`, as a
 * share of the avatar's size): ra = 100 / (1 + 2 * of). Draw the band from
 * about `ra - 1.5` outward so it tucks under nothing and overlaps the avatar's
 * edge a little; never draw inside that, the avatar shows through there.
 *
 * The whole 200 box is usable, corners included (the ring box is not rounded).
 * Angles are degrees, 0 at the top, clockwise. Light comes from the top left.
 * No filters, no text, no external references: gradients, paths and opacity
 * only, so the file is small and renders the same in Chromium and WebKit.
 */
export const C = 100;
export const f = (n) => Math.round(n * 100) / 100;
export const rad = (d) => (d * Math.PI) / 180;
export const raOf = (of) => 100 / (1 + 2 * of);

/** Point at radius r, angle deg. */
export function pt(r, deg) {
  return [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];
}
const xy = ([x, y]) => `${f(x)} ${f(y)}`;

/** Polygon / polyline path from [x, y] points. */
export function poly(points, close = true) {
  return `M${points.map(xy).join("L")}${close ? "Z" : ""}`;
}

/** A circular arc path at radius r from angle a0 to a1 (clockwise), as a bare "M..A.." stroke path. */
export function arc(r, a0, a1) {
  const span = a1 - a0;
  return `M${xy(pt(r, a0))}A${f(r)} ${f(r)} 0 ${Math.abs(span) > 180 ? 1 : 0} ${span >= 0 ? 1 : 0} ${xy(pt(r, a1))}`;
}

/** A filled band between r1 and r2 from a0 to a1. */
export function sector(r1, r2, a0, a1) {
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${xy(pt(r2, a0))}A${f(r2)} ${f(r2)} 0 ${big} 1 ${xy(pt(r2, a1))}L${xy(pt(r1, a1))}A${f(r1)} ${f(r1)} 0 ${big} 0 ${xy(pt(r1, a0))}Z`;
}

/** A full ring between r1 and r2 (fill-rule evenodd is baked in via two sub-paths drawn opposite ways). */
export function donut(r1, r2) {
  const circle = (r, sweep) => `M${f(C - r)} ${C}A${f(r)} ${f(r)} 0 1 ${sweep} ${f(C + r)} ${C}A${f(r)} ${f(r)} 0 1 ${sweep} ${f(C - r)} ${C}Z`;
  return circle(r2, 1) + circle(r1, 0);
}

/** Repeat fn(deg, i) n times round the circle, starting at `start`. */
export function around(n, fn, start = 0) {
  let out = "";
  for (let i = 0; i < n; i++) out += fn(start + (i * 360) / n, i);
  return out;
}

/**
 * Place a motif at radius r and angle deg. Inside, the origin is that point and
 * "up" (negative y) points away from the centre, so a flame drawn pointing up
 * grows outward wherever it is put. Extra transforms (scale, a further rotate)
 * go in `extra`.
 */
export function at(r, deg, inner, extra = "") {
  return `<g transform="translate(${xy(pt(r, deg))}) rotate(${f(deg)})${extra ? " " + extra : ""}">${inner}</g>`;
}

/** Linear gradient in the 200 box. stops: [[offset 0..1, colour, opacity?], ...]. */
export function lin(id, stops, [x1, y1, x2, y2] = [0, 0, 0, 200]) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopTags(stops)}</linearGradient>`;
}
/** Radial gradient in the 200 box. */
export function rg(id, stops, [cx = C, cy = C, r = 100, fx, fy] = []) {
  const focal = fx !== undefined ? ` fx="${fx}" fy="${fy}"` : "";
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${r}"${focal}>${stopTags(stops)}</radialGradient>`;
}
/** Conic-ish gradient is not in SVG: use wedges (see wedges()). */
function stopTags(stops) {
  return stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("");
}

/** A ring cut into n equal wedges, each filled by pick(i). Gives faceted, bevelled and shard looks. */
export function wedges(r1, r2, n, pick, start = 0) {
  return around(n, (deg, i) => `<path d="${sector(r1, r2, deg, deg + 360 / n + 0.35)}" fill="${pick(i, deg)}"/>`, start);
}

/** A star with n points. */
export function star(cx, cy, R, r, n = 5, rot = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rad(rot + (i * 180) / n);
    const rr = i % 2 ? r : R;
    pts.push([cx + rr * Math.sin(a), cy - rr * Math.cos(a)]);
  }
  return poly(pts);
}
/** A four-point sparkle (concave diamond). */
export function spark(cx, cy, R, waist = 0.18) {
  const w = R * waist;
  return `M${f(cx)} ${f(cy - R)}Q${f(cx + w)} ${f(cy - w)} ${f(cx + R)} ${f(cy)}Q${f(cx + w)} ${f(cy + w)} ${f(cx)} ${f(cy + R)}Q${f(cx - w)} ${f(cy + w)} ${f(cx - R)} ${f(cy)}Q${f(cx - w)} ${f(cy - w)} ${f(cx)} ${f(cy - R)}Z`;
}

/**
 * The standard edge work, so frames read as one family on a dark page:
 * a dark outline just outside the band and a thin dark line where the band
 * meets the avatar. Draw these last (or first, for the outline) around your band.
 */
export function outline(r, w = 1.6, colour = "#07060c", opacity = 0.6) {
  return `<circle cx="100" cy="100" r="${f(r)}" fill="none" stroke="${colour}" stroke-opacity="${opacity}" stroke-width="${w}"/>`;
}
/** A light arc over the top left of a band, to give it a rounded top. */
export function gloss(r, w = 2, a0 = 285, a1 = 25, opacity = 0.55, colour = "#fff") {
  return `<path d="${arc(r, a0 > a1 ? a0 - 360 : a0, a1)}" fill="none" stroke="${colour}" stroke-opacity="${opacity}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** Wrap a drawing as a standalone SVG document. */
export function doc(body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>\n`;
}
