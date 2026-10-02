#!/usr/bin/env python3
"""Draw the foil maps of the Skyridge (ecard3) Rare Holos H1-H32: one RGBA WebP per card.

Family wotc-skyridge (older-era holo remaster, 2026-10-02). It is the Aquapolis recipe on the other e-Card set: the two
sets share one frame, one foil and one printing method, so the method of ../wotc-aquapolis/make_aquapolis_maps.py is
used as is (read its docstring: the plain twin registered onto the holo, the foil area from the holo-vs-twin darkness
and the holo-only dots, GrabCut to snap the Pokemon's edge, the ladder bars, the 13 slots and the e logo from the
consensus of all 32 scans, the card's own printed dots as the RGB). Only the set differs: scans from assets/cards/ecard3,
each H holo paired with the non-holo Rare that prints the same painting (same artist, data/ecard3.json), hand hints in
skyridge_hints.json beside this file, output assets/foil/fam/wotc-skyridge/H<n>-v1.webp.

    python3 make_skyridge_maps.py [--cards H9,H25] [--qa <dir>] [--write] [--suffix -v1] [--force]
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("aq", os.path.join(HERE, "..", "wotc-aquapolis", "make_aquapolis_maps.py"))
aq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(aq)

aq.CARDS = os.path.join(aq.ROOT, "assets", "cards", "ecard3")
aq.OUT = os.path.join(aq.ROOT, "assets", "foil", "fam", "wotc-skyridge")
aq.HINTS = os.path.join(HERE, "skyridge_hints.json")
aq.SEED = 2003 + 1  # a different dot-colour draw from Aquapolis
# H holo -> the plain Rare with the same painting
TWIN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35]
aq.PAIR = {f"H{i + 1}": str(t) for i, t in enumerate(TWIN)}

if __name__ == "__main__":
    aq.main()
