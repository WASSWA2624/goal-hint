# Goal Hint — App Specification

**Product requirements and technical design**

Prepared for Wasswa Wilson  •  7 October 2026  •  Version 1.6

**App name:** Goal Hint  
**Selected domain:** goalhint.com  
**Production website:** https://goalhint.com  
**Football data and fallback provider:** API-Football by API-Sports  
**Selected subscription:** Direct Mega plan  
**API-Football monthly spending ceiling:** US$45, including applicable taxes and payment charges

Use “Goal Hint” consistently in the interface, page metadata and public copy. The domain has been selected; registration and DNS setup remain deployment tasks.

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

Build Goal Hint, a free, mobile-first website where anyone can find football matches for today and the next six days, read AI predictions, understand each estimated probability, and later see whether each prediction was correct. Every public feature is free to use without an account, registration, sign-in or visitor authentication, and should require very few taps.

The recommended design uses one main match feed, a reusable match detail page, and a small methodology page. At midnight in East Africa, a daily job selects and refreshes fixtures in a rolling seven-day window. AI researches and predicts each eligible match; API-Football’s predictions are the fallback when valid AI output is unavailable. New valid predictions replace the displayed versions before the publication cutoff, while a separate process checks results. Search visibility, honest performance reporting, and fast loading support audience growth and possible advertising later.

### Required technology

Use the latest stable Next.js release with the App Router and TypeScript, Prisma for database access, PostgreSQL for storage, Redux Toolkit for shared client state, and styled-components for styling. Prisma is the database layer; Next.js server code and background workers provide the backend business logic.

### Public access without accounts

Visitors can browse all predictions, search and filter matches, view analysis and earlier revisions, and read results and performance history immediately. Do not build registration, login, logout, password-reset, email-verification, social-login, profile or account-management screens. Do not add visitor authentication middleware, an authentication SDK or user/session tables. Public pages and read endpoints must work without a visitor token, API key or authentication cookie.

Filter and optional theme preferences may be stored in the URL or browser storage without identifying a visitor. API-Football and AI credentials remain server-side. Private background jobs use service credentials or hosting controls; these do not introduce a login flow into Goal Hint.

### Scope boundary

| Included at launch | Prepared for later | Outside this scope |
| --- | --- | --- |
| Rolling seven-day fixtures and daily prediction refreshes<br>AI predictions with provider fallback<br>Search and compact match cards<br>Probabilities and explanations<br>Final results and outcome labels | Additional interface languages<br>Optional light and dark themes<br>Careful advertising placement | Bet placement and payments<br>Visitor authentication, accounts or subscriptions<br>Social feeds and comments<br>AI chat or native mobile apps |

English is the only launch language. All public predictions remain free. The supporting operations, monitoring, and audit records in this specification exist to run these features reliably; they do not add a separate consumer product.

### Decisions that guide the build

- Use API-Football as the confirmed football data and fallback-prediction provider. Use the direct Mega subscription within the US$45 monthly API-Football ceiling, and cover fixtures available through that plan. Expand competition coverage as data quality and operating budget allow; do not promise every match worldwide.
- Make the AI prediction service the primary source of match analysis, selections and estimated probabilities. Use validated API-Football predictions only when the AI cannot supply a valid prediction for the relevant market.
- Refresh upcoming matches daily within today plus the next six EAT calendar days. The newest valid refresh replaces the current public prediction. Keep previous revisions for audit, and lock the final eligible revision before kickoff for result tracking.
- Store images only as remote URL strings. Keep one canonical database record per distinct team and reference it wherever that team appears.
- Treat accuracy and search visibility as outcomes to measure. Neither a perfect forecast nor a first-page search ranking can be guaranteed.

## 2 Navigation and everyday use

The homepage should immediately show the selected date, search, and matches. Avoid onboarding, a dashboard landing screen, or a sign-in prompt. A visitor should understand the app before opening a menu.

| Surface | Purpose | Navigation |
| --- | --- | --- |
| Today and Results | One shared feed with Today and Next 7 days date controls, status, league and market filters. Results uses the same cards for past dates. | Two obvious navigation choices; no duplicate feature flows. |
| Match detail | All supported markets, evidence, publication time and final outcome for one fixture. | One tap from a card; a stable link for search and sharing. |
| How it works | Explain probabilities, sources, timing, settlement and measured performance. | Footer link, plus a small probability help link. |
| Utility information | Privacy, terms and contact information. | Quiet footer links; no extra main navigation tabs. |

### Find a match

Default to today in Africa/Kampala time. Provide Today, Tomorrow and Next 7 days controls plus a date picker for historical results. Show available predictions immediately for every selected future date within today plus the next six days. Beyond that window, state “Predictions become available within seven days of the match.” Search team, league, or country names with familiar aliases and case-insensitive matching. Search must cover the full selected date or seven-day range, including cards not yet loaded. These controls stay on the same feed and do not add pages or navigation steps.

Keep a search field visible above the cards. Offer league, status and market filters through compact controls, with clear active states and a Reset button. Use kickoff order by default; make probability sorting available for the currently selected market only. Missing probabilities sort last. Never rank unrelated markets as if their probabilities measured the same event.

### Read and return

A match card provides the key prediction without requiring a detail visit. A “View analysis” link opens the detail page. Browser Back restores the date, filters, loaded position and scroll location. URLs preserve applied filters, so reloading or sharing a link does not silently change the view.

On detail pages, put teams, kickoff, the current prediction and probability first. Show “AI prediction” or “API-Football fallback” for each market, its last update time and any delayed-refresh label. Place other markets directly underneath, then a short explanation, sources and final result. Source lists and earlier prediction revisions may expand in place. Do not hide the core prediction behind tabs, login, or an explanation wizard.

### Loading and empty states

- During the daily run, show “Updating predictions for the next 7 days” and a completed count. Keep existing predictions visible with their actual update times while publishing completed refreshes progressively.
- Distinguish “No fixtures on this date,” “No matches fit these filters,” “Insufficient data,” and “Data temporarily unavailable.” Offer only the relevant next action.
- Use compact loading placeholders. Retain already loaded cards on a refresh failure and show when their data was last updated.
- Use a Load more control with ordinary linked pagination underneath for accessibility and discovery. Do not make infinite scrolling the only way to navigate.

## 3 Mobile interface and styled components

### Match card structure

Each card is an article with a clear reading order: competition and kickoff, home team, away team, prediction, probability, outcome status, and the analysis link. Render home and away as separate rows on narrow screens, with explicit Home and Away labels. Place each team logo beside its name and align actual scores in a consistent column.

The prediction line might read “Home win · 54% estimated probability.” Add a compact source label, such as “AI prediction · Updated 00:18 EAT” or “API-Football fallback · Updated 00:18 EAT”. Before kickoff, show the time. When finished, show “Final score 2–1” beside the separate prediction outcome. An illustrative card could show Lake City at home against River United, Home win 54%, Draw 27%, and Away win 19%. These are example values, not real forecasts.

- Allow long team names to wrap to two lines. Never rely on a logo or an unexplained abbreviation to identify a team. If a remote logo is unavailable, show the team’s initials in a styled text placeholder without loading or storing a fallback image file.
- Use one column on phones and a restrained two-column grid on larger screens. Start with 16 px body text, comfortable spacing, 28–32 px team logos, and controls with roughly 44 px touch targets.
- Use a calm light background, strong text contrast and one navigation accent. Reserve green, red and gray for outcome labels, each paired with text and an icon.
- Keep filters reachable without covering the content. No carousel, promotional splash screen or large decorative hero is needed.

### Styling implementation

Styled-components is the styling system for the app. Define reusable tokens for spacing, typography, breakpoints, borders, surfaces and outcome colors. Use ThemeProvider and createGlobalStyle for shared design rules. Build MatchCard, TeamRow, ProbabilityLabel, OutcomeBadge, SearchInput, FilterControl and EmptyState components around these tokens. [5]

