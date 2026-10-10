# Goal Hint — Implement the approved match-details UI

You are working in the existing **Goal Hint** application. Implement the match-details experience using the two attached, approved screenshots: one desktop dashboard and one mobile screen. Deliver working application code, not another design, static mockup, or implementation plan alone.

## 1. Inspect the project before changing it

Read the repository instructions, `app-write-up.md`, and relevant agent/Cursor rules where present. Inspect the existing match route, match-list navigation, shared components, theme, state management, database models, API-Football integration, and prediction services.

Use the project's existing **Next.js, Prisma, Redux Toolkit, and styled-components** architecture and installed dependency versions. Reuse established patterns; do not introduce another styling framework, replace the state architecture, upgrade dependencies unnecessarily, or rebuild unrelated screens. Give a brief implementation plan, then implement it.

Preserve these product requirements:

- Brand the application **Goal Hint**, not the screenshots' placeholder “GoalPredict.” Keep the existing logo and application navigation where available.
- Keep visitor access free and unauthenticated. The screenshot avatar/Profile controls do not authorize adding login, signup, or account requirements. Reuse existing unauthenticated navigation and do not add inert account controls.
- Reuse **API-Football** and the existing server-side integrations. Existing valid AI predictions take priority; provider predictions are the fallback. Preserve the latest-valid-prediction replacement rules, existing history/locking behavior, rolling seven-day prediction window, and midnight East African Time refresh policy. Historical analysis is not restricted to seven days.
- Store only remote image URLs, never copies of team, player, league, or venue images. Reuse canonical team records; do not create duplicate teams when loading a fixture or its history.
- Preserve existing API budgets, rate limiting, caching, and refresh policies. Expanding a UI section must not trigger a fresh AI prediction job.

## 2. Treat the screenshots as the visual reference

Reproduce their information hierarchy, proportions, spacing, typography, borders, rounded corners, subtle shadows, icons, and restrained use of color. Use light surfaces, navy text, blue interactive controls, and orange prediction highlights. Match the approved layout rather than substituting a generic dashboard.

**Desktop:** Retain the application header and back navigation. Build a compact fixture banner containing competition, teams and crests, available standings/form, kickoff, venue/weather, and a featured prediction. Below it, show compact market-summary tiles. Recreate the dense, asymmetric content grid: All Markets & Odds on the left; Team Comparison, Team Form, and Probable Lineups in the middle; Head-to-Head and Key Players on the right; News, Injuries, Match Context, and Referee in the lower area. Use content-driven sizing, not large fixed-height empty cards.

**Mobile:** Follow the attached match header, compact fixture summary, orange featured prediction, market summaries, initially expanded All Markets section, and compact section cards beneath it. Use two-column summary cards when readable and one column on narrow screens. Preserve the existing bottom navigation without covering page content. Use familiar abbreviations such as H2H, BTTS, O2.5, U2.5, 1X, and X2, with accessible full labels where needed. Do not squeeze five tiles or a desktop-sized table into unreadable columns.

The screenshots supply **appearance, not production data**. Do not hardcode their fixtures, player memberships, dates, probabilities, odds, injury reports, standings, or news. Derive weekday/date/time from actual kickoff data and use the app's configured timezone, with Africa/Kampala as its existing default where applicable.

## 3. Core interaction: every section opens its own complete nested details

Implement the hierarchy:

**Match overview → selected section → specific item/subsection.**

Each overview card remains a compact preview. Clicking or tapping its summary area, heading, chevron, or “View all” action must reveal the **full available detail for that section within the current match experience**. A decorative chevron or a second copy of the preview is not sufficient.

Use a consistent expandable-panel pattern:

- Keep **All Markets & Odds** expanded initially, as shown in the reference. Other sections initially show their approved summary previews.
- Open detailed content under the selected section's heading, keeping its relationship to the parent card obvious. On mobile, use a full-width inline panel. On desktop, allow the opened section to span the content width when its detailed table or visualization needs it; it must not remain cramped inside a tiny summary card.
- Retain the match context and provide an obvious collapse/back action. Child items can reveal another nested panel with a breadcrumb such as `Match details / Markets / Over–Under 2.5` or `Match details / Players / Player name`.
- Support both collapse of a section and return from an item to its parent section. Returning must preserve the parent's filters, selected tab, pagination, and scroll position, as well as the match-list filters when returning to the list.
- Use the existing routing approach to make the current section/item addressable and support refresh and browser Back/Forward. For example, adapt the current fixture route with `section`, `tab`, and `item` query parameters. Do not introduce a competing route system or remove unrelated query parameters.
- Market-summary tiles and the featured prediction open the corresponding market/prediction details directly. Player rows open player details; historical match rows open that match's available details using the existing route or a nested record panel.
- Internal tabs, filters, links, and pagination must perform their own action without also toggling the parent. Avoid nested buttons and other invalid interactive markup.
- Avoid stacked modals, unrelated destination pages, excessive navigation steps, and nested scrolling traps. Keep the selected parent visually identifiable.

