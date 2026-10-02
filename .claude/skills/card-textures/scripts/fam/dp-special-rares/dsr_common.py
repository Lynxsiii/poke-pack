"""Shared helpers for the dp-special-rares generators (Shining, Rotom, Arceus AR, Shiny Legendary, Alph, secrets).

Every map is drawn from the card's own Scrydex scan (assets/cards/<set>/<n>.webp, 600 x 838, the picture the site shows)
and the era's drawn art-window masks (assets/foil/dp-win/<frame>-<layout>.webp, alpha = window, 600 x 825, stretched over
the card like the site does with `mask-size: 100% 100%`). Outputs go to assets/foil/fam/dp-special-rares/ only, at the
scan's size, so the site lays them over the card with `100% 100%`.

Nothing here writes outside that folder. Seeds come from the card id, so reruns give the same bytes.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
OUT = ROOT / "assets" / "foil" / "fam" / "dp-special-rares"
W, H = 600, 838

# card id -> art-window mask (assets/foil/dp-win/), the same frame and layout dpMap() in js/dp-foil.js picks.
WINDOW = {
    **{f"pl2-RT{i}": "dp-basic" for i in range(1, 6)},
    "pl2-RT6": "dp-trainer",
    **{c: "dp-basic" for c in ["dp7-SH1", "dp7-SH2", "dp7-SH3", "pl1-SH4", "pl1-SH5", "pl1-SH6", "pl3-SH8", "pl3-SH9",
                                "pl4-SH10", "pl4-SH11", "pl4-SH12"]},
    "pl3-SH7": "dp-stage",
    **{f"pl4-AR{i}": "dp-basic" for i in range(1, 10)},
    **{f"col1-SL{i}": "hgss-basic" for i in range(1, 12)},
    "dp2-124": "dp-trainer",
    "dp7-101": "dp-basic", "dp7-102": "dp-stage", "dp7-103": "dp-stage",
    "pl1-128": "dp-basic", "pl1-129": "dp-basic", "pl1-130": "dp-basic",
    "pl2-112": "dp-basic", "pl2-113": "dp-basic", "pl2-114": "dp-basic",
    "pl3-148": "dp-basic", "pl3-149": "dp-basic", "pl3-150": "dp-basic",
}


def scan_path(card_id: str) -> Path:
    s, n = card_id.split("-", 1)
    return ROOT / "assets" / "cards" / s / f"{n}.webp"


def load_scan(card_id: str) -> tuple[np.ndarray, np.ndarray]:
    """RGB in 0..1 (H x W x 3) and the scan's alpha in 0..1 (the rounded card outline)."""
    im = Image.open(scan_path(card_id)).convert("RGBA")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    return a[..., :3], a[..., 3]


def window_mask(card_id: str) -> np.ndarray:
    """The art window (1 inside), stretched to the card like `mask-size: 100% 100%` does on the site."""
    name = WINDOW[card_id]
    im = Image.open(ROOT / "assets" / "foil" / "dp-win" / f"{name}.webp").convert("RGBA").resize((W, H), Image.BILINEAR)
    return np.asarray(im)[..., 3].astype(np.float32) / 255.0


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def rounded_rect(x0: float, y0: float, x1: float, y1: float, r: float, soft: float = 1.0) -> np.ndarray:
    """1 inside the rectangle [x0, x1] x [y0, y1] (pixels) with corner radius r, soft edge `soft` px."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5
    qx = np.abs(xx - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
    qy = np.abs(yy - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
    d = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r  # signed distance
    return np.clip(0.5 - d / max(soft, 1e-3), 0.0, 1.0)


def body_inset(left: float = 13.0, top: float = 12.5, right: float = 13.0, bottom: float = 12.5, r: float = 8.0) -> np.ndarray:
    """Inside the printed yellow border (measured on the RT, SH and AR scans: about 13 px a side, 12-13 px top and bottom)."""
    return rounded_rect(left, top, W - right, H - bottom, r, soft=1.2)


def rng_for(card_id: str, salt: str = "") -> np.random.Generator:
    seed = int.from_bytes(hashlib.sha256(f"{card_id}:{salt}".encode()).digest()[:8], "little")
    return np.random.default_rng(seed)


def to_u8(x: np.ndarray) -> np.ndarray:
    return np.clip(np.round(x * 255.0), 0, 255).astype(np.uint8)


def save(img: Image.Image, name: str, lossless: bool = False, quality: int = 90) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    if lossless:
        img.save(path, "WEBP", lossless=True, quality=100, method=6)
    else:
        img.save(path, "WEBP", quality=quality, method=6)
    kb = path.stat().st_size / 1024
    flag = "  (over 400 KB!)" if kb > 400 else ""
    print(f"wrote {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]} {img.mode} {kb:.0f} KB{flag}")
    return path


def save_alpha(alpha: np.ndarray, name: str, rgb: np.ndarray | None = None, lossless: bool = False, quality: int = 90) -> Path:
    """An RGBA webp: RGB (white when not given) and alpha, for use both as a mask (alpha) and a background (colour)."""
    if rgb is None:
        rgb = np.ones((H, W, 3), np.float32)
    arr = np.dstack([to_u8(rgb), to_u8(alpha)])
    return save(Image.fromarray(arr, "RGBA"), name, lossless=lossless, quality=quality)


def save_gray(v: np.ndarray, name: str, lossless: bool = True) -> Path:
    return save(Image.fromarray(to_u8(v), "L"), name, lossless=lossless)
