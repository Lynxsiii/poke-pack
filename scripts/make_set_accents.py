"""Derive two accent colours per playable set from the set's own artwork.

Every set's mastery hands out an exclusive look (emblem seal + profile banner)
painted in that set's colours, so the palette has to come off the set itself.

For each id in PLAYABLE_SETS (read from js/catalog.js through node) this looks
at the booster wrapper art under assets/packs/<id>/ (the wrapper list lives in
the catalog) and, when a set has no wrapper art, the set logo under
assets/cards/sets/. It builds a chroma-weighted hue histogram, takes the
strongest hue as accent A and the strongest hue at least 45 degrees away as
accent B (or a designed companion when the art is one colour), then pulls both
into a lightness and saturation band that reads on the dark theme (DESIGN.md:
bg #08080b, ink #f3f1ec).

Hand overrides live in OVERRIDES. They exist because some art is dominated by
a neutral (white wrappers, black wrappers) or by two sets sharing one hue; the
contact sheet is how you find those.

    python3 scripts/make_set_accents.py [--sheet PATH]

Writes data/set-accents.json and js/set-accents.js (the Worker imports the
latter so it never fetches the JSON). --sheet also renders a contact sheet PNG
(keep it out of the repo).
"""
from __future__ import annotations

import argparse
import colorsys
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG = (8, 8, 11)

