# Card separation design review

Ten preview-only treatments for Best slips, Matches, and Slip Builder. The
gallery shares sample fixtures and renderers across all options to isolate
surface contrast, corner radii, and mobile list spacing. No production screen,
theme, business logic, or private data is modified.

From `next-js`, run:

```powershell
python scripts/preview-card-separation.py --serve --port 4396
```

Open <http://127.0.0.1:4396/> in an external browser. All ten numbered sections
are available by scrolling. Use `?option=01` through `?option=10` to open one
option independently, or the numbered navigation to jump between designs.

Controls switch between light/dark, proposed/current, 320/375/430px mobile
previews, full-width desktop, and all/individual screens. Slip disclosure rows
expand and collapse; filter chips are illustrative. Preview widths fit their
available container on narrow screens. Desktop preserves continuous match rows
and the existing 4.5px outer slip gap. The comparison baseline represents the
current surface treatment and spacing in the same review markup; it is not a
live rendering of the application.

The generator copies the bundled Manrope font and favicon into ignored
`output/card-separation-review/` and reads the existing brand radius tokens.
The preview works without external font, image, API, or database requests.
Match corners use `small` (2px), `control` (4px), or the approved theme's surface
mapping (`overlay`, 8px). Option 01 is the suggested starting point; application
changes await the user's design selection.