For the App Router integration, enable `compiler.styledComponents` and use the documented style registry with `ServerStyleSheet`, `StyleSheetManager` and `useServerInsertedHTML`. Keep styled-components definitions and `ThemeProvider` in Client Component modules. Server pages can fetch data and compose these components; Client Components can still provide server-rendered HTML on the first request. [4]

Declare styled components outside render functions. Use transient styling props such as `$status` so presentation flags do not become unwanted HTML attributes. Define breakpoint styles from the smallest screen upward and keep the component API independent of any particular language. [5]

### Verification required

Check the production build for missing initial styles, flashes of unstyled content, hydration warnings and style duplication during streamed navigation. Keep data fetching and metadata on the server; the style registry must not turn the entire app into browser-only rendering. Validate the exact Next.js, React and styled-components versions together before accepting the foundation.

## 4 Prediction markets and result rules

Launch with four market families. They answer different questions, so every percentage and outcome badge must name its event. All launch markets use the score after regulation time, including stoppage time and excluding extra time or penalties.

| Market | Displayed selections | Correct when |
| --- | --- | --- |
| Match result | Home win, Draw, Away win | The selected result matches the regulation score. |
| Double chance | Home or draw, Away or draw, Home or away | Either of the two stated regulation outcomes occurs. |
| Total goals | Over 2.5, Under 2.5 | Over: at least 3 total goals. Under: at most 2. |
| Both teams to score | Yes, No | Yes: each team scores at least once. No: at least one team scores zero. |

The card defaults to the most probable match-result selection, not the easiest market to get right. Changing the market filter changes the displayed event and its probability. Show all alternative probabilities in the detail view. The three match-result values sum to 100%; each binary pair sums to 100%. Double-chance selections overlap and therefore do not sum to 100%.

Each current revision has one displayed pick per available market family, using the highest probability and a documented deterministic tie rule. New valid revisions can change that pick and its probability until the publication cutoff. At the cutoff, lock the latest eligible revision for settlement. Switching the filter reveals the selected market from the same current or locked revision. Headline hit rates count only the locked picks once per family per played fixture, never every revision or every alternative outcome. Score complete probability distributions separately when evaluating the model.

A most likely exact score may be added as secondary information only if the model produces a validated score distribution. Display its own probability. “Most likely score 2–1 · 11%” is different from “Home win · 54%.” Exact-score accuracy must be reported separately, with no suggestion that the main percentage applies to that score.

### Outcome colors

| Color and label | Meaning | Performance count |
| --- | --- | --- |
| Green · Correct | The locked selection occurred. | Include as a correct settled prediction. |
| Red · Incorrect | A valid final result contradicts the locked selection. | Include as an incorrect settled prediction. |
| Gray · Pending | Upcoming, in progress, or awaiting a verified result. | Exclude until settled. |
| Gray · Void | Canceled, unresolved abandonment, or result not eligible under the rules. | Exclude; retain the reason. |
| Gray · Unavailable | No valid pre-match prediction was published. | Exclude; retain the coverage gap. |

A single fixture can have a correct home-win forecast and an incorrect total-goals forecast. Color the selected market’s badge; do not color every market green because one was correct. A live score never settles a prediction early.

If a match is postponed before starting, void the current prediction cycle and retain its history. Start a new cycle in a later daily run when the rescheduled kickoff enters the seven-day window. Keep the same canonical fixture and team records. For a same-day kickoff adjustment, show the change and recompute the cutoff for an unlocked cycle. An already locked cycle remains locked unless a formal postponement creates a new cycle; never reopen prediction writes after the match has actually started. Abandoned, canceled and administratively awarded games are void. A game completed after extra time is settled from a separately verified regulation score; otherwise it remains pending. Provider corrections trigger logged resettlement against the locked prediction, without rewriting its selections. Superseded prediction revisions are history, not extra wins, losses or void matches.

## 5 The daily schedule in East Africa

Use `Africa/Kampala` for the product’s reporting day. Keep the daily trigger at 00:00 EAT, equivalent to 21:00 UTC on the previous calendar date. For a UTC scheduler, use `0 21 * * *`. Persist timestamps in UTC and the EAT date associated with each run.

### The allowed seven-day window

“A week” means a rolling window of seven EAT calendar days: today and the next six days. It is not a Monday-to-Sunday calendar week or a once-weekly job. For run date D, include scheduled kickoffs in `[D 00:00 EAT, D+7 00:00 EAT)`. Only upcoming matches that still satisfy the publication cutoff may receive a new prediction. Historical matches remain available for results and performance reporting outside this window.

For example, the 7 October 2026 run starts at 6 October 21:00 UTC. Its window covers 7–13 October EAT, ending just before 14 October 00:00 EAT, or 13 October 21:00 UTC. On 8 October the window moves to 8–14 October. Matches on overlapping dates are refreshed, and the new final day is added. Validate the exact boundaries after converting provider date filters.

### One daily selection, repeated pre-match analysis

Once daily means one logical selection batch per EAT date covering the entire seven-day window. A match can be analysed again in successive daily runs as kickoff approaches. This replaces the earlier once-per-match publication rule. API pagination, retries and result polling are supporting operations, not separate selections.

1. Create or resume the run under a unique EAT date key and an exclusive lease. Retrieve the seven-day fixture set, validate all pages and commit its selection manifest and window boundaries.
2. Resolve shared teams and fixtures through stable provider mappings. Include enabled competitions and eligible upcoming statuses. Record exclusions and any deterministic budget-priority rule, prioritizing the nearest kickoff.
3. Enqueue one refresh job per run, fixture and prediction cycle. Research the match using evidence available now and attempt the primary AI prediction. Use provider fallback only under the rules in section 7.
4. Before publishing, recheck kickoff, status, the active seven-day window and the prediction cycle. Require publication at least five minutes before kickoff. Reject an older run if a newer run’s revision is already current, and reject every publication after the cutoff or after play has started.
5. Publish at most one accepted prediction revision per refresh job. In one transaction, save its markets, evidence, source labels and timestamps, then move the current-revision reference to it. This overrides the previous public prediction and preserves its history. Invalidate the relevant public caches.
6. Mark the job published, retained-previous, unavailable, skipped or failed. Finish the run when all jobs reach a terminal state. A retry of an already published job returns that revision and cannot create another one.

### Which prediction takes precedence

A newer daily refresh with a valid prediction replaces an older revision, even if the newer revision uses provider fallback because AI failed in that refresh. Within the same refresh, valid AI output takes priority over provider output. Never select between them merely because one offers a higher percentage.

Use the run sequence and prediction-cycle identity to order revisions, not the time a worker happens to finish. A slow older job must never replace a newer prediction. Store generation, evidence-cutoff, publication and provider-retrieval times separately. Re-fetching an unchanged provider output does not justify claiming that the provider generated a new forecast.

If neither source produces a valid market, retain the previous valid revision with “Update delayed” and its original timestamps, provided the fixture and prediction cycle are still eligible. When no previous valid revision exists, show “Prediction unavailable.” Retained forecasts remain eligible for the final lock if they still meet the cutoff and fixture rules; record their age and delayed status rather than presenting them as refreshed. If a new revision contains only some supported markets, those become current and unsupported markets show unavailable; do not silently combine them with markets from an older revision.

### Final lock and later results

Stop prediction writes at kickoff minus five minutes, or earlier if the provider reports that play has started. Lock the latest eligible public revision and use it for every settlement and headline performance calculation. Enforce the cutoff in the database publication transaction, independent of scheduler timing. If the locking job runs late, reconstruct the lock from eligible publication history and timestamps, never from match outcomes.

A match just after midnight may already have a prediction from a previous daily run in the seven-day window. Lock that eligible version if the new run cannot finish in time. If no valid version exists, leave it unavailable; never publish a first prediction after the cutoff.

### Timing, refresh limits and result sync

