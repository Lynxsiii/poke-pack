#!/usr/bin/env python3
"""Writes the sheets of the plain-mirror reverse families from one recipe (2026-11-28 reverse round).

    python3 make_sheets.py     # css/holo/fam/{wotc,pop,me,misc}-reverse.css

One recipe, because one fault: every reverse face no family owned was a colour-dodged or multiplied light laid over
the whole foil area (text boxes blown to flat white, an even orange-to-lemon wash, straight rainbow bars), or the
generic cosmos tile (white cracked blotches). A real mirror reverse is ink over a smooth metallised sheet:

  at rest   the ink over foil reads a touch deeper and cooler than the paper print; nothing else.
  lit       ONE pool of light round the lamp: the sheet's pastel spectrum (two or three hues across the pool, never a
            bar down the card), a white core, and nothing at all 60% of the way from the lamp. Text stays readable.

Layers (every rule is scoped to the family's class, repeated to outrank the era sheets):
  .foil          multiply: [a white veil that opens round the pointer] over [the pastel spectrum, one cycle about 1.35
                 cards wide, sliding with the tilt] over the resting floor. White ink takes the hue, dark ink keeps its own.
  .foil::before  screen, lit only: the same spectrum times a pool that ends in black, low: the sheen dark ink shows.
  .glare         overlay: a white pool at the pointer (scales with the ink under it, black stays black).
  mask           var(--art) x the family's foil area (per family below).
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), *[".."] * 6))
REPEAT = 8

MASK_ALPHA = """  -webkit-mask-image: var(--art), var({var});
  mask-image: var(--art), var({var});
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  mask-mode: alpha, alpha;
  -webkit-mask-size: contain, 100% 100%;
  mask-size: contain, 100% 100%;
  -webkit-mask-position: center, center;
  mask-position: center, center;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat;
  clip-path: none;"""

MASK_WINDOW = """  -webkit-mask-image: var(--art), var({var});
  mask-image: var(--art), var({var});
  -webkit-mask-composite: source-out;
  mask-composite: subtract;
  mask-mode: alpha, alpha;
  -webkit-mask-size: contain, contain;
  mask-size: contain, contain;
  -webkit-mask-position: center, center;
  mask-position: center, center;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat;
  clip-path: {clip};"""

MASK_ART = """  -webkit-mask-image: var(--art);
  mask-image: var(--art);
  -webkit-mask-composite: source-over;
  mask-composite: add;
  mask-mode: alpha;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  clip-path: {clip};"""

MASK_TILE = """  -webkit-mask-image: var(--art), var(--rev-pattern), var({win});
  mask-image: var(--art), var(--rev-pattern), var({win});
  -webkit-mask-composite: source-in, source-out;
  mask-composite: intersect, subtract;
  mask-mode: alpha, alpha, alpha;
  -webkit-mask-size: contain, contain, contain;
  mask-size: contain, contain, contain;
  -webkit-mask-position: center, center, center;
  mask-position: center, center, center;
  -webkit-mask-repeat: no-repeat, no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat, no-repeat;
  clip-path: none;"""

SPECTRUM = (
    "linear-gradient(118deg, hsl(268, 85%, 82%) 0%, hsl(222, 95%, 81%) 14%, hsl(186, 90%, 77%) 28%, "
    "hsl(132, 75%, 78%) 42%, hsl(58, 90%, 75%) 57%, hsl(24, 95%, 79%) 71%, hsl(350, 85%, 82%) 85%, hsl(268, 85%, 82%) 100%)"
)
SPECTRUM_POS = "calc(50% + (var(--background-x) - 50%) * 3) calc(50% + (var(--background-y) - 50%) * 3)"

RECIPE = """
{S} {{
  --mr-floor: {floor};
  --mr-tint: {tint};
  --mr-dark: {dark};
  --mr-glare: {glare};
}}
/* .foil: the sheet under the ink. Away from the lamp only the resting floor; round it the spectrum. */
{S} .foil,
{S}:not(.lit):not(.settling) .foil {{
  background-color: transparent;
  background-image:
    linear-gradient(var(--mr-floor), var(--mr-floor)),
    radial-gradient(circle at var(--pointer-x) var(--pointer-y),
      hsla(0, 0%, 100%, calc(1 - var(--mr-tint))) 0%, hsla(0, 0%, 100%, calc(1 - var(--mr-tint) * 0.85)) 22%,
      hsla(0, 0%, 100%, calc(1 - var(--mr-tint) * 0.4)) 46%, hsl(0, 0%, 100%) 74%),
    {spectrum};
  background-blend-mode: multiply, normal, normal;
  background-size: 100% 100%, 100% 100%, 135% 135%;
  background-position: center, center, {pos};
  background-repeat: no-repeat, no-repeat, repeat;
  filter: none;
  mix-blend-mode: multiply;
  opacity: var(--foil-strength, 1);
}}
/* At rest: the floor alone (no pool, no hue){rest_note}. */
{S}:not(.lit):not(.settling) .foil {{
  background-image: {rest_image};
  background-blend-mode: {rest_blend};
  background-size: {rest_size};
  background-position: center;
  background-repeat: no-repeat;
}}
/* Dark ink cannot show a multiplied hue: a low screened pool of the same spectrum, black away from the lamp. */
{S} .foil::before {{
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at var(--pointer-x) var(--pointer-y), hsl(0, 0%, 100%) 0%, hsl(0, 0%, 62%) 20%, hsl(0, 0%, 22%) 44%, hsl(0, 0%, 0%) 72%),
    {spectrum};
  background-blend-mode: multiply, normal;
  background-size: 100% 100%, 135% 135%;
  background-position: center, {pos};
  background-repeat: no-repeat, repeat;
  -webkit-mask-image: none;
  mask-image: none;
  filter: saturate(1.5);
  mix-blend-mode: screen;
  opacity: calc(var(--mr-dark) * var(--card-opacity));
}}
{after}{S} .glare::after {{
  background-image: none;
  -webkit-mask-image: none;
  mask-image: none;
  filter: none;
  mix-blend-mode: normal;
}}
/* .glare: the lamp's core. */
{S} .glare {{
  background-image: radial-gradient(circle at var(--pointer-x) var(--pointer-y),
    hsla(0, 0%, 100%, 0.85) 0%, hsla(0, 0%, 100%, 0.5) 20%, hsla(0, 0%, 100%, 0.16) 44%, hsla(0, 0%, 100%, 0) 70%);
  background-size: 100% 100%;
  background-position: center;
  filter: none;
  mix-blend-mode: overlay;
  opacity: calc(var(--mr-glare) * var(--card-opacity));
}}
"""

FAMILIES = {
    "wotc-reverse": dict(
        head="""Holo family wotc-reverse (reverse round, 2026-11-28): the reverse faces of Base Set to Neo Destiny (base1-base5, gym1-2,
 * neo1-4; js/fam/wotc-reverse.js). No such print exists (Wizards' first reverse is Legendary Collection); the game data
 * deals them, so they wear the plain mirror of the first real ones, the whole face inside the yellow border but the
 * picture. They were on sv-reverse.css's colour-dodged mirror under the Scarlet & Violet art window: a matte box 30 px
 * off the print (a foil strip along the picture's bottom and right edges) and a text box blown to flat white.
 * Mask: assets/foil/fam/wotc-reverse/<layout>-v1.webp (scripts/fam/wotc-reverse/make_masks.py).""",
        floor="hsl(215, 14%, 91%)", tint="0.8", dark="0.36", glare="0.75",
        masks=[("", MASK_ALPHA.format(var="--wr-mask"))],
    ),
    "pop-reverse": dict(
        head="""Holo family pop-reverse (reverse round, 2026-11-28): the reverse faces of POP Series 6-9 (js/fam/pop-reverse.js), which
 * the dp-reverse family leaves out. They were on dp.css's Mirror: 1.5-5% spectrum stripes that read as straight
 * vertical rainbow bars over the frame and text at phone size. Mask: the dp-reverse family's own frame masks
 * (assets/foil/fam/dp-reverse/dp-<layout>.webp).""",
        floor="hsl(215, 14%, 91%)", tint="0.8", dark="0.36", glare="0.75",
        masks=[("", MASK_ALPHA.format(var="--pr-mask"))],
    ),
    "me-reverse": dict(
        head="""Holo family me-reverse (reverse round, 2026-11-28): the Mega Evolution reverses (me1-me6, me2pt5 and the 30th
 * Celebration me55; js/fam/me-reverse.js). TCG Live's reverse maps are a plain mirror for the whole era
 * (reference/sv-reverse.md). They were on sv-reverse.css's colour-dodged mirror, which blew every pale text box to
 * flat white or laid an even orange-to-lemon wash over a coloured one; me55 had no finish at all and fell to the
 * generic cosmos tile (white cracked blotches). Mask: the card less the layout's art window, as windows.css cuts it.""",
        floor="hsl(215, 14%, 92%)", tint="0.8", dark="0.36", glare="0.7",
        masks=[
            ("", MASK_WINDOW.format(var="--win-holo", clip="none")),
            (".foil-evo", MASK_WINDOW.format(var="--win-evo", clip="none")),
            (".foil-owner", MASK_WINDOW.format(var="--win-owner", clip="none")),
            (".foil-energy", MASK_WINDOW.format(var="--win-holo-energy", clip="none")),
            (".foil-trainer", MASK_WINDOW.format(var="--win-holo-trainer", clip="none")),
        ],
    ),
    "misc-reverse": dict(
        head="""Holo family misc-reverse (reverse round, 2026-11-28): the reverse faces no era finish covered (js/fam/misc-reverse.js):
 * Trick or Trade 2023 and 2024, VMAX Climax's basic Energy, and Sun & Moon's Special Energy. They fell to
 * rarities.css's generic reverse, the cosmos tile colour-dodged at 180 px: white cracked blotches over the text box
 * and frame, with a hard edge where the Scarlet & Violet window mask ended. They take the plain mirror instead.
 * Mask: the card less the layout's art window; a basic Energy is foil edge to edge inside its border.""",
        floor="hsl(215, 14%, 92%)", tint="0.8", dark="0.36", glare="0.7",
        masks=[
            ("", MASK_WINDOW.format(var="--win-holo", clip="none")),
            (".foil-evo", MASK_WINDOW.format(var="--win-evo", clip="none")),
            (".foil-owner", MASK_WINDOW.format(var="--win-owner", clip="none")),
            (".foil-trainer", MASK_WINDOW.format(var="--win-holo-trainer", clip="none")),
            (".foil-energy", MASK_WINDOW.format(var="--win-holo-energy", clip="none")),
            (".foil-energy.mx-basic", MASK_ART.format(clip="inset(2.6% 3.6% 2.6% 3.6% round 3%)")),
        ],
        # a basic Energy is foil edge to edge, picture included: the hue pool is held back so it does not tint the symbol
        extra_vars=[(".mx-basic", "--mr-tint: 0.5;")],
    ),
    "sm-reverse": dict(
        head="""Holo family sm-reverse (reverse round, 2026-11-28): the Sun & Moon reverses of Fighting and Colorless Pokemon
 * (js/fam/sm-reverse.js). The era's recipe (sm.css `rev-sm`: the type tile times a spectrum band, colour-dodged) suits
 * the saturated bodies, but on Fighting's orange it glares bright yellow and washes the flavour text, and on
 * Colorless's near-white it blows the text box to flat white. These two take the mirror recipe with the era's own
 * tile (--rev-pattern) as the sheet's pattern: multiplied faintly into the print, and the lamp's core follows it.
 * Mask: sv-reverse.css's (the tile's alpha less the layout's window) on both layers; the glare takes the tile's
 * luminance too, so the pale symbols catch more light than the lines between them.""",
        floor="hsl(215, 12%, 93%)", tint="0.8", dark="0.3", glare="1", tex="--rev-pattern", tex_veil="0.78",
        masks=[
            ("", MASK_TILE.format(win="--win-holo")),
            (".foil-evo", MASK_TILE.format(win="--win-evo")),
            (".foil-owner", MASK_TILE.format(win="--win-owner")),
        ],
        glare_mask_mode="alpha, luminance, alpha",
    ),
}

