# Desktop slip match updates

Best slips and the builder wrap their slip lists in one
`SlipMatchRefreshProvider`. Desktop rows read refreshed observations from that
provider; the existing phone renderer does not consume them. Each list sends one
deduplicated batch immediately and then every 20 seconds while available.

The immutable slip and native disclosure remain mounted. A builder update does
not regenerate selections, submit the criteria, modify drafts, replace original
names/picks/prices/probabilities, or change the generation timestamp. Provider
minutes and phase labels are displayed as supplied; elapsed time is not guessed
from the visitor's clock.

Visibility, online/offline, restored pages and pending-navigation changes control
the loop. Pausing, changing cohorts or unmounting aborts obsolete requests.
Resuming a visible online page refreshes immediately. One active request owns its
deadline and next timer; late or older responses cannot replace newer data.
Transient errors retain coherent observations and use bounded retry delays,
honoring Retry-After. Known access expiry withdraws private slip content at once
and asks the page to recheck entitlement.

`POST /api/slips/match-states` accepts at most 800 compact original-selection
identities in a bounded same-origin JSON body. It checks full access before
storage reads and again before returning data. Responses are private/no-store.
The session-HMAC budget allows 12 refresh requests per minute, including stable
credentials when an invalid secondary cookie rotates.

The endpoint uses one bounded database transaction and the existing batched
sealed-result reader. It does not call football providers or run the slip
builder. Every observation must match the original fixture, market, selection
and forecast cycle/revision. Missing evidence and unbound legacy claims return
explicit Unknown/Pending observations, clearing stale progress rather than
borrowing a replacement cycle. Final outcomes use verified regulation evidence.

Best slips retain a 60-second desktop cohort/statistics refresh so daily
publication changes and aggregate counts still arrive. Existing mobile and
aggregate-only page refresh behavior remains at 20 seconds. Actual update
freshness depends on the latest evidence already stored by the application.
