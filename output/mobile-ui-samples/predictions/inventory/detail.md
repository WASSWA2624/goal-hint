# Inventory: Match details overview (`detail`), phone 375px

Read-only inventory of the current UI. Every quoted label comes from `src/i18n/messages/en.ts`, except
for the theme-toggle labels, which are hard-coded in `src/components/ui/theme-toggle.tsx`. File:line
references point at the code as it is now. The local DB has no published forecasts, so the reference
screenshots show only the empty states. The populated states below come from the code.

Reference screenshots: `output/mobile-ui-samples/predictions/reference/04-detail-top.jpg` (dark, top),
`05-detail-sections.jpg` (dark, section grid), `06-detail-bottom.jpg` (dark, bottom, footer),
`07-detail-finished-light.jpg` (light, finished 4 – 2). Note: the round black "N" bubble at the top-left of
every screenshot is the Next.js dev indicator. It is not app UI, but in dev it covers the Back button.

Out of scope here, because other groups cover them: the content of the opened market panel (`?market=`),
the full section views (`?section=…`, `?item=…`), and the feed and its filters. They appear below only
where the overview shows or links to them.

---

## 1. Identity

| Field | Value |
| --- | --- |
| id | `detail` |
| Title (visible) | Phone bar title **"Match details"** (`details.title`). Visually hidden page `<h1>`: **"{home} v {away}"** (`match.title`, match-banner.tsx:197-199) |
| Route | `/{locale}/matches/{fixtureId}/{slug}`, e.g. `/en/matches/8f0c…/arsenal-v-liverpool` (`src/app/[locale]/matches/[fixtureId]/[slug]/page.tsx`, `force-dynamic`) |
| Composition | `match-detail-route.tsx` → `MatchDetailPage` (match-detail-page.tsx) → `PublicShell app current="today"` → `LiveMatchDetail` (live-match-detail.tsx) → `MatchDetails` (details/match-details.tsx:214-257) |
| Document title | `detail.metadataTitle` "{match} \| Goal Hint" (robots `noindex, follow` prelaunch) |

## 2. How it is reached

| From | Control | Result |
| --- | --- | --- |
| Feed / Live / Results list (`/[locale]`, `/[locale]/predictions/[date]`, `?status=live`, `?status=finished`) | Tapping anywhere on a match card. The card's `Open` link overlays the whole card (match-card.tsx:738-740). Its accessible name is the visually hidden "View analysis for {home} v {away}" (`match.analysisLabel`) and its visible part is a chevron | Server navigation to the match URL. The feed saves its current URL, filters included, to `sessionStorage["goalhint:feed-href"]` (feed-surface.tsx:103-106) |
| Inside details: Team Form / Head to Head / Match Context record panel | "Open this match's page" (`details.openMatch`, team-sections.tsx:108-110) | Another fixture's details page |
| Inside details: Match Context, "Surrounding fixtures" | "Next" pill row link (info-sections.tsx:171-175) | Next fixture's details page |
| Revision-history links (`?revision=`, `?cycle=`, `?limit=`) | Links in Prediction History | Same page. The history section opens automatically (match-details.tsx:221-227) |
| Direct URL or shared link | — | A wrong or uppercased slug or ID gets a **permanent redirect** to the canonical path, keeping the view query (match-detail-route.tsx:90-92). A malformed or unknown ID gets a real **404** |

## 3. Purpose / user task

Look at one fixture's prediction at a glance (top pick plus the four market probabilities). Check the
kickoff time, live or final score and status. Then go deeper: one market's full outcomes, or one
evidence section (comparison, H2H, form, lineups, players, news, injuries, context, referee, prediction
history). Return to the list you came from.

---

## 4. Ordered content blocks (top → bottom at 375px)

### B0. Phone header bar: `PhoneHeader` (match-details.tsx:171-203)
Full-bleed bar, `min-block-size: 3.25rem` (52px, `theme.header.phoneHeight`). It is **not sticky** and
scrolls away. Fill is `header.background` (light `#102A3A`, dark `#10181D`), with a 2px teal bottom edge
(`header.accent`: light `#39D5CA`, dark `#53D5C6`). The grid is `2rem | 1fr | 2rem | 2rem`
(match-details.tsx:42-56). It shows on phones and tablets and is hidden at 64rem and up, where the
desktop shell header and the "Back to Predictions" text link replace it.

| # | Element | Visible | Accessible name | Size |
| --- | --- | --- | --- | --- |
| 1 | Back link (`RoundLink`) | chevron-left icon only | "Back to matches" (`details.backToMatches`) | 32×32 |
| 2 | Title `<p>` | "Match details" (`details.title`), 18px bold, centered | — | — |
| 3 | Theme toggle | Sun icon (dark mode) / Moon icon (light mode) | "Switch to light theme" / "Switch to dark theme" (hard-coded) | 32×32 |
| 4 | Search toggle (`RoundButton`) | Search icon, or Close icon when open. Inverse-teal fill while open | "Search matches" (`feed.search.open`) / "Close search" (`feed.search.close`), `aria-expanded`, `aria-controls="details-search"` | 32×32 |

