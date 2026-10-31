# 210 · Desktop theme previews

## Goal

Offer ten complete desktop look-and-feel directions for review before choosing
the application's next theme. Preserve the approved layouts and interactions.

## Implementation

- Build an isolated, local Next.js review app from `design/desktop-themes/`.
- Give every theme its own URL and a shared top navigator. Keep the current
  screen selected when changing themes.
- Cover Best Slips, Matches, Slip Builder, Results, Help, Privacy, Terms,
  Contacts, Invites, member dashboard, admin dashboard, and analytics.
- Reuse production screens, shells, forms, tables, sidebars, and legal content.
- Vary semantic color tokens, typography, borders, subtle corners, and feedback.
  Keep the shared radius scale and full-width desktop section composition.
  Allow restrained rounded desktop cards, quiet one-pixel borders and accent
  rails, and compact spacing through the theme contract.
- Extend the shared application theme contract for heading families, header
  logo polarity and desktop surfaces, reading width, selection colors,
  scrollbars, motion, and interaction feedback. Consume those tokens in the
  real components rather than using preview-only appearance overrides.
- Keep business logic and functionality unchanged. Express any future visual
  layout adjustment through the shared theme contract.
- Use synthetic read services. Keep submissions and external actions inside
  the review. Do not change production theme preferences or business logic.
- Verify every theme/screen combination and desktop interaction behavior;
  keep generated builds and captures ignored.

## Review

Run `npm run design:desktop` from `next-js/`, then open
`http://127.0.0.1:3110/themes/porcelain-blue`.
Mobile and tablet theme design are deferred until a desktop direction is chosen.

## Verification · 31 October 2026

- Isolated production preview build, including TypeScript: passed.
- Main application `npm run typecheck`: passed.
- ESLint for the repository and final changed styling/preview files: passed.
- 33 theme, complete-contract, contrast, boundary, market-color, and navigation
  regression tests: passed. A real rendering test verifies that one custom
  theme changes headings, reading width, header height and logo, and timing.
- All 120 theme/screen combinations at both 1440px and 1280px: passed
  (240 browser checks), with no console errors or horizontal overflow.
- 14 interaction checks: passed, covering navigation and URL filter retention,
  date dialog and Escape, focus, result filtering, valid observation reads,
  disclosures, theme preference isolation, shortlist persistence, sample slip
  building, footer links, sticky headers, and reduced motion.
- Visually inspected shared layouts and every palette; verified the last slip
  row's hover background inherits the card's 8px lower corner.
- Audited parent containment and heading rails on member/admin workspaces,
  builder, matches, results, and Help. Shared workspace headings and panel
  headings now consume the same gutter helper as panel content, accounting
  for panel borders. No panels or forms exceeded their parent bounds.
- After the gutter refinement, repeated 80 member/admin/invite/analytics
  workspace checks across all ten themes and both desktop widths, including
  explicit parent containment checks; all passed. Repeated the 14 interaction
  checks against the final build; all passed.
- All data is synthetic. Unpreviewed account submissions and external actions
  remain illustrative. Other font families use documented system fallbacks.
