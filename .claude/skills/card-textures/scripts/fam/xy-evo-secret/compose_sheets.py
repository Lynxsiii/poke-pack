#!/usr/bin/env python3
"""Compose the evidence and comparison sheets of the xy-evo-secret family.

The five Evolutions secret rares (xy12-109..113) are plain, non-holo prints, so the family draws nothing: the BEFORE
(`&famskip=xy-evo-secret`) and AFTER renders are the same pixels. These sheets show that, next to the real photos.

Inputs (all written by foil_probe.mjs --boxes, WebKit, scale 3; see reference/fam-xy-evo-secret.md for the commands):
    <dir>/before_a.png before_b.png after_a.png after_b.png     (w=220, poses rest,30:25,75:65,50:78; a = 109,110,111; b = 112,113)
    <dir>/phone_before.png phone_after.png                      (w=130, pose 30:25, cards 109,110,112,113)
    the real photo frames in /mnt/project-files/holo-remaster/xy-evo-secret/refs/

    python3 compose_sheets.py --renders <dir> --out /mnt/project-files/holo-remaster/xy-evo-secret/sheets

Writes before-after-evo-secret-109-110-111.jpg, before-after-evo-secret-112-113.jpg, phone-compare.jpg,
real-card-photos.jpg and real-windows-zoom.jpg (JPEG q88).
"""
import argparse
import json
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SC = 3
POSES = ["rest", "30:25", "75:65", "50:78"]
REFS = "/mnt/project-files/holo-remaster/xy-evo-secret/refs/"
BG = (20, 20, 20)
DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size, bold=False):
    try:
        return ImageFont.truetype(DEJAVU_B if bold else DEJAVU, size)
    except OSError:
        return ImageFont.load_default()


def cells(png):
    """{(card number, pose): (x, y, w, h)} in CSS px, plus the opened image."""
    im = Image.open(png).convert("RGB")
    js = json.load(open(png[:-4] + ".boxes.json"))
    out = {}
    for c in js:
        m = re.search(r"site · (\d+)", c["caption"])
        out[(m.group(1), c["pose"])] = (c["x"], c["y"], c["w"], c["h"])
    return im, out


