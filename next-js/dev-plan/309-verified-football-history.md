# 309 — Verified football history

- Import provider-listed seasons, starting with the newest season. Use bounded batches and keep completed receipts and original fixture rows with the database so interrupted work can resume. Seed original rows from the saved November snapshot without calling the provider. Reuse the archived league catalog and collapse multiple entries for the same league and year into one fixture selector.
- Prioritize leagues with upcoming fixtures within each season. Include active competitions labeled for a future tournament year when their fixtures are already scheduled. Check forecast readiness separately from overall archive size. A league needs enough recent verified matches and both teams need enough recent evidence to fit the local model.
- Retain completed matches with verified regulation scores and their actual observation times. Preserve existing identities, prediction cycles and locked forecasts. Keep old matches outside the live correction window.
- Check the provider and local database counts after each batch. Record unavailable or incomplete coverage separately from completed imports. An archived request and an available field are separate observations.
- Resume the fixture, match-detail, and reference phases under the same owned database lock. Retry transient storage and shared quota pauses without replaying completed selectors. Preserve exact raw fixture pages with disputed scores and report their unresolved normalization separately. An oversized season can resume in rounds. A complete round plan alone leaves season-wide coverage unresolved.
- Prepare the verified archive for a later production restore. Check production schema, compatibility and authorized data scope as part of that rollout.
- After the archive is populated, compare history windows on time-ordered replays and an independent recent test set. Measure probability accuracy, calibration and forecast coverage by market and competition.
- Follow up on forecast publication failures, incremental fixture discovery, market expansion, and the Ultra plan comparison using the verified archive and measured live freshness.

## Provider coverage

| API data | Collection and reuse |
| --- | --- |
| Countries, time zones, league seasons, coverage, and fixture rounds | Archive the three global dictionaries and the league coverage catalog. Save round dates for observed league seasons and reuse pages from oversized fixture imports. Calculate head-to-head from stored fixtures and check parity with the provider on a sample. |
| Fixtures, scores, referee, venue at kickoff, events, lineups, and team and player match statistics | Use one fixture list per league and season. Retain original rows for the full response, including non-final statuses. Add details for up to 20 fixture IDs per call. Keep section availability and original retrieval time. Individual endpoint gaps and halftime statistics from 2024 onward require additional collection. |
| Teams, venues, standings, season team statistics, and injuries | Reuse one team list, standings response, and injury response per covered league season. Reuse venue details by venue ID. Archive season statistics and team-season membership for observed teams and date-label the observations. |
| Player and coach records | Resume paginated player statistics by league and season. Archive coach careers and date-label current squads by team. Reuse team and player IDs for transfers. Player profiles, team histories, leaderboards, trophies, and sidelined records require additional collection. |
| Provider forecasts, pre-match odds, in-play odds, mappings, bookmakers, and market dictionaries | Store catalog labels once and track changes. Collect available forecasts and odds prospectively under their approved use and freshness policies. API-Football documents a seven-day pre-match odds window and no historical in-play odds feed. |

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
