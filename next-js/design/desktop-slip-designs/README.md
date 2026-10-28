# Desktop slip score and status review

Open `/en/slips/designs/desktop` on the running application, or the isolated
review at <http://127.0.0.1:3120/en/slips/designs/desktop>. The route is marked
`noindex, nofollow`.

Desktop Best slips and the slip builder now use selected concept **01 — Aligned
ledger**. The other nine concepts remain available for comparison. The mobile
presentation is unchanged.

| Option | Layout |
| --- | --- |
| 01 | Aligned ledger |
| 02 | Score box |
| 03 | Inline clock |
| 04 | Status rail |
| 05 | Split status |
| 06 | Quiet bands |
| 07 | Live highlight |
| 08 | Match bracket |
| 09 | Outcome block |
| 10 | Fine grid |

All options retain the approved 36px native slip header (44px for coarse
pointers). Each canvas shows two collapsed slips and one expanded slip with
only 3px between them. The Best slips context includes rank; builder context
omits it. Controls switch context, light/dark appearance and the inspected design.

Each match reads **28-Oct**, **18:00 EAT**, country/flag, league/logo, teams and
score/VS, market/prediction, odds, probability and final status. Date and time
have a 4px column gap without a separator. The first separator follows time,
before country. Country, league and status tracks have fixed widths of 5.75rem,
7.25rem and 7rem respectively; country and league names truncate with ellipsis.

The teams use equal name tracks around a fixed score track. Home crests follow
the home name and away crests precede the away name. Both crests and every
VS/score align across rows, regardless of name length. Hover or keyboard focus
reveals shortened names; Escape dismisses the tooltip. Flags and generic crests
have text-height footprints.

Five explicit illustrative states demonstrate upcoming/VS, live/1-0/30′,
half-time/1-1/HT, finished/2-1/Won and finished/0-1/Lost. Match progress and
selection outcome remain distinct. Clocks sit above or beside the score without
adding another match row; fine-pointer rows stay 36px tall. All status cells
have equal widths. Header odds and average probability are computed from the
five sample selections.

Samples do not request providers, live results or private slip APIs. Production
and review reuse the same row formatting, tooltips and selected geometry. Current
match observations are separate from the immutable production snapshots and are
matched to the original selection and forecast before display. The 64rem minimum desktop canvas
scrolls locally in narrower windows.

To build and serve an isolated review from `next-js/`:

```powershell
python scripts/preview-slip-designs.py --serve --port 3120
```

Use an existing running server when available. The script builds into ignored
`.tmp/slip-design-review/` and serves both review routes without account,
analytics or offline startup. Application builds do not overwrite its files.
Use `--reuse` to serve its last build; omit that flag to include source changes.
No private environment files are copied. Layout screenshots and geometry check
scripts live in ignored `output/playwright/desktop-slips/` and `.tmp/` folders.
