# Desktop match filter design samples

Ten interactive desktop concepts for comparing compact Matches filter layouts.
The user selected sample 1, **Compact toolbar**, for the production desktop
filters. Its implementation is tracked in
[`114-compact-desktop-matches-toolbar.md`](../../dev-plan/114-compact-desktop-matches-toolbar.md),
including the completed rendering and interaction checks. The gallery remains
an illustrative design reference.

## Concepts

1. **Compact toolbar — selected** — two compact rows with every filter within reach.
2. **Status tabs** — visible match statuses above the remaining controls.
3. **Filter cells** — aligned labeled cells with readable current values.
4. **Quick dates** — direct access to common date ranges.
5. **Quiet ledger** — restrained controls aligned with the match rows.
6. **Expandable toolbar** — primary controls with an expandable filter row.
7. **Filter rail** — a narrow filter column beside the results.
8. **Tabbed groups** — related controls organised into selectable groups.
9. **Split toolbar** — search and match scope separated from refinement.
10. **Inline probability** — probability bounds available beside the filters.

All concepts use the application's visual tokens, 12–13px typography, square
edges, 32px controls, and illustrative match rows. Shared controls and dialog
behavior make the layouts directly comparable.

## Preview behavior

- Search, status, periods, sorting, Predictions only, and filter dialogs edit a
  local draft. Apply filters applies that draft to the sample data.
- Date/time, league, country, market, and probability dialogs support section
  Reset, Cancel, and Done. Cancel discards that dialog's changes; Done retains
  them for the main Apply action. The main Reset restores and applies defaults.
- Defaults are All statuses, Last 30 days, all leagues/countries/markets,
  unrestricted kickoff time and probability, Predictions only selected, and
  Latest first. Live uses Today with unrestricted kickoff times.
- Markets retain at least one selection. Probability accepts blank bounds or
  values from 0 to 100, with minimum no greater than maximum.
- Odds remain disabled and labeled unavailable, matching the current desktop
  controls.

The preview uses explicitly labeled sample data. It does not access live
matches, fetch counts, change account access, or replace the production query
and validation logic. Illustrative results are for comparing layouts rather
than validating prediction quality or the production feed.

## Local preview

The editable source is `desktop-match-filter-designs.html`, an HTML fragment
for the in-conversation preview. To serve it in the standalone preview wrapper,
run from PowerShell with Python available:

```powershell
python "C:\Users\WASSWA WILSON\.codex\plugins\cache\openai-bundled\visualize\1.0.57\skills\visualize\scripts\render.py" "D:\coding\apps\nextjs\goal-hint\next-js\design\desktop-match-filter-designs\desktop-match-filter-designs.html" --serve
```

Open the local URL printed by the command. The skill script location is specific
to this workstation and may change when the installed skill version changes.

## Verification

- JavaScript syntax checks passed.
- All 100 layout cases passed: ten concepts, light/dark appearance, and
  1280/1024/768/390/320px review widths. No overlapping controls, clipped
  button labels, or horizontal page overflow were found.
- All ten concepts passed country Cancel/Done/Apply, draft search and Enter,
  global Reset, invalid/valid probability, disabled odds, and Live/Today checks.
- Additional checks passed for league search, Predictions only, custom dates,
  UTC conversion, sorting, minimum market selection, Escape, and returned focus.
- Visual review covered the desktop toolbar, cells, rail, inline probability,
  and the dark ledger treatment. No JavaScript runtime exceptions occurred.

The standalone wrapper emits a sandbox form-submission warning on reload,
despite the preview having no form elements. The verified local interactions
still work. Full application builds and feed integration tests are outside
this isolated design-only change.