**B0a. Search form, shown only while search is open** (match-details.tsx:196-201). Bordered row under
the bar: search icon, `<input type="search" name="q" maxLength=100>` with placeholder
"Search teams, leagues…" (`navigation.search`) and aria-label "Search matches" (`feed.filters.search`),
and a solid button "Search" (`feed.search.submit`). The form is `GET` to `/{locale}` (`homeHref`) with
`role="search"` and aria-label "Search matches". Escape closes it and returns focus to the toggle. An
outside tap dismisses it.

### B1. Match banner: `MatchBanner` (match-banner.tsx:171-225)
`<section id="current-match-summary">`. Surface card with a 3px brand-teal top border and 10px padding.
Phone grid areas: `"comp comp when" / "home vs away" / "pick pick pick"` (match-banner.tsx:23-42).

1. **Competition** (top-left): competition logo 28px (`alt=""`). Under it, strong competition name
   (13px), e.g. "Premier League", with fallback "Competition unavailable" (`match.competitionUnknown`).
   Then a muted 11px line "{round} · {country}", e.g. "Regular Season - 8 · England". The round comes
   from the insights preview context, so it is missing when the preview failed.
2. **When** (top-right, wraps to two lines): calendar icon + `<time>` weekday/day, e.g. "Sat, Oct 17".
   Then clock icon + time + zone, e.g. "14:30 EAT". Times use the **device** time zone. The zone shows
   as "EAT" in Africa/Kampala, otherwise the short zone name, e.g. "GMT+1" (messages.ts:83-84,
   114-123). If there is no kickoff: "Kickoff time not confirmed" (`details.kickoffUnknown`).
3. **Home team** (centered column): crest 40px (team logo, or initials such as "UW" when it fails or is
   missing). Name 13px bold (fallback "Home team unavailable"). Under the name, **form letters** when
   the preview has stored results: up to 5 round 18px chips W (emerald), D (grey), L (red), oldest
   first, `role="img"` with aria-label "Last five results for {team}, oldest first: Win, Win, Draw, …"
   (`details.lastFive`, `details.result.W/D/L`). The letters are absent when there are no records.
4. **Versus / score** (center):
   - Not played: a 36px round grey pill "VS" (`details.versus`). A finished or awarded match without a
     score shows "–" instead.
   - Played (score present and status live / finished-* / awarded): 20px bold score
     "{home} – {away}", e.g. "4 – 2".
   - Status line under it, 11px bold muted. It is shown when played **or** when the status is not
     `scheduled`:
     - live with minute: "67′" (`match.clock.minute`), in live red (`color.live.text`)
     - live with phase only: "HT" / "1st half" / "2nd half" / "Extra time" / "Break" / "Penalties" /
       "Interrupted" / "Suspended" / "In play" (`match.clock.*`)
     - live with no clock: "Live"
     - other statuses (`match.status.*`): "Finished", "Finished after extra time", "Finished after
       penalties", "Postponed", "Canceled", "Abandoned", "Awarded", "Match status unavailable"
     - scheduled: no status line.
5. **Away team**: mirrors the home team (fallback "Away team unavailable").
6. **Top pick button**, full width (match-banner.tsx:208-223):
   - **Published**: an orange-tinted gradient button with a `#FDBA74` border. Left column:
     - "★ Top pick" (`details.topPick`, orange 11px bold)
     - strong 14px "{code} – {pick}", e.g. "DC – Arsenal or draw" (`market.code.*` + `details.pick.*`)
     - muted 11px "Odds: — · {source}", e.g. "Odds: — · AI prediction" (`details.odds`,
       `market.source.ai` / "API-Football fallback")

     Right box: orange gradient with white text, big 18px "74%" and 10px "Estimated probability"
     (`details.estimatedProbability`) wrapped under it. The featured family is the one with the highest
     unrounded selected probability; ties go to the higher fresh price, then policy order
     (market-ranking.ts:16-29). Accessible name: "Open top pick: {market}, {pick}, estimated
     probability {probability}" (`details.featuredOpen`), e.g. "Open top pick: Double chance, Arsenal
     or draw, estimated probability 74%".
   - **No pick**: a disabled grey `cardHeader` box with the "★ Top pick" label, strong "No prediction
     published" (`details.noPick`), and a muted reason (`match.noPickReason.*`, from
     `noPickReason()` in feed-presentation.ts:21-29). The reason is one of: "Not available for this
     market", "Predictions start within 7 days", "Prediction updating", "Not predicted", "No prediction
     locked", "Prediction failed", "Awaiting prediction".

### B2. Market tiles: `MarketTiles` (match-banner.tsx:227-288)
`role="list"` with aria-label "Market summaries" (`details.marketSummary`). A **2×2** grid on phones
(4 across from 48rem), gap 6px. There is one `<button>` tile per published family, in policy order:

| Tile | Icon (accent) | Code (`market.code.*`) | Pick line (`details.pick.*` or "Not available") | Value |
| --- | --- | --- | --- | --- |
| 1 | Result icon (orange) | "1X2" | "{home} win" / "Draw" / "{away} win" | "48%" + odds chip "—" |
| 2 | Shield icon (violet) | "DC" | "{home} or draw" / "{away} or draw" / "{home} or {away}" | "74%" + "—" |
| 3 | Goals icon (blue) | "O/U 2.5" | "Over 2.5" / "Under 2.5" | "61%" + "—" |
| 4 | Both-teams icon (teal) | "BTTS" | "Yes" / "No" | "58%" + "—" |