Publish completed jobs progressively. A proposed capacity target is 1,000 fixture-refresh jobs completed by 01:00 EAT, subject to measured quotas and worker capacity; it is not a promise to finish an arbitrarily large seven-day slate within an hour. Benchmark the full window before agreeing a launch target.

Each midnight run reconsiders current form, injuries and news. Evidence arriving after a match’s daily analysis is incorporated in the next eligible daily refresh. Automatic hourly or last-minute prediction refreshes are outside this launch scope. Record evidence times honestly and explain that late lineup news may not enter the final forecast.

Use the following separate data-refresh schedule. These polls update stored match data; they do not rerun AI, replace a prediction or create another daily selection.

| Data or task | Schedule | Fetch strategy |
| --- | --- | --- |
| Live match scores and status | Every 15 seconds while covered matches are active or about to start | One shared `/fixtures?live=all` request per tick; apply app coverage filters locally. |
| Today’s fixtures, kickoff changes and final results | Every 60 seconds | Fetch the full current EAT date using `/fixtures?date=YYYY-MM-DD&timezone=Africa/Kampala`; validate date boundaries. |
| Seven-day fixture selection and AI refresh | Once daily at 00:00 EAT | Fetch the seven EAT dates, commit the selection manifest and enqueue the daily AI jobs. |
| Tracked matches that crossed midnight or disappeared from the live response | Every 60 seconds around their active/final-result window | Batch unresolved fixture IDs, skipping IDs already refreshed by another poll. |
| Settled-result corrections and long-unresolved matches | Progressively slower checks | Move from active polling to a bounded retry schedule; keep unresolved records visible. |
| Team data and reusable history | On initial import and scheduled refresh when needed | Reuse the canonical team records and structured caches across fixtures and markets. |
| Provider fallback predictions | Only when an eligible AI refresh needs fallback | Cache within that job; do not poll every match’s predictions at live-score frequency. |

API-Football documents an all-live fixture query, roughly 15-second live fixture updates, date filtering and fixture-ID batches of up to 20. Use supported batching and pagination without assuming one request per match. [6] Keep unresolved IDs until an explicit eligible final status and regulation score are verified; disappearance from the live feed is not proof of full time.

A newly discovered fixture still enters prediction processing through the next eligible midnight selection. Status polling cannot bypass that rule. Moving outside the forward window suspends prediction refreshes but preserves result tracking and history. A delayed run retains its original window and label, rechecks current eligibility and cannot overwrite a newer completed refresh.

Use one active poller under a renewable lease. When there are no covered live matches and none is approaching kickoff, pause the 15-second loop and use the one-minute date sync to detect when it should resume. Faster score refreshes do not increase AI or news-research frequency.

## 6 Football data and research sources

API-Football by API-Sports is the confirmed football provider for Goal Hint. Use it for fixtures, teams, statistics, player availability where covered, scores, final results and fallback predictions. The provider and direct Mega subscription are confirmed. Implementation validation determines competition coverage, usable fallback markets and the measured request budget. Mega’s published price is US$39/month with 150,000 requests/day; its documented rate ceiling is 900 requests/minute, equivalent to 15/second. [14][15] The US$45 monthly ceiling is a spending limit, not a claim that the complete app costs US$45 to operate.

| Role | API-Football responsibility |
| --- | --- |
| Football data | Supply scheduled fixtures, stable team and competition IDs, remote logo URLs, historical results and available statistics. [6] |
| Match status and results | Supply kickoff updates, match status and score data for result verification and settlement. [6] |
| Prediction fallback | Supply supported provider predictions when Goal Hint’s primary AI cannot produce a valid market prediction. [6] |

Goal Hint’s AI remains the primary predictor. Build one API-Football adapter that keeps external response formats out of the interface. Validate actual responses for the intended competitions and seven-day window before launch. Detailed statistics, injuries and prediction coverage can differ from fixture coverage. No second football data provider or provider-comparison phase is required for this build.

### Required data contract

- Stable fixture, team and competition identifiers; home and away assignment; scheduled kickoff; status; season; final regulation score; and provider update time where available.
- Historical results, venue or home advantage, recent schedule and rest days. Add player availability, lineups, team statistics or expected goals only where the provider supplies dependable coverage.
- Team names, approved short names, league names and remote logo URLs. Store team names, aliases and the logo URL on the shared Team record. Preserve missing fields as unknown rather than inventing values.
- Coverage metadata and request-budget information. Normalize status codes and final-score semantics explicitly, including extra-time and shootout matches.

### News and expert insight

Football APIs do not automatically provide all relevant reporting or public opinion. Add a licensed search or news source, plus official club and competition sources where permitted. For each match, gather recent team news, confirmed absences, likely lineup changes, recent form and attributable expert previews. Deduplicate syndicated articles and separate confirmed facts from rumor.

Store source URL, publisher, article title, publication time, retrieval time, related fixture and extracted claim. Use short original summaries with links. Respect access and reuse terms; do not assume that purchasing fixture data also grants unrestricted rights to logos, news text or prediction redistribution.

### Remote images only

Store each image location as a URL string, such as `Team.logoUrl`, and let the visitor’s browser load it directly from that remote address. Apply this rule to team logos, competition logos and any other images. Do not download or persist image files, binary data, base64 images or image blobs in the database, filesystem or object storage. Do not create an app-managed image cache, proxy or image CDN.

Render remote images through a native image element, which may be styled with `styled.img`, using the stored URL as `src`. Use a rendering path that bypasses server image optimization and its image cache. Accept approved HTTPS image sources that can be displayed publicly without exposing provider credentials. If a URL changes, update the shared record; if it fails, show the text placeholder. Confirm API-Football’s applicable terms and remote-image limits for this direct display before launch.

### API-Football integration validation

Check ordinary league games, cup games with extra time, postponed matches, missing logos and low-coverage competitions. Measure completeness, delays, request use and historical availability over a representative sample. Verify the direct Mega checkout total against the US$45 ceiling and confirm rights for the intended workload. Provider-generated probabilities serve as the operational fallback and an evaluation benchmark. Test their actual market coverage, freshness, pre-match availability and accuracy on the app’s chosen fixtures. Do not assume all four launch markets have usable fallback probabilities. API-Football documents match-result percentages and other prediction fields, but coverage varies by fixture. [6]

## 7 How AI produces a prediction

The primary predictor is Goal Hint’s AI prediction service. For each eligible upcoming match, it researches evidence, analyses likely outcomes and produces selections, estimated probabilities and a short explanation. API-Football supplies structured data throughout this process; only its ready-made predictions are held in reserve as fallback. Do not make provider predictions the normal result while using AI only to rewrite the explanation.

The AI service may combine a language model for research and reasoning with trained predictive models and probability calibration. Select the exact model and vendor during the trial. Statistical models can support or benchmark the AI service, but an independent statistics-only prediction is not the public fallback in this design. A language model’s verbal confidence or fluent explanation is never evidence that its percentage is calibrated.

### Processing sequence

1. Confirm that the fixture is in the active seven-day window, is upcoming and has time remaining before the publication cutoff. Capture its prediction cycle, run sequence, team IDs and kickoff snapshot.
2. Load current structured evidence: team form, historical results, home advantage, rest, competition context and available injury or player information. Match news to the exact teams, competition and scheduled match. Record missing data as unknown.
3. Retrieve attributable match previews, expert insights and official reporting through bounded research calls. Deduplicate syndicated articles, separate confirmed facts from rumor, and record source publication and retrieval times. Treat source text as untrusted data that cannot change worker instructions or authorize actions.
4. Ask the AI prediction service to analyse the evidence and return structured probabilities for supported market families, selections, concise reasons, key uncertainties and source references. Evaluate prediction quality and calibrate probabilities using held-out data. Do not invent a numerical news adjustment or treat model self-confidence as the displayed event probability.
5. Validate fixture identity, evidence timing, required fields, finite probability values, complete outcome groups and cross-market consistency. Match-result probabilities must sum to one; each binary pair must sum to one. Derive double chance from the selected match-result distribution. Omit unsupported exact-score outputs.
6. For any market family the AI cannot validly supply after bounded retries, fetch API-Football’s prediction. Apply the fallback contract below, then validate the combined revision. Publish supported markets atomically with a source label on each market. If no market is valid, follow the retain-previous or unavailable policy in section 5.

