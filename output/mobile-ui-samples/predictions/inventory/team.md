# Team group inventory: Team Comparison, Head to Head, Team Form (375px phone)

Scope: the three "team" cards on the Match details page (`/[locale]/matches/[fixtureId]/[slug]`) and the views they open.
Each screen exists in three layers: **preview card** (closed, on the overview) -> **opened section** (full width, same card, `?section=`) -> **item panel** (nested inside the opened section, `&item=`).

Sources read: `src/components/match/details/{team-sections,section-card,details-ui,use-match-view,match-details,labels}.tsx/.ts`, `src/domain/{match-view,match-insights,match-insight-presentation,match-details}.ts`, `src/i18n/messages.ts`, `src/i18n/messages/en.ts`, `src/styles/theme.ts`, `src/components/ui/pagination-styles.ts`, `src/components/match/filter-parts.tsx`, `src/components/navigation/shell-styles.tsx`, `src/server/matches/insights-read.ts`, `src/server/football/api-football-normalize.ts`, `docs/match-details.md`.
Measured live at 375x812 (dark) against the local dev server, fixture `Always Ready v Independiente Petrolero` (local DB has no stored verified results, so every list is empty; populated states below come from code).

All quoted strings are exact English values from `src/i18n/messages/en.ts`. `{x}` = placeholder filled at runtime.

---

## 0. Shared frame for all three screens

### 0.1 Where the cards sit on the phone (375px)
Top-to-bottom on the Match details page (`match-details.tsx:236-255`):
1. Phone top bar (not sticky; scrolls away) `match-details.tsx:187-195`: back arrow link (aria-label "Back to matches", goes to the stored feed URL, **leaves the match page**), centred title "Match details", theme toggle, search toggle ("Search matches" / "Close search").
2. Match banner (competition, date/time, crests, score/VS, Top pick box).
3. 2x2 market tiles (1X2, DC, O/U 2.5, BTTS).
4. All Markets & Odds card (full width, expanded by default, ~417px tall).
5. **Card grid, two-up at >=22rem (352px)** `match-details.tsx:124-154`:
   - Row 1: **Team Comparison** (left, 168px wide) | **Head to Head** (right, 168px)
   - Row 2: **Team Form** (left) | Lineups (right)
   - Row 3: Players | News & Insights; Row 4: Injuries & Suspensions | Match Context; Referee (full row); Prediction History (full row).
6. Page disclaimer Note: "Estimated probabilities are not guarantees and are not betting advice. Opening a section reads stored data; it never starts a new prediction." (`match-details.tsx:254`)
7. Footer, then fixed bottom tab bar "App sections" (42.7px, `position: fixed`, `shell-styles.tsx:348-358`): Matches (current), Live, Results, Slip builder, Help, More.

Measured: Team Comparison and Head to Head cards start at document y=860 on an 812px viewport, so **none of the three team cards is visible without scrolling**; Team Form starts at y=1023.
Below 22rem (352px) the grid is one column; at 375px it is two-up.

### 0.2 Card shell (all three) - `section-card.tsx:13-51`, `details-ui.tsx:53-145`
- `<section>` card, radius 0, 1px border (`color.border`); when open, border turns the section accent (`accent[...].solid`) and spans the full grid row.
- Header: `<h2>` containing ONE disclosure button (min 1.875rem / 30px tall): icon badge (20px, accent soft fill) + title (13px bold, wraps balanced in two-up cards, e.g. "Team / Comparison") + optional meta `<small>` (11px muted) + chevron (rotates 90deg and turns blue when open). `aria-expanded`, `aria-controls="section-{id}"`.
  - Meta is **hidden when the card is <=16rem wide** (`details-ui.tsx:101`), i.e. always hidden on the 168px phone two-up card, visible only when opened.
- Closed: `PreviewArea` (tapping any non-interactive part opens the section, `section-card.tsx:35-38`) + "View full ..." LinkButton with right-arrow icon (blue `accent.blue.solid`, 12px bold, min 24px tall).
- Open (`section-card.tsx:41-48`): Panel with top divider -> breadcrumbs (nav aria-label "Location in match details") -> visually hidden `<h3>` focus target -> section content -> bottom LinkButton "Collapse {section}".
- Accents: Team Comparison = orange (CompareIcon: horizontal bars), Head to Head = violet (HeadToHeadIcon: two people), Team Form = emerald (FormIcon: trend line).

