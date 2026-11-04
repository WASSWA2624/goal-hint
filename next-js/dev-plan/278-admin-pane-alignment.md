# 278 — Admin pane alignment

- Align square detail headers and footers across the record workspaces in both
  themes. Use the shared section surface, separator, and control insets.
- Apply the same bands to both Payments review workflows and give the desktop
  actions clearance below. Align the Subscriber identity with the pane edge and
  fill the Codes Revoke action with the shared danger styling.
- Put Audit CSV export beside Advanced filters and reserve the list footer for
  pagination. Use the fixed viewport for Settings so the divider and save
  footer reach the bottom together.
- Align Analytics gutters in loading and loaded states. Measure hydration,
  report and settings requests, and report rendering before considering SQL
  changes.

## Analytics measurement

- In an authenticated synthetic browser fixture, the single report request
  began 0.95–1.89 seconds after navigation. Retention loaded independently.
- On local isolated MySQL with 20,000 synthetic visits, 60,000 page views,
  and 40,000 events, the warm default 30-day report took 14.6 seconds. Its
  breakdown batch took 8.5 seconds. The 7-day report took 3.2 seconds.
- A 100,000-visit local stress run failed during the first query batch. These
  measurements characterize the local host. This change preserves the report
  queries and request contract.

## Verification

- Browser checks covered each admin screen on phones and desktops in both
  themes. Payments checks covered legacy review and checkout with a loaded
  synthetic receipt. Checks also covered Revoke confirmation, Audit download,
  and Settings footer placement, resizing, and draft retention.
- The owner and Referral rendering suites, 59 focused tests, TypeScript,
  scoped lint, and the theme contract passed.
