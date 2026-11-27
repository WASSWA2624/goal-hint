# Best Slips selection verification, 27 November 2026

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

The two old planned spans were 105 and 150 minutes. Their median, 95th percentile and maximum were 127.5, 150 and 150 minutes. The new plan used two 30-minute slips, with zero above 30.

| Plan | Exact-price display | Legs | Mean leg probability | Internal joint lower bound | Kickoff span |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old | 2.50 | 3 | 76.99% | 30.97% | 105 min |
| Old | 2.58 | 4 | 83.69% | 34.76% | 150 min |
| New | 2.56 | 7 | 90.95% | 36.67% | 30 min |
| New | 2.51 | 6 | 87.77% | 26.61% | 30 min |

The new plan's mean leg probabilities rose, and its median internal lower bound fell by 1.22 percentage points. The lower bound ranks the combinations without a joint calibration model. The replay used forecasts and quotes available at the captured clock.

## Synthetic regression cases

- A three-fixture slate has a plausible 5.00–10.00 pair that shares a fixture with the lowest band. Old allocation filled one of the two feasible bands. The new allocation filled both with two slips and three distinct fixtures. The remaining four bands could not reach their exact odds. All selected fixtures started together.
- A 21-fixture slate has independent feasible candidates in all six bands. The old selector chose `[17, 1, 0, 0, 0, 0]` in ascending band order. The new selector chose `[2, 1, 1, 1, 1, 1]`, using 19 different fixtures and dropping the 04:00–14:00 pair. Total slips fell from 18 to 7, while populated bands rose from 2 to 6. The old median, 95th percentile and maximum spans were 0, 600 and 600 minutes. The new values were 25, 30 and 30. Neither search exhausted its budget.
- At an identical 90% Local Engine forecast, the old featured policy chose Under 5.5 at 1.29 with one verified exact book and modeled net return of +0.161 per unit. The new policy chose a separately modeled Over 1.5 at 1.25 with three verified exact books and modeled return of +0.125. A 93% Under 5.5 still ranks ahead. The standard tier retains the 1.10 and positive-return requirements. A priced fallback at 1.01 can still qualify, with its signed modeled return preserved.

[Automatic selection](../../../implementation-docs/automatic-slips.md) · [Featured policy](../../../implementation-docs/prediction-engine.md)