def window(im, box, cw, ch):
    """The card's own bounding box, cut from a scale-3 render and centred in a cw x ch CSS px tile (the lab's captions and the
    neighbouring cards stay out)."""
    x, y, w, h = box
    c = im.crop((int(x * SC), int(y * SC), int(np.ceil((x + w) * SC)), int(np.ceil((y + h) * SC))))
    tile = Image.new("RGB", (int(cw * SC), int(ch * SC)), BG)
    tile.paste(c, ((tile.width - c.width) // 2, (tile.height - c.height) // 2))
    return tile


def before_after(bef_png, aft_png, ids, names, out, title):
    bi, bb = cells(bef_png)
    ai, ab = cells(aft_png)
    cw, ch = 252, 340  # CSS px tile around a card (the 1.08x lit scale of a 220 px card is 238 x 327)
    tw, th = cw * SC, ch * SC
    label_w, head_h, gap = 150, 250, 40
    half = len(ids) * tw
    W = label_w + half + gap + half + 24
    H = head_h + len(POSES) * th + 24
    sheet = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(sheet)
    diff_max = 0
    for r, pose in enumerate(POSES):
        y = head_h + r * th
        d.text((24, y + th // 2 - 20), pose, fill=(255, 220, 90), font=font(38, True))
        for k, cid in enumerate(ids):
            t0 = window(bi, bb[(cid, pose)], cw, ch)
            t1 = window(ai, ab[(cid, pose)], cw, ch)
            diff_max = max(diff_max, int(np.abs(np.asarray(t0).astype(int) - np.asarray(t1).astype(int)).max()))
            sheet.paste(t0, (label_w + k * tw, y))
            sheet.paste(t1, (label_w + half + gap + k * tw, y))
    for k, nm in enumerate(names):
        d.text((label_w + k * tw + 30, head_h - 52), nm, fill=(255, 220, 90), font=font(32, True))
        d.text((label_w + half + gap + k * tw + 30, head_h - 52), nm, fill=(255, 220, 90), font=font(32, True))
    d.text((label_w, 20), title, fill=(255, 255, 255), font=font(46, True))
    d.text((label_w, 86), "BEFORE: &famskip=xy-evo-secret (the era sheet's foil-none, bare scan)", fill=(190, 190, 190), font=font(32))
    d.text((label_w + half + gap, 86), "AFTER: shipped (module + empty sheet)", fill=(190, 190, 190), font=font(32))
    d.text((label_w, 134), f"WebKit, 220 px x 3, poses rest / 30:25 / 75:65 / 50:78. Tiles are pixel-identical: max abs diff {diff_max}. "
           "The real prints are plain glossy cardstock, no foil.", fill=(255, 140, 140), font=font(30))
    sheet.save(out, quality=88)
    print("wrote", out, sheet.size, "max diff", diff_max)
    return diff_max


def fit_cell(im, crop, w=390, h=545, fill=BG):
    """Crop a real photo to `crop`, scale it to w wide, centre it vertically in a w x h cell."""
    c = im.convert("RGB").crop(crop)
    s = w / c.width
    c = c.resize((w, max(1, round(c.height * s))), Image.LANCZOS)
    cell = Image.new("RGB", (w, h), fill)
    if c.height >= h:
        top = (c.height - h) // 2
        cell.paste(c.crop((0, top, w, top + h)), (0, 0))
    else:
        cell.paste(c, (0, (h - c.height) // 2))
    return cell


# (card, real photo file, crop box in the photo, caption)
REAL = [
    ("109", "yt_exeggutor109-beside-charizard11-holo_BHiKUHpasvk_max.jpg", (225, 130, 612, 665), "109 Exeggutor, real (BHiKUHpasvk)"),
    ("110", "yt_flying110-sunlight_y93vCfO2MGc_maxresdefault.jpg", (456, 78, 808, 582), "110 Flying Pikachu, real, sunlight (y93vCfO2MGc)"),
    ("112", "yt_doduo112-three-tilts_JMR8y22nM6M_maxresdefault.jpg", (452, 88, 802, 566), "112 Imakuni?'s Doduo, real (JMR8y22nM6M)"),
    ("113", "yt_rocket113-tilt_KQ1lgKejVWM_max.jpg", (372, 0, 884, 690), "113 Team Rocket!, real, tilted (KQ1lgKejVWM)"),
]


def phone_compare(rdir, out):
    bi, bb = cells(os.path.join(rdir, "phone_before.png"))
    ai, ab = cells(os.path.join(rdir, "phone_after.png"))
    cw, chh, head, cap = 390, 545, 96, 44
    sheet = Image.new("RGB", (3 * cw, head + len(REAL) * (chh + cap)), BG)
    d = ImageDraw.Draw(sheet)
    d.text((14, 8), "REAL PHOTO", fill=(255, 255, 255), font=font(26, True))
    d.text((cw + 14, 8), "BEFORE (famskip)", fill=(255, 255, 255), font=font(26, True))
    d.text((2 * cw + 14, 8), "AFTER (shipped)", fill=(255, 255, 255), font=font(26, True))
    d.text((14, 44), "pose 30:25, WebKit, card 130 px x 3. Real prints: no foil.  BEFORE = AFTER.", fill=(255, 140, 140), font=font(21))
    for r, (cid, f, crop, cap_txt) in enumerate(REAL):
        y = head + r * (chh + cap)
        sheet.paste(fit_cell(Image.open(REFS + f), crop, cw, chh), (0, y))
        for col, (im, bx) in enumerate(((bi, bb), (ai, ab))):
            x0, y0, w, h = bx[(cid, "30:25")]
            tile = im.crop((int(x0 * SC), int(y0 * SC), int((x0 + w) * SC), int((y0 + h) * SC)))
            s = cw / tile.width
            tile = tile.resize((cw, round(tile.height * s)), Image.LANCZOS)
            cell = Image.new("RGB", (cw, chh), BG)
            cell.paste(tile, (0, max(0, (chh - tile.height) // 2)), None)
            sheet.paste(cell, ((col + 1) * cw, y))
        d.text((10, y + chh + 8), cap_txt, fill=(200, 200, 200), font=font(20))
        for x in (cw, 2 * cw):
            d.line([(x, y), (x, y + chh)], fill=(90, 90, 90), width=2)
    sheet.save(out, quality=88)
    print("wrote", out, sheet.size)


def real_photos(out):
    rows = [
        ("109 Exeggutor (Japanese text)", [
            ("yt_exeggutor109-beside-charizard11-holo_BHiKUHpasvk_max.jpg", (100, 60, 800, 720), "BHiKUHpasvk beside Starlight Charizard 11"),
            ("yt_exeggutor109-in-hand_bN64Z-wNSGk_max.jpg", (340, 40, 940, 700), "bN64Z-wNSGk in hand"),
            ("yt_exeggutor109-in-hand_aw2xT8NpZPg_hq3.jpg", (0, 0, 480, 360), "aw2xT8NpZPg close to camera")]),
        ("110 Flying Pikachu", [
            ("yt_flying110-sunlight_y93vCfO2MGc_maxresdefault.jpg", (438, 0, 842, 720), "y93vCfO2MGc direct sunlight"),
            ("yt_flying110-closeup_fq_p7-sPVjE_max.jpg", (438, 0, 842, 720), "fq_p7-sPVjE close-up"),
            ("yt_flying110-in-hand_x0DCaXTX3a4_max.jpg", (438, 0, 842, 720), "x0DCaXTX3a4 in hand"),
            ("yt_flying110-in-toploader_yYEHB0FFlms_hq3.jpg", (120, 0, 360, 360), "yYEHB0FFlms toploader")]),
        ("111 Surfing Pikachu", [
            ("yt_surfing111-held-before-holo-EX_CgrBNLI9jfo_max.jpg", (0, 0, 1280, 720), "CgrBNLI9jfo held in front of two holo Charizards (they glitter, it does not)"),
            ("yt_binder-surfing111-exeggutor-holo-neighbour_rLZPtjeU5cc_hq2.jpg", (0, 0, 480, 360), "rLZPtjeU5cc binder page"),
            ("yt_surfing111-in-hand_LFlIZ1mbDsI_hq3.jpg", (0, 0, 480, 360), "LFlIZ1mbDsI in hand"),
            ("yt_surfing111-closeup-sleeve_im4hlel2MRg_hq3.jpg", (0, 0, 480, 360), "im4hlel2MRg close-up"),
            ("yt_surfing111-pulled-from-pack_FudmNb5ysuk_max.jpg", (300, 0, 980, 560), "FudmNb5ysuk bare card in hand")]),
        ("112 Imakuni?'s Doduo", [
            ("yt_doduo112-three-tilts_JMR8y22nM6M_maxresdefault.jpg", (438, 0, 842, 720), "JMR8y22nM6M on white"),
            ("yt_doduo112-psa10-beside-venusaur-ex_NYVr7Onu494_max.jpg", (0, 0, 1280, 720), "NYVr7Onu494 slab beside a holo Venusaur EX slab"),
            ("yt_binder-doduo112-flying110-exeggutor109_UDQoPgX35rY_hq2.jpg", (0, 0, 480, 360), "UDQoPgX35rY binder page")]),
        ("113 Here Comes Team Rocket!", [
            ("yt_rocket113-flatlay-german_UjQr3Leb2K0_max.jpg", (0, 0, 1280, 720), "UjQr3Leb2K0 flat lay (German print)"),
            ("yt_rocket113-tilt_KQ1lgKejVWM_max.jpg", (0, 0, 1280, 720), "KQ1lgKejVWM tilted"),
            ("yt_rocket113-in-hand_UjQr3Leb2K0_hq2.jpg", (0, 0, 480, 360), "UjQr3Leb2K0 held, studio light")]),
    ]
    H = 520
    bands = []
    for title, items in rows:
        tiles = []
        for f, crop, cap_txt in items:
            im = Image.open(REFS + f).convert("RGB").crop(crop)
            im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
            d = ImageDraw.Draw(im)
            d.rectangle((0, H - 34, im.width, H), fill=(0, 0, 0))
            d.text((8, H - 29), cap_txt, fill=(255, 255, 255), font=font(18))
            tiles.append(im)
        W = sum(t.width for t in tiles) + 6 * (len(tiles) - 1)
        band = Image.new("RGB", (W, H + 44), BG)
        ImageDraw.Draw(band).text((8, 8), title, fill=(255, 220, 90), font=font(26, True))
        x = 0
        for t in tiles:
            band.paste(t, (x, 44))
            x += t.width + 6
        bands.append(band)
    W = max(b.width for b in bands)
    sheet = Image.new("RGB", (W, sum(b.height + 8 for b in bands)), BG)
    y = 0
    for b in bands:
        sheet.paste(b, (0, y))
        y += b.height + 8
    sheet.save(out, quality=88)
    print("wrote", out, sheet.size)


def windows_zoom(out):
    k = Image.open(REFS + "yt_flying110-sunlight_y93vCfO2MGc_maxresdefault.jpg").convert("RGB").crop((470, 135, 770, 365)).resize((900, 690), Image.LANCZOS)
    b = Image.open(REFS + "yt_exeggutor109-beside-charizard11-holo_BHiKUHpasvk_max.jpg").convert("RGB")
    ex = b.crop((260, 200, 590, 430)).resize((990, 690), Image.LANCZOS)
    ch = b.crop((720, 205, 1050, 435)).resize((990, 690), Image.LANCZOS)
    sheet = Image.new("RGB", (900 + 990 + 990 + 20, 690 + 60), BG)
    sheet.paste(k, (0, 60))
    sheet.paste(ex, (910, 60))
    sheet.paste(ch, (1910, 60))
    sheet = sheet.resize((sheet.width * 2 // 3, sheet.height * 2 // 3), Image.LANCZOS)
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), "110 Flying Pikachu: art window, matte print", fill=(255, 220, 90), font=font(22, True))
    d.text((610, 8), "109 Exeggutor: art window, matte print", fill=(255, 220, 90), font=font(22, True))
    d.text((1270, 8), "Starlight holo Charizard 11, same frame: stars", fill=(255, 160, 160), font=font(22, True))
    sheet.save(out, quality=90)
    print("wrote", out, sheet.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--renders", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    r = a.renders
    before_after(os.path.join(r, "before_a.png"), os.path.join(r, "after_a.png"), ["109", "110", "111"],
                 ["109 Exeggutor", "110 Flying Pikachu", "111 Surfing Pikachu"],
                 os.path.join(a.out, "before-after-evo-secret-109-110-111.jpg"), "Evolutions secret rares 109, 110, 111")
    before_after(os.path.join(r, "before_b.png"), os.path.join(r, "after_b.png"), ["112", "113"],
                 ["112 Imakuni?'s Doduo", "113 Here Comes Team Rocket!"],
                 os.path.join(a.out, "before-after-evo-secret-112-113.jpg"), "Evolutions secret rares 112, 113")
    phone_compare(r, os.path.join(a.out, "phone-compare.jpg"))
    real_photos(os.path.join(a.out, "real-card-photos.jpg"))
    windows_zoom(os.path.join(a.out, "real-windows-zoom.jpg"))


if __name__ == "__main__":
    main()
