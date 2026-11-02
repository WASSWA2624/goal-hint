# 243 · Distinct chrome and consistent layout spacing

- Keep the main content, Best Slips filters and Slip Builder controls on the white light-theme
  content surface. Use independent theme roles for app/dialog headers and footers,
  selected filter/workspace sections, table headings and slip headers.
- Use a restrained porcelain tint for light chrome and corresponding layered
  dark surfaces. Choose primary/inverse brand artwork by header luminance.
- Reduce the shared outer gutter to 8px. Use an 8px section inset so filter
  controls and tinted panel/footer contents have breathing room. Remove duplicate
  account-workspace horizontal padding and align shared panel headings/bodies.
- Use `theme.layout.slipGap` for a 20px gap between cards in Best Slips, Slip
  Builder, history, performance and loading states at every viewport width.
- Let Best Slips, Matches, Slip Builder and analytics filters scroll in normal
  document flow. Keep the app header and phone navigation in their existing slots.
- Give primary, phone and More-menu selections a restrained shared soft fill,
  readable accent text and thin indicator. Avoid an exaggerated solid selection.
- Reduce the embedded header-action bodies using `header.controlBlockInset`,
  consistently for Login, Register, appearance and account actions. Keep ordinary
  page-control heights, card internals, routing and business behavior intact.

Verify both active themes, fine/coarse pointers, dialogs and real public/member/
owner screens at 320/390/768/1024/1440/1920px. Check actual outer rails, filter
insets, slip-card gaps, white content/Best Slips filters, chrome contrast, button
fit and horizontal overflow. Preserve the separately implemented contained
slip-header controls.

## Verification

- Theme source contract and full ESLint passed; focused lint also passed after
  removing the remaining desktop Matches padding override.
- All 40 targeted theme, boundary, desktop-theme, sidebar, payment and slip-image
  tests passed. The production build and rebuilt production browser fixture passed.
- Browser acceptance covered 144 screen/theme/width combinations, 72 real control
  rows, 72 filter-scrolling/header-action combinations in fine/coarse pointer
  contexts, and 24 page/open-dialog theme checks. Widths were 320, 390, 768, 1024,
  1440 and 1920px in both active themes. The Matches inset regression was corrected
  and rechecked at every width; no remaining browser errors were found.
- The earlier full unit run has 12 unrelated failures reproduced on the untouched
  baseline; this UI refinement does not change those business-rule tests.
- Concurrent layout-bounds work, linked worktrees and existing stashes are preserved.
