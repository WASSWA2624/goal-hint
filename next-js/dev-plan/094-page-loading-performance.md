# Page loading performance

## Scope

- Render the primary match view without waiting for optional statistics and
  history section previews. Preserve the canonical route's validation, HTTP
  statuses, entitlement checks and existing section retries.
- Read the public subscription price alongside the primary match projection.
- Start offline preparation after the document loads and the browser yields idle
  time, with a bounded fallback and complete lifecycle cleanup.
- Add a reusable, accessible loading shell for Slips and enable automatic partial
  prefetch for that navigation destination.

## Implementation

- Pass the optional preview promise through the server page to a small Suspense
  boundary. The existing match view stays mounted while previews arrive and
  continues to apply its current access projection.
- Keep loading boundaries off routes that must resolve `notFound` or canonical
  redirects before sending their HTTP status. Keep their existing prefetch policy.
- Retain offline bundle integrity checks, update cadence and cancellation rules.
- Retain the development Webpack setting: `docs/local-database.md` records a
  previously reproduced Turbopack development instrumentation hang.

## Verification

- All 77 focused navigation, detail, paywall, route-status, streaming and offline
  startup/refresh/transport tests passed without skips. An unresolved preview
  cannot hold the primary match HTML; failed previews preserve section retries.
- The isolated production fixture passed all 668 HTML, flight, API, history,
  insights, oracle, slip and private-route checks across nine viewer states,
  including entitlement changes during reads.
- Full ESLint and the optimized production build, including TypeScript checks and
  its offline asset manifest, passed.
- Light/dark loading-shell rendering and desktop/mobile navigation checks passed.
  Playwright verified the production Slips page and navigation at 390px; the
  rendered page has one main landmark and no horizontal overflow. Its isolated
  browser server deliberately disabled the database, so session API unavailability
  was expected there.
- Local development timings are affected by on-demand compilation and hot reload;
  they are not production performance measurements.
