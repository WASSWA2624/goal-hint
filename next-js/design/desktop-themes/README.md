# Desktop Theme Studio

Ten desktop look-and-feel directions, with twelve screens in every theme.
The review uses the actual application components and approved layouts.
**01 · Porcelain Blue** and **08 · Cobalt Night** are now the application's
light and dark themes. Their review pages reuse the exact production objects.

From `next-js/`, run:

```powershell
npm run design:desktop
```

Open [Desktop Theme Studio](http://127.0.0.1:3110/themes/porcelain-blue).
Keep the process running while reviewing. For an unchanged, previously built
preview, run `npm run design:desktop -- --reuse`.

The first navigator switches themes and keeps the selected screen. The second
switches screens within the theme. Every screen has a direct, bookmarkable URL,
for example `/themes/forest-night/matches`. Shortlist buttons remember choices
in this browser, using review-specific storage.

| # | Theme | Direction |
| --- | --- | --- |
| 01 | Porcelain Blue | Cool porcelain, royal blue, Manrope |
| 02 | Evergreen | Mineral white, forest green, humanist type |
| 03 | Ink & Paper | Warm paper, navy ink, Georgia headings |
| 04 | Copper Sand | Sandstone, copper, dark chocolate header |
| 05 | Arctic Teal | Ice blue, ocean teal, crisp outlines |
| 06 | Plum Studio | Pale lilac, plum, Manrope |
| 07 | Slate Precision | Silver, graphite, technical type |
| 08 | Cobalt Night | Midnight navy, cobalt, Manrope |
| 09 | Forest Night | Deep pine, mint, humanist type |
| 10 | Graphite Gold | Charcoal, brass, humanist type |

Every theme includes Best Slips, Matches, Slip Builder, Results, Help, Privacy,
Terms, Contacts, Invites, Member Dashboard, Admin Dashboard, and Analytics.
All share the same sample records. Existing help and legal copy is reused.
Manrope is bundled locally. Other font directions use the listed system font
with explicit fallbacks, so their exact appearance depends on installed fonts.

The slip tables, filters, reading layouts, account navigation, and dashboard
composition come from production. The shared radius scale supplies all corners.
Theme tokens provide restrained 4px or 8px desktop card frames, thin quiet edges,
and compact spacing. Themes vary colors, text hierarchy, font treatment,
surface boundaries, and interaction feedback. The studio measures its own
height to offset sticky app headers and workspace sidebars.

Each direction is a complete `GoalHintTheme`. Heading families, desktop header
fills and logo polarity, reading width, selection colors, scrollbar treatment,
transition timing, and interaction feedback belong to that shared contract.
The real application components consume those tokens directly. See
[`docs/theme-system.md`](../../docs/theme-system.md) for extending the contract
when a future visual or small layout adjustment needs another setting.

This is an isolated review app in ignored `.tmp/desktop-theme-review/`, served
on localhost. It does not load production credentials, a database, analytics
collection, offline workers, or message transports. Synthetic read APIs support
filters, card disclosures, and dashboard charts. Account submissions and
external destinations show preview feedback. The ordinary light/dark toggle
explains how to use the review navigator and leaves the app preference alone.
Some actions that require unpreviewed screens remain illustrative.

## Verification

The fixture's production build checks all imported components with TypeScript.
`scripts/verify-desktop-themes.mjs` exports `verifyDesktopThemes(page, options)`
for an existing Playwright Page, without adding a browser dependency. Run it
against the local server; it checks every requested theme/screen combination,
navigation, sample content, text contrast, and horizontal overflow. Optional
captures go in ignored `output/playwright/desktop-themes/`.

Desktop is the current review target: use 1280px or wider for comparison.
Below 1024px, the studio explains that desktop review needs a wider window.
Mobile and tablet theme design follows the selected desktop direction.
