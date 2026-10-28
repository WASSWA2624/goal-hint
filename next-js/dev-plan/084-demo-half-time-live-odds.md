# 084 Half-time statistics and live odds in the development demo

Extend the existing API-Football simulator with its documented optional response
variants while using the normal production pages, components and pricing rules.

1. Verify the provider's half-time statistics example and live-odds schema,
   including the separate live betting-market catalog.
2. Add first/second-half statistics that follow the simulated match clock and
   reconcile with the existing full-match totals and event observations.
3. Add live odds, filters, market suspension flags and update clocks. Reuse the
   existing score model, conditioning remaining outcomes on the observed score.
   Cover pre-kickoff entry, play, pauses and the documented post-match removal.
4. Preserve default fixture details, ordinary statistics and pre-match prices.
   Serve the new variants through the existing development provider routes.
5. Verify exact envelopes, field types, filters, lifecycle and production
   isolation; run the relevant regressions, lint, typecheck and production build.
   Commit and push the integrated result on main.

Completed implementation:

- Verified `statistics_1h` and `statistics_2h` against the provider's selectable
  OpenAPI 3.9.3 example, recovered from the [archived official specification](https://web.archive.org/web/20251204223402id_/https://api-sports.io/public/documentations/football-v3.yaml).
  Added the exact response variant, boolean validation and consistent team/type
  filtering. Default statistics and fixture-detail responses retain their shape.
- Added `/odds/live` and `/odds/live/bets`, with 13 independently identified live
  markets, combined filters, observed-score pricing, five-second update steps,
  suspension flags, extra-time markets and bounded live availability.
- Kept production pages, components, pre-match slip pricing and eligibility rules.
  The new variants use the existing local provider transport and guarded raw
  development routes. No provider credentials or live API calls were needed.

Verification:

- 228 relevant demo, odds, live-match, match-detail and slip regression tests
  passed, including the full 334-day / 187,040-fixture schedule audit.
- ESLint, TypeScript checks and the optimized production build passed.
- HTTP smoke: 560 fixtures on 1 January, two teams with 18 statistics per period,
  working half-statistic filters, 52 currently available live fixtures, 13 live
  market types, and combined fixture/league/bet filtering.
- Production HTTP smoke returned 404 for all three new demo endpoint variants
  even when the public demo flag was enabled.
- Browser smoke loaded the regular slip-builder page and its saved-slip records;
  the ordinary subscription gate remained in effect for the signed-out session.