A section may contain many records: expose the complete available collection through filtering and pagination/load-more, not an arbitrary permanent limit of three or five items.

## 4. Required sections and their nested content

Implement the following using actual available data. Missing information must be represented honestly, not invented to fill the design.

### A. Featured prediction and All Markets & Odds

The preview shows market, selected outcome, estimated probability, and available decimal odds. The expanded section exposes **all supported markets returned by the application's services**, not only those visible in the screenshots.

Provide searchable/filterable categories for results, goals, BTTS, double chance, draw no bet, handicaps, corners, cards, halves, correct scores, clean sheets, and player/special markets where supported. Keep “Popular” as a useful initial view without hiding access to the complete collection.

Every market row shows its exact market/line, prediction, probability, available odds, and an action to open its details. A market's nested panel includes all available outcomes, probability distribution, relevant AI explanation or supporting factors, prediction source/update time, and bookmaker quote source/update time. Show odds comparisons and historical movement only when those records exist.

Keep **probability**, **odds**, and any separate **model confidence** distinct. Do not relabel an estimated probability as confidence. Do not imply that bookmaker odds are AI probabilities. Do not blindly copy “Good Value” labels: display value/edge only when the application has a defined, implemented calculation and sufficient data. Avoid guarantees or “safe win” claims.

Handle unavailable odds/probabilities with `—` and explanatory text. Do not substitute zero. Mutually exclusive exhaustive outcome probabilities must be coherent, allowing for rounding; handle draw-no-bet, handicap, and push/void outcomes according to their actual definitions rather than forcing every market into the same format.

### B. Team Comparison / Team Stats

Start with the screenshot's compact comparison bars. Expand to available attacking, defensive, possession, passing, shooting, xG, goals, corners, cards, clean-sheet, and scoring/conceding statistics. Provide season/recent-form and home/away filters where the underlying data supports them.

Always identify the sample period and whether a value is a total, average, historical rate, or prediction. A statistic can expand to its match-by-match breakdown when available. Do not compare different periods without labeling them.

### C. Head-to-Head History

Show the summary and recent meetings, then expand to all available meetings with date, competition, home/away teams, score, and result. Include available win/draw totals and scoring/BTTS/over-under trends. Add competition, period, venue, and home/away filters where meaningful. Each meeting opens its available match record.

### D. Team Form / Recent Form

Keep compact W/D/L indicators in the overview. Expand both teams' actual recent fixtures with dates, opponents, home/away status, scores, and available performance statistics. Support last-five/last-ten or other supported windows, plus home/away views. Use useful trends or sparklines only from real data; show the underlying records on interaction.

### E. Probable / Confirmed Lineups

Show the compact pitch preview, then a readable formation view with correctly positioned players, names/numbers, available managers, starters, substitutes, and lineup status/update time. Clearly distinguish probable, confirmed, and unavailable lineups. Do not infer a confirmed starting eleven from the general squad.

Selecting a player opens that player's nested details. On small screens, use a team switcher or vertically stacked pitches instead of shrinking two full formations beyond readability.

### F. Key Players / Players

Expand from key-player previews into all relevant available squad/player records, with team/position filters. Show available appearances, minutes, goals, assists, shots, chances created, ratings, and other relevant metrics with their sample period. Include defensive/goalkeeping statistics when appropriate.

Selecting a player reveals available profile, role, season/recent performance, match history, availability, and supported player-market predictions/odds. Use remote portraits or a neutral fallback. Do not manufacture ratings or performance records.

### G. News & Insights

Expand into a match-specific feed with concise headlines, available thumbnails, source, publication time, team/topic tags, and supporting details. Clearly distinguish sourced reporting from generated analysis. Allow source links to open the original report.

Selecting an item shows the available article detail or supported AI analysis; do not fabricate a full article from a headline. Preserve links to supporting information. Do not add an unapproved paid news provider or scraping pipeline just to populate this section.

### H. Injuries & Suspensions

