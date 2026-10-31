# 197 — Admin classic Account workspace

Implement the explicitly selected Admin classic concept from plan 196: desktop
sidebar, concise right-hand details and a phone section menu. Keep existing auth,
payment, credit and verification flows. Use validated section links from both
the sidebar and account dropdown, and preserve safe return destinations.

Reuse admin navigation styling and existing security/financial controls. Keep
Custom Filters in Slip Builder and referral features deferred. Load only data
needed by the selected section. Preserve recovery, blocked and admin guards.

The user's follow-up explicitly requires the actual app chrome and compact
components. Admin and Account now share `WorkspaceHeaderContent` and navigation
items. Account panels use the existing admin `DeskHead`, `Panel`, `PanelHead`,
`PanelBody` and `StatGrid`, with theme typography and the shared form controls.
Odd mobile fact counts span the last item across the row, avoiding empty tiles.
Editing, notification and device panels have a restrained reading width rather
than stretching small forms across the entire desktop detail area.

## Verification

- Root TypeScript and changed-file ESLint passed. Two navigation tests and the
  focused dashboard/session/subscription/preferences/startup checks passed
  (42 tests); the existing security/auth suite passed another 50 tests.
  Shared navigation, admin record-navigation and sidebar-state checks passed
  another 22 tests, for **114 passing focused tests** in total.
- Isolated production member and payment fixtures built and passed their HTML
  and API checks. Updated Account assertions cover the focused sections instead
  of the superseded text stack. Contact checks compare unique destinations,
  because both responsive contact variants exist in server-rendered markup.
- Browser checks passed for all eight sections, account-dropdown entry, refresh
  deep links, password mismatch/current-password errors/success, phone verification,
  notification enable/withdraw/reload, and sign-out of other devices. Sensitive
  fields clear across section navigation; mobile selection, Escape, outside
  dismissal and focus restoration work.
- All eight views passed at 1440, 1024, 390 and 320px in light/dark themes:
  **64 layout combinations**. Form actions share a row on desktop. Long activity
  names wrap, the ten-item limit remains, and no application runtime/hydration
  errors occurred.
- The fixture now renders the actual admin shell for comparison. Computed
  Account/admin navigation matches (Manrope, 16px, 40px desktop targets), as do
  the header rail's 24px/20px insets and 47px content height.
- The final bounded editing/device/notification panels passed another 32 focused
  width/theme checks, including desktop action alignment and a 672px maximum
  reading width. The final production member fixture and root typecheck passed.
- Credit balance/history and auto-renew enable/disable passed browser checks
  through the existing HTTP handler, at desktop and phone widths. All storage
  and account changes in acceptance are synthetic; no production database,
  external delivery or real account mutation was used. No migration is needed.
- Screenshots were visually inspected under ignored `output/playwright/`.
  The small fixtures omit service-worker/builder resources and emit expected
  404s for those resources. Production deployment and live-device behavior are
  outside this local verification.
