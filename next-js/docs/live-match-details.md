# Stored match statistics and events

The match detail page reads centrally collected match observations. A visitor
request never calls API-Football. The existing visibility-aware detail refresh
updates the statistics and event timeline without changing the original
pre-match forecast, its probabilities or its publication clock.

The new panel separates current/final match data from the existing Team
Comparison section, which continues to describe pre-match evidence and previous
results. Match data follows the match detail's completion and entitlement
boundaries: completed fixtures are public; unfinished observations require paid
or earned access. Existing verified football public-display rights still apply.
The provider-spending switch is
independent: collection is enabled only by the private runner configuration.
`allowLiveMatch: false` disables stored reads in an isolated service or emergency
binding. `publicPolicy.features.liveMatchDetails` is the source-owned display
switch.

Applicable future/scheduled matches do not query optional match observations or
show a collection-unavailable panel. Current live, played-final and abandoned
matches can read them; a deliberate revision/cycle history selection can inspect
its retained occurrence independently of the current fixture's status.

## Source clocks and missingness

Each statistics/events source retains its own retrieval time and the provider's
update time, when supplied. A collection attempt does not manufacture a provider
update timestamp. Failed refreshes may retain the last available values with
their original source clock and a partial/delayed explanation. Active data is
marked delayed when its source retrieval clock exceeds the configured freshness
window. Final or deliberately inspected historical observations are labelled
recorded/final rather than permanently marked as delayed live data.
If the fixture ends before the collector replaces its last in-play snapshot, that
snapshot is labelled Recorded match data rather than claiming full-time statistics.

Numeric zero is displayed as zero. A missing team statistic is a dash and a
partial-coverage state. Unavailable/unknown coverage does not become an empty
event timeline. “No match events have been reported” appears only for a complete,
confirmed event response containing no events. Data is bounded to 16 recognized
statistics and 500 normalized events; no raw response, private receipt or
forecast provenance is added to this public envelope.

## Visual event timeline

The Events tab uses one shared two-sided timeline: home incidents left, away
incidents right, minutes on the centre line. Team names and available crests
identify each side. The latest recorded event appears first. The provider's
chronological sequence is reversed, rather than adding stoppage minutes to the
base minute; this preserves period boundaries and distinct same-minute incidents.
See the provider's [event endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

Football symbols distinguish normal goals, own goals, scored/missed penalties,
yellow/red cards, second-yellow dismissals, substitutions and VAR reviews.
Readable labels accompany symbols. Substitutions show the replacement as On
and the departing player as Off. VAR decisions, assists and supplied comments
remain visible. Unknown card details use a neutral card symbol; unknown minutes
remain a dash with a time-unavailable label. No running score, half-time marker
or added-time announcement is inferred from an incomplete event stream.

The desktop tab has one heading and an expanded timeline. Source timestamps and
attribution are in Event data & source; partial/delayed notices remain visible.
Phones reuse the same timeline inside the existing match-events disclosure.
Both modes distinguish a confirmed empty response from unavailable coverage.

## Occurrence and storage safety

Reads validate the MySQL JSON integrity seal, snapshot schema, body/row collection
clock, fixture, cycle and kickoff. The participant identity markers must still
match the canonical fixture. Current reads also require the canonical current
cycle and kickoff, so a cached pre-reschedule scope cannot show old events as
the replacement match. An explicit revision/cycle history selection can read the
matching retained occurrence only after validating its prediction-cycle fixture
and kickoff. Missing or corrupt observations produce an unavailable live panel
while the score and original forecast remain readable.

The live envelope bypasses the immutable forecast and detail caches. The wire
response retains its existing size bound; optional enrichment is withheld if it
would exceed that bound. Browser reconciliation accepts newer match observations
independently from the forecast's data version, rejects older same-occurrence
observations, and respects display withdrawal.

## Central collection and request budget

