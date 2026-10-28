# Apply the selected Clean ledger

## Scope

- Apply the approved three-row Clean ledger to shared slip displays: Best slips,
  generated slips, published slips and saved history.
- Use the same arrangement for mobile/tablet match feeds below the existing
  desktop breakpoint, preserving desktop table columns.
- Keep kickoff date/time left and league crest/name plus country flag/code right;
  home name/crest, VS or score, away crest/name in the middle; market/pick, odds
  and probability beneath. Tighten disclosure padding while retaining 44px targets.
- Preserve access gates, original saved selections, outcome/score semantics,
  analysis links, unavailable predictions and offline behavior.

## Implementation

- Promote the approved review row to reusable production selection markup and
  styles; review candidates reuse that production row.
- Share compact team/league/market labels and identity geometry with match feeds.
- Add cached, timezone-aware short kickoff date/time formatters. SSR remains EAT,
  while mounted displays follow the device like existing timestamps.
- Retain full accessible names, numeric precision and square component boundaries.

## Verification

- Full lint, TypeScript and the optimized production build passed. Focused
  slip, match-card, prediction-label, timezone and compact-label suites passed
  117 tests. Targeted lint also passed after the final presentation adjustments.
- Synthetic production rendering passed for all slip-builder states/native GET
  cases, entitled/locked Best slips, saved snapshots and 13 match-card examples.
- Browser checks passed 30 slip case/width combinations and 28 match-card,
  theme, entitlement/offline and enlarged-text combinations. Normal slip rows
  are about 65px; native disclosures retain their 44px target and keyboard use.
- Visually checked the final build at 200% text: narrow summaries stack their
  facts and selections reflow without horizontal overflow. Full accessible
  names, saved results, probabilities and original odds remain available.
- Isolated fixtures intentionally omit account/service-worker endpoints and use
  synthetic logo hosts; their expected 404/DNS messages are separate from the
  zero JavaScript runtime exceptions observed during layout checks.
- Commit the mobile paths and shared SlipTable variant change while preserving
  concurrent desktop work, detached worktrees and both existing Git stashes.
