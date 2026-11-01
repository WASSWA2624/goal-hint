# Shared screen rails, white selects and desktop match spacing

- Use the shared 16px layout gutter for compact app content, phone brand bars,
  content-page headers and match-detail headers. Retain full-width header fills.
- Share the theme's text-entry fill with native selects, compact select faces
  and custom select menus. Keep white light-theme faces through hover/focus and
  preserve semantic invalid/disabled fills and the single floating outline.
- Add the shared extra-small gap between standalone desktop match cards,
  retaining their thin dividers. Slip selections keep their joined layout.
- Verify resolved controls, screen rails and gaps at phone, tablet and desktop
  widths in both themes, then commit and push the integrated main branch.

Verification passed:

- 63 focused theme, card, feed and performance tests; lint on changed source and audits.
- Optimized production preview build, including TypeScript checking.
- 48 screen cases across both active themes at 390px and 1440px.
- 40 focused cases across both themes at 320, 390, 768, 1024 and 1440px:
  shared header/filter/list/footer rails, actual desktop card gaps and dividers,
  white select faces through hover/focus/expansion, white option panels, joined
  slip selections and no horizontal overflow. No browser exceptions.
