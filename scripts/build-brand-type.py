"""Rebuild the font-independent SVG outlines used by the Goal Hint brand kit.

Requires fontTools. The bundled, unmodified Manrope font is licensed under OFL-1.1.
Normal asset exports use the committed outlines and do not require Python.
"""

import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "assets/brand/source/fonts/Manrope-wght.ttf"
OUTPUT = ROOT / "assets/brand/source/type-outlines.json"
TEXT = {
    "wordmark": ("Goal Hint", 750),
    "headline1": ("Football predictions.", 700),
    "headline2": ("Clearly explained.", 700),
    "descriptor": ("AI analysis. Estimated probabilities. Verified outcomes.", 500),
    "domain": ("goalhint.com", 600),
    "eyebrow": ("FOOTBALL. WITH PERSPECTIVE.", 600),
}


def outline(text: str, weight: int) -> dict:
    font = instantiateVariableFont(TTFont(FONT), {"wght": weight})
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    path = SVGPathPen(glyphs)
    bounds = BoundsPen(glyphs)
    advance = 0
    for character in text:
        glyph_name = cmap[ord(character)]
        transform = (1, 0, 0, 1, advance, 0)
        glyphs[glyph_name].draw(TransformPen(path, transform))
        glyphs[glyph_name].draw(TransformPen(bounds, transform))
        advance += font["hmtx"][glyph_name][0]
    return {
        "text": text,
        "weight": weight,
        "unitsPerEm": font["head"].unitsPerEm,
        "advance": advance,
        "bounds": bounds.bounds,
        "path": path.getCommands(),
    }


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps({key: outline(*value) for key, value in TEXT.items()}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
