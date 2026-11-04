# 270 — Shared date/time and Matches filter inputs

- Introduce one themed date/date-time input, with a time-only mode for existing
  standalone time controls. Reuse it across date-entry forms and preserve each
  form's validation, accessibility and reporting-calendar rules.
- Display dates as 04-JAN-2026 with optional 24-hour HH:mm. Offer scrollable
  day/month/year and hour/minute columns with bounded, virtualized options,
  touch/mouse/keyboard support, one-step up/down arrows and cancellable picker drafts. Validate inline;
  preserve incomplete text while typing and clamp days when months change.
- Matches uses From and To date-times in the detected device zone. They define
  one continuous interval, including intervening days and the final selected
  minute. Validate civil dates, reversed ranges and nonexistent DST times;
  preserve both occurrences of repeated local minutes.
- Keep old date/daily-time URLs readable. New explicit intervals have canonical
  start/end parameters and participate in SQL bounds, caches and pagination.
- Remove Period and editable Time zone from Matches Advanced Filters. Prefill
  applied criteria on every open; keep local drafts, discard and Reset/Apply.
- Reuse searchable multi-select dropdowns for leagues and countries. Keep
  status and sorting dropdowns. Put Markets in a bottom collapsible checkbox
  section on both viewports. Preserve probability guidance and odds behavior;
  label Min/Max inputs individually. Fix shared single-click selection, first
  character/case/accent/partial searches and stable option popup positioning.
- Matches pages show up to fifty records; retain independent Best Slips limits.
- Refine the match-card typography and themed treatment to match the newer
  controls and headings, preserving the existing mobile and desktop layouts.
  Lighten mobile team names/scores and tie team-logo height to the name font size.
- Verify range boundaries/DST, filtering and pagination, reusable input forms,
  keyboard/touch selection and both themes at mobile/desktop widths. Update the
  overview, commit and push main without disturbing stashes or other worktrees.

## Verification — 4 November 2026

- 156 targeted unit checks passed across feed/query/pagination/state, formatted
  date entry, interval/DST boundaries, filter drafts, shared search, slip input
  guards, analytics and admin behavior.
- Genuine disposable MySQL checks passed for continuous interval SQL bounds,
  intervening nights, the inclusive final minute, and fifty-item pagination
  (50 + 14 filtered records and 50 + 45 unfiltered records without overlap).
  An initial disposable migration setup failed; retry completed. The new
  synthetic import first used unsupported offset timestamps; using canonical
  UTC provider timestamps and asserting complete imports resolved the fixture.
- Application TypeScript, focused lint and the shared theme contract passed.
  The isolated production app built successfully; streaming/loading checks
  and ten full performance-dashboard states passed.
- Browser acceptance covers light/dark at 320, 390, 1024 and 1440px: inline
  validation, canonical form values, picker arrows/wheel/keyboard, cancelled
  drafts, live country search, one-click selection, bottom Markets disclosure,
  applied prefill, mobile font/logo sizing and 50 + 5 pagination. Separate touch
  checks cover swipe scrolling, one-tap selection, shared 44px controls and
  prefill in a New York device zone. Screenshots were reviewed in both themes.
  The JavaScript-disabled native GET fallback also passed with combined date-time
  values and fifty records per page.
- Browser fixtures use stored synthetic predictions and a schema-validated
  55-record feed; the database checks exercise real SQL independently. These
  checks do not call football providers or change hosted deployments. Existing
  stashes, detached worktrees, development server and owned demo are preserved.
