# 188 — Compact saved filters and today loading

Keep only the configuration dropdown, Save current filters and Update selected
in the desktop builder's saved-filter row. Reuse the existing toolbar sizing,
filter palette, typography and radius tokens. Remove persistent explanatory
copy, counts and management links/controls there; keep account management and
phone controls available. Retain accessible names and actionable error feedback.

Canonical saved configurations omit dateFrom/dateTo while preserving selected
time ranges and every other reusable filter. Blank times mean the full day.
Normalize older dated saves on read; loading always supplies today's reporting
date for both date bounds and never includes build=1. Manual builder date
selection continues to work independently of saved configurations.

Verify date-free writes/updates, legacy configurations, successive-day loads,
time-range fidelity, and no generation on load/default application. Compare
desktop control geometry/colors in both themes and at the desktop breakpoint;
check the account dashboard and phone layout. Run relevant tests, lint and
strict typing, and record results before committing and pushing main.

Completed verification:

- Strict TypeScript checking and changed-file lint passed.
- The final focused suite passed 122 tests; the real MySQL integration case
  skipped because its server binary is unavailable. Two migration/checksum
  regression tests passed; no new database migration is required.
- The isolated production fixture passed builder/account SSR and private API
  checks. Browser tests verified exactly three visible desktop controls,
  matching 32px heights, 12px fonts, shared borders/palette and radius values
  in light/dark themes at 1440px and the 1024px desktop breakpoint.
- Browser save/update tests verified date-free API data and retained time
  ranges, including full-day defaults. Dropdown, default and dashboard loads
  all used today's reporting date, omitted build=1 and cleared old results.
  The account management controls and 375px phone layout remain available.
- Real database concurrency and physical devices were not exercised. Browser
  verification used the existing synthetic adapter with production handlers
  and service. Screenshots/logs stay ignored under output/.
