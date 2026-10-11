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
# key: (text, weight, tracking in font units added between glyphs, extra word space)
TEXT = {
    "wordmark": ("Goal Hint", 800, -28, -40),
    "headline1": ("Football predictions.", 700, 0, 0),
    "headline2": ("Clearly explained.", 700, 0, 0),
    "descriptor": ("AI analysis. Estimated probabilities. Verified outcomes.", 500, 0, 0),
    "domain": ("goalhint.com", 600, 0, 0),
    "eyebrow": ("FOOTBALL. WITH PERSPECTIVE.", 600, 0, 0),
}


def pair_kerning(font: TTFont):
    """Return a function giving the GPOS 'kern' x-advance adjustment for a glyph pair."""
    gpos = font["GPOS"].table
    lookups = set()
    for record in gpos.FeatureList.FeatureRecord:
        if record.FeatureTag == "kern":
            lookups.update(record.Feature.LookupListIndex)
    subtables = []
    for index in sorted(lookups):
        lookup = gpos.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if getattr(sub, "LookupType", 2) == 2:
                subtables.append(sub)

    def kern(left: str, right: str) -> int:
        for sub in subtables:
            if left not in sub.Coverage.glyphs:
                continue
            if sub.Format == 1:
                pair_set = sub.PairSet[sub.Coverage.glyphs.index(left)]
                for record in pair_set.PairValueRecord:
                    if record.SecondGlyph == right:
                        return getattr(record.Value1, "XAdvance", 0) or 0
            elif sub.Format == 2:
                c1 = sub.ClassDef1.classDefs.get(left, 0)
                c2 = sub.ClassDef2.classDefs.get(right, 0)
                value = sub.Class1Record[c1].Class2Record[c2].Value1
                amount = getattr(value, "XAdvance", 0) or 0 if value is not None else 0
                if amount:
                    return amount
        return 0

    return kern


def outline(text: str, weight: int, tracking: int, word_space: int) -> dict:
    font = instantiateVariableFont(TTFont(FONT), {"wght": weight})
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    kern = pair_kerning(font)
    path = SVGPathPen(glyphs)
    bounds = BoundsPen(glyphs)
    names = [cmap[ord(character)] for character in text]
    advance = 0
    kerns = []
    for i, glyph_name in enumerate(names):
        transform = (1, 0, 0, 1, advance, 0)
        glyphs[glyph_name].draw(TransformPen(path, transform))
        glyphs[glyph_name].draw(TransformPen(bounds, transform))
        advance += font["hmtx"][glyph_name][0]
        if i + 1 < len(names):
            k = kern(glyph_name, names[i + 1])
            kerns.append(k)
            advance += tracking + k + (word_space if text[i] == " " else 0)
    return {
        "text": text,
        "weight": weight,
        "tracking": tracking,
        "kerning": kerns,
        "unitsPerEm": font["head"].unitsPerEm,
        "advance": advance,
        "bounds": bounds.bounds,
        "path": path.getCommands(),
    }


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps({key: outline(*value) for key, value in TEXT.items()}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
