# Goal Hint — App Specification

**Product requirements and technical design**

Prepared for Wasswa Wilson • 7 October 2026 • Version 1.7

| Product setting | Decision |
| --- | --- |
| App name | Goal Hint |
| Selected domain and production origin | https://goalhint.com |
| Football data and fallback provider | API-Football by API-Sports |
| Selected subscription | Direct Mega |
| API-Football spending ceiling | US$45/month, including taxes and payment charges |

Use “Goal Hint” consistently in the interface, metadata and public copy. Domain registration and DNS configuration are prelaunch tasks.

## Contents

1. [Product purpose](#1-product-purpose)
2. [Navigation and everyday use](#2-navigation-and-everyday-use)
3. [Mobile interface and styled components](#3-mobile-interface-and-styled-components)
4. [Prediction markets and result rules](#4-prediction-markets-and-result-rules)
5. [The daily schedule in East Africa](#5-the-daily-schedule-in-east-africa)
6. [Football data and research sources](#6-football-data-and-research-sources)
7. [How AI produces a prediction](#7-how-ai-produces-a-prediction)
8. [Accuracy and honest probability scores](#8-accuracy-and-honest-probability-scores)
9. [Technical architecture and state](#9-technical-architecture-and-state)
10. [Database and audit records](#10-database-and-audit-records)
11. [Endpoints and background operations](#11-endpoints-and-background-operations)
12. [SEO and language infrastructure](#12-seo-and-language-infrastructure)
13. [Performance accessibility and security](#13-performance-accessibility-and-security)
14. [Operating costs and delivery phases](#14-operating-costs-and-delivery-phases)
15. [Acceptance criteria and launch decisions](#15-acceptance-criteria-and-launch-decisions)
16. [Sources and implementation references](#16-sources-and-implementation-references)

## 1 Product purpose

Goal Hint is a free, mobile-first football prediction website. Visitors find fixtures for today and the next six days, read estimated probabilities and supporting analysis, and later verify prediction outcomes. Launch with one match feed, reusable match detail pages and a methodology page.

AI is the primary predictor; validated API-Football predictions provide fallback for supported markets. A daily midnight East Africa run refreshes eligible fixtures in the seven-day window. New valid revisions replace displayed predictions until the publication cutoff; immutable history supports settlement and performance reporting.

### Scope and technology

| At launch | Prepared for later | Outside scope |
| --- | --- | --- |
| Seven-day fixtures and daily predictions<br>Search and filters<br>Four market families with probabilities and explanations<br>Revision history, results and performance<br>English and a light theme | Additional languages<br>Dark theme<br>Advertising | Betting and payments<br>Visitor accounts or subscriptions<br>Social feeds and comments<br>AI chat, native apps or an admin dashboard |

Use stable Next.js with the App Router and TypeScript, Prisma, PostgreSQL, Redux Toolkit and styled-components. Server code and durable workers own business logic.

Every public feature and read endpoint works without registration, sign-in, visitor tokens or authentication cookies. Do not add account screens, an auth SDK or user/session tables. Store anonymous preferences in the URL or browser storage. Private jobs use service credentials or hosting controls.

Cover enabled competitions available through the selected plan, expanding only as data quality and operating budgets allow. Do not promise worldwide coverage, guaranteed wins or search rankings. Keep one canonical record per team. Third-party images load from remote URLs; original Goal Hint branding may be bundled locally as described in section 6.

## 2 Navigation and everyday use

The homepage opens directly to today’s matches in `Africa/Kampala` time, with the date and search visible above the cards.

| Surface | Purpose |
| --- | --- |
| Today and Results | Two navigation choices using the same feed and cards. Provide Today, Tomorrow, Next 7 days and historical date controls. |
| Match detail | Teams, kickoff, markets, analysis, sources, revisions and final outcomes; one tap from a card. |
| How it works | Probability explanations, sources, timing, settlement and measured performance; linked from the footer and probability help. |
| Utility pages | Privacy, terms and contact information in the footer. |

### Search and filters

Search team, league and country names, including aliases and case-insensitive matches, across the entire selected date/range, including unloaded cards. Use compact league, status and market filters with clear active states and Reset.

Default to kickoff order with fixture ID as a stable tie-breaker. Offer probability sorting only for the selected market; missing probabilities sort last. Never compare unrelated market probabilities in one ranking.

Show available forecasts throughout today plus six days. Beyond that window, display “Predictions become available within seven days of the match.” Preserve applied filters in URLs and restore loaded position and scroll on Back. Use Load more with ordinary pagination links for accessibility and discovery.

### Detail and feedback

Put teams, kickoff, prediction and estimated probability first. Show each market’s source, last publication time and refresh status. Other markets follow, then two to four reasons, one uncertainty, source links and the result. Sources and earlier revisions may expand in place; core predictions remain visible.

During a run, show “Updating predictions for the next 7 days” with completed/total jobs while retaining existing forecasts and publishing finished jobs progressively. Distinguish no fixtures, no filter matches, insufficient data and temporary data failure. Label degraded imports as partial coverage; missing data cannot establish “No fixtures”. Keep loaded cards on refresh failure, use compact placeholders for initial loading and display actual update times.

## 3 Mobile interface and styled components

### Reusable match cards

Use an article with this reading order: competition and kickoff, home team, away team, selected prediction, probability, outcome and “View analysis”. On phones, show separate Home and Away rows with logos beside names and aligned scores.

For example: “Home win · 54% estimated probability”, followed by “AI prediction · Updated 00:18 EAT”. A final score and the prediction outcome are separate labels. Any illustrative probabilities must be identified as examples.

- Use one column on phones and at most two on larger screens; start with 16 px body text, 28–32 px logos and roughly 44 px touch targets.
- Allow long names to wrap without overflow. Team names provide identity; broken logos fall back to styled initials.
- Use the Goal Hint brand assets and shared color tokens, strong contrast and restrained accents. Pair outcome colors with text and icons.
- Prefer square corners across cards, buttons, inputs and badges. Avoid carousels, large decorative heroes and controls that cover content.

### Styling and rendering

Define shared tokens for spacing, typography, breakpoints, borders, surfaces and status colors. Build reusable `MatchCard`, `TeamRow`, `ProbabilityLabel`, `OutcomeBadge`, `SearchInput`, `FilterControl` and `EmptyState` components with `ThemeProvider` and `createGlobalStyle`. Declare styled components outside render functions and use transient props such as `$status`. [5]

Enable `compiler.styledComponents` and use the documented App Router registry with `ServerStyleSheet`, `StyleSheetManager` and `useServerInsertedHTML`. Keep styled definitions and the theme provider in Client Component modules; server pages still fetch data, manage metadata and deliver readable HTML on the initial request. [4]

Verify the exact Next.js, React and styled-components combination in a production build: no missing initial styles, style duplication, flashes or hydration warnings during initial load and streamed navigation.

## 4 Prediction markets and result rules

All four launch families use regulation time, including stoppage time and excluding extra time and penalties.

| Family | Selections in deterministic tie order | Correct when |
| --- | --- | --- |
| Match result | Home win, Draw, Away win | Selection matches the regulation result. |
| Double chance | Home or draw, Away or draw, Home or away | Either stated result occurs. |
| Total goals | Over 2.5, Under 2.5 | Over: at least 3 goals. Under: at most 2. |
| Both teams to score | Yes, No | Yes: both score. No: at least one scores zero. |

Select the highest unrounded probability per available family, breaking exact ties in the table’s order. Cards default to match result; the market filter changes the displayed family. Show alternatives on the detail page. Match-result probabilities sum to one, as does each binary pair. Derive double chance from the same match-result distribution; its overlapping selections do not sum to one.

Each publication is a complete revision. At cutoff, lock one eligible revision for all settlement. Headline hit rates count only its selected pick once per family per played fixture. Evaluate full probability distributions separately; neither alternative selections nor superseded revisions add headline predictions.

Exact score is optional secondary information, requiring a validated score distribution and its own probability. Report exact-score performance separately.

### Outcome labels

| Color and label | Meaning |
| --- | --- |
| Green · Correct | The locked selection occurred. |
| Red · Incorrect | A verified eligible final result contradicts the locked selection. |
| Gray · Pending | A valid selection is awaiting settlement. |
| Gray · Void | Its cycle/result is ineligible; retain the reason. |
| Gray · Unavailable | The current or locked snapshot has no valid selection for that family. |

Only Correct and Incorrect enter the hit-rate denominator. A live score never settles a market, and one correct market does not make every badge green.

### Schedule changes and result corrections

A formal postponement before play voids the old cycle. Create a new cycle under the same fixture in the next eligible daily selection. A simple kickoff adjustment updates an unlocked cycle’s cutoff; it does not create another prediction job. If the revised cutoff has passed, close the cycle using only eligible publication history.

Locked cycles never reopen. If a later kickoff/start correction proves a locked forecast violated its cutoff, mark it void with an audit reason; never substitute a different locked pick. Record schedule changes and actual-start evidence.

Canceled, abandoned and administratively awarded games are void. Extra-time or shootout fixtures require a separately verified regulation score; otherwise settlement remains pending. Provider score corrections trigger audited resettlement against the same locked selections. Preserve old void cycles as history without multiplying the fixture’s headline result count.

## 5 The daily schedule in East Africa

Use `Africa/Kampala` for reporting days and UTC for stored timestamps. Trigger one logical daily run at 00:00 EAT, equivalent to 21:00 UTC on the previous date; UTC cron: `0 21 * * *`.

For EAT run date D, select kickoffs in `[D 00:00, D+7 00:00)`: today plus six days, not a calendar week. The 7 October 2026 run starts at 6 October 21:00 UTC and covers 7–13 October EAT. Historical results remain accessible outside this window.

### Selection and publication

1. Create/resume the unique EAT run under an exclusive lease. Retrieve all required fixture pages, normalize identities and apply configured competition and status eligibility.
2. Commit an immutable selection manifest with boundaries, fixture/cycle IDs, exclusions and nearest-kickoff budget priority. Retry an incomplete import before dispatch; if explicitly finalized as degraded, record its known subset and missing coverage.
3. Enqueue one refresh job per run, fixture and cycle. Jobs use the committed manifest; late discoveries wait for the next eligible daily selection.
4. Research and attempt AI, then provider fallback under section 7. Before publication, recheck fixture status, kickoff and cycle using a provider observation within the configured freshness bound. Stale status cannot establish eligibility.
5. In one transaction, require membership in the original manifest/window and the current rolling window, an open current cycle and `publishedAt < cutoff`. Reject older-run output once a newer accepted revision exists. Save the revision and move the current reference atomically.
6. Record published, retained-previous, unavailable, skipped or failed. Finish when every job is terminal. An already published job returns its existing revision on retry.

Use run order and cycle identity, not worker completion time, to order revisions. Pin model configuration per refresh job.

### Replacement and retention

Within a refresh, valid AI takes priority over fallback. A newer valid refresh replaces an older revision even if the newer output uses fallback. Never choose a source for its higher percentage.

If neither source supplies any valid market, retain an eligible previous revision with “Update delayed” and its original timestamps, or show unavailable. A partially supported new revision replaces the entire snapshot: missing families become unavailable rather than inheriting old markets.

Store evidence cutoff, generation, publication and provider retrieval/update times separately. Retrieving unchanged provider output does not make it newly generated.

### Final lock

Define cutoff as scheduled kickoff minus five minutes. Publication at or after cutoff is rejected; observed play starting earlier closes writes immediately. Enforce this inside the publication transaction independently of the lock job.

At cutoff, close the cycle and lock the latest eligible revision, or close it with no prediction. A late lock job reconstructs eligibility from publication and schedule history, never match outcomes. Previous-day forecasts may serve early-morning kickoffs when the new run cannot finish in time.

No hourly or last-minute AI refresh is included. Evidence arriving after analysis waits for the next eligible daily run; disclose that late lineup news may be absent. A provisional capacity target is 1,000 refresh jobs by 01:00 EAT, subject to measured workload and quotas.

### Separate data-refresh schedule

| Task | Cadence and strategy |
| --- | --- |
| Live scores/status | Every 15 seconds while covered games are active or approaching kickoff; share `/fixtures?live=all` and filter coverage locally. |
| Today’s fixtures and final results | Every 60 seconds; `/fixtures?date=YYYY-MM-DD&timezone=Africa/Kampala`, validating date boundaries. |
| Seven-day selection and AI | Once at 00:00 EAT; fetch seven dates and enqueue the committed manifest. |
| Cross-midnight or missing-live matches | Every 60 seconds during their active/result window; batch unresolved IDs not already refreshed. |
| Corrections and long-unresolved results | Bounded, progressively slower checks; preserve visible unresolved records. |
| Team data/history | Initial import and refresh as needed; reuse shared records and structured caches. |
| Provider predictions | Only when an eligible refresh needs fallback; cache within that job. |

API-Football supports the all-live query, approximately 15-second live fixture updates and batches of up to 20 fixture IDs. Follow actual pagination contracts. Disappearance from a live response is never proof of full time. [6]

One poller holds a renewable lease. Pause the live loop when no covered game is active or approaching; date sync detects when to resume. Status polls do not enqueue AI or add fixtures to a committed manifest. Moving outside the forward window stops prediction refreshes but preserves result tracking.

## 6 Football data and research sources

Use one API-Football adapter for fixtures, canonical identities, available statistics, player availability, kickoff/status changes, scores and fallback predictions. Coverage differs by competition and field; validate representative league, cup, postponed and low-coverage fixtures. Plan pricing belongs in section 14.

### Required data contract

- Stable fixture, team and competition IDs; season; home/away assignment; kickoff; normalized status; regulation score; update time when supplied.
- Historical results, home advantage, schedule/rest and dependable statistics. Include injuries, lineups and expected goals only where covered.
- Team/league names, aliases and approved remote logo URLs; missing values remain unknown.
- Coverage and quota metadata, with explicit mappings for extra time, shootouts and settlement.

Match-result fallback percentages may be available where other families lack usable probabilities. Test supported markets, freshness and pre-match availability; do not infer four-market coverage from the plan’s endpoint access. [6]

### News and evidence

Select a licensed search/news source and permitted official club or competition sources. Gather relevant reporting, confirmed absences and attributable previews. Match evidence to the correct fixture, deduplicate syndicated stories and distinguish facts from rumor.

Store URL, publisher, title, publication/retrieval times, extracted claims and reuse metadata. Publish short original summaries with links. Fixture-data access does not automatically grant logo, article or prediction redistribution rights.

### Images and brand assets

Third-party team, competition and editorial images remain approved HTTPS URL strings. Browsers load them directly through native `img`/`styled.img`; no app downloads, optimization proxy, binary storage or persistent image cache. Update changed URLs on shared records and use styled initials when display fails.

Confirm public display rights, credential-free URLs and media limits. API-Football’s media CDN has separate throttling, so direct logo display must be tested for the expected audience. [6]

Original Goal Hint logos, wordmarks, favicons and social graphics are first-party build assets and may be bundled in the repository. Use the [brand guide](assets/brand/README.md) and named assets in `public/brand/`. Keep reusable sources; this exception does not permit copying provider imagery.

## 7 How AI produces a prediction

The primary AI service researches evidence, predicts outcomes and explains its estimates. It may combine language-model analysis with trained predictive models and calibration. Select and evaluate the model during the trial; verbal self-confidence is not an event probability.

### Processing sequence

1. Capture the fixture, cycle, run, team IDs and kickoff; confirm eligibility.
2. Load structured form, results, rest, competition context and available player data. Keep missing fields unknown.
3. Gather attributable news through bounded research calls. Treat source text as untrusted evidence that cannot alter worker instructions or authorize actions.
4. Request structured probabilities, concise reasons, uncertainties and source references. Do not invent numerical news adjustments.
5. Validate identity, evidence timing, finite values, complete outcome groups, sums and cross-market consistency. Derive double chance from match result.
6. Attempt fallback for invalid or missing families, then validate and publish the complete accepted snapshot atomically.

### Fallback contract

| Situation | Behavior |
| --- | --- |
| Valid AI family | Use it; label “AI prediction”. |
| AI times out, fails validation, lacks sufficient evidence or exhausts budget | Attempt API-Football fallback within remaining time and quota. |
| Valid provider family | Label “API-Football fallback”, retaining its provenance and fallback reason. |
| Pick without complete usable probabilities | Leave that family unavailable. |
| Neither source yields any valid family | Apply the retain-previous/unavailable policy in section 5. |

Missing news alone does not force fallback if the evidence threshold is met; label “Limited news coverage”. Missing injury data does not establish a fully fit squad.

Require the same fixture, cycle and regulation-time rules. Record provider retrieval time and source update time separately; an absent update time remains unknown. Apply the trial’s documented freshness criteria and reject output that cannot meet them.

Treat match result and derived double chance as one source group: never mix AI home-win values with provider draw/away values. Total-goals fallback needs the 2.5 line and complementary probabilities. BTTS requires explicit probabilities or a documented validated derivation. Optional exact score requires a valid score distribution. Do not implicitly convert odds, manufacture missing values or average sources.

Define shared consistency checks, tolerances and a deterministic conflict policy before launch. Preserve valid AI groups ahead of conflicting fallback groups; omit unsupported/conflicting families and audit the reason. Each revision remains a complete public snapshot.

Keep ready-made provider predictions outside the primary AI decision path so source performance remains distinguishable. Expert previews are attributable evidence, not automatic votes; test whether their inclusion improves out-of-time performance.

### Public analysis

Show two to four reasons, one key uncertainty, source links, origin and publication time. Fallback explanations must accurately describe their provider basis. Explain daily revision behavior and expose earlier read-only versions within the same match page. Distinguish probability from evidence completeness and age. Never invent citations or publish prompts, internal reasoning or worker logs.

## 8 Accuracy and honest probability scores

A calibrated 70% estimate means comparable events assigned that probability occur about seven times in ten; an individual forecast can still fail. [7]

### Display and evaluation rules

- Label values “Estimated probability”; do not imply guarantees.
- Require probabilities strictly between zero and one. Store precision, normally display whole percentages and use “Less than 1%”/“More than 99%” at rounding boundaries.
- Round mutually exclusive groups together so displayed numeric values total 100%; boundary labels indicate approximation.
- Mark unvalidated launch estimates provisional. Claim calibration only with adequate evaluation evidence.
- Score locked picks, never whichever revision performed best. Keep missing forecasts and voids visible.

Use chronological training, validation, calibration and final-test periods. Choose thresholds before the final test and exclude evidence unavailable at the prediction time. Without trustworthy historical news/provider snapshots, use reconstructable baselines and prospective shadow forecasts rather than hindsight reconstructions. Evaluate forecast horizons separately.

| Measure | Reporting rule |
| --- | --- |
| Hit rate | Correct ÷ (correct + incorrect), with market, count and period. |
| Brier score and log loss | Compare like markets on identical fixtures; lower is better. [7] |
| Calibration | Probability bands with counts and uncertainty. [7] |
| Coverage | Unique fixture/market counts with a stated cohort and availability/source breakdown. |

Put public performance in How it works, linked from Results. Show source-specific AI and fallback metrics and a labeled combined total, with model/provider version where available and links to locked forecasts.

For a selected EAT fixture-date cohort, count each fixture/market once by its applicable cycle: available (AI or fallback), unavailable or void; available outcomes separate settled from pending. Keep historical postponed cycles separate. Delayed forecasts and failed refresh jobs are operational measures that can overlap these categories, not additional fixtures.

Compare AI, provider and simple team-strength/league-frequency baselines on matched fixtures, evidence cutoffs and horizons. Define minimum samples and quality/coverage gates before release; retain the previous model if a candidate fails them. Promise no fixed accuracy target.

## 9 Technical architecture and state

### Framework baseline

Use stable Next.js 16.4 and Prisma ORM 7 as the checked baseline; verify compatibility and pin exact versions when implementation begins. Prisma ORM 8 is a release candidate. Use compatible stable React, Redux Toolkit, react-redux and styled-components versions and a supported Node.js LTS runtime. [1][2]

| Layer | Responsibility |
| --- | --- |
| Next.js | Server-rendered pages, metadata, public reads and protected operations endpoints. |
| Prisma/PostgreSQL | Persistence, migrations, constraints, transactions and indexed queries. |
| Durable queue/workers | Selection, prediction jobs, cutoff locks, retries and settlement. |
| AI/fallback controller | Evidence, model execution, validation and source provenance. |
| Provider adapters | Normalization, bounded research and shared API-Football limiting. |
| Public cache | Stored page/data responses with targeted invalidation. |

Keep shared schemas and domain services in one repository. Use a managed or PostgreSQL-backed durable queue after workload testing. Triggers enqueue work and return promptly. Run the 15-second poller in a long-lived worker with one renewable lease, independent of visitor requests.

### Client state

Applied date/range, market, league, status and search belong in URLs. Redux Toolkit holds shared mutable UI state such as filter drafts and view preferences. Create a store per request/provider instance, never a server-global store. Server Components fetch through server services and do not access Redux; RTK Query is limited to needed browser refreshes. [3]

Serve initial match HTML from the server with one explicit handoff to refreshed client data. Return monotonic fixture-data versions alongside cycle/run/revision references so late responses cannot restore an older cycle, prediction, score or status. Do not compare opaque IDs lexically or treat Redux/local storage as database truth.

## 10 Database and audit records

This logical schema preserves queryable fields and versioned evidence. Final Prisma fields depend on validated provider responses.

| Entity | Core purpose |
| --- | --- |
| Competition / Season | Provider mappings, name, country, season and coverage settings. |
| Team | Canonical ID, name, aliases, remote logo URL and update time. |
| TeamProviderMapping | Unique provider/external-team ID mapped to Team. |
| Fixture | Unique provider mapping; season and team FKs; kickoff, EAT date, status, active cycle, sync time and monotonic data version. |
| PredictionCycle | Schedule version, cutoff, state, current/locked set references, close/lock time and void reason. |
| DailyRun / RunFixture | Unique EAT date, ordered run, boundaries, immutable manifest, fixture/cycle entries, completeness, exclusions and job state. |
| EvidenceSnapshot / SourceRecord | Versioned facts, missing data, cutoff/hash, Team references, attributable source claims/timestamps and reuse metadata. |
| ModelVersion | Predictor/research model, prompt, training window, calibration and evaluation configuration. |
| PredictionSet | Fixture/cycle/run, ordered revision, model/evidence references, generation/publication times, immutable payload and predecessor. |
| MarketPrediction | Complete family probabilities, selected pick, AI/provider source, fallback reason, provenance/timestamps and settlement-rule version. |
| Result / Settlement | Regulation score and provider status revisions; locked set/market, outcome, reason and settlement/correction time. |
| JobRun / AuditEvent | Idempotency key, attempts/leases, reasons, costs/request counts, actors and publication/schedule/reference changes. |
| ApiUsageState | Durable account quota period, counters, observed remaining capacity, limiter state, poller lease and last sync. |

### Required constraints

- Reuse Team across fixtures, seasons and competitions. Resolve provider IDs with transactional upserts and database uniqueness; do not deduplicate by name alone. Verify alternate IDs and hold ambiguous identities for resolution.
- Enforce unique provider/fixture ID, EAT run date and run/fixture/cycle refresh key. Allow at most one accepted publication per key, even across retries or model changes.
- Validate probability bounds, group sums and source/derivation rules consistently in all publication paths.
- Publish set, markets and current reference atomically under a cycle lock or compare-and-swap. Serialize this with locking and rescheduling; recheck run order, eligibility, freshness and cutoff.
- Close cycles even without a valid set. Locked payloads, picks, probabilities, evidence and publication times are immutable.
- Keep one active settlement per cycle/market; append correction history. Headline queries use the fixture’s applicable cycle once, excluding superseded predictions and separately reporting old void cycles.
- Index dates/kickoff, status, competition/team relationships, normalized search terms, run/cycle lookups and current/locked references.

Upcoming pages use the current revision until the cycle closes, then its locked revision or unavailable state. A void cycle retains its last prediction, if any, and its void reason even when no set was locked. Read-only revision lookups never change settlement. Preserve original forecasts and schedule/result corrections; a correction may change a badge with a visible timestamp, never select a more favorable prediction.

## 11 Endpoints and background operations

Public endpoints return visitor-facing fields from stored data. Validate parameters and page sizes. A visitor request never triggers provider research or prediction work.

| Endpoint/job | Contract |
| --- | --- |
| GET /api/matches | Date or bounded seven-day range, search, league, market, status, sort and pagination; one card per fixture with data version, cycle/revision, source and freshness. Historical dates are supported. |
| GET /api/matches/:id | Current/locked snapshot, sources and settlement; explicit read-only revision history. |
| GET /api/performance | Market/period/source/model counts and metrics from locked revisions. |
| Daily selection | Create/resume run, commit manifest, enqueue missing refresh jobs. |
| Prediction worker | Attempt AI/fallback; publish once before cutoff. |
| Lock job | Close cycle with latest eligible set or unavailable. |
| Result sync/settlement | Shared polling, schedule changes, verified scores and audited settlement. |
| Private recovery | Resume eligible unpublished work or correct mappings; retain cutoff and publication invariants. |

### Recovery and concurrency

Assume at-least-once delivery. Use uniqueness, renewable leases, bounded timeouts and capped exponential backoff with jitter. Leave time/quota for fallback; record invalid output, insufficient evidence, timeouts, rate limits and budget failures separately.

Resume committed manifests after crashes. Expire stale leases safely. A watchdog detects missed runs, stalled work and missing locks. Failed/retained jobs may resume only while eligible; published jobs remain final for that daily refresh.

If using Vercel Cron, enqueue durable work within function limits and implement recovery separately: failed cron invocations are not automatically retried. [12]

### Shared API-Football limiter

Apply limits across the whole provider account, including every replica, poller, worker, manual tool and retry.

| Limit | Configuration |
| --- | --- |
| Dispatch | At most 12 requests per rolling second, evenly paced. |
| Minute | At most 720 per rolling 60 seconds. |
| Provider quota day | At most 120,000 dispatched requests. |
| Essential reserve | 20,000 within that ceiling for results, cutoff checks, near-kickoff fallback and recovery. |
| Headroom | Leave 30,000 below Mega’s published daily quota unused by normal work. |

Reserve slots atomically at dispatch and count uncertain network attempts conservatively. Persist shared limiter state; if it is unavailable, pause provider calls and serve stored data. Deduplicate in-flight requests and reuse fresh structured responses.

Reconcile daily `x-ratelimit-requests-remaining` and minute `X-RateLimit-Remaining` headers and their limits against local/in-flight counts. Late responses cannot restore spent allowance. Use the lower effective ceiling if the plan changes. Verify the provider’s reset boundary rather than equating it with EAT midnight. [15]

After restart, reconcile within remaining capacity. At the expected provider reset boundary, permit only a counted probe against the candidate new period; preserve old counters and resume bulk work only after confirming the reset. Exhaustion before that boundary stops outbound work. Honor HTTP 429/retry delays and response-body errors; alert on expired subscriptions and credential failures. Account for separate IP protections when choosing worker egress. [15]

Prioritize final results and cutoff safety, then live/date sync and near-kickoff fallback, daily inputs and optional enrichment. Protect forecast result capacity, reduce polling under pressure and expose delays. Never exceed the ceiling to maintain freshness.

### Cache and monitoring

Cache stored responses by locale, date/range, fixture and permitted filters. Invalidate on publication, locking, material score/status changes, rescheduling and settlement. Keep active-match cache lifetimes compatible with the cadence.

Visible active-match views may refresh the app endpoint every 15–30 seconds; slow/pause in background tabs. Roll today/window at EAT midnight, reject stale data versions and keep probability, source and explanation from one revision.

Target final badges within two minutes of the provider publishing a reliable final result in normal conditions, including processing and cache refresh. Show actual last-sync times and delays when outages or quota controls extend this. Continue unresolved tracking across midnight and outside the prediction window.

Use hosting tools, private operator commands and structured logs for run progress, stale data, missing locks, source failures, quota, costs and recovery. Keep these outside the public application.

## 12 SEO and language infrastructure

### A small navigation with useful searchable pages

Use `https://goalhint.com` as the metadata base and canonical origin; redirect `www` there. Use “Goal Hint” as the site name, “Goal Hint | Daily Football Predictions” as the homepage title, and the app name as the suffix for unique match titles.

Routes: `/en`, `/en/predictions/YYYY-MM-DD`, `/en/matches/fixture-id/home-v-away` and `/en/how-it-works`. Redirect `/` consistently to `/en`. Fixture IDs establish identity; changed slugs redirect to the canonical page. Results shares the dated feed.

- Server-render names, kickoff, probabilities, explanations and results. Use Next.js metadata APIs for unique titles, descriptions, canonical URLs and social previews; include valid canonical pages in the sitemap. [8]
- Retain historical match pages with locked predictions, source/evidence timestamps, scores and outcomes. Show revisions within that page and canonicalize revision URLs to it.
- Keep search, arbitrary filters and revision variants out of the index. Allow crawlers to read `noindex`; do not hide it behind a robots.txt block. Avoid thin team, league, keyword or AI article pages.
- Provide crawlable archive, pagination and detail links. Unknown fixtures return 404; known fixtures may show unavailable states. Supported structured data must match visible content and does not guarantee rich results. [10]

### Content that earns repeat visits

Publish concise original explanations, identifiable sources, AI disclosure, methodology, limitations and a correction policy. Avoid invented experts or filler. [9] Measure impressions, indexing, click-through, returning visits and detail-page use; promise no search rank or traffic volume.

### English now and additional languages later

Externalize interface strings with stable keys, plural-aware messages and `Intl` formatting. Keep market/status codes and team IDs language-neutral; translate explanations independently of numeric predictions.

Prepare locale routes and English fallback. Add a selector only for complete translations, with localized metadata, canonical URLs, `lang` and reciprocal `hreflang`; never publish empty locales. [11] Allow text expansion and logical spacing for future right-to-left layouts. EAT always defines reporting dates; an optional labeled local kickoff time cannot change eligibility or run identity.

## 13 Performance accessibility and security

### Performance targets

Target mobile 75th-percentile LCP ≤2.5 seconds, INP ≤200 milliseconds and CLS ≤0.1. Test low-end Android devices and constrained networks, then measure real traffic. [13]

Initially render about 30 cards and paginate. Reserve logo dimensions and lazy-load below-fold images. Load third-party team, competition and content images directly from remote URLs; first-party Goal Hint brand assets may be bundled. Exclude worker code, raw provider payloads and unused libraries from client bundles. Search indexed application data.

### Accessibility and responsive behavior

Support 320 px through desktop widths, 200% text zoom and long names without overflow. Use semantic headings, buttons, links, labeled controls, visible focus and logical tab order. Statuses need text as well as color; team names provide accessible identity without redundant logo announcements.

Announce search counts and failures without repeated interruptions. Filter panels must dismiss clearly and restore trigger focus. Respect reduced motion and maintain contrast in each theme. Prefer square corners and shared styling tokens across components.

### Optional themes

Launch in light mode; shared tokens should accommodate dark mode later. Any theme switch uses local preference storage and a stable initial theme without hydration errors or a dedicated settings page.

### Security and data handling

Store provider, database and AI credentials in server-only secrets. Public access follows section 1; internal mutations require validated service credentials or workload identity.

Schema-validate inputs and outputs, sanitize text, allow safe link schemes, block server fetches to internal addresses, rate-limit public search, redact logs and grant least database privilege. Minimize visitor data and document analytics/retention. Resolve applicable audience and service consent requirements before enabling advertising.

### Backups and recovery

Enable automated backups and point-in-time recovery where supported; prove restoration before launch and assign incident ownership. Define retention for predictions, results, evidence and audit history within source permissions. Rollbacks must preserve forecast history and database compatibility.

## 14 Operating costs and delivery phases

### Confirmed API-Football Mega budget

Select direct Mega: advertised at US$39/month for 150,000 requests/day and all endpoints, with documented limits of 900/minute and 15/second. Verify active account terms during setup. [14][15]

| Budget item | Requirement |
| --- | --- |
| Hard monthly ceiling | US$45 for API-Football including taxes/payment charges: US$6 above the advertised price. |
| App request ceiling | 120,000/provider-day, including a protected 20,000-request essential reserve; shared throttling follows section 11. |
| Separate budgets | AI, research/search, hosting, network egress, database, monitoring and domain renewal. |

This specification does not purchase a subscription. Check the payable total before purchase or renewal; flag any excess over US$45 without automatically changing plans or exceeding the cap. The direct pricing page describes quota exhaustion stopping requests and prepaid expiry returning to the free tier without automatic renewal. Set an expiry reminder and reconcile account limits before dispatch. [14]

### Refresh request arithmetic

Full-day baseline, assuming one request per poll and uninterrupted polling:

| Poll | Calculation | Requests/day |
| --- | --- | ---: |
| Shared live feed, every 15 seconds | 86,400 / 15 | 5,760 |
| Current EAT date, every 60 seconds | 86,400 / 60 | 1,440 |
| Combined | 5,760 + 1,440 | 7,200 |

This is 4.8% of Mega’s quota and 6% of the app ceiling. Add selection, unresolved-ID batches, AI inputs, fallback, supported pagination, diagnostics and retries. Seven-date selection begins with seven requests, reduced by fresh response reuse; inactive-period pausing also reduces polling. Visitor counts do not multiply shared provider polls.

### Control costs before expanding coverage

**Monthly cost = data subscriptions + research and AI usage + hosting and structured data storage + monitoring.** Include network/domain costs and retries in the relevant categories. Estimate research/AI from daily fixture-refresh jobs, requests/tokens per job and contracted rates: one fixture can receive seven daily refreshes. Stored public predictions prevent visitor-driven AI calls. Remote third-party images require no app-managed storage or processing; budget structured history, canonical teams and bundled Goal Hint brand assets.

At an illustrative US$0.02 per research/AI refresh, 500 refreshes/day cost US$10/day or US$300/30 days. A steady 500 matches/day across a fully refreshed seven-day slate approaches 3,500 refreshes/day: US$70/day or US$2,100/30 days. This assumption is not a vendor quote and excludes Mega, other operations and retries. Fallback consumes shared requests, without an assumed additional per-call fee.

Cache reusable evidence with original timestamps, recheck freshness, and share it across markets. Enforce separate research/AI caps and per-job request/token/time budgets. Apply section 7’s fallback/retention rules and section 11’s reserves; prioritize nearest kickoffs and record skipped/deferred work.

Benchmark 100, 500 and 1,000 refreshes, then the expected seven-day volume. Measure AI success, fallback rate, duration, cutoff misses and cost per published revision before expanding coverage.

### Delivery sequence within the agreed scope

| Phase | Deliverable and exit condition |
| --- | --- |
| 1 Data/model trial | Validate Mega, coverage/rights, checkout/reset behavior, fallback markets, settlement, AI quality and separate budgets. |
| 2 Foundation | Implement the specified stack, reusable responsive components and server-rendered routes/styles. |
| 3 Daily pipeline | Prove selection, ordered revisions, validation, locks and settlement survive overlapping runs and recovery without duplication. |
| 4 Launch validation | Pass shadow evaluation and section 15 criteria; enable monitoring and evidence-supported performance reporting. |

### Future advertising readiness

Keep ads disabled behind a feature flag at launch. Future labeled slots belong between card groups with reserved space, preserving navigation and free access. No advertising portal or payment system is in scope.

## 15 Acceptance criteria and launch decisions

These handoff requirements need recorded evidence. Confirm proposed workload and latency targets against the deployment before making service commitments.

| Area | Required evidence |
| --- | --- |
| Navigation and access | Today’s picks appear immediately; search includes unloaded cards and a card opens analysis in one tap. Fresh-session public pages/read endpoints need no account/token/cookie; no visitor auth screens, SDK or user/session tables exist. Unauthorized job triggers are rejected. |
| Layout and rendering | At 320, 360, 390 and 430 px, long names, broken logos, keyboard use and zoom remain usable. Shared components use square corners and consistent Goal Hint branding. Match HTML and styled-components CSS exist before hydration without flashes/errors. |
| Images and teams | Third-party images remain URL-only and load directly without app storage/proxy/cache; first-party brand assets may be bundled. Broken or throttled logos show text. Concurrent/repeated imports across competitions/seasons produce one canonical team; ambiguous identities are held for resolution. |
| Schedule | Prove today plus six days, exclusive day-seven boundary, 21:00 UTC trigger, midnight rollover and rejection outside eligibility. Prior-day predictions remain usable for eligible early kickoffs. |
| Publication and locking | At most one revision per refresh job; newer valid runs supersede older ones, and late workers/stale client responses cannot roll them back. Reject publication exactly at cutoff and after early starts; test earlier kickoff corrections and closure without a prediction. Partial revisions drop unsupported old markets. Retained output shows age; history and locked revisions remain immutable. |
| AI and evidence | Valid AI takes priority; timeout, invalid output and exhausted budget exercise fallback. Reject incomplete probability groups and inconsistent values; label sources and unavailable markets. Explanations trace to genuine evidence without invented missing facts. |
| Settlement and reporting | Cover draws, 2/3-goal boundaries, extra time, penalties, postponement cycles, cancellations and logged corrections. Counts reconcile once per locked fixture/market; AI/fallback, pending, unavailable and void totals remain distinct. |
| Recovery and quotas | Outages preserve records and allow resumption. Degraded manifests remain immutable and visibly show partial coverage rather than false empty dates. Concurrent workers respect 12/second, 720/minute and 120,000/provider-day including retries and reserve. Stale headers cannot restore capacity; restart, expiry and reset recover safely. |
| Cadence | One active poller shares 15-second live and 60-second date/results checks. Test the proposed two-minute final-badge target, cross-midnight fixtures and missing live responses. Polling and visitor activity never trigger AI or alter locked forecasts. |
| Budget | Record Mega’s payable total within US$45 and separate operating budgets; demonstrate cap enforcement. |
| SEO and languages | Verify metadata, canonicals, crawlable pagination, 404s and indexing exclusions. Externalized English strings and longer test translations preserve layout. |

### Confirmed product choices

Goal Hint and goalhint.com, free account-free access, direct Mega with the US$45 cap, four launch market families, the seven-day/daily EAT schedule, AI priority with fallback, five-minute publication cutoff, English and a light theme are settled requirements.

### Decisions needed before implementation

- Choose initial competitions, separate operating budgets, AI predictor/calibration configuration and research provider; decide whether validated exact scores ship.
- Set minimum evidence coverage, fixture-status and source-specific freshness limits, probability/consistency tolerances and handling of conflicting evidence or unknown provider update times.
- Set shadow-evaluation sample sizes, baseline comparisons, calibration/quality gates and minimum samples for public performance claims.
- Choose hosting for a continuous poller, durable workers and shared limiter; define outage alert thresholds, recovery objectives and ownership.
- Specify correction/dispute handling, unresolved-result and correction polling horizons, retention periods, analytics and source-reuse permissions.

### Checks required before launch

Register the domain; configure DNS, HTTPS and canonical redirects. Verify Mega checkout, coverage, active limits/reset/expiry, fallback markets, freshness and remote-logo/reuse rights, including independent media-host throttling. Pin compatible framework versions, configure secrets/scheduling, and test backups, restoration, monitoring and quota/cost alerts. Complete shadow evaluation and acceptance checks; publish methodology, daily-cadence limitations, correction policy, privacy, terms and contact information.

## 16 Sources and implementation references

Official implementation references; recheck versions, coverage and commercial terms during setup. Product limits and acceptance requirements are specification decisions.

[1] [Next.js releases](https://nextjs.org/blog) — stable-version selection.

[2] [Prisma release status](https://www.prisma.io/docs/orm/release-status) — supported releases.

[3] [Redux Toolkit with Next.js](https://redux.js.org/usage/nextjs) — stores and client state.

[4] [Next.js CSS in JS](https://nextjs.org/docs/app/guides/css-in-js) — styled-components registry.

[5] [Styled-components advanced usage](https://styled-components.com/docs/advanced) and [API](https://styled-components.com/docs/api#transient-props) — theming, rendering and transient props.

[6] [API-Football getting started](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) — capabilities and coverage.

[7] [Scikit-learn calibration](https://scikit-learn.org/stable/modules/calibration.html) — probability evaluation.

[8] [Next.js metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images) — metadata and previews.

[9] [Google helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) — authorship and content quality.

[10] [Google structured data](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) — eligibility and limitations.

[11] [Google localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions) — language relationships.

[12] [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — execution constraints.

[13] [Web Vitals](https://web.dev/articles/vitals) — performance thresholds.

[14] [API-Football pricing](https://www.api-football.com/pricing) — Mega, quotas and subscription terms.

[15] [API-Football rate limiting](https://www.api-football.com/news/post/how-ratelimit-works) — limits, headers and retries.
