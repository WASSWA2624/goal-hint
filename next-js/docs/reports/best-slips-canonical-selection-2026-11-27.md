# Best Slips selection verification, 27 November 2026

The initial staging trial used a 30-minute maximum. The current selection policy widens in 15-minute kickoff-span steps and ranks by the conservative win-probability bound within each step. Any span allowed by the operational set can qualify. The earlier measurements remain below for comparison.

## Production baseline

A read-only MariaDB session inspected the sealed archive and captured the current publisher's qualified fixture and quote pool at 15:52:53 Kampala time. The active publisher was `32613d5f`. The snapshot contained 129 inspected fixture records, 83 eligible fixture outcomes and 261 exact bookmaker offers after prior-allocation exclusion. Of the eligible outcomes, 15 had one verified book and 68 had more than one. Nine books were represented. These counts measure observed support in the stored evidence.

The November 24–27 census contained 56 sealed slips. The median kickoff span was 435 minutes, the 95th percentile was 750 minutes, and the maximum was 1,080 minutes. Fifty-two exceeded 30 minutes. On November 27, 32 of 33 slips exceeded 30 minutes, with a median of 420, 95th percentile of 600 and maximum of 665 minutes. In the lowest band, rank 3 combined 04:00 and 14:00 kickoffs. Rank 13 ran from 11:40 to 22:45. Times come from original sealed snapshots.

The 15:30 slot's paired odds refresh failed, so the worker skipped it. The two policies were replayed on the same captured eligible offers with an in-memory store. Counts under replay describe eligible plans. The live archive was only read. The 12:00, 12:30, 13:00, 13:30, 14:30 and 15:00 slots had successful refreshes and each reported bounded search. The 14:00 and 15:30 slots skipped selection after an unsuccessful refresh.

| Exact odds band | Sealed on Nov 27 at capture | Old independent disjoint slips | Old selected | New retained alternatives | New selected | New replay result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2.50–5.00 | 29 | 2 | 2 | 471 | 2 | Two disjoint slips. Remaining alternatives conflict with selected fixtures. Search reached a bound. |
| 5.00–10.00 | 4 | 1 | 0 | 0 | 0 | Old ascending allocation consumed fixtures. No new combination met all constraints including the kickoff span. |
| 10.00–20.00 | 0 | 0 | 0 | 0 | 0 | No eligible time-cohesive slip. The old search reached a bound. The new search finished within budget. |
| 20.00–50.00 | 0 | 0 | 0 | 0 | 0 | The sampled exact odds could not reach the band within eight same-book legs under the new policy. |
| 50.00–100.00 | 0 | 0 | 0 | 0 | 0 | Same exact-odds limitation. |
| 100.00–200.00 | 0 | 0 | 0 | 0 | 0 | Same exact-odds limitation. |

The old count is its independently selected disjoint batch before cross-band exclusions. The old entry point did not expose overlapping combinations. The new count includes overlapping retained alternatives, so the two feasibility columns have different denominators. The four highest bands had no candidate in this sample under the new rules. This single snapshot cannot explain why every historical slot was empty.

Each band searched from the same 261 stored offers. The new selector retained 157 candidates after applying its automatic input bounds. In ascending band order, bounded kickoff branch exits were 8,272 / 182 / 28 / 0 / 0 / 0, bookmaker exits were 69,398 / 664 / 48 / 0 / 0 / 0, and exact-odds exits were 7,329 / 1,502 / 596 / 16 / 16 / 16. These are search-work counters and can include repeated branches. Forecast and price qualification upstream yielded offers for 83 of 129 inspected fixtures, and the capture did not subdivide the remaining 46 by individual forecast, price or risk gate.

The release horizon plus the kickoff cap retained 52 distinct fixtures across the 157 offers. An independent odds-only upper bound on that pool found a maximum same-book product of 3.6512563 over at most eight fixtures within 30 minutes. The five higher bands were infeasible in this sample even before ranking and allocation.

The two old planned spans were 105 and 150 minutes. Their median, 95th percentile and maximum were 127.5, 150 and 150 minutes. The new plan used two 30-minute slips, with zero above 30.