AFTER_NONE = """{S} .foil::after {{
  background-image: none;
  -webkit-mask-image: none;
  mask-image: none;
  filter: none;
  mix-blend-mode: normal;
}}
"""
# A patterned sheet (Sun & Moon's type tiles): the tile's grey, lifted to 1 - K * (1 - grey), multiplies the group.
AFTER_TEX = """/* The sheet's pattern, lit: multiplied into the .foil group (the resting rule above paints the same thing). */
{S} .foil::after {{
  content: "";
  position: absolute;
  inset: 0;
  background-image: linear-gradient(hsla(0, 0%, 100%, var(--mr-tex-veil)), hsla(0, 0%, 100%, var(--mr-tex-veil))), var({tex});
  background-blend-mode: normal, normal;
  background-size: 100% 100%, contain;
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
  -webkit-mask-image: none;
  mask-image: none;
  filter: none;
  mix-blend-mode: multiply;
  opacity: 1;
}}
"""


def sheet(name, spec):
    sel = "body.fx-holo.fx-holo.fx-holo .tcg.foil-reverse" + f".fam-{name}" * REPEAT
    out = [f"/* {spec['head']}\n *\n * GENERATED by .claude/skills/card-textures/scripts/fam/mirror-reverse/make_sheets.py (the recipe and its\n * reasons are there): edit the script, not this file. */"]
    tex = spec.get("tex")
    if tex:
        rest = dict(
            rest_note="; the pattern shows faintly, as on the real card",
            rest_image=f"linear-gradient(var(--mr-floor), var(--mr-floor)),\n    linear-gradient(hsla(0, 0%, 100%, var(--mr-tex-veil)), hsla(0, 0%, 100%, var(--mr-tex-veil))),\n    var({tex})",
            rest_blend="multiply, normal, normal", rest_size="100% 100%, 100% 100%, contain",
            after=AFTER_TEX.format(S=sel, tex=tex),
        )
    else:
        rest = dict(rest_note="", rest_image="linear-gradient(var(--mr-floor), var(--mr-floor))", rest_blend="normal",
                    rest_size="100% 100%", after=AFTER_NONE.format(S=sel))
    out.append(RECIPE.format(S=sel, spectrum=SPECTRUM, pos=SPECTRUM_POS, **rest, **{k: spec[k] for k in ("floor", "tint", "dark", "glare")}))
    if tex:
        out.append(f"{sel} {{\n  --mr-tex-veil: {spec['tex_veil']};\n}}")
    for extra, decl in spec.get("extra_vars", []):
        out.append(f"{sel}{extra} {{\n  {decl}\n}}")
    out.append("/* ---- Masks: the same area for every layer ---- */")
    for extra, body in spec["masks"]:
        out.append(f"{sel}{extra} :is(.foil, .glare) {{\n{body}\n}}")
    if spec.get("glare_mask_mode"):
        out.append(f"{sel} .glare {{\n  mask-mode: {spec['glare_mask_mode']};\n}}")
    return "\n".join(out) + "\n"


def main():
    for name, spec in FAMILIES.items():
        path = os.path.join(ROOT, f"css/holo/fam/{name}.css")
        with open(path, "w") as f:
            f.write(sheet(name, spec))
        print(path)


if __name__ == "__main__":
    main()
