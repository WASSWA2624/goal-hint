# 156 — Compact slip performance and lifecycle statuses

## Scope

Merge desktop Best Slips performance into its filter controls and distinguish
recorded progress/cancellation in the shared slip header.

## Implementation

- Use Average probability as the shared full label while retaining its existing
  arithmetic-mean meaning and short labels for compact presentations.
- Keep settled wager outcomes unchanged. Derive a separate presentation status
  from matching original-cycle evidence: Not started, In progress, Won, Lost,
  Void, or Cancelled. Keep Pending when progress is unknown rather than inferring
  it from kickoff time or scores. Only an entirely cancelled slip is Cancelled.
- Keep Pending as the filter/count umbrella for unsettled statuses. Add separate
  Void and Cancelled filters; count them disjointly before pagination and result
  filtering. Release only safe aggregate status metadata for locked predictions.
- Show date-range counts inside All/Won/Lost/Pending/Void/Cancelled toggles and
  remove the separate desktop Overall Performance block. Unavailable counts use
  a dash, with no fabricated zeros. Keep six result toggles and Reset together;
  date presets can scroll within their row when space is limited.
- Place the displayed slip range beside Applied filters in the same summary row.
  Retain the custom-range dialog, subscription defaults and access prompts.
- Reuse square 92px status badges with semantic theme colors; preserve Share,
  status, arrow ordering and Slip number, date/time, Top ranked ordering.
- Preserve the mobile performance strip, including an optional cancelled count,
  and keep compact headers usable at 320px. No database migration is needed.

## Verification

- All 86 targeted domain, original-cycle status, query/filter, publication,
  saved-slip, access, header and performance tests passed across the main run and
  focused reruns. The older invalid-filter test now uses an unknown status,
  since Void is a supported filter. Cancellation stays separate from settlement.
- Scoped ESLint and diff checks passed. The integrated production build passed
  compilation, TypeScript, all 21 generated pages and the 27-asset offline bundle.
- All 92 browser checks passed against an isolated production fixture whose
  runtime file hashes match the final workspace. There were no JavaScript page
  exceptions. Counts remain scoped to dates across result changes and pages;
  unavailable/loading counts do not claim zero. Void/Cancelled filters, custom
  dates, Reset, keyboard use, access defaults, held-refresh expiry, failed reads,
  mobile retry and renewal all passed.
- Both themes were verified at 1024/1440px; the merged panel is 68.39px high.
  Applied filters and displayed range share one row. All status badges are 92px
  wide with at least 4.90:1 text contrast. Mobile 320/390px layouts fit and retain
  their compact performance strip. Screenshots were visually reviewed.
- Fixture-only omitted routes and deliberate failed reads emit expected HTTP
  errors. Generated previews, reports and screenshots stay ignored.
- Git review preserves both detached worktrees and existing stashes. Only main
  exists locally/remotely; the verified source is committed and pushed there.
