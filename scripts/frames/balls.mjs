import { C, f, pt, arc, sector, donut, around, at, lin, rg, wedges, star, spark, poly, outline, gloss, doc } from "../lib/frame-art.mjs";

const deg = (r) => (r * 180) / Math.PI;
const bbox = (id, stops, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;

/**
 * The shape every ball shares: a ring that is cap-coloured on top and pale below,
 * a black equator that crosses at left and right and breaks round the button at 3 o'clock.
 * `top` and `bottom` are gradient stop lists; `button` is the push button's rim colour;
 * `extra({ r1, r2, rm })` draws decoration on the cap (it sits under the shading, so
 * it picks up the light); `defsExtra` holds its gradients.
 */
function ball({ top, bottom, band = [[0, "#24242c"], [0.5, "#0b0b0f"], [1, "#030305"]], button = "#f5f5f7", extra = () => "", defsExtra = "", sheen = 0.5 }) {
  return ({ ra }) => {
    const r1 = ra - 1.5;
    const r2 = ra + 15.5;
    const rm = (r1 + r2) / 2;
    const k = r1 / r2;
    const eq = deg(4.3 / rm); // half width of the equator in degrees
    const gap = deg(12.5 / rm); // the button housing breaks the equator on the right
    const defs =
      lin("bt", top, [34, 14, 160, 110]) +
      lin("bb", bottom, [34, 100, 160, 196]) +
      lin("bk", band, [30, 80, 170, 120]) +
      // across the band: a dark root at each edge and a lit crown in the middle
      rg("bs", [[k, "#05040a", 0.5], [k + (1 - k) * 0.2, "#05040a", 0.08], [k + (1 - k) * 0.5, "#fff", 0.22], [k + (1 - k) * 0.78, "#05040a", 0.06], [1, "#05040a", 0.5]], [C, C, r2]) +
      // along the ring: light from the top left, shade to the bottom right
      lin("bl", [[0, "#fff", sheen], [0.4, "#fff", 0], [0.62, "#05040a", 0.04], [1, "#05040a", 0.3]], [30, 22, 172, 178]) +
      bbox("bkc", [[0, "#5a5a68"], [1, "#0a0a0f"]]) +
      bbox("bkd", [[0, "#ffffff"], [1, "#b6bac6"]]) +
      defsExtra;
    const band_ = donut(r1, r2);
    const [hx, hy] = pt(rm + 3.4, 311);
    const body =
      `<path d="${sector(r1, r2, 277, 453)}" fill="url(#bt)"/>` +
      `<path d="${sector(r1, r2, 93, 277)}" fill="url(#bb)"/>` +
      extra({ r1, r2, rm }) +
      // the equator, in two pieces: the left crossing, and the right one up to the button
      `<path d="${sector(r1, r2, 270 - eq, 270 + eq)}" fill="url(#bk)"/>` +
      `<path d="${sector(r1, r2, 90 - eq, 90 - gap)}" fill="url(#bk)"/><path d="${sector(r1, r2, 90 + gap, 90 + eq)}" fill="url(#bk)"/>` +
      `<path d="${band_}" fill="url(#bs)"/><path d="${band_}" fill="url(#bl)"/>` +
      // seam hairlines either side of the equator
      [270 - eq, 270 + eq].map((a) => `<path d="M${f(pt(r1, a)[0])} ${f(pt(r1, a)[1])}L${f(pt(r2, a)[0])} ${f(pt(r2, a)[1])}" stroke="#05040a" stroke-opacity=".5" stroke-width=".7"/>`).join("") +
      // inner lip: a dark groove, then a thin catch of light on its outer side
      `<path d="${arc(r1 + 0.8, 0, 359.9)}" fill="none" stroke="#05040a" stroke-opacity=".38" stroke-width="1.5"/>` +
      `<path d="${arc(r1 + 2.2, 262, 408)}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width=".9" stroke-linecap="round"/>` +
      // outer rim catch and the soft gloss
      `<path d="${arc(r2 - 1.1, 268, 400)}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".8" stroke-linecap="round"/>` +
      gloss(rm + 3, 3.4, 296, 342, 0.5) +
      gloss(rm + 3, 1.8, 348, 12, 0.3) +
      `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="2.8" ry="1.1" transform="rotate(${f(311 + 90 - 90)} ${f(hx)} ${f(hy)})" fill="#fff" fill-opacity=".85"/>` +
      outline(r2 + 0.4, 1.5) + outline(r1 + 0.3, 1.2, "#07060c", 0.55);
    // the push button: a dark collar, a bright ring, a domed centre with its own highlight
    const btn = at(
      rm + 1.4,
      90,
      `<g transform="rotate(-90) scale(1.14)"><circle r="9.9" fill="#07060c" fill-opacity=".5"/><circle r="9" fill="url(#bkc)"/><circle r="7.2" fill="${button}"/><circle r="7.2" fill="none" stroke="#05040a" stroke-opacity=".35" stroke-width=".7"/><circle r="5.2" fill="url(#bkd)" stroke="#05040a" stroke-opacity=".5" stroke-width=".9"/><circle r="2.9" fill="url(#bkd)" stroke="#05040a" stroke-opacity=".25" stroke-width=".7"/><path d="M-6 -2.8A6.6 6.6 0 0 1 -1.6 -6.4" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-opacity=".95"/><path d="M-4.3 3.4A5.6 5.6 0 0 0 2.5 4.7" fill="none" stroke="#05040a" stroke-opacity=".28" stroke-width="1" stroke-linecap="round"/></g>`
    );
    return doc(body + btn, defs);
  };
}

/** A small round dome (the Master Ball's bumps, the Heal Ball's studs); gradient `g` is in objectBoundingBox units. */
const dome = (cx, cy, r, g, edge) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r + 0.9}" fill="#06050a" fill-opacity=".4"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="url(#${g})" stroke="${edge}" stroke-width=".7" stroke-opacity=".6"/>` +
  `<ellipse cx="${f(cx - r * 0.32)}" cy="${f(cy - r * 0.42)}" rx="${f(r * 0.42)}" ry="${f(r * 0.24)}" fill="#fff" fill-opacity=".75" transform="rotate(-28 ${f(cx - r * 0.32)} ${f(cy - r * 0.42)})"/>`;