### Provider fallback contract

Fallback is permitted when AI times out, is unavailable, exhausts its configured budget, lacks sufficient evidence, or returns output that fails validation. It is a reliability path, not a way to choose the most optimistic probability. Missing news alone does not force fallback if the AI meets the documented evidence threshold; label the analysis “Limited news coverage.” Missing injury data does not mean a fully fit squad.

| Situation in this refresh | Published behavior |
| --- | --- |
| Valid AI prediction for a market family | Use it and label it “AI prediction”. |
| AI cannot supply a valid family; provider supplies a valid one | Use the API-Football output and label it “API-Football fallback”. |
| Provider supplies a pick without a usable probability or complete required group | Mark that market unavailable; do not invent a percentage. |
| No valid markets from either source | Keep the eligible previous revision with its original time and a delayed label, or show unavailable if none exists. |
| A later daily refresh produces valid AI output | Replace the earlier fallback or AI revision under the normal version-order rule. |

Fallback values must refer to the same fixture, prediction cycle and regulation-time settlement rules. Capture the provider, retrieval time and source update time when supplied. Check configured freshness limits, coverage and plausibility. If the provider omits its own update time, disclose that it is unknown rather than substituting retrieval time. Refuse output whose freshness cannot meet the trial’s acceptance rules. Snapshot only the permitted structured prediction fields, never image files.

For match result, require a complete home/draw/away probability group and derive double chance from that same group. Never mix an AI home-win value with provider draw or away values. Treat match result and its derived double chance as one consistency group. Total-goals fallback must specifically cover the 2.5 line with valid complementary probabilities; a different line or an unscored “over” tip does not qualify. BTTS and exact-score fallback require explicit usable probabilities or a documented validated derivation. Do not manufacture missing values, convert bookmaker odds implicitly, or average AI and provider probabilities.

Per-market fallback is allowed when the resulting revision remains coherent. Record any validation exclusions and leave conflicting or unsupported families unavailable. Each new revision is a complete public snapshot of its currently supported markets, not a hidden mixture of old and new versions. Provider-only output must not be relabeled as AI; any AI-written explanation must describe its source accurately.

### How expert predictions are used

Public previews are evidence for the AI, not a vote that automatically determines the winner. Track independent sources and their historical reliability where available. Copies of one article count as one source. Describe material disagreement and test whether expert or news features improve predictions. Keep the provider fallback distribution outside the primary AI decision path so the two sources remain distinguishable.

### Public explanation and revision history

Show two to four reasons, one key uncertainty, source links, prediction origin and the last successful publication time. A provider fallback can show a concise provider-based explanation without implying independent AI research. Explain that forecasts can change daily while the match remains eligible. Previous revisions are available within the match page with their timestamps and superseded status; they are not extra cards in the main feed.

Distinguish estimated event probability, evidence completeness and freshness. Do not expose prompts, internal model reasoning or worker logs, and never invent citations. Final results always refer to the locked revision, even when an earlier revision predicted a different outcome.

## 8 Accuracy and honest probability scores

A 70% probability means that, across many comparable forecasts assigned roughly 70%, the event should occur about seven times in ten. It does not mean this particular game is safe or that the AI is 70% sure its explanation is correct. A calibrated forecast can still be wrong. [7]

### Public probability rules

- Use “Estimated probability” as the label. Avoid guaranteed wins, certainty badges and 100% pre-match forecasts.
- Store full numeric precision and normally display whole percentages. At rounding boundaries, use “Less than 1%” or “More than 99%” rather than showing 0% or 100%. Reject invalid exact-certainty outputs for review.
- Round mutually exclusive outcome groups together, for example by allocating rounding remainders, so displayed numeric groups still total 100%. Where boundary labels replace numbers, explain that displayed values are approximate.
- Only describe a probability range as historically calibrated when there is adequate evaluation evidence. At launch, label unvalidated estimates provisional and state that the performance history is still developing.
- Do not select and hide predictions after seeing results. Score the revision locked before kickoff, not the best-performing historical revision. Keep unavailable fixtures, failed refreshes and voids visible in the coverage totals.
- Apply probability checks to AI and provider fallback alike. A source switch does not justify a higher percentage or an untested accuracy claim.

### Evaluation before launch

Use chronological training, validation, calibration and final test periods. Fit only on earlier fixtures and evaluate on later fixtures. Select thresholds and model settings before reading the final test results. Prevent leakage from final scores, post-match articles, later lineup records and statistics updated after the prediction cutoff.

Historical news and provider prediction revisions often cannot be reconstructed reliably as they appeared at a past cutoff. Where timestamped snapshots are unavailable, test reconstructable structured baselines and run the complete AI and fallback process prospectively in shadow mode. Do not present a hindsight reconstruction as a genuine pre-match test. Evaluate day-ahead and several-days-ahead predictions separately; training and evaluation must preserve the evidence available at each revision time.

| Measure | What it answers | Reporting rule |
| --- | --- | --- |
| Hit rate | How often the selected event was correct. | Correct ÷ (correct + incorrect), with count, period and market. |
| Brier score and log loss | How well probabilities score against outcomes. | Compare like markets on identical fixtures; lower is better. [7] |
| Calibration by probability band | Whether stated percentages match observed frequencies. | Show band counts and uncertainty; these metrics complement scoring rules. [7] |
| Coverage and abstention | How much of the fixture set receives valid forecasts. | Show AI, provider-fallback, delayed, unavailable, failed and void counts with clear denominators. |

### What visitors can verify

Include a small performance section within How it works, linked from Results. Show market-specific settled counts, date range and prediction source, with model or provider version where available and access to the locked revisions. Report AI and provider fallback performance separately, with a clearly labeled combined total. Revisions never increase the fixture count; report optional earlier-horizon evaluations separately from headline performance. A toy example is “62 correct out of 100 settled match-result predictions: 62%.” Pending and void items are excluded from that denominator and shown separately.

Compare the AI predictor with provider fallback and simple team-strength and league-frequency baselines on the same held-out fixtures, matched for evidence cutoff and prediction horizon. Publish no promised accuracy target such as 90%. Release a new model only after predefined out-of-time tests show acceptable probability quality, calibration and coverage; retain the previous version if it regresses.

## 9 Technical architecture and state

### Framework baseline

As checked on 7 October 2026, Next.js lists 16.4 as its latest release and its documentation shows 16.4.0. Use the newest compatible stable patch when development begins, then pin the dependency lockfile. The Prisma release-status page identifies ORM 8 as a release candidate and the ORM 7 client as 7.10.0. Use the supported stable Prisma 7 line for this design, and recheck before implementation. [1][2]

Use compatible stable releases of Redux Toolkit, react-redux and styled-components, plus a supported Node.js LTS runtime that satisfies every chosen package. Record exact versions in the repository. Avoid unqualified Prisma “latest” installation while it resolves to a release candidate. [2]

### Component responsibilities

| Layer | Responsibility |
| --- | --- |
| Next.js web app | Server-rendered pages, metadata, validated public read endpoints and protected operations endpoints. |
| Prisma and PostgreSQL | Typed persistence, migrations, uniqueness rules, transactions and indexed search. |
| Durable job queue and workers | Daily seven-day selection, repeated per-match analysis, ordered revision publication, cutoff locks, retries and deterministic settlement. |
| AI prediction service and fallback controller | Primary AI analysis and predictions; validated provider fallback per market; provenance and probability checks. |
| Football and research adapters | Authenticated provider calls, normalization, source provenance and one shared API-Football request limiter across pollers and workers. |
| Public data cache | Fast public pages and structured responses, with invalidation after publication or settlement. Images load directly from remote URLs. |

