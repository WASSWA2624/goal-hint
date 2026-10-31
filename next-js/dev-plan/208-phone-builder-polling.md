# 208 — Phone Slip Builder observation polling

Reuse the existing private observation endpoint and serial, cancellable polling
loop for phone and tablet Builder results, removing only the desktop enable gate.
Keep draft filters separate from the submitted immutable selection cohort; a
new build, paging, reset, saved configuration load or navigation owns cleanup.
No automatic slip generation, sharing changes or new polling endpoint.

Retain the twenty-second interval, request deadline, bounded retry-after/backoff,
original selection filtering and server access checks before/after reads. Add
pagehide/freeze/resume handling alongside visibility, online/offline, navigation
and persisted pageshow so phone/WebView lifecycle changes cancel obsolete work.
Keep disclosure DOM mounted during observation changes and stop on 401/403.

## Verification

- **26 focused polling/API/state tests passed**, zero failures/skips. The new
  browser-environment test exercises pagehide, freeze/resume, persisted restore,
  offline/online, hidden visibility, pending navigation and listener cleanup in
  one serial loop. Existing tests cover deadlines, uncooperative late responses,
  backoff, cohort/unmount cleanup, 401/403 withdrawal, exact original selection
  filtering, pre/post server access checks and per-session budgets.
- The isolated production Next fixture built and its HTML assertions passed:
  ordinary cards start collapsed, Share is present and a guest receives no
  generated selection snapshots. The fixture uses the real Builder, observation
  provider and POST handler with synthetic data/access; no database, real account,
  provider call, publication or external share delivery is involved.
- Chromium verified actual twenty-second cadence: **20,035ms at 390px** and
  **20,061ms at 1440px**, with one initial observation request and one loop.
  Scheduled → live → final updates changed status/score/outcome without rebuilding
  slips. Closed cards remained closed; the exact expanded disclosure DOM node
  remained mounted/open. Opening Share did not toggle the card; Escape closed
  the drawer normally and the real branded image prepared successfully.
- Browser pagehide/freeze/resume, offline/reconnection and pending-navigation
  checks paused/resumed requests. Editing the draft count retained the original
  six-watch cohort and issued no extra request. Build changed it to four watches
  and two cards; Reset removed results and stopped polling. Access withdrawal
  returned 403, removed selections and stopped future reads on both desktop and
  phone layouts. Immutable-cohort late-response/abort cases are covered by the
  focused tests above.
- **Ten width/theme combinations passed** at 1440/1024/768/390/320px in light/dark
  themes: each initial page had one polling request, collapsed cards, three Share
  actions and no horizontal overflow. No application runtime exceptions occurred.
  Expected fixture-only missing service-worker/notification routes and the
  deliberate 403 appeared in console. Inspected screenshots are ignored under
  `output/playwright/phone-builder-polling-390.png` and
  `output/playwright/phone-builder-polling-320-dark.png`.
- Changed-file lint passed. Full integrated typing/build and cross-feature
  regression are the coordinating agent's final checks; the small fixture skips
  unrelated build-time type checks while concurrent Track A models are changing.
  The temporary fixture server and Playwright page were closed after testing.
- Installed Flutter WebView lifecycle delivery, signed Android/iOS builds,
  physical-device background/resume, deployment and real network/service behavior
  remain **Unverified**. No Flutter bridge, UI layout, interval, backend endpoint,
  permission rule, OTP lifetime or database schema changed in this track.
