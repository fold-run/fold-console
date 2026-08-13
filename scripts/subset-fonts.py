#!/usr/bin/env python3
"""Build the shipped font subsets from pinned upstream releases.

Run this only when the fonts change. It is deliberately not wired into
`pnpm build`: it reaches the network, it needs a Python toolchain the rest of
this repo does not, and its output is four files that change roughly never.

    python3 -m venv .venv && .venv/bin/pip install 'fonttools[woff]' brotli
    .venv/bin/python scripts/subset-fonts.py

WHY THIS EXISTS

Two problems, fixed in two passes.

The first was that the -400 and -600 of each family were byte-identical: both
were the variable font with its wght axis intact and a default of 400,
declared in CSS as two static faces. A face declared `font-weight: 600` whose
file carries no 600 instance renders the outlines it has, so nothing here was
ever actually bold, and every fold binary carried each face twice.

The second was provenance. The fix for the first read its inputs out of
fonts-src/, which held the previously-shipped subsets — so the source of the
bytes was the bytes. Nobody could verify that what a fold binary embeds is
really IBM Plex Sans and Geist Mono, in a repo whose entire vendoring
discipline exists to make that kind of question answerable.

So the inputs are now upstream release assets, pinned by tag and sha256 in
fonts-src/sources.json, and this refuses to run on a download that does not
match.

WHY STATIC FACES RATHER THAN INSTANCING

Both projects ship designed weights alongside their variable fonts. Taking
Regular and SemiBold directly gets the weights their type designers drew,
rather than a point interpolated out of an axis — better letterfitting at 600,
and one less transformation between upstream and an operator's screen.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - a setup error, not a runtime one
    sys.exit("fonttools is missing — see the module docstring for the venv setup")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, "fonts-src", "sources.json")
OUT = os.path.join(ROOT, "public", "fonts")

RELEASE_URL = "{project}/releases/download/{release}/{asset}"


def fetch(spec: dict) -> bytes:
    """Download a pinned release asset and prove it is the pinned one."""
    url = RELEASE_URL.format(
        project=spec["project"], release=spec["release"], asset=spec["asset"]
    )
    print(f"  fetching {spec['family']} from {spec['release']}")
    with urllib.request.urlopen(url) as response:  # noqa: S310 - pinned https URL
        blob = response.read()

    got = hashlib.sha256(blob).hexdigest()
    if got != spec["sha256"]:
        sys.exit(
            f"{spec['family']}: checksum mismatch for {spec['asset']}\n"
            f"  expected {spec['sha256']}\n"
            f"  got      {got}\n"
            "Refusing to build fonts from an asset that is not the pinned one. "
            "If upstream re-cut the release, verify it by hand and update "
            "fonts-src/sources.json in its own commit."
        )
    return blob


def build(spec: dict, unicodes: str) -> list[tuple[str, int]]:
    """Subset each declared weight of one family, returning (path, size)."""
    archive = zipfile.ZipFile(io.BytesIO(fetch(spec)))
    written = []

    for weight, member in sorted(spec["faces"].items()):
        try:
            source = archive.read(member)
        except KeyError:
            sys.exit(
                f"{spec['family']}: {member} is not in {spec['asset']}. "
                "Upstream moved it; update fonts-src/sources.json."
            )

        font = TTFont(io.BytesIO(source))

        options = subset.Options()
        options.flavor = "woff2"
        options.notdef_outline = True

        # Unhinted, which is both what these files have always been (the
        # previously shipped subsets carried `gasp` and nothing else) and what
        # Google Fonts serves for latin webfonts. TrueType hinting instructions
        # are a third of the payload and are ignored outright by every macOS
        # browser; DirectWrite consults them only lightly. Keeping them would
        # be paying 15 KiB in every fold binary for a rendering difference
        # almost nobody sees, and would be a change from what ships today
        # rather than a restoration of it.
        options.hinting = False

        # fontTools' default feature set, not "*". Keeping every feature also
        # keeps every glyph those features can reach — stylistic alternates
        # this console never asks for — which nearly doubled the payload for
        # letterforms no operator will see. The default keeps kerning and the
        # shaping features text actually needs.
        #
        # The name records are pinned rather than defaulted: OFL 1.1 wants its
        # copyright notice (0) and licence text (13, 14) to travel with the
        # Font Software, and the default set drops 13 and 14. fonts/OFL.txt
        # carries the licence too; this keeps it inside the file as well, where
        # `fc-query` or a font inspector will find it.
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]

        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=subset.parse_unicodes(unicodes))
        subsetter.subset(font)

        target = os.path.join(OUT, f"{spec['family']}-{weight}-latin.woff2")
        font.flavor = "woff2"
        font.save(target)

        size = os.path.getsize(target)
        written.append((os.path.basename(target), size))
        print(
            f"    {os.path.basename(target):<34} {size:>6} bytes  "
            f"usWeightClass={font['OS/2'].usWeightClass}  "
            f"glyphs={font['maxp'].numGlyphs}"
        )

    return written


def main() -> None:
    with open(SOURCES, encoding="utf-8") as handle:
        config = json.load(handle)

    unicodes = config["unicodeRange"]["value"]
    total = 0
    for spec in config["families"]:
        for _, size in build(spec, unicodes):
            total += size

    print(f"\n  {total} bytes of fonts")


if __name__ == "__main__":
    main()