Expand into all available absences grouped/filterable by team and status. Show player, position, reported reason, status, last update/source, and expected return only when provided. Clearly distinguish out, doubtful, suspended, available, and unknown states. Open the related player details from each row.

Do not invent return dates or present estimated impact as a verified fact. Keep lineup availability and injury statuses consistent with their sources and timestamps.

### I. Match Context / Venue & Weather

Expand to available competition/round, standings context, stadium/location, kickoff/timezone, venue information, rest days, nearby fixtures, and actual weather information for the match. Show context or weather trends only when supported by data. Label derived rest-day values and distinguish forecast conditions from observations.

Provide nested stadium, weather, standings, or schedule details where records exist. Do not invent crowd estimates, title-race stakes, or venue conditions.

### J. Referee

Expand from the referee preview to the assigned official's available profile, competition/season sample, match count, cards, fouls, penalties, and recent officiated matches. State whether values are totals or per-match averages and show the sample size. Each listed match can open its available details.

Display “Not assigned” or “Not available” when appropriate. Do not substitute a plausible referee or synthetic statistics.

## 5. Data integration and application behavior

Build on the existing typed service/API contracts and Prisma models. Never expose provider credentials to the browser. Centralize normalization of fixture, team, market, prediction, lineup, player, statistic, and availability data instead of duplicating transformations across cards.

Load the overview efficiently. Lazy-load deeper section data on first expansion, reuse it afterward, and deduplicate simultaneous requests. Use the existing server cache and refresh logic. Avoid per-row/per-player request waterfalls and do not fetch every historical detail in advance. Clean up polling/subscriptions and cancel or ignore stale requests when changing fixtures or filters.

Distinguish loading, refreshing, unavailable, empty, and error states. An individual section failure must not remove the rest of the match page. Keep last-known data visible during refresh, with appropriate timestamps/staleness indicators. Retry only the failed section.

Handle pre-match, live, completed, postponed, and cancelled fixtures through the existing status model. Never display a predicted score as an actual result. Use local component state for transient disclosure behavior where suitable and the existing shared data/state layer for cached application data.

Do not redesign the database or rewrite prediction scheduling merely to implement this screen. Add only necessary typed endpoints/model changes. Keep test/demo fixtures isolated from production; production fallback must never be synthetic match data.

## 6. Responsive quality and accessibility

Use reusable match-header, market-summary, section-card, nested-panel, probability-bar, statistics-table, and state components aligned with the current architecture. Do not create separate mobile/desktop business logic or duplicate all fetching.

Keep cards extremely compact while preserving readable text and usable controls. Use restrained padding, short labels, subtle separators, and content-driven heights. Prefer responsive table-to-row transformations over horizontal page overflow. Any essential table scrolling must remain inside its own clearly usable container.

Support keyboard activation, visible focus, semantic headings, accessible labels, `aria-expanded`/`aria-controls` for disclosure controls, meaningful logo alternative text, and non-color-only result/status indicators. Manage focus when opening or returning from a focused nested view. Respect reduced-motion preferences. Expanded content and focus targets must not hide underneath sticky headers or bottom navigation.

## 7. Acceptance checks and completion report

Implement and verify, rather than merely describing these behaviors:

1. The mobile and desktop overview layouts closely match the respective attachments, with Goal Hint branding and real fixture data.
2. Every section, featured prediction, market tile, and relevant item opens substantive nested details. Every collapse/back action works without losing parent state.
3. All supported markets and all available section records are reachable, including paginated records. Search, category filters, team switches, tabs, and item selection actually work.
4. Deep links, refresh, browser Back/Forward, and returning to the match list preserve the intended context. Invalid section/item parameters fail gracefully.
5. Missing odds, unavailable predictions/news/lineups, absent images, empty history, provider errors, and stale data have correct states; no fabricated data appears.
6. Test representative widths of 360, 390, 768, 1024, 1440, and 1920 pixels. Check long names, narrow screens, expanded panels, sticky elements, and the absence of page-level horizontal overflow.
7. Use the project's existing testing tools to cover disclosure and nested navigation, state preservation, data-source/fallback selection, filters, request deduplication, and representative responsive behavior. Run relevant type checks, linting, tests, and build checks.
8. Capture actual implementation screenshots where tooling permits and compare them against both attached references. Correct layout and interaction issues before finishing.

Finish with a concise report listing changed files, implemented interactions, data/API additions, checks actually run and their results, and any real provider-data gaps or environment blockers. Do not claim unrun tests passed. Do not leave placeholder controls or TODOs for the core section-opening behavior. Do not alter unrelated features.
