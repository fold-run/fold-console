#!/usr/bin/env python3
"""Generate the shipped font subsets from the variable sources in fonts-src/.

Run this only when the fonts change. It is deliberately not wired into
`pnpm build`: it needs a Python toolchain the rest of this repo does not, and
its output is four files that change roughly never.

    python3 -m venv .venv && .venv/bin/pip install 'fonttools[woff]' brotli
    .venv/bin/python scripts/subset-fonts.py

WHY THIS EXISTS

The console shipped four woff2 files in which the -400 and -600 of each family
were byte-identical. Both were the *variable* font with its wght axis intact
and a default of 400, declared in CSS as two static faces. A face declared
`font-weight: 600` whose file carries no 600 instance renders the outlines it
does have, so nothing on the page was ever actually bold — it just cost twice.

Instancing fixes both halves of that. Pinning wght drops `gvar`, `HVAR` and the
rest of the variation machinery, so a static instance is well under half the
size of the variable font it came from: two real weights per family now cost
less than one variable file did.

WHY NOT SHIP THE VARIABLE FONT ONCE

It was the obvious answer and it is the wrong one, twice over. It is *larger*
(63 KB against 55 KB for four static instances — variation deltas cost more
than a second instanced outline set when only two weights are used), and it
changes the shipped file set, which fold pins in scripts/sync-console.sh and
asserts in gateway/introspection_test.go. Four filenames in, four filenames
out: this fix needs no change on fold's side at all.

The sources in fonts-src/ are the previously-shipped latin subsets, not the
upstream masters — they are what this repo has, and they carry a full wght axis
(IBM Plex Sans 100-700, Geist Mono 100-900), which is all the instancing needs.
They live outside public/ so they are not copied into the bundle.
"""

from __future__ import annotations

import os
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:  # pragma: no cover - a setup error, not a runtime one
    sys.exit("fonttools is missing — see the module docstring for the venv setup")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fonts-src")
OUT = os.path.join(ROOT, "public", "fonts")

# The weights the stylesheet declares. Adding one here means adding a file to
# fold's MANIFEST too — see the note above.
WEIGHTS = (400, 600)

FAMILIES = {
    "IBMPlexSans": "IBMPlexSans-variable-latin.woff2",
    "GeistMono": "GeistMono-variable-latin.woff2",
}


def main() -> None:
    total = 0
    for family, source in FAMILIES.items():
        path = os.path.join(SRC, source)
        for weight in WEIGHTS:
            # Reloaded per weight: instantiateVariableFont consumes the axis
            # data it reads, so a font reused across calls yields the first
            # instance twice — which is the exact bug this script exists to
            # undo.
            font = TTFont(path)
            axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
            lo, hi = axes["wght"]
            if not lo <= weight <= hi:
                sys.exit(f"{family}: wght {weight} outside the source axis {lo}-{hi}")

            static = instancer.instantiateVariableFont(
                font, {"wght": weight}, inplace=False, updateFontNames=True
            )
            if "fvar" in static:
                sys.exit(f"{family}-{weight}: still variable after instancing")

            static.flavor = "woff2"
            target = os.path.join(OUT, f"{family}-{weight}-latin.woff2")
            static.save(target)

            size = os.path.getsize(target)
            total += size
            print(f"  {os.path.basename(target):<34} {size:>6} bytes  "
                  f"usWeightClass={static['OS/2'].usWeightClass}")

    print(f"\n  {total} bytes of fonts")


if __name__ == "__main__":
    main()
