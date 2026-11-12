# 309 — Verified football history

- Import provider-listed seasons, starting with the newest season. Use bounded batches and keep completed receipts and original fixture rows with the database so interrupted work can resume. Seed original rows from the saved November snapshot without calling the provider. Reuse the archived league catalog and collapse multiple entries for the same league and year into one fixture selector.
- Prioritize leagues with upcoming fixtures within each season. Include active competitions labeled for a future tournament year when their fixtures are already scheduled. Check forecast readiness separately from overall archive size. A league needs enough recent verified matches and both teams need enough recent evidence to fit the local model.
- Retain completed matches with verified regulation scores and their actual observation times. Preserve existing identities, prediction cycles and locked forecasts. Keep old matches outside the live correction window.
- Use the local coverage audit to match whole-season receipts to checksummed source pages with the same selector, row count, and observation time. Report verified empty scopes, pending attempts, raw-only observations, and unresolved partitions separately. Treat the saved league catalog as a dated observation and keep reference observation counts distinct from a completeness claim.
- Verify a settled continuous pass against the current saved catalog and discovered archive targets before posting the optional Windows completion message. Require resolved match details, completed replay, and the verified odds mapping for that provider day. Persist pending delivery and continue importing newer data after the message.
- Resume the fixture, match-detail, reference, and local replay phases under the same owned database lock. Retry transient failures and quota pauses from saved checkpoints. Recheck seasons that hit the old local row limit under the current bounds. Process large verified pages in bounded transactions without provider requests. Round imports remain available when a whole-season response still exceeds the limit.
- Reconcile the reviewed 2025 Club Friendlies score against both club records. The saved provider response for fixture 1377649 repeats the 3–0 halftime score as full time. The reviewed replay uses the verified 7–0 result and binds the correction to the original season page. [Regensburg match report](https://www.ssv-jahn.de/aktuelles/detail/weiterer-torreicher-testspielsieg) · [Bayreuth season archive](https://www.spvgg-bayreuth.de/1-mannschaft/spielplan-2025-26-archiv/)
- Prepare the verified archive for a later production restore. Check production schema, compatibility and authorized data scope as part of that rollout.
- After the archive is populated, compare history windows on time-ordered replays and an independent recent test set. Measure probability accuracy, calibration and forecast coverage by market and competition.
- Follow up on forecast publication failures, incremental fixture discovery, market expansion, and the Ultra plan comparison using the verified archive and measured live freshness.

## Provider coverage

| API data | Collection and reuse |
| --- | --- |
| Countries, time zones, seasons, coverage, and fixture rounds | Archive the global country, team-country, time-zone, league-season, and player-season dictionaries and the league coverage catalog. Reuse saved round dates. Calculate head-to-head from stored fixtures and check parity with the provider on a sample. |
| Fixtures, scores, referee, venue at kickoff, events, lineups, and team and player match statistics | Use one fixture list per league and season. Retain original rows for the full response, including non-final statuses. Add details for up to 20 fixture IDs per call. Collect half-by-half statistics for eligible fixtures from the 2024 season. Keep section availability and original retrieval time. Remaining detail gaps require targeted collection. |
| Teams, venues, standings, season team statistics, and injuries | Reuse one team list, standings response, and injury response per covered league season. Archive country team and venue profiles from provider country lists. Reuse team identities for season membership, squad, coach, and transfer collection. |
| Player and coach records | Resume paginated player statistics and profiles. Start a separate scan after repeated verified pagination drift and retain the earlier observations. Index identities for direct career teams, seasons, transfers, and batched trophies and sidelined records. Use verified lineup coach IDs for career gaps and reuse archived full careers. Archive leaderboards and date-label current squads. |
| Provider forecasts, pre-match odds, in-play odds, mappings, bookmakers, and market dictionaries | Archive normalized daily odds mappings under the existing odds budget and verify each page cohort. Collect forecasts and quotes prospectively under their approved use and freshness policies. API-Football documents a seven-day pre-match odds window and no historical in-play odds feed. |

Use the [provider's endpoint documentation](https://www.api-football.com/documentation-v3) to track coverage by competition, season, and fixture. Fixtures can have gaps even when a league reports coverage. Keep unavailable fields, unexpected empty responses, transport failures, and locally verified data distinct. Schedule incremental captures for changing data after the historical backfill. Verify all archive layers and their database restore before any hosted rollout.

## Local verification

The owned snapshot saved 295 previously downloaded fixture pages without provider requests. Counted trials saved the Premier League seasons starting in 2020 through 2025, wrote new details for 63 fixtures from four batched requests, and archived team, venue, standings, injury, and transfer pages. November 12 checkpoints verified 220,551 distinct fixture IDs in the saved provider pages, 169,017 canonical API-Football fixtures, and 160,829 verified results. Fixture receipts marked 1,219 of 8,784 whole league-season selectors complete. Two oversized Club Friendlies rounds are saved as provider pages and await canonical processing.

A counted seven-day fixture-range request across leagues returned no usable body. The league-season requests returned verifiable fixtures and are the current archive partition.

The read-only local-engine check covered 97 upcoming fixtures in 37 competitions. The engine produced zero candidates before the prioritized imports and 28 at the latest check. The check measures forecast readiness.

The retrospective Premier League replay held out all 380 verified 2025–26 results and kept the current 180-day half-life. Forecasts were made 24 hours before kickoff and earlier results were assumed available 48 hours after their own kickoff. The archive preserves actual retrieval times separately. The one-, two-, and five-year windows produced 360, 364, and 366 forecasts respectively. The same 360 fixtures were used for each comparison.

| History | Match result Brier | Over/under 2.5 Brier | Both teams to score Brier | Double chance Brier |
| --- | ---: | ---: | ---: | ---: |
| One year | 0.62123 | 0.26058 | 0.24951 | 0.20708 |
| Two years | 0.62031 | 0.25722 | 0.24769 | 0.20677 |
| Five years | 0.61966 | 0.25647 | 0.24723 | 0.20655 |

Lower Brier scores indicate better probability estimates in this comparison. Five years also slightly improved log loss, while calibration improved for goals and both teams to score and worsened for match result and double chance. The live engine retains two years while the broader evaluation continues. The five-year pilot exceeded the live query's 1,500-result limit. Actual observation timestamps came after the holdout, so the replay tests retrospective accuracy under the stated availability assumption.
