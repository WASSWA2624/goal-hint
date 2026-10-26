# Baseline football evidence

`src/server/evidence/baseline-evidence.ts` applies the reproducible
`baseline-evidence-v1` safeguards to a candidate before the shared price selector.
These are provisional engineering safeguards, not calibrated probability
adjustments or accuracy claims. API-Football probabilities remain intact.

| Setting | Default and effect |
| --- | --- |
| History | Up to eight verified completed regulation matches per team in the preceding 120 days; at least three per team are required. |
| Event support | The existing settlement rules evaluate the candidate's exact regulation event, including the supported 2.5 goal line and BTTS. A 30-day exponential half-life weights each result; Beta(1,1) smoothing adds one success and one failure. Smoothed support below 0.40 excludes the candidate. This support rate is recorded separately from winning probability. |
| Recent form | An outright team-win candidate is excluded when that team's latest three verified matches contain no win and a negative aggregate goal balance. |
| Important scorer | At least 450 observed season minutes and three goals plus assists in the exact team/competition/season scope. A confirmed absence excludes backing that team's outright win, over 2.5 or BTTS yes unless a confirmed starter has at least the same observed contribution and the minimum minutes. This is a conservative evidence veto, not an invented injury-impact percentage. |
| Freshness | Player contributions: seven days; availability and lineups: 24 hours, also bounded by the evidence snapshot's source policy. Unknown reports remain unknown. |

History is keyed by provider fixture ID, deduplicated across team histories and
sources, and rejected when score or team-orientation observations conflict.
Canonical team identity determines goals for/against even when a team previously
played in the opposite venue role. For the candidate event, each team's results
are oriented into its role in the upcoming fixture. A genuine head-to-head match
preserves the two actual identities and appears once in combined event support.
Small H2H cohorts get no additional weight and cannot satisfy minimum samples.
Audit output retains the independent sample counts, venue splits, wins/draws/
losses, goals, match references, oldest/newest kickoff, source references, and H2H
count. Venue assignment does not establish pitch condition or home advantage.

Only confirmed, unconflicted facts from eligible original source observations are
used. Kickoff, original retrieval/update times, verification and the analysis
cutoff exclude later results and season totals. Form summaries are not counted
again alongside their underlying matches. Historical event rates are not the
app's prior prediction win rate.

`player-football.ts` joins stable provider player/team identities and the exact
competition/season, retaining original observation clocks. Season contribution
is explicitly labeled as season contribution; recent player form, defender
impact, squad continuity, opponent-strength adjustments and expected lineups have
no fabricated numerical model. Missing player reports do not disable an otherwise
sufficient history-backed baseline. A contradictory confirmed absence and
starting lineup records uncertainty rather than asserting an impact.

Live preparation uses the existing account/quota adapter before analysis is
captured, for both baseline-only and optional AI jobs. Two history imports remain
bounded. When the canonical account-supplied season coverage explicitly permits
them, at most four further single-attempt calls fetch fixture injuries, confirmed
lineups, and one page of player season statistics for each team. A partial player
page establishes data only for the named returned players, never full squad
coverage. An unknown dispatch stops subsequent optional player requests. Missing
coverage performs no player request. The preparation stage archives returned
sources for restart/replay; the later frozen plan retains those original sources
without renewing clocks or issuing replacement paid requests.

The existing [official API-Football documentation](https://www.api-football.com/documentation_v3)
defines stable player IDs and team/league/season aggregates, and distinguishes
`Missing Fixture` from `Questionable` injury reports. The existing `/players`
adapter accepts the documented optional team filter and validates it against
returned statistics. Runtime coverage still varies by account, competition,
season and fixture; synthetic tests do not establish live coverage. No provider
credentials, account upgrades or production configuration change is required by
these modules.
