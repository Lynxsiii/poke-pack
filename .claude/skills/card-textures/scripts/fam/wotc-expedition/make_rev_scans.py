#!/usr/bin/env python3
"""Draw the face of the reverse holo of each Expedition Rare Holo: the holo's frame with the non-holo twin's window.

Family wotc-expedition. Expedition printed its Rare Holos (ecard1 1-32) a second time as reverse holos, and the reverse
print's window is NOT the holo's foil starfield: it is the non-holo Rare's art (photos in
/mnt/project-files/holo-remaster/wotc-expedition/refs/: Charizard 6 reverse shows the teal aurora of 40, Dragonite 9 reverse
the pale sky of 43, Golem 14 reverse the red ground of 49), while its frame keeps the holo print's card number, strip slots,
ladder marks and gold e logo (Golem 14 reverse PSA scan, Expedition binder pages). The site has only the holo's scan for
these ids, so the reverse face drew the starfield as matte paper.

For each holo n: the twin (twins.py: same name, best window correlation, SIFT affine, colour matched on the frame) is warped
into the holo's frame and its window pasted over the holo's (the era's measured window, feathered 1.5 px).

Output: assets/foil/fam/wotc-expedition/rev-scan-ecard1-<n>-v1.webp (600 x 838) and rev-scan-ecard1-<n>-sm-v1.webp
(320 x 447, from the large one), RGBA with the holo scan's own alpha. The family CSS shows them on the reverse face through
`content` on the face's img (js/fam/wotc-expedition.js sets --exp-scan / --exp-scan-sm).

    python3 .claude/skills/card-textures/scripts/fam/wotc-expedition/make_rev_scans.py [--only 6,9] [--sheet out.jpg]

Deterministic (twins.py seeds OpenCV's RNG before every RANSAC fit; reruns give the same files).
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import twins  # noqa: E402

OUT = os.path.join(twins.ROOT, "assets", "foil", "fam", "wotc-expedition")
SMALL = (320, 447)


def compose(n):
    holo = twins.scan(n).astype(np.float32)
    twin = twins.registered_twin(n)
    w = cv2.GaussianBlur(twins.window_mask().astype(np.float32), (0, 0), 0.75)[..., None]
    rgb = holo[..., :3] * (1 - w) + twin * w
    out = np.dstack([np.clip(rgb + 0.5, 0, 255), holo[..., 3]]).astype(np.uint8)
    return out


def save(n):
    os.makedirs(OUT, exist_ok=True)
    face = compose(n)
    big = os.path.join(OUT, f"rev-scan-ecard1-{n}-v1.webp")
    Image.fromarray(face, "RGBA").save(big, quality=88, method=6)
    small = os.path.join(OUT, f"rev-scan-ecard1-{n}-sm-v1.webp")
    Image.fromarray(face, "RGBA").resize(SMALL, Image.LANCZOS).save(small, quality=88, method=6)
    print(f"ecard1-{n} twin {twins.pair(n)['twin']}: {os.path.getsize(big)} + {os.path.getsize(small)} bytes")
    return face


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated holo numbers (default 1-32)")
    ap.add_argument("--sheet", help="write a contact sheet of the results")
    args = ap.parse_args()
    nums = [int(x) for x in args.only.split(",")] if args.only else list(range(1, 33))
    faces = [(n, save(n)) for n in nums]
    if args.sheet:
        cols = 8
        rows = (len(faces) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 205, rows * 290), (16, 16, 16))
        for i, (n, f) in enumerate(faces):
            im = Image.fromarray(f[..., :3]).resize((200, 280), Image.LANCZOS)
            sheet.paste(im, ((i % cols) * 205, (i // cols) * 290))
        sheet.save(args.sheet, quality=85)
        print(args.sheet)