Each tile has a 20px icon badge on the left, code (12px bold), pick (11px muted, ellipsis), value (16px
bold %) with a grey "—" odds chip (`title="Bookmaker odds are not imported yet."`), and a chevron on the
right. The **featured** family's tile has an orange-soft fill, a `#FDBA74` border and an orange %. If no
pick exists, the pick reads "Not available" (`details.notAvailable`) and the value "—". Accessible name:
"Open {market} details: {pick}, estimated probability {probability}" (`details.tileOpen`; market names
`details.market.*`: "Match result (1X2)", "Double chance", "Over/Under 2.5 goals", "Both teams to score").

### B3. All Markets & Odds card: `MarketsCard` (markets-card.tsx:211-264), full width, **open by default**
Card header button: orange icon badge, "All Markets & Odds" (`details.allMarkets`), meta
"{count} of {total} published" (e.g. "4 of 4 published" or "0 of 4 published",
`details.publishedCount`), and a chevron rotated 90° while open. When open (`mk` absent), top to bottom:
- Search field: placeholder and aria-label "Search markets" (`details.searchMarkets`).
- Horizontally scrolling category chips (`role="group"`, aria-label "Market categories"):
  - "Popular", "Results", "Goals", "Both teams", "Double chance"
  - "Draw no bet", "Handicaps", "Corners", "Cards", "Halves", "Correct score", "Clean sheets",
    "Players & specials"

  The selected chip has a blue solid fill (`aria-pressed`). The chips are hidden while a search is
  typed.
- Column header (because the full-width card is 20rem or wider): "Market", "Our prediction",
  "Probability", "Odds".
- One row button per family, e.g. "Match result (1X2)" | pill "Arsenal win" (orange pill when featured,
  blue otherwise, dimmed "Not available" pill when missing) | "48%" (the bar is hidden at this width) |
  "—" | chevron.
- Empty notes:
  - "No supported market matches “{query}”."
  - "No {category} markets are published for this match."
  - "Goal Hint currently publishes match result (1X2), double chance, total goals over/under 2.5 and
    both-teams-to-score probabilities."
- Dashed footer:
  - "Odds show as — because bookmaker odds are not imported yet; no odds comparison, movement or value
    rating is shown." (`details.oddsFooter`)
  - "Probabilities are Goal Hint estimates, not bookmaker odds and not guarantees."
    (`details.probabilityNotOdds`)

Collapsed (`?mk=closed`): only the header and a link button "Show all markets" (`details.showMarkets`).
Opening a row, a tile or the top pick shows the nested **market panel** in place of the list
(`?market=<family>`, other group).

### B4. Section-card grid (match-details.tsx:124-154, 241-253)
At 375px the grid has **two columns** (`@media (min-width: 22rem)`), with an 8px gap and
`grid-auto-flow: row dense`, `align-items: start`. Full-width items are: markets, history, any opened
card, and Referee (whenever nothing else is open, or History is open, so that Referee does not sit alone
in a row). Each half-width card is about 167px wide with a content box of about 150px (about 9.4rem).
So these container-query rules are **all active on phones**:
- the header meta count is hidden (`max-width: 16rem`, details-ui.tsx:101)
- Head to Head preview rows are hidden (`min-width: 17rem`, team-sections.tsx:315-318)
- News shows only the 1st item (info-sections.tsx:31-34)
- Team Form stacks the two teams and hides the sparkline (team-sections.tsx:243-257)
- the Lineups mini pitch is hidden (`min-width: 15rem`, squad-sections.tsx:78-80)
- Facts are stacked, with the label above the value (details-ui.tsx:417-428)

Shared card anatomy (`SectionCard`, section-card.tsx:13-51; `Card`/`CardHeader`, details-ui.tsx:53-134):
- `<h2>` containing a **header button**: a 20px tinted icon badge, the title (13px bold, balanced
  wrap), the meta (hidden on phone two-up cards) and a chevron-right. `aria-expanded` and
  `aria-controls="section-{id}"`.
- **Preview area**: a tap anywhere on plain content opens the section, while rows inside it open their
  own item.
- **"View …" link button**: 12px bold blue, followed by an arrow. It opens the section.
- Cards have a 1px border, radius 0 and no shadow. The border takes the accent color while open.

Cards in DOM / reading order:

| # | id (`?section=`) | Title | Icon / accent | Meta when data exists (hidden on phone half-width) | Preview, populated | Preview, empty | "View …" label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `stats` | "Team Comparison" | compare / orange | — | Row of both crests + names. Row "48%  Win probability  27%" (`details.winProbability`, only when 1X2 is published). 4 mirrored bar rows, each with the label on its own line above the bars: "Points per game" 2.1 / 2.3, "Goals scored per game" 1.9 / 2.2, "Goals conceded per game" 0.8 / 1.0, "Win rate" 60% / 70%. Note "Home: 10 results. Away: 10 results." (`details.comparisonSample`) | Crest/name row, then "No verified results are stored for this team yet." | "View full comparison" |
| 2 | `h2h` | "Head to Head" | head-to-head / violet | "5 meetings" | "Last 5 meetings" + 5 W/D/L chips for the home team. The meeting rows (date, teams, score, letter) are **hidden on phone** | "No previous meetings between these teams are stored." | "View full head to head history" |
| 3 | `form` | "Team Form" | form / emerald | — | For each team: crest + name, 5 letter chips, "Goals 9 · Conceded 4" (`details.goalsLine`). Sparkline hidden on phone | Crest + name, "No results" (`details.noResults`), per team | "View full form" |
| 4 | `lineups` | "Lineups" | lineup / emerald | "Confirmed" | Home crest + "4-3-3", away crest + "4-2-3-1" ("Formation unknown" fallback). Mini pitch hidden on phone | "No confirmed lineup has been published for this match yet." | "View lineups" |
| 5 | `players` | "Players" | player / blue | "36 players" | 3 rows: initials avatar "BS", bold "Bukayo Saka", muted "Arsenal · F · #7", pill "Starter" (emerald) / "Substitute" (blue) / injury pill "Out" (red) / "Doubtful" (amber) / "Status unclear" (blue) | "No player records are stored for this match yet." | "View all players" |
| 6 | `news` | "News & Insights" | news / blue | "3 items" | 1 row on phone: pill "Report" (blue) or "Analysis" (violet), 2-line-clamped title, muted "BBC Sport · Oct 16, 2026, 18:05 EAT" | "No match news or analysis is stored for this match." | "View all news and insights" |
| 7 | `injuries` | "Injuries & Suspensions" | plus / red | "2 absences" | Up to 3 rows: red + icon, bold "Ben White", muted "Arsenal · Knee Injury · {reason}", pill "Out" / "Doubtful" / "Status unclear" | "No absences are reported in the stored evidence." | "View full injuries list" |
| 8 | `context` | "Match Context" | context / amber | — | Facts: "Competition" → "Premier League · Regular Season - 8"; "Venue" → "Not available"; "Weather" → "Not available" (always) | Same facts. Competition falls back to "Competition unavailable" | "View full match context" |
| 9 | `referee` | "Referee" | whistle / violet | — | Facts: "Referee" → "Not available" (always; no data is collected) | same | "View referee details" |
| 10 | `history` | "Prediction History" | history / teal | "3 revisions" (+ "+" when more pages exist) | "Latest revision published Oct 16, 2026, 09:12 EAT" (`details.latestRevision`) | "No prediction revision has been published for this match." | "View prediction history" |

The previews come from one server read (`readPublicMatchInsights` → `insightsPreview`, limits: form 10,
meetings 5, players 6, injuries 6, news 3, stats 6). If that read fails, `preview = null` and **every**
card shows its empty text (match-detail-route.tsx:57-62).

### B5. Page disclaimer: `Note` (match-details.tsx:254)
"Estimated probabilities are not guarantees and are not betting advice. Opening a section reads stored
data; it never starts a new prediction." (`details.disclaimer`), 12px muted.

### B6. Shell footer (public-shell.tsx:88-108)
Brand mark + "© 2026 Goal Hint". Links "Help", "Privacy", "Terms", "Contact". Note "Estimated
probabilities, not guarantees. No betting advice." (`navigation.footerNote`). The bottom padding leaves
room for the tab bar.

### B7. Phone tab bar: `TabBar` (shell-styles.tsx:347-368; responsive-navigation.tsx)
`position: fixed` at the bottom, 42px plus the safe area, navy fill, aria-label "App sections". It is
measured to fit, so it shows 4–6 equal tabs: "Matches" (home icon), "Live", "Results", "Slip builder",
then "Help" when it fits, then "More" (a native `<details>` popup that opens upward with the remaining
"Help", "Privacy", "Terms", "Contact"). Icons are 18px with 10px labels. On this page **"Matches" is
always current** (teal text plus a 2px top indicator) because of `current="today"`
(match-detail-page.tsx:20).

---

## 5. Controls and where they lead

