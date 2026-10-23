/**
 * Holo family ex-gold-star: Gold Star (EX era).
 *
 * Scope: every Pokémon ★ print with the cosmos holo (`ex-star`), and the three refractor stars (`ex-refractor`: Gyarados ex13-102,
 * Charizard ex15-100 and Mew ex15-101, all delta) under their own class `fam-ex-gold-star-refractor`: on those the Pokémon
 * itself is the foil, so each has a Pokémon silhouette map (`<id>-refractor-v<VR>.webp`, make_refractor_star_maps.py) that replaces
 * the era's `--foil-map` and the sheet's refractor recipe (the cosmos stars' rules are scoped to `fam-ex-gold-star` and never touch them).
 *
 * Part of the older-era holo remaster (2026-10-01; js/holo-fam.js lists every family, first claim wins). This module
 * decides which card faces are this family's and returns what to add to the face foilExtras() built: the class
 * `fam-ex-gold-star` (every rule in css/holo/fam/ex-gold-star.css is scoped to it), any finer classes, the family's own
 * custom properties (per-card maps as `url('...')` through `url()`, which makes a repo path absolute) and `cure: true` to
 * get the extra `.cure` layer. `base` is foilExtras()'s own result ({ classes, style, cure }) for the same face, so a
 * family can read what the era module decided; a custom property set here comes after the era's in the style
 * attribute, so it wins (`--foil-map` included). `card` has been through foilLook(), so a promo's rarity is its foilAs.
 * Never import js/foil-maps.js from here (it waits on this module).
 *
 * What it adds: every claimed face has its own map, drawn from its own scan by
 * .claude/skills/card-textures/scripts/fam/ex-gold-star/make_ex_gold_star_maps.py into
 * assets/foil/fam/ex-gold-star/<card id>-v4.webp (RGBA, the art window's box of the scan): RGB is the scan's own printed cosmos dots
 * in the art window (pinpoints, dots, clover clusters, a few big discs), each one hue (its printed tint or a cosmos palette pick);
 * alpha is the foil ground, the background of the window, ending on the Pokémon's outline (the Pokémon is plain ink).
 * The map goes in as `--foil-map-xg` (its dots alone, opaque, as `--foil-map-xg-dots`), with the per-card tuning in TUNE (`--xg-sheen`, `--xg-dots`, `--xg-core`); `cure: true`
 * adds the `.cure` layer that lights the dots. A face with no map keeps the era's recipe. Reference:
 * .claude/skills/card-textures/reference/fam-ex-gold-star.md.
 */
import { isEx, exPattern } from "../ex-foil.js?v=8";

const has = (pattern, cls) => ` ${pattern || ""} `.includes(` ${cls} `);

/** Every face with a map, by set: "<set>:<numbers>" (an id is `<set>-<number>`). */
const MAPPED = new Set(
  [
    "ex7:107 108 109",
    "ex8:105 106 107",
    "ex10:113 114 115",
    "ex11:111 112 113",
    "ex12:90 91 92",
    "ex13:103 104",
    "ex14:100 99",
    "ex16:100 101 102",
  ].flatMap((row) => {
    const [s, nums] = row.split(":");
    return nums.split(" ").map((n) => `${s}-${n}`);
  }),
);
/** The maps' version: a map redrawn after it shipped lives under a new name (assets are cached as immutable). v3 (2026-10-22
 * audit): the scan's own printed dots, a hard Pokémon cut on the outline, the audit's mask fixes. v4 (review r1): cropped to the
 * art window at 456 x 279 (WebKit decodes it synchronously), the BASIC notch filled, Raikou's and Pikachu's masks fixed, and a
 * second, opaque file of the dots alone (`<id>-dots-v4.webp`) for the .cure layer. */
const V5 = new Set(["ex7-107", "ex7-109", "ex8-107", "ex10-113", "ex13-103", "ex14-99", "ex14-100"]);
/** v5 (review r2): the masks that still let foil onto the Pokémon or cut out its sky, redrawn: Rayquaza's arm and coil cut and its
 * central sky in the ground, Entei's white paws and the fur under its chest, Mudkip's left gill and foot, Treecko's pupils, Celebi's
 * eye, Mewtwo's mouth and the arm by its tail loop, Alakazam's right spoon. */
/** v6 (review r3): Entei's pale smoke (the top-centre and top-right banks, the right-edge column, two strands at the lower right), two
 * mane-spike tips and the fur fringe under its armour out of the ground (matte ink on the real card). */
const V6 = new Set(["ex10-113"]);
const mapVersion = (card) => (V6.has(card.id) ? 6 : V5.has(card.id) ? 5 : 4);

/**
 * Per-card tuning, from the audit photos: `sheen` scales the mirror ground (1 on light skies that light up as a silver sheet:
 * Torchic, Latias, Rayquaza, Suicune; down to 0.35 on dark windows that stay dark in hand: Treecko's bark), `dots` the dots'
 * flash (Mewtwo is the quietest of the stars), `core` the sheen's colour (warm gold on Regice's and Registeel's red-brown skies
 * and Suicune's light rays, as the lit photos show; silver elsewhere), `wash` a broad tint round the lamp (Regice and Registeel
 * go warm gold all over), `pastel` the strength of the band's pastel edges (violet, blue, green: strongest on the JP Latias
 * photo; 0.4 by default, a hint of colour round a silver sheet).
 */