Keep the web app and workers in one repository with shared schemas and domain services. Deploy workers in a runtime that permits durable background work. A scheduled job or hosting-operator command should enqueue a job and return promptly; it should never research hundreds of fixtures while a visitor waits. A managed queue or a durable PostgreSQL-backed queue is sufficient initially; choose one after measuring the workload. Run the 15-second poller in a long-lived worker with a renewable single-owner lease. Keep its network calls outside visitor requests and do not depend on overlapping short cron invocations to maintain that loop.

### Redux Toolkit boundaries

Use Redux Toolkit for shared mutable interface state, such as filter drafts and view preferences. Applied date, market, league and search terms belong in the URL. On navigation, initialize the interface from the URL so Back, refresh and shared links behave consistently.

Create a store per request or mounted provider instance; do not share a module-level store between server requests. Server Components fetch public data directly from server services and do not read or mutate Redux. Limit RTK Query to browser-side refreshes where needed. [3]

Render initial match data in the server response. If a client query refreshes that data later, compare the returned prediction-cycle and revision identifiers before replacing a card. A slower response must never restore an older prediction. Define one explicit handoff to avoid duplicate lists and stale versions. Do not copy the database into Redux or use local storage as the source of truth. Keep Prisma and provider credentials entirely outside the client bundle.

## 10 Database and audit records

The following is the proposed logical schema. There are no visitor User, Account, Session, password or verification-token tables. Exact Prisma fields can be finalized after validating API-Football responses. Preserve normalized fields used by queries alongside versioned evidence and prediction snapshots. “Override” changes the current reference; it does not delete or rewrite previous predictions.

| Entity | Core fields and purpose |
| --- | --- |
| Competition and Season | Internal ID, provider mapping, name, country, season and coverage settings. |
| Team | One canonical row per distinct team: internal ID, full name, aliases, remote `logoUrl` and update time. |
| TeamProviderMapping | Provider and external team ID mapped to the canonical `teamId`; unique on provider plus external team ID. |
| Fixture | Provider mapping, season, `homeTeamId` and `awayTeamId` foreign keys, kickoff UTC, EAT date, status, active prediction-cycle ID and last sync time. |
| PredictionCycle | Fixture, schedule/cycle version, publication cutoff, state, `currentPredictionSetId`, `lockedPredictionSetId`, lock time and void reason. A postponement can create a new cycle without duplicating the fixture. |
| DailyRun and RunFixture | Unique EAT run date, ordered run sequence, seven-day start/end, selection time, manifest, fixture/cycle IDs, processing states and exclusions. |
| EvidenceSnapshot | Fixture and cycle, cutoff, statistics, availability facts, missing data and content hash; shared Team references rather than duplicate team records. |
| SourceRecord | URL, publisher, title, publication/retrieval times, extracted claims and reuse metadata. |
| ModelVersion | AI predictor, research model, prompt version, training window, calibration version and evaluation summary. |
| PredictionSet | Fixture/cycle/run IDs, revision ID, evidence/model references, generated/published times, immutable prediction payload and superseded-revision link. |
| MarketPrediction | Set, market family, complete probability group, displayed selection, source `AI` or `PROVIDER`, provider/model provenance (`API_FOOTBALL` for fallback), fallback reason, provider retrieval/update times and settlement rule version. |
| Result and Settlement | Verified regulation score, provider status, result revision, locked set and market references, correct/incorrect/void outcome and settlement time. |
| JobRun and AuditEvent | Idempotency key, attempts, lease, validation/failure reason, usage cost, API request counts, actor, publication decisions and reference changes. |
| ApiUsageState | Shared provider-account quota period, dispatched-request counters, observed remaining quota, limiter state, poller lease and last successful sync. Persist across worker restarts. |

### Constraints that protect correctness

- Reuse one Team row across all fixtures, competitions and seasons. Fixtures, prediction records and statistical snapshots reference its ID; they do not embed duplicate Team records. Historical statistics may have their own dated records linked to that same team.
- Resolve incoming provider team IDs through TeamProviderMapping and use transactional upserts with database-enforced uniqueness. Repeated imports and concurrent workers must reuse the existing team. Adding a new fixture, season or prediction revision must not create another Team row.
- When an additional verified external ID refers to an existing team, verify the identity and add a mapping to the existing row. Do not deduplicate by name alone: similarly named clubs, women’s teams, youth teams and reserve teams can be distinct. Hold ambiguous identities for resolution before creating a new team or importing dependent fixtures.
- Make provider plus fixture ID unique, and each daily run date unique. Make each run, fixture and prediction-cycle refresh key unique, with the model configuration pinned to that job. Enforce at most one accepted published set per refresh key; a changed model version must not create a second publication on retry.
- Keep probabilities between zero and one, with explicit checks for related market sums. Store numeric precision consistently and format only at display time. Keep each outcome group under one source and enforce the double-chance derivation rule.
- Publish the set, its market rows and the current-reference update in one transaction. Lock or compare-and-swap the cycle row; check the run order, current cycle, fixture status, window and cutoff again inside that transaction. Serialize publication with locking and rescheduling so a concurrent job cannot publish into a closed or obsolete cycle.
- Once a cycle is locked, reject every change to its current/locked prediction payload, selection or probability. Result corrections may update settlement only. Keep publication and evidence timestamps immutable.
- Reference the exact locked prediction and market in Settlement. Enforce one headline settlement per fixture cycle and market; superseded revisions cannot create additional headline wins or losses.
- Index fixture kickoff, EAT date, status, competition and team relations; normalized search terms; cycle/run lookups; and current/locked prediction references. Seven-day range queries must use these indexes.

### Corrections and history

Keep every successfully published revision with its original evidence, source and times. On a new publication, update the current reference and record the old revision as superseded without rewriting its payload. The ordinary upcoming-match page resolves the current reference; a completed match resolves the locked reference. An optional revision parameter opens read-only history within that page and never changes what is scored.

Store score revisions and settlement changes in an audit trail. A corrected result can change a badge with a visible correction time, but cannot select a more favorable prediction revision. For postponements, preserve the old void cycle and new eligible cycle separately. Historical results follow the relevant locked cycle; a later prediction for a rescheduled fixture cannot replace the old result record.

## 11 Endpoints and background operations

Keep the public API read-only and accessible without visitor authentication. All public GET endpoints below require no sign-in, session cookie or visitor API key. Validate parameters, limit page size and return only visitor-facing fields. Keep job triggers and recovery operations private, using scheduler secrets, workload identity or the hosting platform’s access controls rather than app user accounts. A page view or filter change must never launch AI work.

| Endpoint or job | Contract |
| --- | --- |
| GET /api/matches | Accept a date or validated seven-day range, search, league, market, status and pagination. Return one card per fixture with current/locked revision IDs, source labels, probabilities and freshness. Permit historical results outside the forward prediction window. |
| GET /api/matches/:id | Default to the current revision for upcoming matches and locked revision for results. Include sources and settlement; allow an explicit read-only revision lookup for history. |
| GET /api/performance | Return market-specific counts by period, prediction source and model/provider, based on locked revisions. |
| Daily selection job | Create/resume the EAT run, commit its seven-day manifest and enqueue missing fixture-refresh jobs. |
| Prediction worker | Attempt AI, apply validated provider fallback where needed, and publish a newer revision atomically before the cutoff. |
| Prediction lock job | Lock the latest eligible revision for each cycle at the cutoff; all publication paths independently enforce the same lock rules. |
| Result sync and settlement | Run shared 15-second live and 60-second date/result polling, handle rescheduling, verify regulation scores and settle locked markets. |
| Restricted recovery action | Resume eligible failed/unpublished jobs or correct provider mappings with an audit record. Never bypass a cutoff or rewrite a published job. |

### Retries and concurrency