# Hand-tuned pairs, hex "a"/"b". Anything listed here skips the derivation.
# Reasons are in the comments; keep them so the next reader knows why.
OVERRIDES: dict[str, tuple[str, str]] = {
    # Mega Evolution block
    "me55": ("#e8b64a", "#ff8f6b"),      # gold logo; champagne to rose gold
    "me5": ("#8b6cf0", "#3fc7d9"),       # Pitch Black: violet over teal
    "me4": ("#36b4ee", "#7cf0d2"),       # Chaos Rising: splash blue to foam
    "me3": ("#7fd94a", "#f2d44b"),       # Perfect Order: lime to yellow, as the logo
    "me2pt5": ("#f2a93b", "#d86bd0"),    # Ascended Heroes: amber to orchid
    "me2": ("#a35cff", "#58a8ff"),       # Phantasmal Flames: ghost purple to blue flame
    "me1": ("#59d98a", "#ff9f43"),       # Mega Evolution: the logo's green to orange rim
    "mep": ("#c5d0e6", "#59d98a"),       # ME promos: silver star, Mega Evolution green
    # Black and White
    "zsv10pt5": ("#5ab8ff", "#b48cff"),  # Black Bolt: electric blue to violet
    "rsv10pt5": ("#ff7a5c", "#ffd9a8"),  # White Flare: flare orange to cream
    # Scarlet and Violet
    "sv10": ("#f04d4d", "#b05cff"),      # Destined Rivals: crimson against violet
    "sv9": ("#35d0c4", "#ffb86b"),       # Journey Together: teal to apricot
    "sv8": ("#ffcf2e", "#ff7a3d"),       # Surging Sparks: spark yellow to orange
    "sv6": ("#a56bff", "#f5c14e"),       # Twilight Masquerade: masque purple and gold
    "sv5": ("#2fd0d8", "#7a8cff"),       # Temporal Forces: time teal to periwinkle
    "sv4pt5": ("#59d3c0", "#f47fa8"),    # Paldean Fates: mint to shiny pink
    "sv4": ("#4d8dff", "#ff5c7a"),       # Paradox Rift: rift blue to red
    "sv3": ("#ff5a3c", "#ffb04a"),       # Obsidian Flames: ember to amber
    "sv7": ("#8fa8ff", "#f0b7ff"),       # Stellar Crown: silver blue to lilac
    "sv2": ("#e0784a", "#6fe0c4"),       # Paldea Evolved: copper to seafoam
    "sv6pt5": ("#d94fc0", "#7d5cff"),    # Shrouded Fable: chain magenta to indigo
    "sv1": ("#f0454e", "#9b6cff"),       # Scarlet & Violet: scarlet to violet
    "sv8pt5": ("#ff8fd0", "#8fd0ff"),    # Prismatic Evolutions: pink to sky
    "sv3pt5": ("#ee4b5a", "#f7d774"),    # 151: Poke Ball red to Kanto gold
    "svp": ("#c5d0e6", "#6f8cff"),       # SV promos: silver star, blue
    # Sword and Shield
    "swsh12pt5": ("#eac95b", "#6aa0ff"), # Crown Zenith: crown gold to zenith blue
    "swsh12": ("#43b8e0", "#a3b1ff"),    # Silver Tempest: storm aqua to lavender
    "swsh11": ("#e2496f", "#8b5bff"),    # Lost Origin: void rose to violet
    "pgo": ("#ffd03d", "#5aa0ff"),       # Pokemon GO: the logo's yellow and blue
    "swsh10": ("#ff5fa8", "#ffc44d"),    # Astral Radiance: radiant pink to gold
    "swsh9": ("#3fa0ff", "#b47bff"),     # Brilliant Stars: star blue to violet
    "swsh8": ("#ff5cc0", "#38d0ff"),     # Fusion Strike: fusion pink to cyan
    "cel25": ("#ffc83d", "#ff4d4d"),     # Celebrations: gold and party red
    "swsh7": ("#2fd0b0", "#9be35a"),     # Evolving Skies: sky teal to green
    "swsh6": ("#6fd0ff", "#b6a4ff"),     # Chilling Reign: ice to lavender
    "swsh5": ("#3d8bff", "#ff9a3d"),     # Battle Styles: blue to fighting orange
    "swsh45": ("#45cbe0", "#ffb14a"),    # Shining Fates: shiny cyan to amber
    "swsh4": ("#ff4fa0", "#ffe14a"),     # Vivid Voltage: hot pink to volt yellow
    "swsh35": ("#f4b93a", "#34c98a"),    # Champion's Path: trophy gold to emerald
    "swsh3": ("#ff7a2f", "#9962ff"),     # Darkness Ablaze: flame to shadow violet
    "swsh2": ("#ff4f78", "#46d0ff"),     # Rebel Clash: rebel pink to cyan
    "swsh1": ("#4d7fff", "#ff5a7a"),     # Sword & Shield: sword blue, shield red
    "swshp": ("#c5d0e6", "#ffb347"),     # SWSH promos: silver star, gold
    # Promo boxes
    "mcd24": ("#3aa5ff", "#66e0d6"),     # Dragon Discovery: sky to aqua
    "tot24": ("#ff8f2e", "#9866ff"),     # Trick or Trade 2024: pumpkin to violet
    "mcd23": ("#ff4a3d", "#ffc72c"),     # Match Battle: fries red and gold
    "tot23": ("#8fdc4a", "#ff6fae"),     # Trick or Trade 2023: slime green to pink
    "smp": ("#c5d0e6", "#ff9a3c"),       # SM promos: silver star, Alola sun orange
    "mcd17": ("#ffb02e", "#ff4a3d"),     # McDonald's 2017: golden arches to red
    "mcd18": ("#ff5a3d", "#ffd84a"),     # McDonald's 2018: red to fries yellow
    "mcd19": ("#ff3d6a", "#ffc72c"),     # McDonald's 2019: berry red and gold
    "sm1": ("#f59a2e", "#4aa0e8"),  # Sun & Moon: Solgaleo sun orange to Lunala moon blue
    "sm2": ("#a45cf0", "#f0c14a"),  # Guardians Rising: island violet to guardian gold
    "sm3": ("#ff7a2a", "#5aa7e0"),  # Burning Shadows: ember orange to Necrozma blue
    "sm115": ("#e0a93a", "#7f7cff"),  # Hidden Fates: gold logo to shiny violet
    "sm12": ("#3fc5d8", "#ff9f3f"),  # Cosmic Eclipse: eclipse teal to sun orange
    "det1": ("#f4c531", "#e0413f"),  # Detective Pikachu: Pikachu yellow to Poke Ball red
    "sm10": ("#f2b632", "#8a78e6"),     # Unbroken Bonds: bond yellow to Marshadow violet
    "sm11": ("#c15bf0", "#59c8f0"),     # Unified Minds: Mewtwo purple to Espeon cyan
    "sm6": ("#a45cff", "#f2b84a"),       # Forbidden Light: Necrozma violet to gold
    "sm7": ("#37d6a0", "#ffc83d"),       # Celestial Storm: storm green to star yellow
    "sm75": ("#ffb62e", "#e6492d"),      # Dragon Majesty: dragon gold to flame red
    "sm8": ("#ffb02e", "#8a5cff"),     # Lost Thunder: thunder yellow to storm violet
    "sm9": ("#5aa9ff", "#ff5c8a"),     # Team Up: team blue to logo pink
    "sm35": ("#f2b53c", "#e2609e"),  # Shining Legends: shining gold to Mew pink
    "sm4": ("#e8403f", "#ffb347"),  # Crimson Invasion: invasion red to Guzzlord amber
    "sm5": ("#8a7dff", "#ffb347"),  # Ultra Prism: prism violet to Necrozma gold
    "xy9": ("#f29a2e", "#4d84e8"),  # BREAKpoint: BREAK orange to wrapper blue
    "g1": ("#e8473f", "#f2c14e"),  # Generations: Charizard red to Pikachu gold
    "xy10": ("#e6b84a", "#5f8fe0"),  # Fates Collide: chrome gold to Lugia blue
    "xy4": ("#d24fbf", "#ff8a3d"),  # Phantom Forces: phantom magenta to logo orange
    "xy5": ("#ff7a3a", "#4aa3ff"),  # Primal Clash: Primal Groudon orange to Primal Kyogre blue
    "dc1": ("#e5484d", "#27b3c9"),  # Double Crisis: Team Magma red to Team Aqua teal
    "xy1": ("#4aa3ec", "#e8453c"),  # XY: Xerneas blue to Yveltal red
    "xy2": ("#ff8a2a", "#4ab3ff"),  # Flashfire: flame orange to Mega Charizard X blue flame
    "xy3": ("#e8503a", "#38b6a0"),  # Furious Fists: fist red to Hawlucha teal
    # XY block (b3)
    "xy6": ("#7fd04e", "#f2c542"),
    "xy7": ("#a46be0", "#e8b84a"),
    "xy8": ("#e5533d", "#4db3ea"),
    # XY block (b6): promos, McDonald's 2014-2016, the Trainer Kit half decks
    "xyp": ("#c5d0e6", "#ff7ab6"),       # XY promos: silver star, Fairy pink
    "mcd14": ("#ffb02e", "#4aa3ec"),     # McDonald's 2014: golden arches to Kalos blue
    "mcd15": ("#ffb02e", "#e8453c"),     # McDonald's 2015: golden arches to Omega Ruby red
    "mcd16": ("#ffb02e", "#59c8f0"),     # McDonald's 2016: golden arches to sky blue
    "xytk6a": ("#9a7bf0", "#45b6d0"),    # Noivern kit: bat violet to echo teal
    "xytk6b": ("#ff8fc8", "#8ad0ff"),    # Sylveon kit: ribbon pink to fairy blue
    "xytk7a": ("#e0566c", "#9fb0c4"),    # Bisharp kit: blade red to steel
    "xytk7b": ("#ff8fc8", "#ffd36b"),    # Wigglytuff kit: balloon pink to gold
    "xytk8a": ("#4aa3ff", "#c9b3ff"),    # Latios kit: sky blue to lavender
    "xytk8b": ("#ff6f86", "#ffc4cf"),    # Latias kit: red to blush
    "xytk9a": ("#ffd23f", "#ff6a4a"),    # Pikachu Libre kit: electric yellow to mask red
    "xytk9b": ("#4fc3f7", "#a6e1ff"),    # Suicune kit: aurora blue
    "xy11": ("#f0a23a", "#4fa3d9"),  # Steam Siege: gear gold to steam blue
    "xy12": ("#f2652d", "#5bb3e8"),  # Evolutions: Charizard orange to Blastoise blue
    "xy0": ("#69c35a", "#f2823a"),  # Kalos Starter Set: Chespin green to Fennekin orange
    "bw1": ("#4fa8ff", "#ff7a3a"),  # Black & White: Zekrom blue to Reshiram orange
    "bw2": ("#e5533d", "#8fd04e"),  # Emerging Powers: wrapper red to Tornadus green
    "bw3": ("#38a8e6", "#f2a93b"),  # Noble Victories: wrapper blue to Victini gold
    "bw4": ("#f2c23a", "#3f8ff0"),  # Next Destinies: wrapper gold to Zekrom blue
    "bw5": ("#b45ce6", "#ff9a2e"),  # Dark Explorers: wrapper purple to Scrafty orange
    "bw6": ("#4cc95a", "#ee4b2b"),  # Dragons Exalted: wrapper green to Rayquaza flame red
    "dv1": ("#a4d63a", "#f08a24"),  # Dragon Vault: lava-lime to Dragonite orange
    "bw7": ("#ff6a3d", "#4cc9f0"),  # Boundaries Crossed: Keldeo mane orange to frost cyan
    "bw8": ("#2f9bff", "#ff8c42"),  # Plasma Storm: storm blue to Charizard orange
    "bw9": ("#2ed3c6", "#ff5d73"),  # Plasma Freeze: freeze teal to Deoxys red
    # Black & White block (c5): promos, McDonald's 2011-2012, the Trainer Kit half decks
    "bwp": ("#c5d0e6", "#4d8be0"),  # BW promos: silver star to Unova blue
    "mcd11": ("#ffb02e", "#3fbf9a"),  # McDonald's 2011: golden arches to Snivy green
    "mcd12": ("#ffb02e", "#e8663d"),  # McDonald's 2012: golden arches to Tepig orange
    "bwtk5a": ("#e0566c", "#8a6fe0"),  # Zoroark kit: mane red to illusion violet
    "bwtk5b": ("#d0a24a", "#9fb0c4"),  # Excadrill kit: drill gold to steel
    "hgss1": ("#f0a33a", "#7fb4e8"),  # HeartGold & SoulSilver: Ho-Oh gold-orange to Lugia silver-blue
    "hgss2": ("#2fb7a6", "#f0803a"),  # HS Unleashed: teal wrapper to Entei orange
    "hgss3": ("#d8483a", "#e8b04a"),  # HS Undaunted: red foil to amber
    "hgss4": ("#3b8fd9", "#f0a52f"),  # HS Triumphant: Palkia blue to Magmortar amber
    "col1": ("#e8453c", "#9bb6d8"),  # Call of Legends: legend red to silver blue
    # Diamond & Pearl generation (d5): promos, POP Series 6-9, the Trainer Kit half decks
    "dpp": ("#cfd6e8", "#8479e0"),  # DP promos: silver star to Sinnoh violet
    "hsp": ("#e3c15a", "#c9d3dd"),  # HGSS promos: gold star to silver
    "pop6": ("#8cc8f2", "#7a86e8"),  # POP 6: Lucario ice blue to periwinkle
    "pop7": ("#f09a4d", "#46a37a"),  # POP 7: Gallade orange to green
    "pop8": ("#c4ccd8", "#e5742f"),  # POP 8: Heatran silver to lava orange
    "pop9": ("#f2c230", "#6f78e0"),  # POP 9: Garchomp yellow to violet-blue
    "dptk3a": ("#4bb3e0", "#7a8cf0"),  # Manaphy kit: sea blue to periwinkle
    "dptk3b": ("#e8873a", "#5a8de0"),  # Lucario kit: orange to aura blue
    "hgsstk4a": ("#2f8fd9", "#e0605a"),  # Gyarados kit: sea blue to coral red
    "hgsstk4b": ("#f2c230", "#e0793a"),  # Raichu kit: yellow to orange
    "bw10": ("#ff9a2e", "#3aa0ff"),  # Plasma Blast: wrapper orange to Team Plasma blue
    "bw11": ("#f2b632", "#8f7be8"),  # Legendary Treasures: Radiant gold to Mewtwo violet
    # Diamond & Pearl block (d1)
    "dp1": ("#4f8fe8", "#d96ad0"),   # Diamond & Pearl: Dialga blue to Palkia pink
    "dp2": ("#ff7a2e", "#3aa8d8"),   # Mysterious Treasures: Magmortar orange to lake-trio blue
    "dp3": ("#58c25a", "#d4508f"),   # Secret Wonders: wrapper green to Honchkrow magenta
    "pl1": ("#4aa3e0", "#e8a33a"),  # Platinum: Shaymin sky blue to Giratina gold
    "pl2": ("#f08a2a", "#3f9be0"),  # Rising Rivals: Rotom orange to wrapper blue
    "pl3": ("#d24a3f", "#6f7fd1"),  # Supreme Victors: wrapper red to Absol night violet
    "pl4": ("#e8c04a", "#5fb7e8"),  # Arceus: ring gold to ice-water blue
    "dp4": ("#7a6be0", "#e3b94a"),  # Great Encounters: Darkrai violet to Dialga gold
    "dp5": ("#2f9be0", "#f2c744"),  # Majestic Dawn: Empoleon blue to logo gold
    "dp6": ("#f08a1c", "#3b82d9"),  # Legends Awakened: wrapper orange to Lucario blue
    "dp7": ("#9a63d6", "#e5533d"),  # Stormfront: storm purple to Infernape red
    # EX era (e2)
    "ex5": ("#5aa9d8", "#d9473f"),  # EX Hidden Legends: Metagross steel blue to wrapper logo red
    "ex6": ("#f08a2a", "#7fcf3c"),  # EX FireRed & LeafGreen: FireRed orange to LeafGreen
    "ex7": ("#e5532d", "#8a68c8"),  # EX Team Rocket Returns: Rocket R red to wrapper violet
    "ex8": ("#d7e03a", "#e0483c"),  # EX Deoxys: wrapper lime to logo red
    "neo1": ("#8cc152", "#d9534a"),  # Neo Genesis: Meganium green to the red neo logo
    "neo2": ("#d6a352", "#567ab8"),  # Neo Discovery: temple sand to night blue
    "neo3": ("#d9573a", "#4a86c8"),  # Neo Revelation: wrapper red to ruin blue
    "neo4": ("#9a69cf", "#d6c14a"),  # Neo Destiny: Dark violet to Light gold
    # EX era (e4)
    "ex13": ("#b665d4", "#e8742f"),  # Holon Phantoms: Mewtwo wrapper violet to Zangoose orange
    "ex14": ("#46b4e0", "#ee8a2e"),  # Crystal Guardians: ice-crystal blue to Charizard flame orange
    "ex15": ("#e8a22a", "#9576e0"),  # Dragon Frontiers: gold frame to Salamence violet
    "ex16": ("#2fa88c", "#e8a53a"),  # Power Keepers: wrapper teal to Raichu gold
    # Wizards of the Coast block (w2)
    "base5": ("#e0463a", "#f2c744"),  # Team Rocket: Rocket red to the gold Pokémon logo
    "gym1": ("#f08a2a", "#27b3a6"),  # Gym Heroes: wrapper orange rays to teal
    "gym2": ("#9b5de0", "#7cc83e"),  # Gym Challenge: wrapper violet to green
    "base6": ("#5a86e6", "#f2b632"),  # Legendary Collection: wrapper blue to the logo gold
    "base1": ("#e8b23a", "#5f86e6"),  # Base Set: Charizard gold-orange to wrapper blue
    "base2": ("#4fb04a", "#f2c744"),  # Jungle: wrapper green to logo gold
    "base3": ("#d9b48a", "#3f8fd0"),  # Fossil: parchment tan to logo blue
    "base4": ("#d9543e", "#3d8bd9"),  # Base Set 2: Charizard red to wrapper blue
    "ecard1": ("#e0a82e", "#3f78c8"),  # Expedition: logo gold to e-Card blue
    "ecard2": ("#35a7d6", "#6b6fd6"),  # Aquapolis: wrapper water blue to logo violet
    "ecard3": ("#3fb86a", "#d8d23a"),  # Skyridge: wrapper green to logo lime
    "si1": ("#f08a2c", "#3aa0c8"),  # Southern Islands: logo orange to lagoon blue
    # Wizards of the Coast promo sets (w5)
    "basep": ("#e0b94a", "#7f8fb8"),  # Wizards Black Star Promos: black-star gold to slate
    "bp": ("#d9503a", "#8a70d4"),  # Best of Game: Rocket red to Dark violet
    # EX era (e3)
    "ex9": ("#3fbf6a", "#4aa8e0"),  # Emerald: logo green to Deoxys sky blue
    "ex10": ("#d24fa8", "#3f78d9"),  # Unseen Forces: Raikou magenta to logo blue
    "ex11": ("#f2a02e", "#7e8aa0"),  # Delta Species: Dragonite orange to logo steel
    "ex12": ("#c4a46a", "#7aa86a"),  # Legend Maker: logo stone to wrapper green
}

