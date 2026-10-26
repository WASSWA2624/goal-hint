# Probability-qualified prediction engine

New live refresh intents freeze `probability-qualified-odds-v1` from
`src/domain/recommendation.ts`. The inclusive minimum winning probability is
**0.65**, a provisional engineering default, not a calibrated success rate.
Forecasts remain separate from bookmaker-implied probabilities.

Every supported selection in a validated distribution is considered. Match result
and derived double chance use the same original probability group. Existing
family predictions retain their argmax selections and settlement history. The
recommendation is a separate decision and can select another double-chance event.
Provider text advice and score strings supply no totals or BTTS probabilities.
Unsupported families remain unavailable; no new statistical goal model is claimed.

An eligible candidate must pass identity, regulation-period/exact-line, source
freshness, football evidence and the probability threshold, and have a fresh
permitted quote for exactly that event. Rank eligible candidates by full stored
decimal odds, then higher unrounded probability, then configured family/selection
order. There is no extra edge or expected-value ranking. Odds never enter the AI
probability prompt or alter a provider probability.

Forecast retrieval age is bounded by 24 hours and quote age by three hours,
also subject to stricter source policies. Quotes observed after the analysis
cutoff are excluded. Unavailable, suspended, malformed, mismatched or unpermitted
quotes cannot produce a priced recommendation. No qualifying candidate yields an
explicit `no-qualified-recommendation`, without silently lowering the threshold.
Valid probability-only family forecasts remain available through explicit family
requests. No-price legacy revisions keep their original readable contracts.

## Football evidence

The [baseline evidence contract](baseline-evidence.md) documents the exact
cohorts, player joins and source-specific limitations.

`baseline-evidence-v1` uses verified completed regulation scores from the preceding
120 days, at most eight recent matches per team and at least three per team.
Canonical team identities establish orientation. The existing settlement rules
evaluate candidate events, including exact 2.5 totals and BTTS. Each historical
match counts once across both histories; small H2H samples add no duplicate votes.
The cohort records samples, venue splits, goals, outcomes, dates and references.

Event support uses a 30-day recency half-life and Beta(1,1) smoothing. Support below
0.40 vetoes eligibility; it does not replace the forecast probability. A team
win is also vetoed when its last three matches contain no wins and a negative
aggregate goal balance. These safeguards are explicit provisional policy, without
an estimated performance improvement.

Confirmed absence is joined to player/team/competition/season contribution
observed before cutoff. At least 450 season minutes and three goal/assist
contributions identify an important attacker. Relevant attacking selections are
vetoed unless reliable replacement evidence satisfies the rule. Season aggregates
do not claim recent form. Missing injuries, lineups, contributions or replacement
reports remain unknown and do not by themselves disable the baseline. Doubtful
players and expected lineups are not confirmed absences or participation.

## Sources and fallback

The live policy is `optional-ai-primary`. Provider distributions and both source
receipts are retained independently, even when AI supplies complete families.
Use the common selector on AI forecasts first; a usable AI recommendation wins
even if the baseline chose a different market or price. If AI has no qualified
priced recommendation, publish the independently resolved baseline candidate.
Missing keys, disabled capability, exhausted allocation, transport/schema/evidence
failure and timeout remain explicit fallback reasons. A parsed response alone is
insufficient. Missing optional news does not automatically reject sufficient
structured evidence. Complete-family and cross-market validation still apply.

This owner-approved precedence supersedes the previous shadow-only product guard.
Model identity, source transmission/reuse rights, exact evidence ownership,
accounting limits, canonical fixture/version, strict cutoff and atomic publication
checks still apply. No evaluation or accuracy promotion evidence is fabricated.

## Persistence, permissions and rollback

The existing sealed fallback stage stores the exact recommendation, source
decision, eligibility audit and quote snapshot before publication. The immutable
revision stores it at `candidate.audit.recommendation`; no new table or historical
rewrite is required. Replay uses the original intent/stages and clocks, without
new paid calls. New observations can influence only a new eligible revision.

Internal quote loading verifies acquisition and structured-retention permission
and reads sealed bookmaker snapshots and their current observation manifest.
It is independent of `publicPolicy.features.providerOdds`, which stays false.
Historical receipts without a quote manifest conservatively cannot establish a
priced recommendation. Public forecasts expose only the recommendation selection
and source; private quote provenance is not a public-display grant.

To roll back selection, remove the new policy from future configured plans and
restore the desired reviewed source policy in the binding. Existing frozen jobs
and revisions retain their contracts; do not mutate stages or historical rows.
Disabling AI or optional research preserves structured baseline collection.

Shared preparation budgets two history and up to four coverage-gated player calls,
plus one prediction request and one final fixture observation (eight total).
Capacity is reduced accordingly within the existing daily ceiling. Eligible
standard paid plans reserve 10% for enrichment before assigning refresh capacity;
enrichment still cannot consume the result/ordinary reserve. Baseline jobs now
use the same bounded preparation envelope as AI jobs (five minutes standard,
eight minutes slow), preserving the fallback/status/publication reserve.

No counted live calls, actual-account market coverage, chronological held-out
evaluation or profitability claim follows from deterministic tests. Actual
coverage remains competition-, season-, fixture- and subscription-specific.
Absent production credentials/permissions or stored odds can cause abstention.
