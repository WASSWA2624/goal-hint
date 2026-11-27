# GoalHint UI and connection performance

The baseline is development commit `714c44c9`. The browser used Chromium with three cold contexts per route. The 390px profile used 4× CPU slowdown, 150 ms network latency, 200,000 bytes per second download and 100,000 bytes per second upload. The 1440px profile ran without throttling. Routes came from the existing isolated production UI fixture and used synthetic rows. First visible content is the relevant route region observed at the next two animation frames. Script size counts same-origin encoded JavaScript response bodies. These are local lab measurements. Browser event timing does not establish field INP.

## Baseline

| Route | Mobile first content / LCP | Desktop first content / LCP | JavaScript transfer |
| --- | ---: | ---: | ---: |
| Matches | 1,664 / 1,256 ms | 441 / 432 ms | 422,207 B |
| Best Slips | 1,033 / 992 ms | 219 / 236 ms | 411,133 B |
| Builder generated results | 1,442 / 1,116 ms | 296 / 316 ms | 398,966 B |
| Performance | 996 / 1,104 ms | 255 / 284 ms | 373,702 B |

The numbered Matches page change took 5.23 seconds on throttled mobile and 154 ms on desktop, measured from click to the first paint after the returned page became visible. The sampled click interaction durations were 2,376 ms and 56 ms respectively. Mobile CLS medians were below 0.001 across the four routes. The desktop Builder fixture had two 0.821 CLS samples and one 0.00009 sample. The variability limits conclusions about its layout shift.

## Hosted feed observations before the change

| Request | Status | End-to-end |
| --- | ---: | ---: |
| Production default 30-day Matches, two samples | 503, 503 | 32.87 s, 39.53 s |
| Production Today Matches, pages 1 and 2 | 200, 200 | 21.89 s, 10.49 s |
| Production Today/Pending Matches | 200 | 13.55 s |
| Staging Today/Pending Matches | 200 | 1.24 s |
| Production Best Slips API | 200 | 10.58 s |

The existing standalone Matches API keeps its 30-day default, exact filtering and bounded pages. The hosted samples included connection overhead and concurrent site activity. They establish that a long or failed read can occur while the server is reachable. They do not isolate a database operation or establish an improvement to the broad query. Staging returns a small cohort and cannot qualify populated production latency.

## Changes under test

The shared Show More control replaces the numbered pager and limits loads to the next bounded batch. Existing rows keep their keys. Builder reuses rendered result cards with stable props when another slice opens. Passive Matches and finite Best Slips refreshes each read one loaded page per tick and update matching rows. A validated rebase applies changes to ordered membership. A failed Matches read can retry the applied query in place. The request has a 40-second whole-response budget and supports one quiet automatic attempt. The document-level fallback keeps its limited offline bundle and original retry URL.
