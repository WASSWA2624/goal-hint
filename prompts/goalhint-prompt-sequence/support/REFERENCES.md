# Source references and their scope

These are the reference notes supplied in the original prompt. They were preserved, not independently researched or refreshed, during this split.

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`
- **R2 — API-Football, “How to Optimize API-Sports Calls and Quota Usage” (2026):** coverage-aware requests, shared fetching, caching and quota control. `https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage`
- **R3 — API-Football, “How to Get All Data from a League with API-Football” (2026):** league-season scope, coverage, team statistics, standings and complete response validation. `https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football`
- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`
- **R5 — API-Football, “How to Get All Fixtures Data from One League” (2024):** enriched fixture requests and the 20-ID limit. `https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league`
- **R6 — API-Football, “FIFA World Cup 2026: Group Stage Recap and Complete Match Reports”:** enriched fixture/statistical response structure; this prompt does not rely on the article's tournament-result narrative. `https://www.api-football.com/news/post/fifa-world-cup-2026-group-stage-recap-and-complete-match-reports-with-api-football`
- **R7 — API-Football, “How to Get All Teams and Players from a League ID”:** team/player traversal and complete player pagination. `https://www.api-football.com/news/post/how-to-get-all-teams-and-players-from-a-league-id`
- **R8 — API-Football terms, subscription-specific quota-reset sections:** verify the actual subscription channel. `https://www.api-football.com/terms`
- **R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”:** a baseline modeling reference, not evidence of GoalHint's performance. `https://academic.oup.com/jrsssc/article-abstract/46/2/265/6990546`
- **R10 — scikit-learn, probability calibration documentation:** reliability and probability evaluation. `https://scikit-learn.org/stable/modules/calibration.html`
- **R11 — scikit-learn, TimeSeriesSplit documentation:** avoiding future-to-past validation leakage; implement chronological football-data splits appropriate to the dataset rather than assuming equally spaced fixtures. `https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit`
- **User-supplied product reference:** GoalHint screenshots of `/en/matches`, desktop/mobile filters, and `/admin`, dated 14 November 2026. Live source code was not inspected during prompt preparation.
- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
