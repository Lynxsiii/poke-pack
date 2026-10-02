/**
 * Profile stills. PNGs only — animated sprites stay premium later.
 * Art is loaded from the public PokeAPI sprite repo (same scans-as-reference
 * idea as the TCG catalog). We do not hotlink Serebii.
 */
import { avatarColor, COLOR_IDS } from "./palette.js";
import { BANNER_MOTION_LEVELS, BANNER_MOTION_NAMES } from "./level-data.js";
import { isMasteryBanner, isMasterySet, masteryBannerId, masteryBannerSet, setAccent } from "./mastery.js";

export const AVATAR_MAX = 1025;
export const SHOWCASE_MAX = 6;
export const STAT_KEYS = ["packs", "pulls", "unique", "coins"];
export const DEFAULT_STATS = ["packs", "pulls", "unique"];
export const DEFAULT_AVATAR = "25";
export const DEFAULT_STYLE = "art";
export const DEFAULT_BANNER = "aurora:gold+ember";

const SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

export const AVATARS = [
  [1, "Bulbasaur"], [2, "Ivysaur"], [3, "Venusaur"],
  [4, "Charmander"], [5, "Charmeleon"], [6, "Charizard"],
  [7, "Squirtle"], [8, "Wartortle"], [9, "Blastoise"],
  [25, "Pikachu"], [26, "Raichu"], [39, "Jigglypuff"],
  [52, "Meowth"], [54, "Psyduck"], [58, "Growlithe"], [59, "Arcanine"],
  [94, "Gengar"], [95, "Onix"], [113, "Chansey"], [123, "Scyther"],
  [129, "Magikarp"], [130, "Gyarados"], [131, "Lapras"],
  [133, "Eevee"], [134, "Vaporeon"], [135, "Jolteon"], [136, "Flareon"],
  [143, "Snorlax"], [144, "Articuno"], [145, "Zapdos"], [146, "Moltres"],
  [149, "Dragonite"], [150, "Mewtwo"], [151, "Mew"],
  [152, "Chikorita"], [155, "Cyndaquil"], [158, "Totodile"],
  [172, "Pichu"], [175, "Togepi"], [196, "Espeon"], [197, "Umbreon"],
  [248, "Tyranitar"], [249, "Lugia"], [250, "Ho-Oh"], [251, "Celebi"],
  [252, "Treecko"], [255, "Torchic"], [258, "Mudkip"],
  [282, "Gardevoir"], [303, "Mawile"], [306, "Aggron"],
  [359, "Absol"], [373, "Salamence"], [376, "Metagross"],
  [380, "Latias"], [381, "Latios"], [382, "Kyogre"], [383, "Groudon"], [384, "Rayquaza"],
  [385, "Jirachi"], [386, "Deoxys"],
  [387, "Turtwig"], [390, "Chimchar"], [393, "Piplup"],
  [445, "Garchomp"], [448, "Lucario"], [468, "Togekiss"],
  [470, "Leafeon"], [471, "Glaceon"], [474, "Porygon-Z"],
  [483, "Dialga"], [484, "Palkia"], [485, "Heatran"], [487, "Giratina"],
  [491, "Darkrai"], [492, "Shaymin"], [493, "Arceus"],
  [495, "Snivy"], [498, "Tepig"], [501, "Oshawott"],
  [571, "Zoroark"], [609, "Chandelure"], [637, "Volcarona"],
  [643, "Reshiram"], [644, "Zekrom"], [646, "Kyurem"],
  [647, "Keldeo"], [649, "Genesect"],
  [650, "Chespin"], [653, "Fennekin"], [656, "Froakie"], [658, "Greninja"],
  [700, "Sylveon"], [706, "Goodra"], [718, "Zygarde"],
  [719, "Diancie"], [720, "Hoopa"], [721, "Volcanion"],
  [722, "Rowlet"], [725, "Litten"], [728, "Popplio"],
  [778, "Mimikyu"], [784, "Kommo-o"],
  [791, "Solgaleo"], [792, "Lunala"], [800, "Necrozma"],
  [807, "Zeraora"], [809, "Melmetal"],
  [810, "Grookey"], [813, "Scorbunny"], [816, "Sobble"],
  [887, "Dragapult"], [888, "Zacian"], [889, "Zamazenta"],
  [890, "Eternatus"], [892, "Urshifu"], [898, "Calyrex"],
  [906, "Sprigatito"], [909, "Fuecoco"], [912, "Quaxly"],
  [964, "Palafin"], [967, "Cyclizar"], [978, "Tatsugiri"],
  [1000, "Gholdengo"], [1008, "Miraidon"], [1007, "Koraidon"],
  [1010, "Iron Leaves"], [1017, "Ogerpon"], [1024, "Terapagos"], [1025, "Pecharunt"],
  [18, "Pidgeot"], [38, "Ninetales"], [65, "Alakazam"], [68, "Machamp"],
  [76, "Golem"], [80, "Slowbro"], [91, "Cloyster"], [103, "Exeggutor"],
  [110, "Weezing"], [121, "Starmie"], [127, "Pinsir"], [142, "Aerodactyl"],
  [157, "Typhlosion"], [160, "Feraligatr"], [169, "Crobat"], [181, "Ampharos"],
  [208, "Steelix"], [212, "Scizor"], [214, "Heracross"], [229, "Houndoom"],
  [230, "Kingdra"], [254, "Sceptile"], [257, "Blaziken"], [260, "Swampert"],
  [330, "Flygon"], [334, "Altaria"], [350, "Milotic"], [365, "Walrein"],
  [392, "Infernape"], [395, "Empoleon"], [405, "Luxray"], [407, "Roserade"],
  [460, "Abomasnow"], [461, "Weavile"], [462, "Magnezone"], [464, "Rhyperior"],
  [497, "Serperior"], [500, "Emboar"], [503, "Samurott"], [530, "Excadrill"],
  [635, "Hydreigon"], [663, "Talonflame"], [681, "Aegislash"], [701, "Hawlucha"],
  [724, "Decidueye"], [727, "Incineroar"], [730, "Primarina"], [745, "Lycanroc"],
  [812, "Rillaboom"], [815, "Cinderace"], [818, "Inteleon"], [849, "Toxtricity"],
  [908, "Meowscarada"], [911, "Skeledirge"], [914, "Quaquaval"], [1002, "Chien-Pao"],
];

