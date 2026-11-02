# 242 · Contained slip-header actions

- Derive matching Share and disclosure frames from the common control metric,
  reserving a themed inset instead of filling the header's full height.
- Keep desktop Share below the card's top border and the disclosure inside a
  positive end gutter. Preserve mobile alignment and independent hit targets.
- Check real responsive slip cards in both appearances, with fine/coarse
  pointers, expanded/collapsed states, long names and summary-only headers.
- Preserve ordinary form-control heights and verify the shared theme contract.

Verified:
- Reproduced the desktop Share frame above the header and the disclosure past
  its right border before applying the shared embedded metrics.
- Production fixture compilation and TypeScript checks passed.
- All 432 browser checks passed at six widths from 320px to 1920px, in both
  themes with fine/coarse pointers and enabled/disabled Share states. Matching
  frames measure 28px with a fine pointer and 32px with a coarse pointer.
- Open/closed slips, long names, missing Share and summary-only headers remain
  contained; native disclosure still toggles. Desktop/mobile screenshots checked.
- All 38 focused slip/share/theme tests, the theme contract audit, targeted
  ESLint checks and Python syntax checks passed.
