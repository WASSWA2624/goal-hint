# Prediction access previews

- Show public match identities and slip aggregates to every viewer; redact unfinished per-match predictions, prices and probabilities on the server.
- Release each original slip selection only after original-cycle and canonical completion; an early lost slip does not unlock later legs.
- Use one themed Unlock action on protected content across desktop and mobile. Native links cover locked slips and match cards and route to registration, login or subscription. Keep filter areas free of additional access sections.
- Keep details and builder results protected, with public finished matches and read-only completed publication links.
- Verify API projections, expiry/revocation, unavailable forecasts, sharing boundaries, mixed slips and light/dark responsive layouts.

- Mobile refinement: replace the locked score/prediction display with a full-area, context-aware access button. Keep the approved desktop row intact.
- Place the mobile slip Unlock action in an intrinsic header grid track beside its status, keeping other slip header actions unchanged.

## Verification

- 177 access/feed/slip tests and 76 publication/forecast/card/detail tests passed.
- TypeScript and lint passed; the production fixture build passed.
- Access projections passed 727 HTML/RSC/API checks across nine viewer states before the mobile layout refinement. Final mobile production markup/API checks passed in 21 cases.
- Browser checks passed 72 responsive layouts across guest, expired and entitled viewers, both themes, and 320/390/1440px widths. Desktop card geometry and text matched the approved fixture in both themes.
- The reusable mobile access verifier passed 24 production touch layouts in both themes, including shared control heights, hidden fields, button coverage, destinations and separate slip status/action tracks.
- Rendering acceptance used synthetic stored readers with the database disabled.
