# 304 Live matches and market display

- Reuse the November fixtures, sealed forecast publications, and stored pre-match and in-play odds. Trace coverage and access through the signed-in admin view.
- Put live fixtures first in the default Today view. Keep the chosen status, date, market, and explicit sort controls authoritative.
- Show the strongest available published market and its probability when the forecast abstains from recommending a pick. Show current bookmaker prices only for supported, fresh market observations. Retain the distinction between a forecast and a recommendation in filters and settlement.
- Use shared league crests and flag fallbacks on desktop and mobile. International competitions use a globe in the country slot.
- Keep image loading quiet and reduce data transferred for performance reports. Verify the stored data, both themes, and browser timings with the worker active.

## Local verification on November 11, 2026

- The stored cohort contained 192 fixtures and 34 published forecasts. The forecasts had no qualifying recommendation. Browser checks with a temporary admin session showed all 14 live fixtures first, 20 published probabilities and 37 rows with odds on the first page in light and dark themes at desktop and phone widths.
- All 55 competitions in today's cohort had a crest URL. The ten World competitions lacked country flags. The browser showed the globe on World rows, and the provider crest returned an image directly after the local thumbnail request failed.
- Warm HTTP responses measured about 2.0 seconds for the Today API, 2.9 seconds for the Matches navigation response, and 7.9 seconds for the streamed 30-day Performance report. Requests during compilation and concurrent type checks were slower.
- In the admin browser, returning from Slips to Matches took 3.8 seconds. The first completed Slips and match-detail transitions took 11.7 and 24.4 seconds. Three warm server reads of the same match detail then took 0.16–0.69 seconds. Development startup and compilation still affect browser timings.