| Plan | Exact-price display | Legs | Mean leg probability | Internal joint lower bound | Kickoff span |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old | 2.50 | 3 | 76.99% | 30.97% | 105 min |
| Old | 2.58 | 4 | 83.69% | 34.76% | 150 min |
| New | 2.56 | 7 | 90.95% | 36.67% | 30 min |
| New | 2.51 | 6 | 87.77% | 26.61% | 30 min |

The new plan's mean leg probabilities rose, and its median internal lower bound fell by 1.22 percentage points. The lower bound ranks the combinations without a joint calibration model. The replay used forecasts and quotes available at the captured clock.

## Featured-pick replay

At 15:57:29 Kampala time, a separate production read-only transaction sampled the earliest 350 scheduled fixtures in the next 24 hours and reached the sample limit. It found 201 priced picks, including 163 standard and 23 fallback Local Engine picks and 15 legacy provider picks. Of the 186 priced Local Engine picks, 128 had another modeled outcome with exactly the selected win probability. Running both policies on that evidence yielded the same chosen outcomes, prices and tiers. The 58 remaining Local Engine picks had no tied outcome. The results support keeping the support preference at an exact probability tie with the current evidence.

## Synthetic regression cases

- A three-fixture slate has a plausible 5.00–10.00 pair that shares a fixture with the lowest band. Old allocation filled one of the two feasible bands. The new allocation filled both with two slips and three distinct fixtures. The remaining four bands could not reach their exact odds. All selected fixtures started together.
- A 21-fixture slate has independent feasible candidates in all six bands. The old selector chose `[17, 1, 0, 0, 0, 0]` in ascending band order. The new selector chose `[2, 1, 1, 1, 1, 1]`, using 19 different fixtures and dropping the 04:00–14:00 pair. Total slips fell from 18 to 7, while populated bands rose from 2 to 6. The old median, 95th percentile and maximum spans were 0, 600 and 600 minutes. The new values were 25, 30 and 30. Neither search exhausted its budget.
- At an identical 90% Local Engine forecast, the old featured policy chose Under 5.5 at 1.29 with one verified exact book and modeled net return of +0.161 per unit. The new policy chose a separately modeled Over 1.5 at 1.25 with three verified exact books and modeled return of +0.125. A 93% Under 5.5 still ranks ahead. The standard tier retains the 1.10 and positive-return requirements. A priced fallback at 1.01 can still qualify, with its signed modeled return preserved.

## Verification

Focused regression checks covered the exact 30-minute and +1 ms boundaries, timestamps across midnight, drift under the publication lock, original wide-slip archive reads, same-book exact products, cross-band allocation and readiness skips. The publication integration ran on isolated MySQL 8.4.11 and exercised concurrent claims. Lint, type checking, schema validation and the theme contract passed. The default JavaScript suite passed 3,568 tests with 15 failures and one skip. The Python script suite passed 215 with one failure in the November replay trigger assertion. All 16 failures reproduced on the pre-change `aa971eeb` source.

The private staging publisher candidate from `0b7d1f7d` passed 213 focused tests. Its read-only preflight verified 95 completed migrations and found zero operational fixtures and zero append batches. The staging odds gate returned `odds-unavailable` before a cohort read or publication write. Staging therefore verifies the host runtime and guard, with eligible-publication cases exercised by synthetic fixtures and isolated MySQL.

