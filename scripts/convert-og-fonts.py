"""WOFF2 -> WOFF for the OG image (Ф5): Satori (next/og) does not read WOFF2.

Converts the Kazakh subsets from public/fonts/*.woff2 (Ф1) into src/server/invite/fonts/*.woff.
Run again whenever the subsets in public/fonts change:

    python -m pip install --user fonttools==4.66.1 brotli
    python scripts/convert-og-fonts.py

Checked with fontTools 4.66.1 (+ brotli, needed to read WOFF2). Output is deterministic for the same input.
"""

from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "fonts"
DST = ROOT / "src" / "server" / "invite" / "fonts"
NAMES = ["cormorant-garamond-600-kk", "onest-400-kk"]


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        font = TTFont(SRC / f"{name}.woff2", recalcTimestamp=False)
        font.flavor = "woff"
        out = DST / f"{name}.woff"
        font.save(out, reorderTables=True)
        print(f"{out.relative_to(ROOT)}  {out.stat().st_size} bytes")


if __name__ == "__main__":
    main()
