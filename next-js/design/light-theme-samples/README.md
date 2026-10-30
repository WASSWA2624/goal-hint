# Light-theme review

Ten review-only palettes for the existing Goal Hint interface. Each uses the same
real desktop and mobile components, spacing, typography and square corners.
Production theme tokens and screens are unchanged. A selected theme still needs
the user's approval before implementation.

| Theme | Direction |
| --- | --- |
| Porcelain Blue | Cool porcelain and royal blue |
| Alpine Teal | Mineral white and deep teal |
| Ivory & Ink | Warm paper and ink blue |
| Sage Field | Soft sage and forest green |
| Nordic Slate | Silver gray and slate |
| Lavender Mist | Pale lavender and violet |
| Sandstone Copper | Creamy stone and copper |
| Glacial Cyan | Ice blue and ocean blue |
| Rose Quartz | Soft blush and berry |
| Olive Paper | Linen paper and olive |

## Run the isolated review

From `next-js/`, with the repository's existing dependencies installed:

```powershell
python scripts/preview-light-themes.py --serve --port 3107
```

Open `http://127.0.0.1:3107/?theme=porcelain-blue`; use any palette ID from
`palettes.json`. The script creates an ignored application beneath
`.tmp/light-theme-review/`. Add `--reuse` to serve the previous build.

The fixture reuses `MatchFeedPage`, `PublicShell`, `MatchCard`,
`PerformanceSummary` and `SlipCard`. All records and the background feed refresh
are synthetic. Interface links and filters retain their production destinations;
the fixture is intended for visual review rather than functional navigation.

## Build the conversation gallery

`scripts/capture-light-theme-samples.mjs` exports `captureLightThemes(page)` for
an existing Playwright `Page`. It captures each palette at 1440 × 1000 and
390 × 844, verifies seven match cards and no horizontal overflow, embeds local
brand/flag/font assets, and strips application scripts and navigation links.
No browser dependency is added to the application.

The resulting `output/playwright/light-themes/capture.json`, verification report
and twenty screenshots are ignored generated review output. Generate the gallery
with:

```powershell
node scripts/build-light-theme-gallery.mjs output/playwright/light-themes/capture.json C:/absolute/path/goal-hint-light-themes.html
```

The gallery contains actual rendered markup and CSS for all twenty screens,
compressed into one self-contained fragment. Shadow roots isolate component
styles. Theme navigation stays in the review surface; production code is absent.
Desktop/Mobile controls switch the device view for the selected theme. The
desktop composition is scaled to fit the conversation, while the phone
composition retains its 390 px proportions. Captured application actions are
visual samples; they do not perform requests or account operations.

## View the gallery in an external browser

Export the existing conversation fragment with the visualization skill's
`scripts/render.py`, using
`output/playwright/light-themes/goal-hint-light-themes.html` as the destination.
The exported document includes the standalone styling and interaction runtime;
the fragment itself remains the editable source.

Then run this command from `next-js/`:

```powershell
python scripts/serve-light-theme-gallery.py
```

Open <http://127.0.0.1:3108/goal-hint-light-themes.html> in a browser on this
computer. Use `--port` to choose another local port. The server binds only to
`127.0.0.1` and exposes only the exported gallery; generated files are ignored by
Git. Keep the process running while reviewing the samples. Regenerated exports
are available on reload without restarting the server.

## Color checks

Each palette separates quiet decorative borders from stronger editable-field
boundaries. Primary actions, secondary text, selected accents and field outlines
are checked against their actual palette surfaces. Football market and result
meanings remain consistent across themes.
