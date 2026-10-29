# 124 — Grouped desktop Slip Builder controls

## Scope

Refine the desktop Slips page only. Keep mobile presentation, criteria
contracts, access routing, generated results and fixed primary-action sizing.

## Implementation

- Use one wrapping desktop toolbar with the numeric ranges, three popup groups,
  Reset and account action. Keep whole groups intact on narrower desktops.
- Align category titles and controls, using subtle vertical category dividers.
- Keep the desktop H1 available to assistive technology while reclaiming its
  visible space. Preserve the visible mobile heading.
- Hide the duplicate lower action on desktop and explain the required next
  step for guests and signed-in viewers without access. Provide clear idle
  guidance for eligible viewers. Retain the mobile notice and its action.
- Preserve the full native form before enhancement and without JavaScript.

## Verification

- Passed full TypeScript checking, full ESLint, Python syntax checks, all
  100 focused builder/card/paywall tests, and `git diff --check`.
- Passed the isolated production fixture build and complete Slip Builder SSR
  assertions, including titled categories, responsive status guidance, access
  routing, criteria defaults and native form behavior.
- Passed 57 browser layout/account cases across 320, 390, 768, 1024, 1280,
  1440 and 1920px widths, light/dark themes and fine/coarse pointers. At 1280px
  and wider, all controls and category titles align in one row. The desktop
  toolbar is about 110px high; at 1024px whole groups wrap without overflow.
- Passed 18 exact mobile/tablet baseline comparisons across 320, 390 and
  768px widths and three account states, with fine and coarse pointers.
  Heading, controls, summaries, account buttons and results copy/geometry match.
- Passed desktop title/separator alignment, accessible H1 retention, one
  visible account action, and account-aware status guidance.
- Passed popup Apply/Cancel/Escape, summary updates, global Reset, delayed
  pending-button behavior and JavaScript-disabled native GET submission.
  The primary action remains 208 by 32px, or 208 by 44px for coarse pointers.
- Root and verification agent visually inspected final desktop/mobile images
  in ignored `output/playwright/`. No overflow or JavaScript exceptions occurred.
- Test servers and browser session were stopped; generated artifacts remain
  ignored. The full nine-viewer paywall rendering suite was not run; its updated
  assertions were syntax-checked and all three real Slips account states were
  covered by the complete Slip Builder SSR suite and browser checks.