The checksummed staging web artifact activated the same `0b7d1f7d` commit and served build `6Z5klNMZIB555yj-7hM9C`. The three app pages, the Matches and guest session APIs, and all six Best Slips band queries returned HTTP 200. Staging retained `noindex`. Its migration ledger verified all 95 entries. This capped trial ran only on staging. [Staging release](../../../implementation-docs/deployment-and-version-control.md#best-slips-selection-staging-release).

## Intermediate probability-first comparison

The corrected selector replayed the same 83 eligible fixture outcomes and 261 exact offers at the captured clock. It selected two 2.50–5.00 slips with kickoff spans of 270 and 105 minutes and conservative probability bounds of 42.99% and 30.97%. The capped trial selected two 30-minute slips with bounds of 36.67% and 26.61%. The wider 2.54 slip in the corrected plan covers 17:00 to 21:30 Kampala time. Its larger bound took priority over the shorter alternatives.

| Exact odds band | Retained alternatives | Selected | Outcome in the corrected replay |
| --- | ---: | ---: | --- |
| 2.50–5.00 | 263 | 2 | Two slips. The other 261 retained candidates shared fixtures with the selected slips. The search reached a bound. |
| 5.00–10.00 | 2 | 0 | Both retained candidates shared fixtures with stronger selections. The search reached a bound. |
| 10.00–20.00 | 0 | 0 | The bounded search returned no candidate. |
| 20.00–50.00 | 0 | 0 | No eligible slip in the sampled pool. |
| 50.00–100.00 | 0 | 0 | No eligible slip in the sampled pool. |
| 100.00–200.00 | 0 | 0 | No eligible slip in the sampled pool. |

The intermediate build ranked all candidates by the highest conservative bound, then the smallest span at that bound. It was built and tested privately. It was superseded before web activation by the 15-minute widening policy. The replay used stored snapshots and an in-memory publication store.

## 15-minute widening replay

With the same 83 eligible fixtures and 261 offers, the selector planned three disjoint 2.50–5.00 slips. It first selected six simultaneous 20:00 kickoffs, then a seven-leg slip from 20:30 to 21:00 and a six-leg slip from 18:00 to 19:00. Their spans were **0, 30 and 60 minutes**, and their conservative bounds were 25.90%, 38.16% and 40.89%. These plans illustrate shorter-span precedence and carryover of unused fixtures at wider steps.

| Exact odds band | Retained alternatives | Selected | Outcome |
| --- | ---: | ---: | --- |
| 2.50–5.00 | 1,739 | 3 | The remaining alternatives conflicted with selected fixtures. The search reached a bound. |
| 5.00–10.00 | 0 | 0 | Feasibility remained unresolved at the search limit. |
| 10.00–20.00 | 0 | 0 | No eligible slip found within the inspected pool. |
| 20.00–50.00 | 0 | 0 | No eligible slip found within the inspected pool. |
| 50.00–100.00 | 0 | 0 | No eligible slip found within the inspected pool. |
| 100.00–200.00 | 0 | 0 | No eligible slip found within the inspected pool. |

The replay used an in-memory publication store. Focused tests cover exact 15-, 30- and 45-minute boundaries, highest probability within the same step, fallback to wider spans, fixture carryover and selection across midnight. An isolated MySQL check verified append of a 90-minute pair across Kampala midnight.

Staging activated `ddc66aa7` and returned HTTP 200 from the app and all six Best Slips band queries. The matching private worker passed 220 tests and verified 95 completed migrations. Its staging preflight found an empty operational cohort and a closed odds gate. [Staging release](../../../implementation-docs/deployment-and-version-control.md#15-minute-best-slips-staging-release).

## Distant carryover comparison

In a synthetic 03:00 Kampala slot, the released 05:00–09:30 slip had a 270-minute span and the upcoming 09:30–09:40 alternative had a 10-minute span. The two shared the 09:30 fixture and both priced at 3.24 from the same bookmaker. With conservative bounds of 86% and 75%, the released slip won. With bounds of 80% and 86%, the publisher left the upcoming fixtures unclaimed and selected them in the 03:30 slot. An exact probability tie also deferred for the tighter alternative.

The regression cases also cover mismatched bookmakers or odds bands, a gap equal to the upcoming step width, and reconsideration when a later allocation claims a fixture needed by the upcoming slip. The fixed production-cohort replay retained its three selections at spans of 0, 30 and 60 minutes. That snapshot contained zero retained candidates crossing the release horizon.

Staging activated `68436794`. The app and all six band API queries returned HTTP 200, and the matching private publisher passed 227 tests. Its read-only preflight verified 95 applied migrations, an empty eligible cohort and a closed odds gate. [Staging release](../../../implementation-docs/deployment-and-version-control.md#distant-carryover-staging-release).

[Automatic selection](../../../implementation-docs/automatic-slips.md) · [Featured policy](../../../implementation-docs/prediction-engine.md)