const GOLD_CORE = "hsla(42, 45%, 84%, 0.85)";
/** A warm wash round the lamp, for the skies that go gold all over when lit (Regice, Registeel; review r1). */
const GOLD_WASH = "hsla(38, 95%, 52%, 0.95)";
const TUNE = {
  "ex7-107": { sheen: 0.6 },
  "ex7-108": { sheen: 1, pastel: 0.6 },
  "ex7-109": { sheen: 0.35 },
  "ex8-105": { sheen: 1, pastel: 1 },
  "ex8-106": { sheen: 0.6 },
  "ex8-107": { sheen: 1, pastel: 0.6 },
  "ex10-113": { sheen: 0.6 },
  "ex10-114": { sheen: 0.5 },
  "ex10-115": { sheen: 1, core: GOLD_CORE },
  "ex11-111": { sheen: 0.7 },
  "ex11-112": { sheen: 0.7 },
  "ex11-113": { sheen: 0.6 },
  "ex12-90": { sheen: 1, core: GOLD_CORE, wash: GOLD_WASH, pastel: 0.12 },
  "ex12-91": { sheen: 0.6 },
  "ex12-92": { sheen: 0.9, core: GOLD_CORE, wash: GOLD_WASH, pastel: 0.12 },
  "ex13-103": { sheen: 0.45, dots: 0.6 },
  "ex13-104": { sheen: 0.7 },
  "ex14-99": { sheen: 0.6, dots: 1.25 },
  "ex14-100": { sheen: 0.5, dots: 1.25 },
  "ex16-100": { sheen: 0.7 },
  "ex16-101": { sheen: 0.9 },
  "ex16-102": { sheen: 0.6, core: GOLD_CORE },
};
const tuneStyle = (id) => {
  const t = TUNE[id] || {};
  return [
    t.sheen != null ? `--xg-sheen:${t.sheen}` : "",
    t.dots != null ? `--xg-dots:${t.dots}` : "",
    t.core ? `--xg-core:${t.core}` : "",
    t.wash ? `--xg-wash:${t.wash}` : "",
    t.pastel != null ? `--xg-pastel:${t.pastel}` : "",
  ].filter(Boolean).map((d) => `;${d}`).join("");
};

/** Fetch and decode a map as the face mounts, so the first lit frame has it (WebKit painted no dots, or a flat sheet, on a
 * first light while the image was still decoding). Browser only; the census runs this module in Node. */
const decoded = new Set();
function preload(src) {
  if (typeof Image === "undefined" || decoded.has(src)) return;
  decoded.add(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    if (img.decode) img.decode().catch(() => {});
  } catch {
    /* a preload is only a hint */
  }
}

/** Whether a card face is this family's. */
export function claims(card) {
  return Boolean(card) && !card.reverse && isEx(card) && has(exPattern(card), "ex-star") && !has(exPattern(card), "ex-refractor");
}

/** The refractor stars with a silhouette map (the Pokémon is the foil). */
const REFRACTOR = new Set(["ex13-102", "ex15-100", "ex15-101"]);
/** The silhouette maps' versions: v3 (review r1) for all three; v4 (review r2) for Gyarados (two alpha levels: the pale fins, crest
 * and head at 1, the red body and gold belly at 0.3, so the rainbow tints the body instead of recolouring it) and Charizard (its
 * flame breath runs out of the window over the frame, as printed); v5 (review r3) for Charizard: the black sky right of the torso
 * below the arm, right of the neck and under the jaw cut back to the printed outline (it lit as blue blocks), and Gyarados: the light
 * pink head behind the crest drops to 0.35 (it went an even magenta with the fins; the JP photo keeps it salmon-red). */
const VR = { "ex13-102": 5, "ex15-100": 5, "ex15-101": 3 };
/** Charizard's flames outside its body (white), for the warm term that lights them red-orange (make_refractor_star_maps.py). */
const FLAME = { "ex15-100": "assets/foil/fam/ex-gold-star/ex15-100-flame-v1.webp" };
/** Pale prints take the refractor spectrum by overlay (screen washes Mew's mint ink to white). */
const PALE = new Set(["ex13-102", "ex15-101"]);
/** The dark print (Charizard) takes a cool spectrum, darker and weaker: screened yellow turned its body a flat cream cut-out
 * and washed its ink out (review r1); the tilted photo shows green, cyan, blue and violet with the ink still reading. */
const DARK = new Set(["ex15-100"]);
/** Gyarados takes a pastel cycle on its two-level map: the saturated one recoloured the red body (review r2). */
const PASTEL = new Set(["ex13-102"]);

export function famExtras(card, url, base) {
  if (Boolean(card) && !card.reverse && REFRACTOR.has(card.id) && isEx(card) && has(exPattern(card), "ex-refractor")) {
    return {
      classes: `fam-ex-gold-star-refractor${PALE.has(card.id) ? " gsr-pale" : ""}${DARK.has(card.id) ? " gsr-dark" : ""}${PASTEL.has(card.id) ? " gsr-pastel" : ""}`,
      style: `--foil-map:url('${url(`assets/foil/fam/ex-gold-star/${card.id}-refractor-v${VR[card.id]}.webp`)}')${
        FLAME[card.id] ? `;--gsr-flame:url('${url(FLAME[card.id])}')` : ""
      }`,
      cure: false,
    };
  }
  if (!claims(card) || !MAPPED.has(card.id)) return null;
  const src = url(`assets/foil/fam/ex-gold-star/${card.id}-v${mapVersion(card)}.webp`);
  const dots = url(`assets/foil/fam/ex-gold-star/${card.id}-dots-v${mapVersion(card)}.webp`);
  preload(src);
  preload(dots);
  return {
    classes: "fam-ex-gold-star",
    style: `--foil-map-xg:url('${src}');--foil-map-xg-dots:url('${dots}')${tuneStyle(card.id)}`,
    cure: true,
  };
}