| Control (label / accessible name) | Result | History |
| --- | --- | --- |
| Back icon "Back to matches" | `<Link>` to the stored feed URL from `sessionStorage` (it must start with `/{locale}` and contain no `//`). Otherwise to `/{locale}` (today's feed) | New entry (forward navigation) |
| Theme toggle "Switch to light/dark theme" | Flips the theme and persists it | — |
| Search toggle "Search matches" / "Close search" | Shows or hides B0a and focuses the input | — |
| Search form "Search" | GET `/{locale}?q=…`. **Drops** the stored feed filters | New page |
| Top pick button "Open top pick: …" | `?market=<featured>` (and clears `mk=closed`). The market panel opens inside All Markets & Odds and the card scrolls into view | push |
| Market tile "Open {market} details: …" | `?market=<family>`, same as above | push |
| All Markets & Odds header button | Toggles `mk=closed`. Collapsing also clears `market` | push |
| "Show all markets" | Removes `mk=closed` | push |
| Search markets input | Filters as you type. Writes `mq` after 300 ms | replace |
| Category chip | `mcat=<category>` | replace |
| Market row | `?market=<family>` | push |
| Section header button / tap on preview / "View …" link | `?section=<id>`. The card expands to full width **in place** and its old `tab`/`item`/filter keys reset. Focus moves to a hidden `<h3>` and the card scrolls to the top | push |
| Inside an opened card: breadcrumb "Match details" | Closes the section | push |
| Inside an opened card: "Collapse {section}" (`details.collapse`) | Closes the section. Focus returns to the header button | push |
| Preview row in Players / Injuries / News / H2H (rows hidden on phone for H2H) | `?section=<id>&item=<key>`, which opens the section straight to that item | push |
| Browser Back / Forward | Steps through the section/item/market states above, then leaves for the feed | — |
| Tab bar tabs | Matches → today's feed (device-zone href); Live → `?status=live`; Results → today's results; Slip builder → `/{locale}/slips`; More → info pages | New page |
| Footer links | Help / Privacy / Terms / Contact pages | New page |

Only one section can be open at a time. Deep links such as `?section=h2h&venue=home&page=2` render on the
server in the open state, and the full section data then loads on the client.

---

## 6. States

**Page level**
- **OK**: B0–B7 as above.
- **Unavailable** (`result.data === null`; match-detail-page.tsx:23-28): `PublicShell app={false}`, so
  the phone shows the **shell header** (Goal Hint logo + theme toggle) and **no** detail bar or Back.
  Content:
  - `<h1>` "Match temporarily unavailable" (`detail.unavailableTitle`)
  - EmptyState title "The stored match could not be loaded." (`detail.unavailable`)
  - description "Try again shortly. This page reads stored data; opening it does not generate a
    prediction." (`detail.retryDescription`)
  - button link "Try again" (`feed.retry`) to `/en/matches/{id}/{slug}`. The locale is hard-coded,
    see match-detail-route.tsx:95.

  The tab bar is still shown.
- **Rate-limited**: the same layout, with title "Match requests are temporarily busy."
  (`detail.rateLimited`).
- **Not found** (malformed or unknown fixture): the global 404 with "Page not found" and "This address
  does not have a page. Use the navigation to continue." (not-found.tsx), inside the shell without
  `app`.
- **Loading**: there is **no** `loading.tsx` for this route, and the page is `force-dynamic`. After a
  card tap, the feed stays on screen until the server responds.
- **Live refresh**: polls `GET /api/matches/{id}` every **20 s** while live, while the daily run is
  updating, or within 30 min of kickoff. Otherwise it polls every **60 s**
  (live-match-detail.tsx:55-59; live-refresh.ts:8). Changes re-render silently. There is no
  "Last synced" indicator or spinner on the overview.

**Match status (banner)**
- **upcoming / scheduled**: "VS" pill, no status line.
- **live**: score plus a red minute or phase.
- **finished / AET / pens**: score plus "Finished…".
- **postponed / canceled / abandoned**: "VS" plus the status.
- **awarded**: the score, or "–", plus "Awarded".
- **unknown**: "VS" plus "Match status unavailable".
- **unknown kickoff**: "Kickoff time not confirmed".

**Prediction**
- **Top pick**: published (orange) or "No prediction published" plus one of the 7 reasons.
- **Tiles**: each one either has a pick or shows "Not available"/"—". The featured tile is highlighted.
- **Markets meta**: "0 of 4 published" to "4 of 4 published".
- **Source**: "AI prediction" or "API-Football fallback" on the top-pick line.
- **Not on the overview**: Provisional ("Provisional estimate"), fallback reasons, outcome badges
  (Correct / Incorrect / Pending / Void / Unavailable), applicability (current, locked, void,
  historical), settlement or void times, and "Limited news coverage". These appear **only** inside the
  market panel or Prediction History.
- **Odds**: always "—" (`publicPolicy.features.providerOdds = false`).

**Sections**
- **Preview**: present (populated) or empty text, per card.
- **Preview read failed**: every card shows its empty text. There is no separate error state.
- **Opened section**: shows "Loading every record for this section…" (`role="status"`) while loading.
- **Section load failed**: shows "This section could not be loaded. The preview above is still shown."
  plus a "Try again" link button (`role="alert"`).
- **History auto-open**: happens when history query keys are present.

**UI**
- Search open or closed.
- Light or dark theme.
- Tab bar with More open or closed.
- Reduced motion: no chevron transition, instant scroll.

---

## 7. Current phone layout at 375px (from the screenshots plus CSS)

1. **0–52px**: navy detail bar: ‹ | "Match details" | ☀/☾ | 🔍, with a teal 2px edge. It scrolls away.
   The shell header is hidden on phones for `app` pages.
2. **~62–280px**: banner card, with 16px side gutters because the page is **not** `compact`.
   - Competition (logo, name, round · country) on the left; date and time in two lines on the right.
   - Crests (40px) and names, with "VS" or the score in the middle.
   - Full-width Top pick box (about 70px tall).
3. **~290–425px**: 2×2 market tiles (about 64px each).
4. **~433px → about 1.1 screens**: All Markets & Odds, open, containing:
   - search
   - chip row, cut off at the right edge ("Double ch…")
   - table header
   - 4 rows: names truncated ("Match resu…", "Double cha…", "Over/Unde…", "Both team…"), "Not
     available" pills clipped
   - two footer notes

   The first section card starts at about 780px, below the first screen.
5. **Two-up section cards**:
   - "Team Comparison" | "Head to Head"
   - "Team Form" | "Lineups"
   - "Players" | "News & Insights"
   - "Injuries & Suspensions" | "Match Context"

   Cards in a row have unequal heights (`align-items: start`), which leaves ragged gaps. Long "View …"
   links wrap to 2 lines and leave the arrow alone on its own line ("View all news and insights →").
6. Full-width "Referee", then full-width "Prediction History".
7. The disclaimer paragraph, then the shell footer.
8. **Fixed** tab bar, 42px, over the bottom of the viewport the whole time.

The total is about 3 phone screens with no section open. Fixed or sticky elements: **only the tab bar**.

---

## 8. Friction points against the 5 criteria (with evidence)

### Uniformity
1. **Market colors disagree with the feed.**
   - The feed card uses `theme.color.market`: 1X2 emerald, DC violet, O/U blue, BTTS orange
     (theme.ts:206-211, match-card.tsx:403-462).
   - Details uses `familyAccent`: 1X2 **orange**, DC violet, O/U blue, BTTS **teal**
     (match-banner.tsx:19-21).
   - The details top pick is orange whatever its market (match-banner.tsx:137-138).
2. **Status wording disagrees.**
   - The feed shows "Upcoming", "Ended", "FT"/"AET"/"Pens" chips, a live dot chip, "+stoppage" and a
     "*" regulation-only marker (match-card.tsx:531-588).
   - The banner shows nothing for scheduled matches, "Finished…" for finished ones, plain red text for
     live, and no stoppage or regulation note (match-banner.tsx:180-182, 203-204).
3. **The phone bar differs from the feed bar.**
   - Feed `AppBrandBar`: 3rem tall, 8px gutter, logo plus theme toggle (app-brand-bar.tsx:12-25).
   - Details `PhoneBar`: 3.25rem tall, 16px gutter, back, title, theme toggle and search
     (match-details.tsx:42-56).
   - The feed page is `compact` (8px gutters); the details page is not (match-detail-page.tsx:20 vs
     match-feed-page.tsx:15).
4. **Probability formatting differs.** Details uses `Math.round` (labels.ts:14-16). The feed uses the
   probability label rules "<1%" / ">99%" (`probability.compact.*`).
5. **Navigation naming is inconsistent.** The tab is "Matches", the phone back is "Back to matches", the
   desktop back is "Back to Predictions", and the desktop nav says "Predictions" (en.ts:35-36, 419-420;
   public-shell.tsx:54).
6. **Hard-coded colors bypass the tokens:** `#FDBA74` borders (match-banner.tsx:138, 244) and the
   lineup pitch greens (squad-sections.tsx:86, 104).

### Simplicity
1. **The same four picks appear three times in a row**: Top pick, 4 tiles, then the All Markets & Odds
   table (match-details.tsx:239-242). On top of that, the table is **open by default**
   (`marketsOpen: true`, match-view.ts:296) and pushes every section below the first screen.
2. **Permanently empty UI.**
   - Odds "—" appears on the top pick, all 4 tiles and every table row (always, with providerOdds off).
   - 8 of 13 category chips always say "No … markets are published"
     (match-details.ts:14-28 in domain).
   - The Referee card is always "Not available" (info-sections.tsx:184-195).
   - Match Context's preview is 2 of 3 rows "Not available" (info-sections.tsx:137-141).
3. **Three affordances for one action per card**: header button with chevron, tap on preview, and
   "View …" link (section-card.tsx:32-39).
4. **Stacked disclaimers at the bottom**: the markets footer (2 notes), the page disclaimer and the
   footer note all say "estimates, not guarantees / not betting advice" (markets-card.tsx:256-259,
   match-details.tsx:254, public-shell.tsx:106).
5. **Ragged two-up grid.** Unequal card heights with `align-items: start` leave empty patches
   (screenshot 05). Opening a card reorders the others because of `grid-auto-flow: row dense`. For
   example, opening H2H moves Team Form up beside Team Comparison (match-details.tsx:127-132).

### Accessibility
1. **The top-pick probability box fails contrast in light theme.** White (`onBrand`) sits on the
   orange gradient `#EA580C→#D97706`, about 3.2–3.6:1, below the 4.5:1 needed for 18px bold "74%" and
   10px "Estimated probability" (match-banner.tsx:150-159; theme.ts accent.orange.gradient).
2. **Small touch targets.** Bar icons are 32×32 (match-details.tsx:61-88). Card header buttons are 30px
   tall (details-ui.tsx:83). "View …" and "Collapse" link buttons are 24px (details-ui.tsx:152).
   Category chips are 26px (details-ui.tsx:236). All pass the 24px minimum but sit well below 44px.
3. **Label-in-name mismatch (WCAG 2.5.3).** Tiles and the top pick show "DC" / "O/U 2.5" / "BTTS", but
   their accessible names say "Double chance" / "Over/Under 2.5 goals" / "Both teams to score"
   (match-banner.tsx:209-213, 278-280; en.ts:401-404, 467-470).
4. **The score has no spoken label.** The banner reads "4 – 2 Finished" or "67′". The feed provides a
   "Final score: …" scoreline and spoken live-clock labels (match-card.tsx:531-540, 565-571 vs
   match-banner.tsx:203-204).
5. **Information is lost on phones.** Section counts are hidden (details-ui.tsx:101). The odds
   explanation lives only in a `title` tooltip, which cannot be reached on touch
   (match-banner.tsx:282). Meta text is 10–11px (`micro`/`caption`).
6. **The theme toggle labels are not localized** (theme-toggle.tsx: "Switch to light theme" /
   "Switch to dark theme").

### Easy navigation
1. **The phone bar is not sticky.** Back and search scroll away on a page about 3 screens long
   (match-details.tsx:42-56 has no `position: sticky`).
2. **The tab bar always highlights "Matches"**, even when the user came from Live or Results
   (match-detail-page.tsx:20). Tapping "Matches" goes to today's feed, not to the user's filtered list.
3. **Two different "backs".** The header Back is a forward `<Link>` to the stored URL, with a fallback
   to `/{locale}` when storage is blocked (match-details.tsx:157-165). Browser Back first steps back
   through every opened section, item or market (`pushState`, use-match-view.ts:113-121). Plausible,
   needs checking: feed scroll and page restoration is keyed to the history entry
   (feed-restoration.ts:8-18), so the header Back may land at the top of the list.
4. **Header search drops the user's feed filters**: GET to `/{locale}` with only `q`
   (match-details.tsx:196).
5. **The unavailable state has no Back link or phone title bar.** Its retry link hard-codes `/en/`
   (match-detail-page.tsx:20-28; match-detail-route.tsx:95).

### Short flows
1. **Checking whether the pick won takes 2 steps plus scrolling.** In a finished match the overview
   shows no outcome. The user has to open a tile, then read "Prediction outcome" near the end of the
   panel (markets-card.tsx:165). The feed card shows the result at a glance (match-card.tsx:731-734).
2. **Reaching sections takes about 1 screen of scrolling** past the open markets table.
3. **Phone previews are reduced** (H2H rows, mini pitch and sparkline hidden; only 1 news item), so the
   user has to open the section to see what desktop previews show.
4. **No immediate feedback after the tap from the feed**: no `loading.tsx` on a `force-dynamic` route.

---

## 9. Must-keep constraints

- **URL-addressable view state** (match-view.ts):
  - Keys: `section`, `item`, `tab`, `team`, `venue`, `window`, `comp`, `page`, `market`, `mcat`, `mq`,
    `mk=closed`.
  - Open and close actions push history entries; tabs, filters, categories, search and paging replace
    the current entry.
  - Invalid values fall back to the defaults. History keys (`revision`, `cycle`, `limit`) are preserved.
  - Canonical slug redirect, and real 404s.
- **Server-rendered first paint**: the initial HTML contains names, kickoff, all four markets with
  probabilities and source, the score and the section previews. Do not hide the core prediction behind
  client-only UI. The section toggles and tiles are JS buttons; deep links still render the open state
  on the server.
- **Back to the stored feed URL** (`goalhint:feed-href`), with fallback `/{locale}`.
- **Accessible names**:
  - "Back to matches", "Search matches" / "Close search", and the theme-toggle labels.
  - Top pick "Open top pick: …" and tiles "Open {market} details: …".
  - Tiles list "Market summaries".
  - Visually hidden `<h1>` "{home} v {away}".
  - Form chips `role="img"` with spelled-out results.
  - Card headings as `<h2>` with an `aria-expanded` disclosure button.
  - Breadcrumb nav "Location in match details".
  - Focus moves into opened sections and returns on collapse.
- **Contrast and focus**: text meets 4.5:1 in both themes; tokens are tested, and the current
  orange-gradient exception is a bug. Focus rings are 3px (`color.focus`; inverse teal on the navy bar).
  `scroll-margin` clears the 42px tab bar. Reduced motion is respected.
- **Disclaimers that must stay**:
  - "Estimated probabilities are not guarantees and are not betting advice. Opening a section reads
    stored data; it never starts a new prediction."
  - "Probabilities are Goal Hint estimates, not bookmaker odds and not guarantees."
  - The odds footer, for as long as odds show "—".
  - Footer "Estimated probabilities, not guarantees. No betting advice."
- **Probability vs odds**: keep "Estimated probability" labels. Odds are a separate "—" until display
  rights exist. Show **no** confidence, value rating or odds movement.
- **Times**: device-local, with a zone label ("EAT" in Kampala) and `<time dateTime>`. Unknown kickoff
  stays explicit.
- **The scope is exactly these blocks**: banner, top pick, 4 tiles, All Markets & Odds, the 10 section
  cards (in this order), the disclaimer, the shell footer and the tab bar. Only the 4 market families
  exist. Venue, weather, standings, referee, odds and player stats are "Not available" and must not be
  invented.
- **Live polling** (20 s / 60 s) and a silent re-render. The live minute or phase stays visible in the
  banner.
- **Unavailable / rate-limited / 404 states**, with the "Try again" action and the read-only
  explanation.

---

## 10. Sample populated data (existing fields only)

**Upcoming (scheduled), light or dark**

- **Bar**: ‹ · "Match details" · ☾ · 🔍
- **Banner**:
  - Competition: Premier League logo; "Premier League"; "Regular Season - 8 · England".
  - Kickoff: "Sat, Oct 17" · "14:30 EAT".
  - Home: Arsenal crest, "Arsenal", form chips W W D W L.
  - Center: "VS".
  - Away: Liverpool crest, "Liverpool", form chips W D W W W.
- **Top pick**: "★ Top pick" / "DC – Arsenal or draw" / "Odds: — · AI prediction" | "74%" "Estimated
  probability".
- **Tiles**:
  - 1X2 "Arsenal win" 48% —
  - **DC "Arsenal or draw" 74% —** (featured)
  - O/U 2.5 "Over 2.5" 61% —
  - BTTS "Yes" 58% —
- **All Markets & Odds**: "4 of 4 published". Rows:
  - "Match result (1X2)" · "Arsenal win" · 48% · —
  - "Double chance" · "Arsenal or draw" · 74% · —
  - "Over/Under 2.5 goals" · "Over 2.5" · 61% · —
  - "Both teams to score" · "Yes" · 58% · —
- **Team Comparison**: "48%  Win probability  27%"
  - Points per game 2.1 | 2.3
  - Goals scored per game 1.9 | 2.2
  - Goals conceded per game 0.8 | 1.0
  - Win rate 60% | 70%
  - Note: "Home: 10 results. Away: 10 results."
- **Head to Head**: "Last 5 meetings" with chips W D L W D. Meta "5 meetings".
- **Team Form**:
  - Arsenal W W D W L, "Goals 9 · Conceded 4"
  - Liverpool W D W W W, "Goals 12 · Conceded 5"
- **Lineups**: Arsenal "4-3-3", Liverpool "4-2-3-1". Meta "Confirmed".
- **Players** (meta "36 players"):
  - "Bukayo Saka", "Arsenal · F · #7", Starter
  - "Mohamed Salah", "Liverpool · F · #11", Starter
  - "Ben White", "Arsenal · D · #4", Out
- **News & Insights** (meta "3 items"): "Report" · "Arteta confirms Saka fit for Liverpool visit" ·
  "BBC Sport · Oct 16, 2026, 18:05 EAT".
- **Injuries & Suspensions** (meta "2 absences"):
  - "Ben White", "Arsenal · Knee Injury", Out
  - "Joe Gomez", "Liverpool · Hamstring", Doubtful
- **Match Context**:
  - Competition "Premier League · Regular Season - 8"
  - Venue "Not available"
  - Weather "Not available"
- **Referee**: Referee "Not available".
- **Prediction History** (meta "3 revisions"): "Latest revision published Oct 16, 2026, 09:12 EAT".

**Live**: the same, but the center shows "2 – 1" with a red "67′" (or "HT"). Polling runs every 20 s.

**Finished (light)**:
- Banner: "Serie A" / "Regular Season - 30 · Brazil", "Tue, Oct 13" / "03:00 EAT", "RB Bragantino"
  "4 – 2" "Finished" "Cruzeiro".
- Top pick: "1X2 – RB Bragantino win" "Odds: — · AI prediction" "56%".

**No pick (screenshots)**: "★ Top pick" / "No prediction published" / "Not predicted". All tiles show
"Not available" and "—". Meta "0 of 4 published".

---

## 11. Shared components seen (file refs)

- **Phone detail bar** (`PhoneBar`, `RoundLink`, `RoundButton`, `SearchForm`):
  `src/components/match/details/match-details.tsx:42-102, 171-203`
- **Feed phone brand bar** (for uniformity): `src/components/navigation/app-brand-bar.tsx`
- **Shell** (header hidden on phones for app pages, footer, fixed tab bar, More menu):
  `src/app/_components/public-shell.tsx`, `src/components/navigation/shell-styles.tsx`,
  `src/components/navigation/responsive-navigation.tsx`
- **Theme toggle**: `src/components/ui/theme-toggle.tsx`
- **Section card shell** (`Card`, `CardHeader`, `IconBadge`, `PreviewArea`, `LinkButton`, `Crumbs`,
  `Panel`, `Choices`/`ChoiceGroup`, `Note`, `Pill`, `Facts`, `Bar`, `FormLetters`, `Crest`, `Pager`,
  `RowList`/`RowButton`, `SectionState`): `src/components/match/details/details-ui.tsx`
- **`SectionCard` / `ItemPanel`**: `src/components/match/details/section-card.tsx`
- **Banner, top pick, market tiles, `familyIcon`/`familyAccent`**:
  `src/components/match/details/match-banner.tsx`
- **Markets card**: `src/components/match/details/markets-card.tsx`
- **Section icons**: `src/components/match/details/details-icons.tsx`
- **Labels** (`pickLabel`, `marketName`, `percent`): `src/components/match/details/labels.ts`
- **Team logo with initials fallback**: `src/components/match/team-logo.tsx`
- **Outcome badge** (market panel only): `src/components/match/outcome-badge.tsx`
- **Empty state** (unavailable page): `src/components/ui/feedback.tsx`
- **Feed match card** (entry point; market colors and status chips to align with):
  `src/components/match/match-card.tsx`
- **Theme tokens**: `src/styles/theme.ts`, `assets/brand/brand-tokens.json`
