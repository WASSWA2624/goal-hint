# Share Matches presentation with betting slips and the slip builder

## Accepted scope

- Apply the existing reusable match presentation to Matches on desktop, tablet
  and mobile, preserving the current feed controls, data and navigation.
- Keep web implementation in `next-js/`; no Flutter business/UI duplication.
- Reuse the approved Clean ledger phone/tablet identity/facts styling and the
  exact Aligned ledger desktop renderer used by betting slips and the builder.
- Keep square themed surfaces, compact spacing and accessible full names.

## Implementation

- Extract `DesktopMatchRow`, shared Aligned ledger/base styles and clipped-name
  tooltip presentation into `components/match/`.
- Keep `DesktopSlipRow` as the slip-specific adapter. Its original selected
  outcome, probability, odds, names, kickoff and publication remain immutable;
  separately supplied match observations retain their normal role.
- Keep `MatchCard` as the feed's existing forecast/access projection. Feed
  fixtures are not converted into fake `SlipSelection` objects or invented
  forecast distributions.
- `MatchCardList` owns one `useDesktopLayout` subscription and provides it via
  `MatchCardLayoutContext`. The context defaults to the original card fallback
  for server rendering and hydration, then selects the desktop presentation
  from 64rem. There is one fixture presentation per view, without duplicated
  hidden mobile/desktop records or per-card media subscriptions.
- Replace the former desktop table heading, separate number track and row
  striping with the shared nine-cell Aligned ledger presentation: date, time,
  country, league, teams/score/clock, prediction, odds, probability and status.
- Preserve accessible feed positions and the exact/similar-result divider.
  Clipped names expose their full value; score/VS retains canonical analysis
  navigation independently of name-tooltip controls.

## Behavior boundaries

- Preserve eligible-family/recommendation ranking, original selected odds,
  prediction probability and correctly bound settlement using existing helpers.
- Gated unfinished forecasts expose no pick or price. Explicitly public chance
  and unlock messaging retain their existing treatment; absent forecasts keep
  the actual no-prediction reason rather than a fabricated lock.
- Preserve scheduled, live, halftime, final and halted fixture facts. Rendering
  does not introduce settlement, invented scores or extrapolated live clocks.
- Preserve the asterisk, tooltip and accessible regulation-time explanation for
  extra-time/penalty finishes whose supplied score covers regulation only.
- Preserve filters, query ordering, exact/similar search grouping, pagination,
  retained results, continuous positions, live reconciliation and detail/Back
  navigation through the existing feed path.
- Use shared `Messages` formatting without changing UTC instants or reporting
  cohorts. Feed kickoff uses the hydrated device display zone with an EAT server
  fallback; slip display keeps its reporting-zone default.
- Preserve saved/offline restrictions: no forecasts, external media requests,
  detail links or live claims.
- Preserve unrelated automatic-slip-refresh/mobile-header work, existing
  stashes and detached worktrees. Commit only this task's intended changes.

## Verification

- Full-project lint, route/type checks and the production application build
  passed. The final annotation correction also passed scoped lint and a fresh
  production build, including its TypeScript validation and offline bundle.
- 111 focused Node tests passed for match cards, prediction selection/prices,
  filters, pagination/state, live refresh, paywalls and immutable slip snapshots.
- Optimized feed verification passed 46 captured scenarios, 11 date/status
  redirect cases and five invalid-query guards without new provider/database
  reads. The 13-card optimized fixture and its server-rendered checks passed.
- Paywall verification passed 668 raw HTML/RSC/API, history, insights, oracle,
  slip and private-route checks across nine viewer states.
- Browser layout checks passed 84 combinations covering seven feed scenarios,
  both themes and 320/390/768/1024/1280/1440px. Checks confirmed one instance
  per fixture, unchanged ordering, exact displayed picks/prices, responsive
  presentation, canonical analysis links and no page/row overflow.
- Twenty additional card/access browser checks passed, including live clocks,
  missing kickoff, long names, all outcomes and anonymous/entitled/expired/
  revoked viewers. Changing the selected market changed its exact price from
  1.85 to 2.10; Any market showed unavailable odds instead of borrowing another
  pick's price. The entitled exact match-result price remained 7.73 while free
  viewers saw no private selection or price.
- Numbered page-two navigation returned the two expected matches. Opening
  analysis and going Back restored focus to the same match's analysis link.
- Six direct regulation-only AET/Pens browser checks passed at 1280/390/320px:
  asterisks, tooltip/accessibility explanations, single-copy fixture rendering
  and no overflow. Dedicated synthetic controls preserve the 13 default SSR
  examples; the fresh optimized fixture and all SSR checks also passed.
- Integrate the verified intended changes into `main` and push `main`.
