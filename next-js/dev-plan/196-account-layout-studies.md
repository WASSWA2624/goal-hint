# 196 — Account layout studies

## Scope

Prepare ten interactive Account page concepts for the user's selection before
implementing a redesign. Follow the existing admin dashboard: left section
navigation, concise details on the right, and actions next to their subject.
Expose Change phone and Change password as menu items. Keep all Account entry
points within the same workspace. Preserve the builder-only Custom Filters scope.

## Deliverable

- A reusable, self-contained comparison fragment under `design/account-layout-studies/`.
- Ten named alternatives with different information hierarchy, density, panel
  geometry and action placement, using Goal Hint colors and restrained corners.
- Working local section navigation, account dropdown, sample forms, and theme-aware
  presentation. All records and changes are fictional; no account APIs are called.
- An inline comparison for review, with host-provided variant navigation and
  optional sidebar-width/spacing controls.

## Verification

- JavaScript extracted from the fragment passed `node --check`.
- The visualization renderer accepted the fragment; the inline copy and repository
  source have identical SHA-256 hashes.
- Playwright CLI checks passed across all ten variants at 1440, 1024, 390 and
  320px in light/dark appearances: **80 layout combinations**, with no horizontal
  overflow or clipped controls and left-side navigation at desktop widths.
- **80 section-navigation checks** passed, plus account dropdown destinations,
  ten narrow-screen dropdown placement checks, mobile section menus, and local
  form state retention when switching designs.
- Four form checks passed: password mismatch, password preview success, phone
  verification preview, and notification preference preview. No account API
  requests or browser runtime errors occurred. Native submissions are intercepted
  so form previews also work in the conversation's restricted frame.
- Screenshots of all ten concepts were reviewed together, with representative
  full-size light/dark views. Output and review scripts remain ignored under
  `output/playwright/`.
- No production application code, database schema, Account route, authentication
  handler or saved-filter behavior changed. Application builds and business-logic
  integration tests are outside this presentation-only scope.

Live Account implementation awaits the user's design selection.