Assume the scheduler and queue can deliver a job more than once. Use database uniqueness and renewable leases to obtain one publication per refresh job. Resume that run’s committed fixture manifest on retry. An incomplete import remains explicitly incomplete until all required pages are available or the run is marked degraded.

Attempt AI first within a bounded timeout and retry budget, leaving enough time and quota for provider fallback before the cutoff. Distinguish invalid output, insufficient evidence, timeout, rate limiting and budget exhaustion. Retain source-specific usage and failure reasons. Once that refresh job has published, retries return the existing revision; a later daily run performs the next revision.

Limit concurrency to provider, search and AI rate limits. Honor rate-limit responses and use capped exponential backoff. Expire crashed-worker leases safely. Reject older-run publication after a newer revision, including during recovery. A watchdog detects missed runs, stalled jobs and missing locks without treating scheduler retries as new prediction cycles.

If Vercel Cron is chosen, account for function duration limits and implement retries outside the cron invocation: failed cron invocations are not automatically retried. Hosting must support the required daily trigger, cutoff enforcement and result-polling frequency. [12]

### Shared API-Football request limits

Apply these app limits across the entire API-Football account workload, not separately to each server, replica, job or API key. The published Mega limits are higher; the difference is deliberate operating headroom. [14][15]

| Limit | Goal Hint configuration |
| --- | --- |
| Dispatch rate | At most 12 requests in any rolling second, paced evenly rather than released in bursts. |
| Minute limit | At most 720 requests in any rolling 60 seconds. |
| Daily application ceiling | At most 120,000 total dispatched requests in the provider’s quota day, including polls, research inputs, fallback, manual tools and retries. |
| Reserved capacity | Keep 20,000 of the 120,000 for status/result tracking, cutoff checks, time-critical fallback and essential recovery. Pause discretionary data enrichment before it consumes this reserve. |
| Provider headroom | Leave the remaining 30,000 requests below Mega’s published daily quota unused by normal application work. Do not silently increase the app ceiling. |

Use one shared atomic limiter and daily counter, backed by durable shared state. Reserve a request slot at dispatch and count every attempt conservatively, including retries and requests with uncertain network outcomes. Deduplicate identical in-flight requests and reuse fresh structured responses. Workers must pass through the same limiter; scaling replicas cannot multiply the allowance. Pause provider calls if shared limiter state is unavailable, while serving the last stored results.

The API exposes separate daily and minute remaining-quota headers: `x-ratelimit-requests-remaining` and `X-RateLimit-Remaining`, together with their corresponding limit headers. [15] Reconcile them conservatively with local counts and in-flight requests; an out-of-order response must not restore already spent allowance. Apply whichever ceiling is lower if the reported subscription limit changes. Verify the provider’s actual daily-reset boundary during integration; do not reset counters merely because midnight EAT launched a new prediction run. After restart or an uncertain reset, verify the quota state before resuming bulk work.

Prioritize final-result reconciliation and cutoff safety, then live/date polling and near-kickoff fallback, then daily prediction inputs, with optional enrichment last. Estimate remaining required result calls before dispatching discretionary work. If capacity tightens, slow refresh intervals and expose stale-data timestamps. At the 120,000 app ceiling or a lower reported provider limit, stop outbound work until a verified reset; never bypass the ceiling to maintain a freshness target.

On HTTP 429, pause dispatch through the shared limiter, honor any retry delay supplied and retry with capped exponential backoff and jitter. Inspect response-body errors as well as HTTP status. Daily exhaustion waits for reset rather than looping retries. Alert on subscription expiry or credential failure. API-Football also applies IP-level protections, so prefer a worker with dedicated outbound IP where practical and include its hosting cost separately. These controls reduce throttling risk; they do not promise that external rate limiting can never occur. [15]

### Caching and freshness

Public requests read stored predictions and scores; visitors never call API-Football directly. Cache by locale, EAT date/range, fixture and permitted filters, and track prediction revision identifiers plus score-update timestamps. Invalidate affected feeds and match data after material score changes, publication, locking, rescheduling or settlement. Keep active-match response caches short enough to support the poll cadence. On visible pages with active matches, browser refreshes may read Goal Hint’s own cached endpoint every 15–30 seconds; pause or slow them in background tabs. These requests must not generate provider calls. Roll today and the forward window at midnight EAT, and reject stale prediction revisions or score responses independently.

Show the actual last successful publication and the latest refresh status. Keep an earlier valid forecast visible during processing or a failed refresh, with a delayed label where appropriate. Never relabel retained evidence or provider output as newly generated. Card probability, source label and explanation must always come from the same published revision.

With the 60-second result sync, target final-result badges within two minutes of API-Football publishing a reliable eligible final result under normal operation, including internal processing and cache refresh. Provider delays, retries or quota protection can extend that interval; show the actual last-successful-sync time and a delayed label. Continue tracking unresolved matches across midnight and after they leave the forward window. Recheck recent results for corrections before reducing polling. Score and result checks cannot regenerate predictions or change their locked revisions.

Use the hosting platform’s existing job tools, private operator commands and structured logs to inspect window/run status, missing data, AI and fallback failures, stale forecasts, quota use, costs and recovery. Do not build an in-app admin login, authentication system or admin dashboard for launch. Hosting-platform access remains outside the visitor experience.

## 12 SEO and language infrastructure

### A small navigation with useful searchable pages

Use `https://goalhint.com` as the production metadata base and canonical origin. Redirect the `www` hostname to this origin. Use “Goal Hint” as the site name, “Goal Hint | Daily Football Predictions” as the homepage title, and the app name as the suffix for unique match-page titles.

Use /en as the English homepage, /en/predictions/YYYY-MM-DD for date archives, /en/matches/fixture-id/home-v-away for fixture pages, and /en/how-it-works for the methodology. The ID is the identity; a changed slug redirects to the canonical URL. Results is a view of the same dated feed. The root URL redirects consistently to /en at launch.

A small number of page templates can produce useful match URLs without adding navigation steps. Keep historical match pages online with the final locked prediction, its source and evidence timestamp, final score and outcome. Show earlier revisions within the same page; keep revision-query URLs out of the index and canonicalize them to the match URL. Do not generate thin team, league, keyword or AI article pages merely to increase URL count.

- Server-render team names, kickoff, probabilities, explanation and result. They must be readable before client JavaScript runs.
- Use unique titles and descriptions, canonical URLs and social preview metadata through the Next.js metadata APIs. Generate a sitemap containing valid canonical pages. [8]
- Keep site search and arbitrary filter combinations out of the index. Define canonical and noindex rules deliberately; do not block a URL in robots.txt when a crawler needs to read its noindex directive.
- Use accessible links for date archives, pagination and match details. Return real 404 responses for unknown fixtures; show honest unavailable states for known fixtures.
- Add accurate supported structured data where it matches visible content. Do not invent ratings or imply a guaranteed search enhancement. Structured data does not guarantee a rich result. [10]

### Content that earns repeat visits

Write short original explanations with identifiable sources and an accurate AI disclosure. Explain the method, limitations and correction policy. Avoid invented experts and repetitive filler. These choices follow Google’s emphasis on helpful content and transparent authorship. [9]

Measure search impressions, indexed pages, click-through rate, returning visits and match-detail use. SEO makes discovery possible; ranking also depends on competition, content usefulness and the site’s reputation. No particular position or traffic volume is promised.

### English now and additional languages later

Extract every interface string into English translation messages. Use stable keys, plural-aware messages and Intl formatting for numbers and dates. Keep market codes, statuses and team IDs language-neutral. Store explanations separately from numeric predictions so translations do not recalculate or change probabilities.

Prepare locale-prefixed routes and an English fallback. Show a language selector only when another complete language is available. When translations launch, provide language-specific titles, canonical URLs, lang attributes and reciprocal hreflang links. Do not create empty language versions. [11]