export const BANNER_MOTIONS = [
  { id: "aurora", name: "Aurora" },
  { id: "drift", name: "Drift" },
  { id: "pulse", name: "Pulse" },
  { id: "beam", name: "Beam" },
  { id: "mist", name: "Mist" },
  // Level rewards: `level` is the first level that can wear them (js/level-data.js).
  ...Object.entries(BANNER_MOTION_LEVELS).map(([id, level]) => ({ id, name: BANNER_MOTION_NAMES[id] || id, level })),
];

/** The level a banner needs for its motion, 0 for the free motions and the mastery banners (those have their own gate). */
export function bannerMotionLevel(value) {
  const motion = parseBanner(value).motion;
  return BANNER_MOTION_LEVELS[motion] || 0;
}

const AVATAR_MAP = new Map(AVATARS.map(([id, name]) => [String(id), name]));
const MOTION_IDS = new Set(BANNER_MOTIONS.map((row) => row.id));

export function avatarId(value) {
  const n = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(n) || n < 1 || n > AVATAR_MAX) return DEFAULT_AVATAR;
  return String(n);
}

export function avatarName(id) {
  const key = avatarId(id);
  return AVATAR_MAP.get(key) || `#${key}`;
}

export function avatarStyle(value) {
  return String(value || "") === "pixel" ? "pixel" : DEFAULT_STYLE;
}

export function avatarArt(id) {
  return `${SPRITE}/other/official-artwork/${avatarId(id)}.png`;
}

export function avatarIcon(id) {
  return `${SPRITE}/${avatarId(id)}.png`;
}

export function avatarSrc(id, style) {
  return avatarStyle(style) === "pixel" ? avatarIcon(id) : avatarArt(id);
}

/**
 * Banner ids are `motion:colorA+colorB` (palette ids), or `mastery:<setId>`,
 * the exclusive banner a set's mastery unlocks. For the mastery form `colors`
 * holds the default banner's palette ids so callers that read `.colors[0]`
 * keep working, `set` names the set, and bannerVars gives the real hexes.
 * An unknown set id falls back to the default banner.
 */
export function parseBanner(value) {
  const raw = String(value || DEFAULT_BANNER);
  if (isMasteryBanner(raw)) {
    const set = masteryBannerSet(raw);
    if (isMasterySet(set)) return { motion: "mastery", colors: DEFAULT_BANNER.split(":")[1].split("+"), set };
    return parseBanner(DEFAULT_BANNER);
  }
  const [motionRaw, colorRaw] = raw.split(":");
  const motion = MOTION_IDS.has(motionRaw) ? motionRaw : "aurora";
  const colors = String(colorRaw || "gold+ember")
    .split("+")
    .map((id) => (COLOR_IDS.has(id) ? id : "gold"))
    .slice(0, 2);
  if (colors.length < 1) colors.push("gold");
  if (colors.length < 2) colors.push(colors[0] === "gold" ? "ember" : "gold");
  return { motion, colors };
}

export function bannerId(value) {
  const parsed = parseBanner(value);
  if (parsed.set) return masteryBannerId(parsed.set);
  return `${parsed.motion}:${parsed.colors.join("+")}`;
}

export function bannerVars(value) {
  const parsed = parseBanner(value);
  if (parsed.set) {
    const { a, b } = setAccent(parsed.set);
    return { motion: "mastery", style: `--b1:${a};--b2:${b}` };
  }
  const a = avatarColor(parsed.colors[0]).hex;
  const b = avatarColor(parsed.colors[1]).hex;
  return { motion: parsed.motion, style: `--b1:${a};--b2:${b}` };
}

export function normalizeStats(list) {
  const picked = (Array.isArray(list) ? list : DEFAULT_STATS)
    .map((key) => String(key))
    .filter((key) => STAT_KEYS.includes(key));
  const unique = [...new Set(picked)];
  return unique.length ? unique : DEFAULT_STATS.slice();
}

export function searchAvatars(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return AVATARS;
  const asNum = Number.parseInt(q, 10);
  const extra = Number.isInteger(asNum) && asNum >= 1 && asNum <= AVATAR_MAX && !AVATAR_MAP.has(String(asNum))
    ? [[asNum, `#${asNum}`]]
    : [];
  return [...AVATARS, ...extra].filter(([id, name]) => {
    return String(id) === q || name.toLowerCase().includes(q);
  });
}
