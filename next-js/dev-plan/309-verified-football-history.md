# 309 — Verified football history

- Import provider-listed seasons, starting with the newest season. Use bounded batches and keep completed receipts and original fixture rows with the database so interrupted work can resume. Seed original rows from the saved November snapshot without calling the provider. Reuse the archived league catalog and collapse multiple entries for the same league and year into one fixture selector.
- Prioritize leagues with upcoming fixtures within each season. Include active competitions labeled for a future tournament year when their fixtures are already scheduled. Check forecast readiness separately from overall archive size. A league needs enough recent verified matches and both teams need enough recent evidence to fit the local model.
- Retain completed matches with verified regulation scores and their actual observation times. Preserve existing identities, prediction cycles and locked forecasts. Keep old matches outside the live correction window.
- Check the provider and local database counts after each batch. Record unavailable or incomplete coverage separately from completed imports. An archived request and an available field are separate observations.
- Prepare the verified archive for a later production restore. Check production schema, compatibility and authorized data scope as part of that rollout.
- After the archive is populated, compare history windows on time-ordered replays and an independent recent test set. Measure probability accuracy, calibration and forecast coverage by market and competition.
- Follow up on forecast publication failures, incremental fixture discovery, market expansion, and the Ultra plan comparison using the verified archive and measured live freshness.

## Provider coverage

| API data | Collection and reuse |
| --- | --- |
| Countries, time zones, league seasons, coverage, and fixture rounds | Fetch shared dictionaries and season coverage once. Keep provider-specific round dates when available. Calculate head-to-head from stored fixtures and check parity with the provider on a sample. |
| Fixtures, scores, referee, venue at kickoff, events, lineups, and team and player match statistics | Use one fixture list per league and season. Retain original rows for the full response, including non-final statuses. Add details for up to 20 fixture IDs per call. Use individual detail endpoints for genuine gaps and additional fields such as half-by-half statistics. Keep section availability and original retrieval time. |
| Teams, venues, standings, season team statistics, and injuries | Reuse one team list, standings response, and injury response per covered league season. Reuse venue details by venue ID. Retain team season and country indexes, team statistics, and corrections where available. |
| Player and coach records | Track player profiles, seasons, team histories, paginated season statistics, current squads, scorers, assists, yellow and red cards, and coach careers. Reuse team and player IDs for transfers. Deduplicate and use documented batches for trophies and sidelined records. Date-label snapshots of current squads. |
| Provider forecasts, pre-match odds, in-play odds, mappings, bookmakers, and market dictionaries | Store catalog labels once and track changes. Collect available forecasts and odds prospectively under their approved use and freshness policies. API-Football documents a seven-day pre-match odds window and no historical in-play odds feed. |

Use the [provider's endpoint documentation](https://www.api-football.com/documentation-v3) to track coverage by competition, season, and fixture. Fixtures can have gaps even when a league reports coverage. Keep unavailable fields, unexpected empty responses, transport failures, and locally verified data distinct. Schedule incremental captures for changing data after the historical backfill. Verify all archive layers and their database restore before any hosted rollout.

## Local verification

The owned snapshot saved 295 previously downloaded fixture pages without provider requests. Counted trials saved the Premier League seasons starting in 2020 through 2025, wrote new details for 63 fixtures from four batched requests, and archived team, venue, standings, injury, and transfer pages. The saved catalog contained 1,251 competitions and 8,773 league-season selectors through 2026. The latest checked checkpoint contains 56,581 unique provider fixture IDs and 28,352 verified results, with fixture source pages for 181 league-season selectors. The source archive and verified results are still being populated.

A counted seven-day fixture-range request across leagues returned no usable body. The league-season requests returned verifiable fixtures and are the current archive partition.

The read-only local-engine check covered 97 upcoming fixtures in 37 competitions. The engine produced zero candidates before the prioritized imports and 28 at the latest check. The check measures forecast readiness.

The retrospective Premier League replay held out all 380 verified 2025–26 results and kept the current 180-day half-life. Forecasts were made 24 hours before kickoff and earlier results were assumed available 48 hours after their own kickoff. The archive preserves actual retrieval times separately. The one-, two-, and five-year windows produced 360, 364, and 366 forecasts respectively. The same 360 fixtures were used for each comparison.

| History | Match result Brier | Over/under 2.5 Brier | Both teams to score Brier | Double chance Brier |
| --- | ---: | ---: | ---: | ---: |
| One year | 0.62123 | 0.26058 | 0.24951 | 0.20708 |
| Two years | 0.62031 | 0.25722 | 0.24769 | 0.20677 |
| Five years | 0.61966 | 0.25647 | 0.24723 | 0.20655 |

Lower Brier scores indicate better probability estimates in this comparison. Five years also slightly improved log loss, while calibration improved for goals and both teams to score and worsened for match result and double chance. The live engine retains two years while the broader evaluation continues. The five-year pilot exceeded the live query's 1,500-result limit. Actual observation timestamps came after the holdout, so the replay tests retrospective accuracy under the stated availability assumption.