Allow translated text to expand, and use logical spacing properties so right-to-left support can be added. EAT remains the reporting-day rule across languages. An optional local-time display may show a second kickoff time, clearly labeled, without changing its EAT match date, the seven-day eligibility window or the recorded run of any prediction revision.

## 13 Performance accessibility and security

### Performance targets

Target mobile Core Web Vitals at the 75th percentile: Largest Contentful Paint within 2.5 seconds, Interaction to Next Paint within 200 milliseconds, and Cumulative Layout Shift no more than 0.1. Measure real traffic after launch and use representative low-end Android devices and constrained networks during development. [13]

Render a small initial page of cards, proposed at 30, and paginate the rest. Reserve dimensions for remote images and lazy-load those below the first screen. Load logos directly from the URL on the shared team record, with no app-side image download, optimization or persistent cache. Avoid shipping worker code, large raw provider payloads or unused client libraries. Search and filters should respond promptly from the app’s own indexed data.

### Accessibility and responsive behavior

- Support a 320 px wide viewport without horizontal scrolling. Test common phone widths, tablet and desktop layouts, 200% text zoom and long names.
- Use semantic headings, real buttons and links, labeled form controls, visible keyboard focus and a logical tab order. Outcome badges must include readable text, not color alone.
- Announce search-result counts and refresh failures without repeatedly interrupting screen-reader users. Provide an obvious way to dismiss filter panels and return focus to their trigger.
- Respect reduced-motion settings. Keep status contrast readable in every supported theme. Use team names as the primary accessible identity; avoid redundant logo announcements.

### Optional themes

Ship a polished light theme first. The shared styled-components tokens should allow a dark palette later without changing card structure or domain logic. If a theme switch is included, persist the preference locally and apply a stable server-compatible initial theme to prevent a flash or hydration mismatch. Do not add a settings page solely for this switch.

### Security and data handling

Keep API-Football credentials, database URLs and AI keys in server-side secret configuration. Never expose them through public environment variables. Visitors have anonymous read-only access; scheduled triggers and private recovery operations require service-level authorization. Validate scheduler secrets or workload identity before accepting internal mutations. Goal Hint has no visitor login sessions or cookie-authenticated public mutations.

Validate provider and AI outputs against schemas. Sanitize text, allow only safe link schemes, and protect server-side fetches from arbitrary internal addresses. Apply rate limits to public search endpoints. Redact secrets from logs and give services only the database permissions they need.

Keep every public feature account-free and minimize visitor data. Document analytics and retention choices. Before activating advertising, verify the applicable privacy and consent requirements for the actual audience and advertising service. This is an implementation decision for launch markets, not a legal classification of the product.

### Backups and recovery

Enable automated database backups and point-in-time recovery where supported. Verify a restore before launch and define who responds to a failed daily run. Preserve published predictions, results and audit records under a documented retention policy, while limiting raw source storage to permitted use. A deployment rollback must retain the existing forecast history and use a compatible database schema.

## 14 Operating costs and delivery phases

### Confirmed API-Football Mega budget

Use the direct API-Football Mega plan. Its advertised monthly price is US$39, with 150,000 daily requests and access to all endpoints; the documented rate ceiling is 900 requests/minute or 15/second. These vendor figures were checked on 7 October 2026 and must be verified against the actual account during setup. [14][15]

| Budget item | Decision |
| --- | --- |
| Selected plan | Direct Mega, monthly subscription duration. |
| Advertised plan price | US$39/month. [14] |
| Hard API-Football spending ceiling | US$45 in a month, including applicable taxes and payment charges. |
| Difference at the advertised price | US$6 available for such charges; this is not a second paid service budget. |
| App request ceiling | 120,000/day, including a 20,000-request reserve for essential operations. |
| Costs outside this ceiling | AI, news/search, hosting, dedicated network egress, database, monitoring and domain renewal need separate budgets. |

The Mega choice is a specification decision; no subscription has been purchased through this write-up. Before purchase or renewal, check the final payable amount. If it exceeds US$45, flag the budget conflict rather than switching plans, adding services or exceeding the cap automatically. API-Football’s direct pricing page says requests stop when its quota is exhausted rather than attracting overage charges, and prepaid subscriptions expire back to the free tier without automatic renewal. Add an expiry reminder and reconcile the actual active limits before dispatch. [14]

### Refresh request arithmetic

The following is a full-day baseline assuming one request per poll response and uninterrupted polling. Inactive-period pausing can reduce it. These are request counts, not per-request prices.

| Poll | Calculation | Base requests/day |
| --- | --- | ---: |
| Shared live feed every 15 seconds | 86,400 / 15 | 5,760 |
| Current EAT date every 60 seconds | 86,400 / 60 | 1,440 |
| Combined live/date polling | 5,760 + 1,440 | 7,200 |

The baseline is 4.8% of Mega’s 150,000-request quota and 6% of the 120,000 app ceiling. It is not the total app workload. Add the seven-day fixture selection, unresolved-ID batches, structured inputs for AI, fallback calls, applicable pagination, diagnostics and retries. A simple seven-date import starts with seven date requests, reduced when an identical fresh response is reused. Count extra pages only where the endpoint supports pagination, and follow the actual response contract. Visitor count does not multiply provider polls because all visitors share stored results.

### Control costs before expanding coverage

Operating cost depends mainly on the data subscription, the number of fixture-refresh jobs across the seven-day window, search usage, AI input and output tokens, fallback calls, worker time and hosting. Count refreshes, not only distinct matches: the same upcoming match may be analysed in as many as seven daily runs. Visitor traffic should mostly use cached stored predictions rather than multiply AI calls.

Use this planning formula: monthly cost = data subscriptions + research and AI usage + hosting and structured data storage + monitoring. Calculate research and AI usage from the sum of daily fixture-refresh jobs, requests per refresh and actual contracted rates. Budget for the API-Football subscription and the request volume used by both data collection and fallback predictions, alongside separate AI and news-research usage. Include retries and maintenance work. Free public access does not imply free operations.

The budget excludes app-managed image-file storage, image processing and an image CDN because browsers load images from remote URLs. Database storage includes URL strings, one canonical record per team, fixtures, prediction revisions, evidence and audit history. Revision history increases structured-data storage, but does not duplicate team records or image files. Referencing shared team records prevents repeated storage of team details for every match or season. The remote provider’s applicable service charges remain part of its subscription.

Illustrative arithmetic only: 500 prediction refreshes per day at a combined search and AI cost of US$0.02 each would cost US$10 per day, or US$300 in a 30-day month. If approximately 500 matches take place each day and the full seven-day slate is refreshed daily, the steady workload could approach 3,500 refreshes per day: US$70 per day or US$2,100 in a 30-day month at that same assumption. These figures exclude the Mega subscription, other operating costs and retries. API-Football fallback calls consume the shared request allowance; do not assume an additional per-call charge on the direct plan. US$0.02 is not a vendor quote; measure actual per-refresh costs and the seven-day schedule before choosing the budget.

- Cache reusable team history and duplicate news, but verify evidence freshness for every scheduled refresh. Budget requests, tokens and time per refresh, and share its evidence across markets. Reused source material must keep its original timestamps.
- Enforce the US$45 monthly API-Football ceiling and the shared limits in section 11. Set separate AI and research spending limits, and preserve quota for fallback and result tracking. Prioritize the nearest kickoffs. If the AI budget is exhausted, attempt provider fallback within its reserved budget; if both paths are unavailable, retain eligible prior predictions with a delayed label or show unavailable. Record skipped and deferred refreshes.
- Benchmark at 100, 500 and 1,000 fixture-refresh jobs, then at the expected full seven-day volume before increasing coverage. Measure AI success, fallback rate, job duration, cutoff misses and cost per published revision. Plan for observed workloads rather than millions of daily games.