### 0.3 Item panel shell - `section-card.tsx:54-62`
- "‹ Back to list" LinkButton (blue) -> `<h4>` heading (14px, focused on open) -> content.
- Breadcrumbs above it become: "Match details" (button) / "{Section title}" (button, closes item) / "{item label}" (current, `aria-current="location"`).

### 0.4 Shared controls (exact behaviour)
| Control | Component | Phone size | Result | History |
|---|---|---|---|---|
| Card header button | `CardHeader` `details-ui.tsx:122-134` | 30px tall, full card width | toggles section open/closed (`openSection`, resets section filters) | push |
| Tap on preview content | `PreviewArea` | whole preview | opens section | push |
| "View full ..." | `LinkButton` | 24px (36px when wrapped to 2 lines) | opens section | push |
| Breadcrumb "Match details" | `Crumbs` `details-ui.tsx:177-184` | **16.5px tall, 11px text** | closes section (`openSection(null)`) | push |
| Breadcrumb "{Section}" (only when an item is open) | `Crumbs` | 16.5px | closes item | push |
| "Collapse {section}" | `LinkButton` `section-card.tsx:47` | 24px | closes section, focus returns to the header button | push |
| "‹ Back to list" | `ItemPanel` `section-card.tsx:58` | 24px | closes item, focus returns to the row that opened it (`useReturnFocus`) | push |
| Filter chip groups | `ChoiceGroup` `details-ui.tsx:225-260` | **26px tall, 11px text**, horizontal scroll with hidden scrollbar | sets URL key, resets `page` to 1 | replace |
| Pager | `Pager` `details-ui.tsx:348-360` | 32px tall slots filling the width; "‹" "1" "2" ... "›" | sets `page` | replace |
| Result / metric rows | `RowButton` `details-ui.tsx:370-389` | 40px measured (min 34px) | opens item panel | push |
| Browser Back / Forward | `use-match-view.ts:20-33` | - | steps through pushed entries (open/close section, open/close item) | - |
| Top-bar back arrow | `match-details.tsx:188` | 32px | **leaves Match details** to the feed (stored feed URL) | navigation |

Opening a section scrolls its card to the top (smooth unless reduced motion), focuses the hidden heading (`details-ui.tsx:432-468`). Filters are not kept when switching to another section (`match-view.ts:99-102`).

### 0.5 Shared states
- **Loading (opened section)**: Note `role="status"`: "Loading every record for this section…" placed above the content; content meanwhile renders from preview data (`details-ui.tsx:272-277`). No request when the page's preview (<5 min old) already holds the whole collection (`use-match-view.ts:43-61`).
- **Error (opened section)**: Note `role="alert"`: "This section could not be loaded. The preview above is still shown." + LinkButton "Try again" (re-fetches only this section).
- **Preview read failed** (`preview === null`): cards render exactly like the empty state (no distinct message) until opened.
- Match status (upcoming / live / finished / postponed) does **not** change these three sections: they always show stored verified past results. Only the Team Comparison preview's "Win probability" row depends on a published 1X2 forecast.
- Themes: light and dark tokens (`theme.ts`); dark is the default in screenshots.

### 0.6 URL state used by these screens (`match-view.ts`)
| Key | Values | Default (omitted) | Used by |
|---|---|---|---|
| `section` | `stats` / `h2h` / `form` | none (overview) | all |
| `item` | metric id (`pointsPerGame`, `goalsFor`, `goalsAgainst`, `winRate`, `cleanSheetRate`, `bttsRate`, `over25Rate`, `failedToScoreRate`) or a fixture id | none | stats (metric), h2h & form (fixture id) |
| `window` | `5` / `10` / `0` (All stored) | `5` | stats, form |
| `venue` | `all` / `home` / `away` | `all` | stats, form, h2h |
| `team` | `both` / `home` / `away` | `both` | form |
| `comp` | competition id | none (All competitions) | h2h |
| `page` | 1-1000 | `1` | form, h2h |
Unknown values fall back to defaults; section keys are ignored without `section`. Other query keys (revision history) are preserved. Deep links are server-rendered (verified: `?section=h2h&venue=home` SSR-renders the open section with "At {home}" pressed).

---

## 1. Screen `stats` - Team Comparison

**Purpose / user task:** compare the two teams side by side on 8 per-match averages/rates computed from each team's own stored verified regulation-time results; see the published 1X2 win probabilities; drill into one metric's match-by-match breakdown; see provider statistics captured in the prediction evidence.