# Used when a set has no art at all and no override.
FALLBACK = ("#f2c14e", "#9b6dff")


def load_sets() -> list[dict]:
    """PLAYABLE_SETS ids, tcg ids and wrapper art paths, straight from the catalog."""
    js = (
        "import('./js/catalog.js').then(m=>console.log(JSON.stringify("
        "m.PLAYABLE_SETS.map(s=>({id:s.id,name:s.name,"
        "art:(s.wrappers||[]).map(w=>w.artFallback||w.art).filter(Boolean),"
        "logo:m.setIdentity(s).logo.split('?')[0],"
        "symbol:m.setIdentity(s).symbol.split('?')[0]})))))"
    )
    out = subprocess.run(["node", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def hsl(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    return h * 360, s, l


def from_hsl(h: float, s: float, l: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, min(max(l, 0), 1), min(max(s, 0), 1))
    return round(r * 255), round(g * 255), round(b * 255)


def hex_of(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb)


def lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast(rgb, bg=BG) -> float:
    a, b = luminance(rgb), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def pixels(path: Path, width: int, alpha_min: int) -> tuple[np.ndarray, np.ndarray]:
    """Opaque RGB pixels of an image plus their alpha-free HSV."""
    im = Image.open(path).convert("RGBA")
    w = width
    h = max(1, round(im.height * w / im.width))
    im = im.resize((w, h), Image.LANCZOS)
    arr = np.asarray(im)
    keep = arr[..., 3] >= alpha_min
    rgb = arr[..., :3][keep]
    return rgb.astype(np.float64), np.asarray(Image.fromarray(arr[..., :3]).convert("HSV"))[keep].astype(np.float64)


def histogram(rgb: np.ndarray, hsv: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """72-bin hue histogram weighted by chroma; returns (hist, weights)."""
    s = hsv[:, 1] / 255
    v = hsv[:, 2] / 255
    # ignore greys, near-black and blown-out highlights: they carry no identity
    mask = (s > 0.32) & (v > 0.30)
    w = np.where(mask, s * s * v, 0.0)
    hue = hsv[:, 0] / 255 * 360
    hist = np.zeros(72)
    np.add.at(hist, (hue // 5).astype(int) % 72, w)
    # circular gaussian smoothing, sigma about 2 bins
    k = np.exp(-0.5 * (np.arange(-6, 7) / 2.0) ** 2)
    k /= k.sum()
    sm = np.zeros(72)
    for i, kv in zip(range(-6, 7), k):
        sm += np.roll(hist, i) * kv
    return sm, w


def circ(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def mean_of_hue(rgb: np.ndarray, hsv: np.ndarray, w: np.ndarray, centre: float, span: float = 20):
    hue = hsv[:, 0] / 255 * 360
    d = np.abs(((hue - centre + 180) % 360) - 180)
    sel = (d <= span) & (w > 0)
    if not sel.any():
        return None
    ww = w[sel]
    return (rgb[sel] * ww[:, None]).sum(0) / ww.sum()


def fit_a(rgb) -> tuple[int, int, int]:
    """Accent A: vivid, mid-light so it holds up against the dark theme."""
    h, s, l = hsl(rgb)
    return from_hsl(h, min(max(s, 0.62), 0.92), min(max(l, 0.55), 0.66))


def fit_b(rgb) -> tuple[int, int, int]:
    """Accent B: a touch lighter so the pair reads as a gradient, not a blob."""
    h, s, l = hsl(rgb)
    return from_hsl(h, min(max(s, 0.55), 0.9), min(max(l, 0.58), 0.72))


def companion(h: float) -> float:
    """Contrasting hue for art that is essentially one colour."""
    h %= 360
    if 20 <= h < 75:      # warm gold / orange -> violet
        return h + 205
    if 75 <= h < 170:     # greens -> warm amber
        return h - 95
    if 170 <= h < 260:    # cyan / blue -> rose
        return h + 130
    if 260 <= h < 330:    # violet / magenta -> gold
        return h - 205
    return h + 150        # reds -> teal


def card_pixels(sid: str, limit: int = 48) -> tuple[np.ndarray, np.ndarray] | None:
    """Illustration-window pixels of up to `limit` evenly spaced cards of the set.

    The card frame is yellow on every set, so only the art window is read.
    """
    files = sorted((ROOT / "assets" / "cards" / sid).glob("*-sm.webp"))
    if not files:
        return None
    step = max(1, len(files) // limit)
    rgbs, hsvs = [], []
    for f in files[::step][:limit]:
        im = Image.open(f).convert("RGB")
        w, h = im.size
        im = im.crop((round(w * 0.09), round(h * 0.13), round(w * 0.91), round(h * 0.54))).resize((32, 22), Image.LANCZOS)
        rgbs.append(np.asarray(im).reshape(-1, 3).astype(np.float64))
        hsvs.append(np.asarray(im.convert("HSV")).reshape(-1, 3).astype(np.float64))
    return np.concatenate(rgbs), np.concatenate(hsvs)


def sources(entry: dict) -> list[tuple[np.ndarray, np.ndarray, float]]:
    """(rgb, hsv, weight) per art source. The logo is the set's own palette;
    the cards say what the set is about; wrappers are mostly the shared frame."""
    out = []
    p = ROOT / entry["logo"]
    if p.exists():
        r, hv = pixels(p, 200, 200)
        if len(r):
            out.append((r, hv, 1.0))
    cp = card_pixels(entry["id"])
    if cp is not None:
        out.append((cp[0], cp[1], 0.8))
    return out


def derive(entry: dict) -> tuple[str, str] | None:
    src = sources(entry)
    if not src:
        return None
    rgbs, hsvs, hist = [], [], np.zeros(72)
    ws = []
    for rgb, hsv, wt in src:
        h, w = histogram(rgb, hsv)
        if h.sum() < 1e-6:
            continue
        hist += h / h.sum() * wt
        ws.append(w / h.sum() * wt * 72)  # per-source normalised pixel weights
        rgbs.append(rgb)
        hsvs.append(hsv)
    if not rgbs:
        return None
    rgb = np.concatenate(rgbs)
    hsv = np.concatenate(hsvs)
    w = np.concatenate(ws)
    i1 = int(hist.argmax())
    h1 = i1 * 5 + 2.5
    a_rgb = mean_of_hue(rgb, hsv, w, h1)
    if a_rgb is None:
        return None
    # second peak: strongest hue at least 45 degrees from the first
    far = np.array([circ(i * 5 + 2.5, h1) >= 45 for i in range(72)])
    h2 = None
    if far.any() and hist[far].max() >= 0.30 * hist[i1]:
        i2 = int(np.where(far, hist, -1).argmax())
        h2 = i2 * 5 + 2.5
    b_rgb = mean_of_hue(rgb, hsv, w, h2) if h2 is not None else None
    a = fit_a(a_rgb)
    if b_rgb is not None:
        b = fit_b(b_rgb)
    else:
        ha, sa, la = hsl(a)
        b = from_hsl(companion(ha), 0.72, 0.68)
    return hex_of(a), hex_of(b)


def build(sets: list[dict]) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for entry in sets:
        sid = entry["id"]
        if sid in OVERRIDES:
            a, b = OVERRIDES[sid]
        else:
            got = derive(entry)
            a, b = got if got else FALLBACK
        out[sid] = {"a": a, "b": b}
    return out


def write(accents: dict) -> None:
    (ROOT / "data" / "set-accents.json").write_text(json.dumps(accents, indent=2) + "\n")
    lines = [
        "/* Generated by scripts/make_set_accents.py from data/set-accents.json. Do not edit by hand:",
        "   change OVERRIDES in the script and run it again. Inlined so the Worker can import it. */",
        "export const SET_ACCENTS = {",
    ]
    for sid, ab in accents.items():
        lines.append(f'  "{sid}": {{ a: "{ab["a"]}", b: "{ab["b"]}" }},')
    lines.append("};")
    (ROOT / "js" / "set-accents.js").write_text("\n".join(lines) + "\n")


def sheet(sets: list[dict], accents: dict, path: Path) -> None:
    cols, tw, th = 6, 300, 190
    rows = (len(sets) + cols - 1) // cols
    im = Image.new("RGB", (cols * tw, rows * th), BG)
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
        fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except OSError:
        f = fs = ImageFont.load_default()
    for n, entry in enumerate(sets):
        x0, y0 = (n % cols) * tw, (n // cols) * th
        ab = accents[entry["id"]]
        a = tuple(int(ab["a"][i : i + 2], 16) for i in (1, 3, 5))
        b = tuple(int(ab["b"][i : i + 2], 16) for i in (1, 3, 5))
        # gradient bar
        for x in range(tw - 24):
            t = x / (tw - 25)
            col = tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))
            d.line([(x0 + 12 + x, y0 + 84), (x0 + 12 + x, y0 + 130)], fill=col)
        d.rectangle([x0 + 12, y0 + 136, x0 + 132, y0 + 158], fill=a)
        d.rectangle([x0 + 144, y0 + 136, x0 + 264, y0 + 158], fill=b)
        d.text((x0 + 14, y0 + 8), f'{entry["id"]}  {entry["name"]}'[:30], fill=(243, 241, 236), font=f)
        d.text((x0 + 16, y0 + 140), ab["a"], fill=BG, font=fs)
        d.text((x0 + 148, y0 + 140), ab["b"], fill=BG, font=fs)
        d.text((x0 + 14, y0 + 164), f"contrast {contrast(a):.1f} / {contrast(b):.1f}", fill=(145, 143, 151), font=fs)
        # wrapper thumbnails for reference
        tx = x0 + 12
        for rel in (entry["art"] or [entry["logo"]])[:4]:
            p = ROOT / rel
            if not p.exists():
                continue
            t = Image.open(p).convert("RGBA")
            t.thumbnail((60, 54) if entry["art"] else (120, 48))
            im.paste(t, (tx, y0 + 28), t)
            tx += t.width + 6
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="also write a contact-sheet PNG here")
    args = ap.parse_args()
    sets = load_sets()
    accents = build(sets)
    write(accents)
    if args.sheet:
        sheet(sets, accents, Path(args.sheet))
    print(f"wrote {len(accents)} set accents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