### Delivery sequence within the agreed scope

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 1  Data and model trial | Mega integration validation, AI predictor evaluation, fallback-market validation and settlement mapping. | Seven-day coverage, rights, quota-reset behavior, actual checkout total, AI quality and separate operating budgets are documented. |
| 2  Product foundation | Next.js, Prisma, Redux Toolkit and styled-components; responsive cards and core routes. | Server-rendered pages and styles work across phone sizes. |
| 3  Daily pipeline | Seven-day selection, AI/fallback jobs, ordered revisions, probability checks, cutoff locks and settlement. | Overlapping daily runs and failure recovery cannot duplicate jobs, overwrite newer revisions or change locked predictions. |
| 4  Validation and launch | Shadow forecasts, accessibility checks, SEO metadata and monitoring. | Acceptance criteria pass and performance claims match the evidence. |

### Future advertising readiness

Keep future ad locations between groups of cards, never inside prediction labels or navigation controls. Feature-flag ad components off at launch. When enabled, reserve their space to prevent layout jumps, label advertisements clearly and preserve the free core experience. No ad marketplace, advertiser portal, payment flow or subscription system belongs in this build.

## 15 Acceptance criteria and launch decisions

These are proposed acceptance criteria for the development handoff. Numerical workload and latency targets should be confirmed against the selected API-Football plan and deployment before they become service commitments.

| Area | Required evidence |
| --- | --- |
| Simple navigation | A visitor can see today’s picks immediately, find a team and open a match in one tap, with no account required. |
| No visitor authentication | In a fresh browser session, every public page and read endpoint works without sign-in, a visitor token or an authentication cookie. No registration, account screens, auth SDK or user/session tables are present. Internal job triggers still reject unauthorized requests. |
| Mobile layout | No overflow at 320, 360, 390 and 430 px; long names, broken logos, keyboard use and zoom remain usable. |
| Remote images | The database stores image URL strings only; browsers request images directly from approved remote hosts. No image files, image blobs, app image proxy or persistent image cache are created. Broken URLs show a text placeholder. |
| Unique teams | Importing the same team repeatedly or concurrently, or using it in different seasons and competitions, leaves one canonical Team row. Fixture references and verified provider aliases resolve to that row; ambiguous identities are held for resolution. |
| Styling and rendering | The production page includes readable match HTML and styled-components CSS before hydration, with no style flash or hydration errors. |
| Daily timing and weekly window | Tests prove today plus six days, the exclusive day-seven boundary, 21:00 UTC trigger, midnight rollover and rejection outside the window. Previous-day predictions remain usable for eligible early kickoffs. |
| Publication integrity | One revision per refresh job; newer valid runs replace older public predictions; older late workers and stale client responses cannot roll back a revision. All initial and replacement publications obey the cutoff. |
| AI priority and fallback | Valid AI is used first; timeout, invalid output and budget exhaustion exercise provider fallback. Sources are labeled, incomplete probability groups are rejected and missing markets remain unavailable. |
| Revision retention and locking | Earlier revisions remain read-only; failed refreshes preserve eligible prior output with its age. The cutoff locks one eligible revision, and neither post-kickoff AI recovery nor provider updates can replace it. |
| Forecast quality | Probabilities pass bounds and consistency checks; explanations link to real evidence; missing data cannot generate invented facts. |
| Settlement | Tests cover ordinary results, draws, 2 versus 3 goals, extra time, penalties, postponement cycles, cancellation and provider corrections against the locked revision. |
| Failure recovery | Quota exhaustion and provider outages preserve old records, show honest delays and allow safe resumption. |
| Mega usage limits | Concurrent workers share the 12/second, 720/minute and 120,000/provider-day ceilings. Retries count, the essential reserve is protected, out-of-order quota headers cannot restore spent capacity, and restart/expiry/reset cases recover safely. |
| Refresh cadence | One active poller serves the whole app. Live polling uses 15-second intervals, date/results use 60-second intervals, and final badges meet the proposed two-minute target in normal conditions. Cross-midnight and missing-live-response cases still receive explicit result checks. |
| Separate AI cadence | Live-score, result and visitor refreshes never enqueue extra AI jobs or change locked forecasts. |
| API-Football budget | The direct Mega selection and final payable monthly amount are recorded; API-Football spending stays within US$45, with other operating costs budgeted separately. |
| Search and SEO | Search covers unloaded cards; match pages have metadata, canonical URLs and crawlable links; thin filter pages are excluded. |
| Performance history | Correct/incorrect counts reconcile to locked revisions once per fixture and market. AI/fallback totals, pending, unavailable and void counts are separate; superseded revisions cannot inflate the totals. |
| Language readiness | English messages are externalized; a longer test translation does not break cards or controls. |

### Decisions needed before implementation

- The app name is **Goal Hint** and the selected domain is **goalhint.com**. Complete domain registration and DNS configuration before launch.
- Public access is confirmed as free and account-free. No visitor authentication system is part of this build.
- Choose the first competition set and separate monthly budgets for AI/research, hosting and other operating costs. The API-Football ceiling is already fixed at US$45/month.
- API-Football direct Mega is confirmed for football data and prediction fallback. Verify its checkout total, active limits and quota-reset behavior; validate competition coverage, direct remote-logo display, supported fallback markets, freshness and permitted reuse.
- Select the separate news-research provider and primary AI predictor after testing; confirm the applicable source-reuse permissions.
- Confirm the optional exact-score display and the measured refresh budget for the four launch market families. The agreed defaults are a rolling seven-day window, daily midnight EAT analysis, AI priority, provider fallback and replacement of current predictions until five minutes before kickoff. Document late-news limitations of the daily cadence.
- Select hosting that supports the continuous poller, a durable worker and shared request limiter, and the tested AI prediction/calibration configuration. Keep light theme and English as defaults unless there is a clear reason to expand them.

The deliverable for launch is a fast public prediction feed with verifiable outcomes. Additional languages, optional themes and advertising can use the prepared infrastructure later without introducing new product modules.

## 16 Sources and implementation references

Official sources checked on 7 October 2026. Framework versions, provider coverage and service plans must be rechecked when implementation begins. The architecture, workflow limits and acceptance criteria in this document are proposed product decisions; citations support the external technical facts.

[1] [Next.js release announcements](https://nextjs.org/blog)

Release line and stable-version check.

[2] [Prisma ORM release status](https://www.prisma.io/docs/orm/release-status)

Stable ORM 7 and ORM 8 release-candidate distinction.

[3] [Redux Toolkit setup with Next.js](https://redux.js.org/usage/nextjs)

Per-request stores, Server Components and client data fetching.

[4] [Next.js guide to CSS in JS](https://nextjs.org/docs/app/guides/css-in-js)

Styled-components compiler option and server style registry.

[5] [Styled-components advanced usage](https://styled-components.com/docs/advanced)

Theming and server-rendering concepts. See also the [API reference](https://styled-components.com/docs/api#transient-props) for transient props and global styling.

[6] [API-Football getting started guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

Fixture, injury, prediction and coverage capabilities.

[7] [Scikit-learn probability calibration](https://scikit-learn.org/stable/modules/calibration.html)

Calibration curves, Brier score and log-loss interpretation.

[8] [Next.js metadata and social images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)

Server-managed page metadata.

[9] [Google guidance on helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

Useful original content and transparent AI authorship.

[10] [Google structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

Visible-content alignment and rich-result limitations.

[11] [Google localized page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)

Language versions and hreflang relationships.

[12] [Vercel cron job management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

Invocation duration and lack of automatic failed-job retries.

[13] [Web Vitals guidance](https://web.dev/articles/vitals)

Mobile loading, responsiveness and stability thresholds.

[14] [API-Football direct pricing](https://www.api-football.com/pricing)

Mega price, daily allowance, included endpoints and prepaid quota/expiry terms. Checked on 7 October 2026.

[15] [API-Football rate limiting](https://www.api-football.com/news/post/how-ratelimit-works)

Minute/second ceilings, quota headers, shared-IP protections and retry guidance. Checked on 7 October 2026.