`npm run live` owns a second fenced poller for match details. It reads covered
stored fixtures in the configured competitions, including fixtures that received
no prediction. Scores/results and detail collection share that competition scope.
No page, HTTP endpoint or browser can enqueue a provider request.

Collection defaults off. After applying the reviewed additive migrations
`20261025170000_live_match_details` and
`20261025171000_provider_workload_budget`, set
`GOAL_HINT_LIVE_DETAILS_ENABLED=true` in the private runner configuration and
restart the quota-sharing processes together. Existing football private-use,
public-display and freshness authorities are rechecked at collection boundaries.
This implementation has not applied either migration or enabled a live runner.

The collector uses `/fixtures/statistics?fixture=<id>` and
`/fixtures/events?fixture=<id>` independently. Each endpoint gets one dispatch,
one page and explicit time/row/byte bounds. Pacing retries may wait for a limiter
slot, but cannot launch a second provider request. The official
[endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
documents per-minute statistics and 15-second event updates; these frequencies
are indicative, and the [v3 coverage contract](https://www.api-football.com/documentation_v3)
does not guarantee every fixture's coverage. This collector polls no faster than
once a minute and assumes no batching for either endpoint.

Eligible paid plans reserve up to 20% of the verified usable UTC provider day for
details, before optional odds and team codes. Free plans, plans below 7,500 daily
requests and slow plans stay ineligible. Enabling this allocation reduces forecast
refresh capacity where necessary while preserving the score/result, selection and
essential reserves. `npm run live:status` and the runner's ready log show the
configured switch, eligibility and allowance. This command also reads the
provider's free account-status endpoint; it is not a local-only health check.

Admission runs inside the same durable quota-account transaction as each
dispatch. Priority counters count uncertain attempts, and only attributable
ordinary dispatches count against the planned ordinary allocation. Unattributed provider usage is
never credited as completed selection/refresh work. A separate hashed
account/day budget row preserves the detail cap across restarts and plan changes.
That row contains a counter and period end, not a provider payload or raw account
identity. The quota role needs SELECT/INSERT/UPDATE on `ApiQuotaBudget`; no DELETE
grant is needed. Restarting all quota-sharing processes preserves the new durable
priority counters consistently.

The private collector role needs SELECT/INSERT/UPDATE on `LiveMatchPollerLease`
and `LiveMatchSnapshot`, plus SELECT on canonical fixture/team/season/cycle/result
state tables. Snapshot writes recheck occurrence and participant identity under
shared locks. Trigger-driven fixture cache generations need the migration's
normal trigger-definer privileges; no per-minute invalidation journal is added.
Web roles need only SELECT on the new snapshot table and canonical identities.

Active observations are due every minute; recent final/abandoned observations are
rechecked every 15 minutes for up to three days after their first final timestamp.
Failures back off, and oldest attempted fixtures are served first. A final
correction replaces the same occurrence's bounded body. Rescheduling creates a
new occurrence and retains the old one. Existing result, lifecycle, forecast and
settlement audit chains are not deleted or compacted.

## Verification

`tests/live-match-read.test.mjs` covers exact occurrence/source clocks, zero versus
missing, malformed/corrupt/future/foreign data, safe storage failure, public access
without premium-pick disclosure, and independent nonregressing browser updates.
The focused reader, live-client, detail-page and paywall run passed all 40 tests
on 25 October 2026 after the final occurrence hardening. Targeted ESLint also
passed. Production rendering results are recorded in the implementation report.

`python scripts/verify-live-match-rendering.py` builds an isolated production
fixture with live, partial, delayed, confirmed-empty, unsupported, retained-final
and missing-snapshot states. A null snapshot denotes unavailable enrichment; it
does not prove that collection has never happened. `--fixture <directory>` reuses a built fixture and
`--serve` retains it for browser inspection. All inputs are synthetic and establish
no live provider coverage. Database acceptance belongs to the collector/store
tests and must be recorded separately from rendered UI acceptance.
