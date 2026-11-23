"""Render the home-screen icons the web manifest names (worker/seo.js).

The same cards-only mark as the header logo and favicons
(scripts/make_avatar.py render_mark), at the sizes Android and iOS ask for:

    assets/icon-192-v1.png, assets/icon-512-v1.png
    assets/icon-512-maskable-v1.png  (cards shrunk into the middle 80%, which
                                      is all a maskable icon promises to show)

    python scripts/make_app_icons.py

Files under assets/ are cached for a year: a redraw ships under -v2 names and
the manifest in worker/seo.js points at them.
"""
from __future__ import annotations

import make_avatar as mk
from PIL import Image

OUT = mk.ASSETS


def main():
    full = mk.render_mark("warm").convert("RGB")
    for px in (192, 512):
        path = OUT / f"icon-{px}-v1.png"
        full.resize((px, px), Image.LANCZOS).save(path, optimize=True)
        print(f"  {path.relative_to(mk.ROOT)}  {path.stat().st_size:,} bytes")
    mk.MARK_CARD_H = 400
    safe = mk.render_mark("warm").convert("RGB")
    path = OUT / "icon-512-maskable-v1.png"
    safe.resize((512, 512), Image.LANCZOS).save(path, optimize=True)
    print(f"  {path.relative_to(mk.ROOT)}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
