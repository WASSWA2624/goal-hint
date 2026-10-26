# App help

`/en/help` is a server-rendered guide to using Goal Hint. `/en/how-it-works`
permanently redirects to it so saved links remain useful. Help uses the shared
information layout, theme, content messages, controls and navigation. A question
circle icon and Help label appear in desktop navigation and the phone tab bar.
Footer and contextual policy links use `/en/help` and its actual section anchors.

The compact square panels cover dates and ranges, search, filters, Picks only,
probability ordering, navigation, match cards, analysis, sources, prediction
locks and settlement. Copy distinguishes device-local 24-hour event timestamps
from EAT reporting dates, live scores from settled predictions, and estimates
from guarantees. Topics use semantic headings and definition lists; panels grow
with text size and form two columns on desktop.

The former performance report UI, native report form, page adapter, methodology
rendering command and its isolated page fixture have been removed. There is no
Stats or measured-performance link in the app. The stored performance API,
service, cache, query rules and integration tests remain; see
[the API contract](performance-api.md). The canonical evidence-link contract is
covered by `tests/performance.test.mjs`.

Help metadata canonically names `/en/help`. Its inclusion in public discovery
still requires the existing verified release gate. The legacy redirect and new
metadata/sitemap behavior are covered by the navigation and SEO checks.


## Paid access (066)

Get access explains trial eligibility/start time, local SMS parsing/manual correction, payment screenshots, owner review, code-link Unlock, renewals and Facebook-to-Chrome recovery. Conditional wording works with paid mode off and on; the existing help grid/anchors are reused.