### 1A. Preview card (closed) - `team-sections.tsx:171-184`
Entry: scroll the Match details overview to the first card row (left cell). URL: no `section`.

Ordered content (phone, 168px card):
1. Header: orange icon badge (CompareIcon), title "Team Comparison" (wraps to 2 lines), chevron ›. No meta.
2. Teams row (`aria-hidden="true"`): home crest (20px, initials fallback) + home name (ellipsis) | away name (ellipsis) + away crest. 12px bold.
3. Win-probability row - **only if the 1X2 (match-result) market is published**: home-win % (bold) | Note "Win probability" | away-win % (bold). Integer percent via `percent()`.
4. If either team has stored results: 4 mirrored comparison rows from the first 4 metrics (preview always uses each team's **last 10** stored results, `slice(0, 10)`): label on its own centred row (11px muted), below it `home value | home bar (orange, grows from centre) | away bar (blue) | away value`.
   - Rows: "Points per game", "Goals scored per game", "Goals conceded per game", "Win rate".
   - Then Note: "Home: {n result(s)}. Away: {n result(s)}." (`details.comparisonSample` + plural "{count} result"/"{count} results").
   Else Note: "No verified results are stored for this team yet."
5. LinkButton "View full comparison" + arrow.

Populated sample (Arsenal v Chelsea):
```
[=] Team         ›
    Comparison
(A) Arsenal   Chelsea (C)
48%  Win probability  27%
      Points per game
2.1 [====|===  ] 1.6
   Goals scored per game
2.0 [====|===  ] 1.5
  Goals conceded per game
0.8 [  ==|==== ] 1.2
         Win rate
60% [====|===  ] 40%
Home: 10 results. Away: 10 results.
View full comparison ->
```
Empty sample (current local data, ref `05-detail-sections.jpg`): crests + "USA W  Spain W", Note "No verified results are stored for this team yet.", "View full comparison ->".

Actions: header button / tap preview / "View full comparison" -> 1B (`?section=stats`, push).

### 1B. Opened section - `team-sections.tsx:185-222`
Entry: any open action from 1A, or deep link `?section=stats[&window=10|0][&venue=home|away]`. Also Back/Forward.
Layout: card spans full width (343px at 375), orange border, scrolled to top of viewport; measured height ~770px (empty data) so it fills the whole screen above the 42.7px tab bar.

Ordered content:
1. Header (title "Team Comparison", chevron rotated/blue).
2. Breadcrumbs: "Match details" (button) / "Team Comparison" (current).
3. Section state line (loading/error) when applicable. Note: opening stats fetches two sections (form + stats); retry re-fetches both.
4. Filter chips (`FormFilters`, `team-sections.tsx:147-155`), two groups each on its own scrolling row:
   - group "Results window": "Last 5" (default, pressed) · "Last 10" · "All stored"
   - group "Venue": "All venues" (default) · "Home games" · "Away games" (applies to **each** team's own home/away games)
5. Teams row (crests + names, `aria-hidden`).
6. 8 comparison rows, each a full-width button (`aria-label` "Open match-by-match breakdown: {metric}"), 40px tall, label above mirrored bars (card <24rem):
   "Points per game", "Goals scored per game", "Goals conceded per game", "Win rate", "Clean sheets", "Both teams scored", "Over 2.5 goals", "Failed to score".
   Values: averages 1 decimal ("2.2"), rates integer % ("60%"); "—" when a team has no results. Bars: averages scaled to the larger of the two; rates on 0-100%.
7. Note: "Home: {n results}. Away: {n results}. Averages per match and rates over each team's own stored, verified regulation-time results."
8. Strong: "Provider statistics in the prediction evidence"
9. Either a definition list (label/value side by side at this width) of evidence metrics, sorted alphabetically, max 40:
   - dt: raw metric id + unit, e.g. "corners (count)", "possession (percent)", "shots-on-goal (count)"
   - dd: "{home}: {avg, max 2 decimals} ({n match/matches}) · {away}: {avg} ({n matches})", "—" for a side without samples
   or Note: "No provider match statistics were captured in this prediction's evidence."
10. Note: "Possession, shots, xG, corners and cards are shown only when captured in the prediction evidence."
11. LinkButton "Collapse Team Comparison".

Populated sample (window Last 5, venue All venues):
| Metric | Arsenal | Chelsea |
|---|---|---|
| Points per game | 2.0 | 1.6 |
| Goals scored per game | 2.2 | 1.4 |
| Goals conceded per game | 0.8 | 1.0 |
| Win rate | 60% | 40% |
| Clean sheets | 40% | 20% |
| Both teams scored | 60% | 60% |
| Over 2.5 goals | 60% | 40% |
| Failed to score | 0% | 20% |
Note: "Home: 5 results. Away: 5 results. Averages per match and rates over ..."
Evidence: "corners (count)" -> "Arsenal: 6.4 (5 matches) · Chelsea: 5.2 (5 matches)"; "possession (percent)" -> "Arsenal: 57.6 (5 matches) · Chelsea: 54.2 (5 matches)"; "shots-on-goal (count)" -> "Arsenal: 6.2 (5 matches) · Chelsea: 4.8 (4 matches)".

Actions:
- Window chip -> `window=10|0` (replace, page reset). Venue chip -> `venue=home|away` (replace).
- Metric row -> 1C `&item={metricId}` (push).
- Breadcrumb "Match details" / header button / "Collapse Team Comparison" -> overview (push), focus back on header.

### 1C. Metric breakdown item panel - `team-sections.tsx:186-195`
Entry: tap a metric row in 1B, or deep link `?section=stats&item=pointsPerGame` (plus any `window`/`venue`, which still apply but their chips are **not shown** here).
Ordered content:
1. Breadcrumbs: "Match details" / "Team Comparison" (button) / "{Metric label}" (current).
2. "‹ Back to list"
3. `<h4>` "{Metric label}" (e.g. "Points per game")
4. Note: averages -> "Average per match over the listed results; each row shows that match's value." ; rates -> "Share of the listed results where this happened; each row shows 1 when it did and 0 when it did not."
5. For home then away team: Strong "{Team} · {value}" (e.g. "Arsenal · 2.0"), then a plain (non-interactive) list, 12px, one row per filtered result: date ("Sat, Oct 10") | "{home name} {hg}–{ag} {away name}" | per-match value (points 3/1/0, goals count, or 1/0 for rates). Empty: "No verified results are stored for this team yet."
6. "Collapse Team Comparison".

Sample (Points per game, Last 5):
```
Arsenal · 2.0
Sat, Oct 10  Arsenal 2–0 Everton        3
Sat, Oct 3   Brighton 1–1 Arsenal       1
Sat, Sep 26  Arsenal 3–1 Fulham         3
Sun, Sep 20  Aston Villa 2–1 Arsenal    0
Sat, Sep 13  Arsenal 4–0 Burnley        3
Chelsea · 1.6
Sun, Oct 11  Newcastle 1–0 Chelsea      0
...
```
Actions: "‹ Back to list" / breadcrumb "Team Comparison" -> 1B with same filters, focus on the metric row (push). Invalid metric id -> 1B list.

### stats - states
- Preview: populated (with/without Win probability row); empty ("No verified results are stored for this team yet."); preview read failed (looks empty).
- Open: loading (status line + preview data), error + "Try again", populated, empty (all values "—", "Home: 0 results. Away: 0 results. ...", evidence empty note), evidence present/absent independently.
- Window/venue filtered to fewer results (values recomputed; no "filtered empty" message - rows show "—").
- Item panel: populated, one/both teams empty.

### stats - current phone layout (375px)
Closed: 168px card, title on two lines, 4 short rows of 11px numbers with bars ~50px wide, LinkButton. Opened: full-width card replaces its grid cell; two chip rows (26px chips), team names row, 8 x 40px rows (label row + bar row each), three notes, evidence heading + list/note, Collapse link at the very bottom (~750px down). Phone top bar has scrolled away; fixed tab bar at bottom.

### stats - frictions
| Criterion | Issue | Evidence |
|---|---|---|
| Accessibility | Metric row buttons have an `aria-label` that replaces their content, so screen readers hear "Open match-by-match breakdown: Win rate" but never the two values. | `team-sections.tsx:202-203` |
| Accessibility | The team-name row is `aria-hidden`; in preview and open views the values are announced with no team association (home value / label / away value). | `team-sections.tsx:90`, `74-85` |
| Uniformity | Preview computes from the last 10 results, while the opened view defaults to "Last 5", so numbers change on opening. | `team-sections.tsx:181-182` vs `match-view.ts:35-36` (`window: 5`) |
| Simplicity | Evidence statistics show raw ids with units ("shots-on-goal (count)"), not localized labels; sorted alphabetically. | `team-sections.tsx:216`, `insights-read.ts:114,139`, `api-football-normalize.ts:294-303` |
| Simplicity | Open view stacks two different data blocks plus three explanatory notes; sample note says "Home/Away" instead of team names. | `team-sections.tsx:212-221`, `en.ts:511-512` |
| Simplicity | Preview empty copy "No verified results are stored for this team yet." describes both teams with singular "this team". | `team-sections.tsx:183`, `en.ts:513` |
| Simplicity | Venue "Home games" filters each team to its own home games (not home team at home vs away team away); chip text does not explain this. | `team-sections.tsx:164` |
| Accessibility | Comparison text is 11px (caption) at phone width; chips 11px, breadcrumbs 11px. | `team-sections.tsx:57-63`, `details-ui.tsx:169,243` |
| Accessibility | Item panel list falls back to an empty string when a team name is null (other lists show "Team unavailable"). | `team-sections.tsx:192` vs `99` |
| Easy navigation | Window/venue filters still apply inside the metric panel but are not visible there. | `team-sections.tsx:164,186-195` |
| Short flows | Card is below the fold (y=860 on 812px); reaching the breakdown needs scroll + open + row tap; no way to jump to sibling team sections (H2H, Form) from inside the open section except collapsing and scrolling. | measured; `section-card.tsx:41-48` |

### stats - must keep
- Title "Team Comparison", "View full comparison", "Collapse Team Comparison", breadcrumb trail, 8 metrics in this order with these labels, value formats ("—" when no sample), mirrored home/away bars, Win probability row only when 1X2 is published.
- Window ("Last 5"/"Last 10"/"All stored") and venue ("All venues"/"Home games"/"Away games") as URL keys `window`/`venue` with replace semantics; `item={metricId}` with push semantics.
- Notes: "details.comparisonBasis", "details.statsNotCollected", evidence heading and empty note; metric help texts.
- Loading/error/retry behaviour; focus return to the metric row.

---

## 2. Screen `h2h` - Head to Head

**Purpose / user task:** see the stored verified meetings between the two teams: totals (wins each, draws, average goals, BTTS, over 2.5), filter by host team and competition, page through every meeting, open one meeting's details and jump to its own match page.

### 2A. Preview card (closed) - `team-sections.tsx:335-342`
Entry: overview, first card row, right cell. URL: no `section`.
Ordered content (phone 168px):
1. Header: violet badge (HeadToHeadIcon), "Head to Head", chevron. Meta "{count} meetings" exists but is **hidden on the phone card** (<=16rem).
2. If meetings exist: summary line (wraps): muted "Last {count} meetings" (count = up to 5) + 5 W/D/L letter chips, oldest first, from the **home team's** perspective (`role="img"`, aria-label "Head-to-head results for {home}, oldest first: Win, Draw, ...").
   The preview result rows are **hidden below 17rem card width** (always hidden on phone two-up; visible on wider cards).
   Else Note: "No previous meetings between these teams are stored."
3. LinkButton "View full head to head history" + arrow (wraps to 2 lines, 36px).

Populated sample: `Last 5 meetings  (W)(D)(L)(W)(W)`, "View full head to head history ->". Header meta when opened: "12 meetings".

Actions: open -> 2B (`?section=h2h`, push). On wider cards a preview row opens 2C directly (`openItem`).

### 2B. Opened section - `team-sections.tsx:343-365`
Entry: open actions, or deep link `?section=h2h[&venue=home|away][&comp={id}][&page=n]`.
Ordered content:
1. Header "Head to Head" + meta "{n} meetings" (visible now, 11px muted) + chevron.
2. Breadcrumbs: "Match details" / "Head to Head".
3. Section state line (loading/error).
4. Totals definition list (label | value, side by side; computed over the **filtered** meetings):
   - "Meetings" -> 12
   - "{home} wins" -> 6
   - "Draws" -> 3
   - "{away} wins" -> 3
   - "Average goals" -> 2.8 (1 decimal, "—" if none)
   - "Both teams scored" -> 58%
   - "Over 2.5 goals" -> 50%
5. Filter chips:
   - group "Venue": "All venues" · "At {home}" · "At {away}" (e.g. "At Arsenal", "At Chelsea")
   - group "Competition" (only when meetings span >1 competition): "All competitions" · "{competition name}" ... (e.g. "Premier League", "FA Cup", "League Cup")
6. Meetings list (10 per page), each row a button (40px): date "Sun, Apr 12" (no year) | home crest 16 + home name "–" away name + away crest 16 (single ellipsized line) | score "1–2" bold | one W/D/L chip from the home team's perspective (label "Result: Win").
   Empty: "No stored meetings match these filters." when filters exclude all, else "No previous meetings between these teams are stored."
7. Pager (nav "Pages") only when >1 page: "‹" (Previous page) "1" "2" ... "›" (Next page); up to 60 meetings -> up to 6 pages.
8. Note: "Meetings come from stored verified results only; older meetings the provider has not imported are not included."
9. "Collapse Head to Head".

Populated sample rows:
```
Sun, Apr 12  (C) Chelsea – Arsenal (A)   1–2  W
Sat, Dec 20  (A) Arsenal – Chelsea (C)   2–2  D
Sun, Oct 5   (A) Arsenal – Chelsea (C)   3–1  W
Sat, Mar 15  (C) Chelsea – Arsenal (A)   1–0  L
...
‹  1  2  ›
```

Actions: venue chip -> `venue` (replace, page 1); competition chip -> `comp` (replace, page 1); pager -> `page` (replace); row -> 2C `&item={fixtureId}` (push); breadcrumb / header / Collapse -> overview (push).

### 2C. Meeting item panel (`RecordPanel`) - `team-sections.tsx:97-112`
Entry: tap a meeting row, or `?section=h2h&item={fixtureId}`.
Ordered content:
1. Breadcrumbs: "Match details" / "Head to Head" (button) / "{home} v {away}" (current).
2. "‹ Back to list"
3. `<h4>` "{home} v {away}" (e.g. "Chelsea v Arsenal")
4. Facts:
   - "Date" -> "Apr 12, 2026, 18:30 EAT" (`<time>`)
   - "Competition" -> "Premier League" (or "Competition unavailable")
   - "Score" -> bold "Chelsea 1 – 2 Arsenal"
   - "Status" -> "Finished" | "Finished after extra time" | "Finished after penalties"
5. Note: "Verified regulation-time score, including stoppage time and excluding extra time and penalties."
6. Link "Open this match's page" (13px bold, teal `color.link`) -> `/[locale]/matches/{fixtureId}/{slug}` (full navigation to another Match details page).
7. "Collapse Head to Head".
Unknown fixture id in `item` -> list view (2B).

### h2h - states
- Preview: populated (1-5 letters), empty, preview read failed (looks empty).
- Open: loading, error + "Try again", populated (1 page / multiple pages), no meetings, filtered-empty ("No stored meetings match these filters."), competition filter hidden (<=1 competition), totals over filtered set ("—" for averages/rates when 0).
- Item: populated; team/competition name missing ("Team unavailable" / "Competition unavailable").

### h2h - current phone layout
Closed: 168px card, title one line, (populated) muted "Last 5 meetings" with letter chips wrapping beneath; (empty) 3-line note; 2-line "View full head to head history". Opened: full width; totals as 7 label/value lines; chip rows (venue row overflows: measured scrollWidth 353 > 325 with "At Independiente Petrolero"); list of 40px rows; pager full width 32px; note; Collapse.
Opening H2H reflows the grid: Team Form moves up into the empty cell beside Team Comparison and H2H drops below it (measured: form at y=855 right column, H2H at y=1042 full width).

### h2h - frictions
| Criterion | Issue | Evidence |
|---|---|---|
| Easy navigation | Opening H2H reorders cards (`grid-auto-flow: row dense`): Team Form jumps above H2H, so the card the user tapped moves. | `match-details.tsx:127,132`; measured positions |
| Accessibility | Venue chips with long team names overflow a hidden-scrollbar row; the last chip is clipped with no scroll affordance. | `details-ui.tsx:231-233`; measured 353 > 325px |
| Simplicity | Meeting count meta is hidden on the phone card; preview shows only letters, no scores (rows hidden <17rem). | `details-ui.tsx:101`, `team-sections.tsx:315-318` |
| Simplicity | Row dates omit the year although meetings span seasons; year appears only in the item panel. | `team-sections.tsx:130`, `messages.ts:17,23,114-116` |
| Uniformity | H2H has no results-window filter while Comparison and Form do; venue chip wording differs ("At {team}" vs "Home games"). | `team-sections.tsx:354-361` vs `147-155` |
| Uniformity | Item panel uses two link colours: "‹ Back to list" blue (`accent.blue.solid`) vs "Open this match's page" teal (`color.link`). | `details-ui.tsx:154`, `team-sections.tsx:108`, `global-style.tsx:96-97` |
| Simplicity | The item title is shown twice (breadcrumb current item and h4). | `section-card.tsx:43-44,59` |
| Accessibility | Breadcrumb buttons are 16.5px tall with 11px text; Back/Collapse links 24px. | `details-ui.tsx:166-176`, measured |
| Short flows | From the overview: scroll ~860px, open, tap row = 3 actions + scroll; "Open this match's page" leaves the current match entirely. | measured; `team-sections.tsx:108` |

### h2h - must keep
- Title "Head to Head", "View full head to head history", meta "{count} meetings", "Last {count} meetings", letter chips with full-word accessible label, totals list labels, venue ("All venues", "At {team}") and competition ("All competitions", names) filters as `venue`/`comp`, `page` pagination exposing every page, `item={fixtureId}`.
- Empty vs filtered-empty copy; "details.h2hBasis" note; regulation note in item; "Open this match's page".

---

## 3. Screen `form` - Team Form

**Purpose / user task:** see each team's recent stored verified results (W/D/L, goals), filter by team, results window and venue, page through the full history, open one result's details.

### 3A. Preview card (closed) - `team-sections.tsx:269-280`
Entry: overview, second card row, left cell (below Team Comparison).
Ordered content (phone 168px; teams stack in one column because card <=17rem, sparkline hidden):
1. Header: emerald badge (FormIcon), "Team Form", chevron.
2. For home then away:
   - crest (20px) + team name (12px bold, ellipsis)
   - 5 W/D/L letter chips oldest first (18px circles, 10px letters; W emerald, L red, D neutral; aria-label "Last five results for {team}, oldest first: Win, Loss, ..."), or Note "No results" when none.
   - (wider cards only) sparkline of goals scored over last 10.
   - Note (only when results exist): "Goals {scored} · Conceded {conceded}" over the last 5.
3. LinkButton "View full form" + arrow.

Populated sample:
```
(A) Arsenal
(W)(L)(W)(D)(W)
Goals 11 · Conceded 4
(C) Chelsea
(D)(W)(W)(D)(L)
Goals 7 · Conceded 5
View full form ->
```
Empty sample (ref `05-detail-sections.jpg`): "USA W" / "No results" / "Spain W" / "No results".

### 3B. Opened section - `team-sections.tsx:281-301`
Entry: open actions, or `?section=form[&team=home|away][&window=10|0][&venue=home|away][&page=n]`.
Ordered content:
1. Header "Team Form" (no meta).
2. Breadcrumbs: "Match details" / "Team Form".
3. Section state line.
4. Chip group "Team": "Both teams" (default) · "{home}" · "{away}" (measured overflow 329 > 326px with long names).
5. Chip group "Results window": "Last 5" · "Last 10" · "All stored"; chip group "Venue": "All venues" · "Home games" · "Away games".
6. For each selected team (both = home block then away block):
   - Strong team name (not a heading element)
   - Note summary: "{wins}W {draws}D {losses}L · Goals {scored}:{conceded} · {n result(s)}" e.g. "3W 1D 1L · Goals 11:4 · 5 results"
   - Result rows (10 per page), each a button: date "Sat, Oct 10" | venue pill "H" (teal, title "Played at home") or "A" (violet, title "Played away") + opponent crest 16 + opponent name | score home-first "2–0" | W/D/L chip from this team's perspective.
   - Pager (only with >10 rows, i.e. "All stored" with 11-40 results).
   - Empty: "No verified results are stored for this team yet."
7. "Collapse Team Form".

Populated sample (Both teams, Last 5):
```
Arsenal
3W 1D 1L · Goals 11:4 · 5 results
Sat, Oct 10  H (E) Everton        2–0  W
Sat, Oct 3   A (B) Brighton       1–1  D
Sat, Sep 26  H (F) Fulham         3–1  W
Sun, Sep 20  A (V) Aston Villa    2–1  L
Sat, Sep 13  H (B) Burnley        4–0  W
Chelsea
2W 2D 1L · Goals 7:5 · 5 results
Sun, Oct 11  A (N) Newcastle      1–0  L
Sat, Oct 4   H (B) Brentford      2–2  D
Sat, Sep 27  H (W) Wolves         1–0  W
Sun, Sep 21  A (W) West Ham       1–3  W
Sat, Sep 13  H (T) Tottenham      1–1  D
Collapse Team Form
```
Actions: team chip -> `team` (replace, page 1); window/venue chips (replace, page 1); pager -> `page` (replace); row -> 3C `&item={fixtureId}` (push); breadcrumb/header/Collapse -> overview (push).

### 3C. Result item panel (`RecordPanel`)
Same as 2C with breadcrumb "Match details" / "Team Form" / "{home} v {away}" (e.g. "Aston Villa v Arsenal"); facts Date "Sep 20, 2026, 16:00 EAT", Competition "Premier League", Score "Aston Villa 2 – 1 Arsenal", Status "Finished"; regulation note; "Open this match's page"; "‹ Back to list" returns to the list with filters/page and focuses the row.

### form - states
- Preview: populated per team, one team empty ("No results"), both empty, preview read failed.
- Open: loading, error + "Try again", populated, per-team empty, filtered to zero (shows the same "No verified results are stored for this team yet."), single team focus, multi-page (All stored).
- Item: populated; unknown id -> list.

### form - current phone layout
Closed: 168px card with two stacked team blocks (name, 5 chips, goals line) ~180px tall. Opened: full width; three chip rows (Team, Results window, Venue), then team blocks with summary line and 40px rows; Collapse at bottom. With both teams and Last 10 the panel is ~2 screens tall.

### form - frictions
| Criterion | Issue | Evidence |
|---|---|---|
| Easy navigation | One shared `page` value pages both team lists at once when "Both teams" is selected. | `team-sections.tsx:290,297` |
| Simplicity | Scores are shown home-first while the W/D/L chip is from the listed team's perspective ("2–1 L" for an away loss). | `team-sections.tsx:138-139` |
| Simplicity | When filters exclude every result the copy says no results are stored at all. | `team-sections.tsx:298` vs h2h `362` |
| Accessibility | "H"/"A" pills explain themselves only through `title` (not available on touch; screen readers read "H"). | `team-sections.tsx:132` |
| Accessibility | Team chip row overflows with hidden scrollbar; letter chips use 10px text; team blocks use `<strong>` not headings. | `details-ui.tsx:231-233,312`; `team-sections.tsx:292` |
| Uniformity | Detail filter chips use a solid blue pressed state and 4px radius, while feed chips use the accent soft fill and square corners. | `details-ui.tsx:241,249` vs `filter-parts.tsx:44-47` |
| Short flows | Three filter rows (9 chips) precede the content; Pager only appears under "All stored". | `team-sections.tsx:283-287`, `pageSize = 10` line 25 |

### form - must keep
- Title "Team Form", "View full form", "Collapse Team Form", letter chips with "Last five results for {team}, oldest first" label, "Goals {scored} · Conceded {conceded}", summary format "{wins}W {draws}D {losses}L · Goals {scored}:{conceded} · {count}", H/A venue marker with "Played at home"/"Played away" meaning, opponent crest + name, score, result chip.
- URL keys `team`, `window`, `venue`, `page`, `item` with the same push/replace rules; all pages reachable.

---

## 4. Cross-screen must-keep constraints
1. URL-addressable view state exactly as in 0.6, server-rendered deep links, push for open/close section and item, replace for filters/pages, filters reset when switching sections, unrelated query keys preserved.
2. Breadcrumb trail "Match details / {Section} / {Item}" (nav "Location in match details") and an explicit collapse action; Back/Forward must keep working.
3. Accessible names: header disclosure button with `aria-expanded`/`aria-controls`; chip groups with `aria-label` ("Results window", "Venue", "Team", "Competition") and `aria-pressed`; letter chips as `role="img"` with full words; pager nav "Pages" with "Previous page", "Next page", "Page {n}"; `role="status"`/`role="alert"` for loading/error; focus moves to the opened panel and back to the row/heading on close.
4. Contrast 4.5:1 for text (theme tokens already pass: muted text, accent text on soft, onBrand on solid); targets at least 24px (chips are 26px, link buttons 24px; breadcrumbs currently 16.5px).
5. Disclaimers/notes that must remain: "details.disclaimer" (page bottom), "details.comparisonBasis", "details.statsNotCollected", "details.h2hBasis", "details.regulationNote", metric help texts; no estimated or invented data (missing values stay "—" / explicit empty copy).
6. Data limits: form <=40 per team, meetings <=60, evidence <=40; preview truncation (form 10, meetings 5, stats evidence 6); page size 10.
7. Fixed bottom tab bar (42.7px) and `scroll-margin` clearance (`details-ui.tsx:47-50`) so focused content is not hidden behind it.