const radialBB = (id, stops) => `<radialGradient id="${id}" cx=".35" cy=".3" r=".8">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</radialGradient>`;

/** A lightning streak at angle a on the ring. */
function bolt(rm, a, size) {
  return at(rm, a, `<path d="M${f(-size * 0.35)} ${f(size * 0.95)}L${f(size * 0.55)} ${f(-size * 0.05)}L${f(size * 0.05)} ${f(-size * 0.05)}L${f(size * 0.4)} ${f(-size * 0.95)}L${f(-size * 0.55)} ${f(size * 0.12)}L${f(-size * 0.04)} ${f(size * 0.12)}Z" fill="url(#qy)" stroke="#6a4a00" stroke-opacity=".5" stroke-width=".6" stroke-linejoin="round"/>`);
}

const WHITE_BOTTOM = [[0, "#ffffff"], [0.55, "#e3e5ec"], [1, "#a9aebb"]];

export const frames = [
  {
    id: "ball-poke",
    name: "Poké Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#ee1c25", "#f4f4f6"],
    base: ball({
      top: [[0, "#ff7468"], [0.45, "#e8222a"], [1, "#9c0c18"]],
      bottom: WHITE_BOTTOM,
    }),
  },
  {
    id: "ball-great",
    name: "Great Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#2b6fe0", "#e63a3a"],
    base: ball({
      top: [[0, "#7fb4ff"], [0.45, "#2a69dc"], [1, "#13348f"]],
      bottom: WHITE_BOTTOM,
      defsExtra: lin("gr", [[0, "#ff6a5c"], [1, "#c4121f"]], [30, 30, 170, 100]),
      extra: ({ r1, r2 }) =>
        // two red slashes, one either side of the crown
        [[300, 322], [38, 60]]
          .map(([a0, a1]) => `<path d="${sector(r1, r2, a0, a1)}" fill="url(#gr)"/><path d="${sector(r1, r2, a0, a1)}" fill="none" stroke="#5a0a12" stroke-opacity=".4" stroke-width=".7"/>`)
          .join(""),
    }),
  },
  {
    id: "ball-ultra",
    name: "Ultra Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#2a2a33", "#ffd21f"],
    base: ball({
      top: [[0, "#6b6b7a"], [0.4, "#2b2b34"], [1, "#0f0f14"]],
      bottom: WHITE_BOTTOM,
      defsExtra: lin("uy", [[0, "#fff29a"], [0.5, "#ffd21f"], [1, "#d79a00"]], [30, 30, 170, 100]),
      extra: ({ r1, r2, rm }) =>
        // an H laid round the cap: two yellow posts and the bar between them
        [[303, 320], [40, 57]].map(([a0, a1]) => `<path d="${sector(r1, r2, a0, a1)}" fill="url(#uy)"/>`).join("") +
        `<path d="${arc(rm, 318, 402)}" fill="none" stroke="url(#uy)" stroke-width="4.4"/>` +
        `<path d="${arc(rm - 2.2, 318, 402)}" fill="none" stroke="#5a3a00" stroke-opacity=".3" stroke-width=".7"/><path d="${arc(rm + 2.2, 318, 402)}" fill="none" stroke="#5a3a00" stroke-opacity=".3" stroke-width=".7"/>`,
    }),
  },
  {
    id: "ball-master",
    name: "Master Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#8a3fd6", "#ff6fb4"],
    fx: "pulse",
    fxs: 3.4,
    base: ball({
      top: [[0, "#c58cff"], [0.42, "#7b2fd0"], [1, "#35106f"]],
      bottom: [[0, "#ffffff"], [0.55, "#e8e3f1"], [1, "#aaa3bd"]],
      band: [[0, "#3a2a56"], [0.5, "#150d24"], [1, "#07040c"]],
      defsExtra: radialBB("mp", [[0, "#ffd0ea"], [0.55, "#ff5fae"], [1, "#b8267a"]]),
      extra: ({ r1, r2, rm }) => {
        // the two pink domes, a pale line between them and a dark one under it
        const [ax, ay] = pt(rm, 322);
        const [bx, by] = pt(rm, 38);
        return (
          `<path d="${arc(rm, 330, 390)}" fill="none" stroke="#e9c8ff" stroke-opacity=".5" stroke-width="1.1" stroke-linecap="round"/>` +
          `<path d="${arc(rm - 4.2, 336, 384)}" fill="none" stroke="#2a0c55" stroke-opacity=".45" stroke-width=".8" stroke-linecap="round"/>` +
          dome(ax, ay, 6.4, "mp", "#5a0f3d") +
          dome(bx, by, 6.4, "mp", "#5a0f3d")
        );
      },
    }),
    glow: ({ ra }) => {
      const rm = ra + 15.5 - 3;
      const sp = [[322, 1], [38, 1], [350, 0.7], [10, 0.7], [300, 0.6], [60, 0.6]]
        .map(([a, s]) => {
          const [x, y] = pt(rm + (s < 1 ? 4 : 0), a);
          return `<path d="${spark(x, y, 5.2 * s + 1.6, 0.14)}" fill="#fff"/>`;
        })
        .join("");
      return doc(sp);
    },
  },
  {
    id: "ball-premier",
    name: "Premier Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#f4f4f6", "#e02a34"],
    base: ball({
      top: [[0, "#ffffff"], [0.5, "#f0f1f5"], [1, "#b8bcc9"]],
      bottom: [[0, "#ffffff"], [0.55, "#ececf2"], [1, "#a9aebb"]],
      defsExtra: lin("pr", [[0, "#ff6f62"], [1, "#b50f1c"]], [30, 30, 170, 100]),
      sheen: 0.35,
      extra: ({ r1, r2, rm }) =>
        // a single red stripe round the crown, with its own thin keylines
        `<path d="${arc(rm, 296, 424)}" fill="none" stroke="url(#pr)" stroke-width="6.6"/>` +
        `<path d="${arc(rm - 3.3, 296, 424)}" fill="none" stroke="#4a0710" stroke-opacity=".35" stroke-width=".6"/><path d="${arc(rm + 3.3, 296, 424)}" fill="none" stroke="#4a0710" stroke-opacity=".35" stroke-width=".6"/>`,
    }),
  },
  {
    id: "ball-luxury",
    name: "Luxury Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#1d1d23", "#e9b73a"],
    base: ball({
      top: [[0, "#5d5d6b"], [0.4, "#1f1f26"], [1, "#07070b"]],
      bottom: [[0, "#6a6a78"], [0.55, "#2c2c34"], [1, "#101015"]],
      band: [[0, "#6a5224"], [0.5, "#1f1608"], [1, "#080603"]],
      button: "#e6b84a",
      defsExtra: lin("lg", [[0, "#fff0a8"], [0.45, "#e9b73a"], [1, "#8a5d0c"]], [30, 30, 170, 120]),
      extra: ({ r1, r2, rm }) =>
        // gold stripe across the cap and a fine gold line round the base
        `<path d="${arc(rm, 284, 436)}" fill="none" stroke="url(#lg)" stroke-width="6.2"/>` +
        `<path d="${arc(rm - 3.1, 284, 436)}" fill="none" stroke="#2a1a00" stroke-opacity=".4" stroke-width=".6"/><path d="${arc(rm + 3.1, 284, 436)}" fill="none" stroke="#2a1a00" stroke-opacity=".4" stroke-width=".6"/>` +
        `<path d="${arc(rm, 98, 262)}" fill="none" stroke="url(#lg)" stroke-width="1.3" stroke-opacity=".85"/>`,
    }),
  },
  {
    id: "ball-heal",
    name: "Heal Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#ff8fc0", "#fff1d2"],
    base: ball({
      top: [[0, "#ffc6e0"], [0.45, "#ff7fb6"], [1, "#d63d87"]],
      bottom: [[0, "#fffbee"], [0.55, "#fbeccd"], [1, "#d9c29a"]],
      defsExtra: radialBB("hd", [[0, "#fffbee"], [1, "#f6dcae"]]),
      extra: ({ r1, r2, rm }) => {
        // two cream studs and a small cross on the crown
        const [ax, ay] = pt(rm, 322);
        const [bx, by] = pt(rm, 38);
        return (
          `<path d="${arc(rm, 336, 384)}" fill="none" stroke="#fff4dc" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round"/>` +
          dome(ax, ay, 5.4, "hd", "#a8265f") +
          dome(bx, by, 5.4, "hd", "#a8265f") +
          at(rm, 0, `<path d="M-1.6 -4.6H1.6V-1.6H4.6V1.6H1.6V4.6H-1.6V1.6H-4.6V-1.6H-1.6Z" fill="#fff6e4" stroke="#a8265f" stroke-opacity=".5" stroke-width=".7" stroke-linejoin="round"/>`)
        );
      },
    }),
  },
  {
    id: "ball-quick",
    name: "Quick Ball",
    group: "Poké Balls",
    of: 0.15,
    c: ["#2a8ae6", "#ffd21f"],
    base: ball({
      top: [[0, "#8fd2ff"], [0.45, "#2f93ec"], [1, "#154fa8"]],
      bottom: [[0, "#fffdf2"], [0.55, "#f5eed6"], [1, "#c7bd9b"]],
      defsExtra: bbox("qy", [[0, "#fff6a8"], [0.5, "#ffd21f"], [1, "#e09a00"]]),
      extra: ({ r1, r2, rm }) =>
        // yellow streaks racing round the cap, the middle one longest
        bolt(rm, 314, 8) + bolt(rm, 0, 10.4) + bolt(rm, 46, 8),
    }),
  },
];
