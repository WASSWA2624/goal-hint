# 077 Dark theme refinement

Refine the existing dark palette without changing layout, dimensions, spacing,
shapes, typography or behavior.

1. Soften decorative borders on surfaces, phone cards, headers and result tags;
   use subtle navy surface differences to preserve separation.
2. Give labeled buttons a shared quiet border token while retaining contrasting
   editable-field borders and existing focus, error and selected states.
3. Give Won, Lost and Pending summaries dedicated solid colors with text contrast
   of at least 7:1 in dark mode. Preserve the existing light-mode appearance.
4. Verify color contrast and real rendered components at phone, tablet and
   desktop widths, including theme switching, persistence, focus and dialogs.
5. Run lint, TypeScript, targeted tests and the production build; commit and push
   the intended changes to `main`, preserving unrelated work and stashes.

## Verification — 2026-10-27

- Full ESLint, TypeScript, 36 targeted theme/market/card/performance tests and the
  production build passed. The production offline manifest generated successfully.
- The synthetic production theme fixture passed SSR and browser checks in dark
  mode at 320, 390, 768 and 1440px, and light mode at 390 and 1440px, without
  horizontal overflow. Sampled card/control dimensions matched between themes.
- Theme switching, dark preference persistence after reload, modal surfaces and
  visible input focus passed. Rendered summary text contrast: Won 7.97:1,
  Lost 7.21:1, Pending 10.17:1.
- Screenshots and computed colors are local ignored artifacts under
  `output/playwright/dark-theme-refinement/`. The isolated fixture omits the
  production offline worker, so its registration logs 404 responses; offline
  behavior was outside these visual checks.
