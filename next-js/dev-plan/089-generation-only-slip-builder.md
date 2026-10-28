# Generation-only slip builder

## Scope

- Keep the existing slip count, total odds, match count, individual odds and
  probability, date/time, market and reuse controls on all screen sizes.
- Remove saved-slip performance, completed history, generated win/loss summaries
  and Save actions from the builder. Do not read saved history during builds.
- Generate temporary results from the selected criteria without persisting slips.
- Verify real generation and responsive browser behavior before committing and
  pushing the integrated result on `main`.

## Implementation

- Remove the history reader and presentation from the server route, and remove
  performance summaries and Save controls from generated results.
- Ensure Automatic evaluates all requested published outcomes with approved
  prices, independently of the feed's displayed recommendation.
- Cover the recommendation case in domain and service regressions, and verify
  generation-only rendering for anonymous and signed-in viewers.
- Let slip summaries use two columns on narrow phones to prevent clipped values
  and selection counts.

## Verification

- 126 focused domain, service, joint-model, price-page, cohort and Best Slips
  tests passed, with no skips. The new recommendation regressions failed before
  the fix and passed afterward.
- Genuine local MySQL verification read 46 fixtures and 460 approved demo quotes
  through the production stored cohort and generation service. It generated
  three distinct two-match slips in 5.9 seconds, satisfying total and individual
  odds, probability, markets, EAT date/time and disabled reuse. Original forecast
  and quote values were retained, and the saved-slip count did not change.
- All 33 production-rendered builder cases passed, including signed-in builds,
  regeneration, exact inclusive limits, empty results, invalid criteria, cutoff
  handling and native forms. Existing saved-snapshot presentation checks passed.
- Playwright submitted the actual form, applied optional limits, regenerated,
  rebuilt identical criteria and reset. At 320, 390, 768, 1280 and 1920 pixels,
  results had no history, performance summary, Save action, horizontal overflow
  or clipped slip summary. The browser made no saved-slip requests.
- Full ESLint, TypeScript checking and the final optimized production build,
  including its offline manifest, passed. The responsive style also passed its
  focused lint check.
- The full repository unit run did not finish: an unrelated offline database CLI
  test exceeded its 60-second subprocess timeout, and an evidence-service worker
  remained running after the other workers finished. The stalled run was stopped;
  the database CLI test passed in isolation in 24.4 seconds. This is not a claim
  that the entire repository suite passed.
- Production subscriber and public-odds policy gates remain in force. The MySQL
  and browser generation checks used approved isolated development/demo data.
