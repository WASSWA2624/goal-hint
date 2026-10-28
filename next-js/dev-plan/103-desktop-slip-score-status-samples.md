# Desktop slip score and status samples

## Scope

- Create ten desktop-only preview concepts for selection before implementation.
- Preserve the current production desktop design and the mobile presentation.
- Reuse the approved slim, native collapsible slip header.
- Demonstrate adjacent slips with a 3px gap, two collapsed and one expanded.
- Show both Best slips and builder contexts in light and dark themes.

## Row requirements

- Order: date, time, country, league, teams, market/selection, odds,
  probability and final status.
- Format dates as 28-Oct; keep date and EAT time close with no separator.
  Place the first separator after time, before country.
- Fix country, league and status widths; truncate names with accessible
  full-text tooltips.
- Use a shared score/VS centre and aligned home/away logo tracks across rows.
- Keep scores and compact 30′, HT and FT indicators within the same match row.
- Distinguish match state from Pending, Won and Lost selection outcomes.
- Use explicit illustrative states only; do not fetch or infer live results.

## Verification

- Isolated optimized preview build and TypeScript checks pass for desktop and
  mobile review routes; targeted ESLint passes for all changed source files.
- Eighty browser cases pass across all ten concepts, both themes and both
  contexts, including 1024, 1280 and 1600px desktop widths for Best slips.
- Verified 3px slip gaps, two collapsed/one expanded defaults, 28-Oct dates,
  tight date/time spacing, logical column order and fixed metadata/status widths.
- Verified exact score, crest and name-to-crest alignment across short and long
  names, equal 36px row heights, and no overlapping or overflowing fields.
- Enter/Space disclosures, full-name tooltips and Escape dismissal pass.
- Visual review passes in both themes, including boxed scores, inline clocks
  and outcome blocks. Clocks stay inside their rows without overlapping scores.
- Review pages remain noindex and make no API requests; live production row
  behavior is unchanged (only its existing text-tooltip export is reused).
- Preserve unrelated working changes, stashes and detached worktrees; commit
  only the preview changes and push main after verification.
