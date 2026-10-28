# Single-line desktop slip layout review

Open `/en/slips/designs/desktop` on the running application, for example
<http://127.0.0.1:3000/en/slips/designs/desktop>. The route uses illustrative
records and local generic crests and is marked `noindex, nofollow`.

| Option | Layout |
| --- | --- |
| 01 | Balanced ledger |
| 02 | Inline columns |
| 03 | Fixture priority |
| 04 | Market panel |
| 05 | Odds anchor |
| 06 | Probability anchor |
| 07 | Country rail |
| 08 | Alternating lines |
| 09 | Subtle dividers |
| 10 | Minimal line |

Every option has one initially collapsed native disclosure and one expanded
example. All ten reuse the approved Balanced ledger header, with its height
reduced from 44px to 36px (44px for coarse pointers). Its color, typography,
horizontal spacing, field order and alignment stay the same.

Each match is one horizontal line: short date such as **28 Oct**, 24-hour time
and EAT, league/logo, country/flag, teams, market/prediction, individual odds and
probability. The home crest follows its name immediately before **vs**; the away
crest precedes its name. Long league/country/team labels use ellipsis. Hover or
keyboard focus reveals full text; Escape dismisses the tooltip. Local sample
crests and bundled country flags have text-height footprints.

Use **Inspect** or the design selector to compare one option. The only other
controls switch Best slips/Slip builder and Light/Dark. Sample records include
short and long names so truncation is visible without extra controls. Canvases
fit the review surface down to a 960px minimum and scroll locally in smaller
windows; enlarged text scales that minimum width.

Desktop production slips now use **09 — Subtle dividers**, with centred
intrinsic team-name pairs. Long names still shrink and ellipsize. The native
desktop disclosure starts collapsed in Best slips, builder results and history;
locked summaries share the same header and relevant access action. The existing
64rem responsive hook selects one row implementation and preserves the selected
phone layout. A desktop-only pending rule prevents an expanded-content flash
before hydration; JavaScript-disabled browsers retain the server fallback.

Production and preview share the desktop snapshot row, tooltip, base geometry
and selected divider CSS. Production **vs** links open canonical match analysis
without nesting links around full-name controls. Samples remain synthetic and
non-navigating; no providers or private slip APIs are called by them.

To keep reviews available while the main application is being built, run an
isolated review from `next-js/`:

```powershell
python scripts/preview-slip-designs.py --serve --port 3120
```

This builds into ignored `.tmp/slip-design-review/` and serves both review routes
without account, analytics or offline startup. Subsequent application builds do
not overwrite its files. Use `--reuse` to serve the last review build, or omit
that flag to include source changes. No private environment files are copied.

Use an existing running server when available. Layout screenshots and browser
check scripts are generated in ignored `output/playwright/desktop-slips/` and
`.tmp/` directories rather than committed.

Verify production snapshot rendering and locked-summary privacy with
`python scripts/verify-desktop-slip-rendering.py`. Its isolated routes and
browser checks are described in `tests/helpers/rendering/desktop-slips/README.md`.
