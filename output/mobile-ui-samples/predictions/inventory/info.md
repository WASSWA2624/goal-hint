# Info group inventory: News & Insights, Match Context, Referee, Prediction History (phone, 375px)

Scope: the four "info" cards at the bottom of the Match details page (`/[locale]/matches/[fixtureId]/[slug]`) and every
view they open. Each screen has up to three layers:
**preview card** (closed, on the overview) -> **opened section** (same card, full width, `?section=`) -> **item panel**
(nested in the opened section, `&item=`). Prediction History has its own server-rendered sub-levels instead of item
panels (selected publication or cycle snapshot, `?revision=` / `?cycle=`).

Screen ids: `news`, `context`, `referee`, `history`.

Sources read: `src/components/match/details/{info-sections,section-card,details-ui,use-match-view,match-details,team-sections,labels,details-icons}.tsx/.ts`,
`src/app/_components/{revision-history,match-detail-content,match-detail-page,match-detail-route}.tsx`,
`src/components/match/live-match-detail.tsx`, `src/components/ui/{disclosure,layout,controls,local-time,feedback}.tsx`,
`src/components/match/{probability-label,outcome-badge,detail-styles}.tsx`, `src/server/matches/{history-page,insights-read,detail-read,fixture-read}.ts`,
`src/domain/{match-view,match-insights,match-insight-presentation,match-detail,detail-presentation,fixture-snapshot}.ts`,
`src/i18n/messages.ts`, `src/i18n/messages/en.ts`, `src/styles/{theme.ts,global-style.tsx}`,
`docs/{match-details,revision-history-page,prediction-history}.md`.

Measured live on the running dev server at 375x812, dark theme, fixture "Always Ready v Independiente Petrolero"
(Primera División, Bolivia, finished). The local DB has no forecasts, news or revisions, so the populated states
below come from code. Two screenshots taken during measurement are saved next to this file:
`info-shots/context-open.jpg` (Match Context opened, 375px) and `info-shots/history-open-empty.jpg`
(Prediction History opened, empty; the pane rendered it slightly narrower than 375, content is exact).
The round "N" badge in screenshots is the Next.js dev indicator, not product UI.

All quoted strings are exact English values from `src/i18n/messages/en.ts` (line numbers given). `{x}` = runtime
placeholder. Times use `messages.reportingInstant` = "Oct 16, 2026, 18:05 EAT" (device zone after hydration; the
zone label reads "EAT" only in East Africa Time, otherwise e.g. "GMT+1"), `messages.reportingDay` = "Sat, Oct 10",
`messages.reportingDate` = "Friday, October 16, 2026" (`src/i18n/messages.ts:15-27, 98-116`).

---

## 0. Shared frame for all four screens

### 0.1 Where the cards sit at 375px (closed overview)
Order on the page (`match-details.tsx:236-255`): phone top bar (static, scrolls away) -> banner -> 2x2 market tiles
-> All Markets & Odds (full width, open by default) -> card grid -> page disclaimer -> footer -> fixed bottom tab bar.

Card grid (`match-details.tsx:124-154`): one column below 22rem (352px), **two-up at 375px** with
`grid-auto-flow: row dense`. Markets, History and any opened card span the full row; Referee spans the full row when
no section is open or when History is open (`match-details.tsx:132-137`).

Measured document positions (closed overview, 812px viewport):

| Card | Column | y (px) | Size (w x h) | Visible text (empty data) |
|---|---|---|---|---|
| News & Insights | right, row 3 (beside Players) | 1205 | 168 x 137 | "News & Insights" / "No match news or analysis is stored for this match." / "View all news and insights" (link wraps to 2 lines, 36px, arrow alone on line 2) |
| Match Context | right, row 4 (beside Injuries & Suspensions) | 1350 | 168 x 236 | "Match Context" / "Competition" "Primera División · Apertura - 21" / "Venue" "Not available" / "Weather" "Not available" / "View full match context" (wraps, 36px) |
| Referee | full row | 1594 | 343 x 108 | "Referee" / "Referee  Not available" / "View referee details" |
| Prediction History | full row | 1710 | 343 x 108 | "Prediction History" / "No prediction revision has been published for this match." / "View prediction history" |
| Page disclaimer | full | 1826 | 343 x 52 | "Estimated probabilities are not guarantees and are not betting advice. Opening a section reads stored data; it never starts a new prediction." (`details.disclaimer`, en.ts:489) |
| Footer | full bleed | 1902 | 375 x 139 | "© 2026 Goal Hint", Help, Privacy, Terms, Contact, "Estimated probabilities, not guarantees. No betting advice." |
| Tab bar | fixed bottom | — | 375 x 43 | Matches (current), Live, Results, Slip builder, Help, More (`shell-styles.tsx:348`) |

So News starts ~1.5 screens down and History ~2 screens down; none of the four is visible on first paint.
Reference screenshots: `reference/05-detail-sections.jpg`, `reference/06-detail-bottom.jpg`.

**Re-flow when a section opens (measured):** the opened card takes a full row and the dense grid back-fills:
- News opened: moves from right column y=1205 to a full row at y=1338 (below Players | Injuries); Context and Referee
  then sit two-up at y=1593.
- Context opened: Injuries | Referee pair up at y=1350, Context full row at y=1487 (690px tall), History at 2185.
- Referee opened: full row at y=1594 (212px tall); Injuries | Context two-up above it.
- History opened: stays at the bottom (y=1710), Referee keeps its full row.
Opening scrolls the card to the top of the viewport (smooth unless reduced motion; scroll-margin 0.75rem top /
4.5rem bottom for the tab bar) and focuses a visually hidden `<h3>` (`details-ui.tsx:47-50, 432-468`).

### 0.2 Card shell (`SectionCard`, `section-card.tsx:13-51`; primitives in `details-ui.tsx`)
- `<section data-section="{id}">` card: radius 0, 1px `color.border`; when open the border turns the section accent
  (`accent.{name}.solid`) (`details-ui.tsx:53-68`). Padding 9px 8px 10px on phones.
- Header = `<h2>` containing ONE disclosure `<button>` (min 30px tall, measured 30px): 20px icon badge (accent soft fill)
  + title (13px bold, balanced wrap) + optional meta `<small>` (11px muted) + chevron (rotates 90deg and turns blue
  when open). `aria-expanded`, `aria-controls="section-{id}"` (`details-ui.tsx:78-134`).
  Meta is hidden when the card is <= 16rem wide (`details-ui.tsx:101`), i.e. hidden on the 168px two-up cards,
  shown on full-width cards (History, any opened card).
- Closed: `PreviewArea` (tap on any non-interactive part opens the section, `section-card.tsx:34-39`) and the
  "View ..." `LinkButton` (blue `accent.blue.solid`, 12px bold, min 24px, arrow icon) (`details-ui.tsx:148-164`).
- Open: `Panel` with top divider -> breadcrumbs (`<nav aria-label="Location in match details">`, 11px, measured 17px
  tall) -> hidden `<h3>` focus target -> content -> bottom `LinkButton` "Collapse {section}" (`details.collapse`,
  en.ts:423) (`section-card.tsx:41-48`).
- Item panel (`ItemPanel`, `section-card.tsx:54-62`): "‹ Back to list" (`details.backToList`, en.ts:421) ->
  `<h4>` (14px, focused on open) -> content. Breadcrumbs become "Match details" / "{Section}" / "{item label}".

Icons and accents (`details-icons.tsx`): News = NewsIcon (newspaper), blue; Match Context = ContextIcon (stadium
bowl), amber; Referee = RefereeIcon (whistle), violet; Prediction History = HistoryIcon (counter-clockwise clock), teal.

### 0.3 Shared controls (exact behaviour)
| Control | Component / file | Phone size | Result | History entry |
|---|---|---|---|---|
| Card header button | `CardHeader` `details-ui.tsx:122-134` | 30px tall, full card width | toggles section (`openSection`, resets tab/item/page/filters) | push |
| Tap on preview content | `PreviewArea` `section-card.tsx:35-38` | whole preview | opens section | push |
| "View ..." link-button | `LinkButton` `section-card.tsx:39` | 24px (36px when wrapped) | opens section | push |
| Breadcrumb "Match details" | `Crumbs` `details-ui.tsx:177-184` | 17px tall, 11px text | closes section | push |
| Breadcrumb "{Section}" (only with an item open) | `Crumbs` | 17px | closes item | push |
| "Collapse {section}" | `LinkButton` `section-card.tsx:47` | 24px | closes section; focus returns to header button | push |
| "‹ Back to list" | `ItemPanel` `section-card.tsx:58` | 24px | closes item; focus returns to the row that opened it (`useReturnFocus`, `section-card.tsx:65-74`) | push |
| Chip group | `ChoiceGroup` `details-ui.tsx:225-260` | 26px tall, 11px text, horizontal scroll, scrollbar hidden | sets URL key, resets page to 1 | replace |
| Pager | `Pager` `details-ui.tsx:348-360` | numbered slots, "‹" / "›" | sets `page` | replace |
| List row | `RowButton` `details-ui.tsx:370-389` | min 34px | opens item panel | push |
| Browser Back/Forward | `use-match-view.ts:20-33` | — | steps through pushed entries | — |
| Top-bar back arrow (aria-label "Back to matches") | `match-details.tsx:188` | 32px | leaves Match details for the stored feed URL | navigation |

### 0.4 Data loading and shared states
- News: full list fetched on first open through `/api/matches/{id}/insights?section=news` (RTK Query, cached), unless
  the page's preview (< 5 min old) already holds every item (`use-match-view.ts:36-61`,
  `match-insight-presentation.ts:62-75`, preview keeps 3 news items).
- Context: the preview always holds the whole section, so no request when the preview is < 5 min old.
- Referee: static; no request, no loading state.
- History: server-rendered `RevisionHistory` subtree passed as `children` (`match-detail-page.tsx:21-22`,
  `live-match-detail.tsx:60`); its links are ordinary server navigations, no client fetcher.
- Section loading (News, Context): `Note role="status"` "Loading every record for this section…" (en.ts:424) above the
  content while the preview content keeps rendering (`details-ui.tsx:272-277`).
- Section error (News, Context): `Note role="alert"` "This section could not be loaded. The preview above is still
  shown." (en.ts:425) + LinkButton "Try again" (`feed.retry`, en.ts:197).
- Preview read failed (`preview === null`): News shows the empty sentence; Context falls back to fixture fields
  (competition name only, round/country "Not available"); no distinct failure message until opened.
- Page-level unavailable (detail read failed): no cards at all; "Match temporarily unavailable" page
  (`match-detail-page.tsx:23-28`) — out of this group's scope.
- Themes: light and dark tokens (`theme.ts:182-357`); screenshots are dark.

### 0.5 URL state used by these screens (`src/domain/match-view.ts`)
| Key | Values | Default (omitted) | Used by | Mode |
|---|---|---|---|---|
| `section` | `news` / `context` / `referee` / `history` | none | all | push |
| `item` | news item id (`analysis-1`, `analysis-uncertainty`, source id) or a last-result fixture id | none | news, context | push |
| `tab` | `report` / `analysis` (anything else = All) | none (All) | news | replace |
| `page` | 1–1000 | 1 | news (10 per page) | replace |
| `revision`, `cycle`, `limit`, `revisionAnchor`, `revisionBefore`, `cycleAnchor`, `cycleBefore` (+ `#revision-history`) | server-validated history cursors | none | history | full server navigation (Next `Link`, `prefetch={false}`) |

View keys are client state and are removed before the history keys are validated (`match-detail-route.tsx:43-46`);
unknown/invalid view values fall back to defaults; section keys are ignored without `section`
(`match-view.ts:53-75`). Other keys are preserved by `serializeMatchView` (`match-view.ts:78-96`).

### 0.6 Type scale and tokens used here (`src/styles/theme.ts`)
- Sizes: caption 11px (dt labels in stacked Facts, breadcrumbs, chips, pills, row meta), secondary 12px (Notes,
  Facts values, LinkButtons), body 13px (card titles, BodyText inside history, external link), emphasis 14px
  (item-panel h4, history headings on phones).
- Colours (dark / light): text `#F2F7F8` / `#102A3A`; muted `#B1BEC8` / `#486071` (7.80:1 / 6.59:1 on surface);
  surface `#1E2932` / `#FFFFFF`; LinkButton blue `#9EC5FF` / `#2563EB` (8.38:1 / 5.17:1); history TextLink teal
  `#53D5C6` / `#00645F` (8.25:1 / 7.03:1); pills blue/violet/teal soft-on-text all >= 6.5:1; pressed chip
  `onBrand` on `accent.blue.solid` 8.40:1 / 5.17:1; breadcrumb "/" separator uses `color.border` (decorative, 1.5–1.8:1).
- Accents: news blue, context amber, referee violet, history teal; news pills "Report" blue / "Analysis" violet;
  context pills "Last" teal / "Next" violet.

---

## 1. Screen `news`: News & Insights section view

### 1.1 Identity and entry
- Title: "News & Insights" (`details.section.news`, en.ts:495). Accent blue, NewsIcon.
- Preview card on the overview (right column, row 3 at 375px).
- Opened section: tap the card header, tap the preview body, or "View all news and insights"
  (`details.viewAll.news`, en.ts:505) -> URL `?section=news`. Deep link `?section=news[&tab=report|analysis][&page=2]`
  server-renders open.
- Item panel: tap a news row in the preview (opens section and item in one step, `openItem`, `info-sections.tsx:70`)
  or in the opened list -> `?section=news&item={id}`.
- Exit: "Collapse News & Insights", breadcrumb "Match details", card header, browser Back; from item: "‹ Back to list",
  breadcrumb "News & Insights", browser Back.

### 1.2 Purpose / user task
Scan the stored reports and Goal Hint's generated analysis behind the prediction, filter by type, read one item's
summary bullets and open the original report. Read-only; nothing here starts a prediction.

### 1.3 Content blocks (ordered)

**A. Preview card (closed)** (`info-sections.tsx:89-93`)
1. Header: icon + "News & Insights" + meta "{count} item(s)" (`details.itemCount`, en.ts:638: "{count} item" /
   "{count} items"; hidden on the 168px two-up card) + chevron.
2. Preview rows (`PreviewNews`, `NewsRows`, `info-sections.tsx:31-34, 67-75`): first 3 stored items, but only the
   **first row is shown when the card is < 17rem wide** (always at 375px). Each row is a `RowButton`:
   - Pill: "Report" (`details.newsKind.report`, en.ts:604, blue) or "Analysis" (`details.newsKind.analysis`,
     en.ts:605, violet).
   - Title (bold-medium, clamped to 2 lines).
   - Small muted line: "{publisher} · {publishedAt}" (time omitted when unknown).
   - Below 16rem container width the pill sits above the title; from 16rem it sits to its left.
3. Empty: Note "No match news or analysis is stored for this match." (`details.newsNone`, en.ts:608).
4. LinkButton "View all news and insights →".

**B. Opened section, list view** (`info-sections.tsx:94, 109-119`)
1. Breadcrumbs: "Match details" (button) / "News & Insights" (current).
2. (Loading/error note, see 0.4.)
3. `PanelBar` with chip group `role="group" aria-label="News type"` (`details.newsType`, en.ts:606): "All"
   (`details.allItems`, en.ts:607), "Report", "Analysis"; pressed chip = solid blue. Measured 26px tall, 11px:
   All 33px, Report 55px, Analysis 63px wide.
4. Rows (10 per page, `pageOf(filtered, view.page, 10)`, `info-sections.tsx:84`), same row anatomy as the preview;
   rows are full width so the pill sits left of the title. Or Note "No match news or analysis is stored for this
   match." when the filter has no items.
5. Pager (only when > 10 items): `<nav aria-label="Pages">` with "‹" ("Previous page"), numbered buttons
   ("Page {page}", current `aria-current="page"`, gaps "…"), "›" ("Next page") (en.ts:265-267, 632).
6. Note "Limited news coverage" (`match.limitedNews`, en.ts:316) — only when the evidence coverage flag is set.
7. Note "Reports are permitted sources from the prediction evidence; analysis items are Goal Hint's generated
   explanations." (`details.newsBasis`, en.ts:609) — always shown, also under the empty message.
8. LinkButton "Collapse News & Insights".

**C. Item panel (nested)** (`info-sections.tsx:95-108`)
1. Breadcrumbs: "Match details" / "News & Insights" (button, closes item) / "{first 60 characters of the title}"
   (current, cut without ellipsis).
2. "‹ Back to list".
3. `<h4>` full title (focused on open).
4. Pill "Report" / "Analysis".
5. Facts (`<dl>`):
   - "Publisher" (`details.publisher`, en.ts:610) -> publisher ("Goal Hint analysis" for every analysis item,
     `insights-read.ts:129-132`).
   - "Source published" (`detail.sourcePublished`, en.ts:656) -> `<time>` or "Unknown" (`detail.unknownTime`, en.ts:662).
   - "Source retrieved" (`detail.retrieved`, en.ts:659) -> `<time>` (reports only; analysis has none).
6. Bullet list of the item's stored claim summaries (`details`, max 20; reports only; inline 13px style,
   `info-sections.tsx:104-105`).
7. Note: analysis -> "Generated by Goal Hint from this revision's evidence. It is an explanation, not a news report."
   (`details.analysisNote`, en.ts:612); report -> "Summary of a permitted source; open the original report for the
   full article." (`details.reportNote`, en.ts:613).
8. External link "Read the original report" + external icon (`details.readOriginal`, en.ts:611) — only when a safe
   https URL exists (reports); opens a new tab (`target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"`).
9. LinkButton "Collapse News & Insights" (card level, below the panel).

Data fields (`newsItemSchema`, `match-insights.ts:39-41`): `id`, `kind` (report|analysis), `publisher`, `title`,
`url` (https or null), `publishedAt` (nullable), `retrievedAt` (nullable), `details[]`. Section flag `limitedNews`.
Reports come first (evidence sources of kind news, max 60), then analysis reasons ("analysis-1".."analysis-4") and
the key uncertainty ("analysis-uncertainty") of the current revision, all with publishedAt = revision publish time
(`insights-read.ts:121-133`). Max 80 items.

### 1.4 Controls and actions
| Control (label / accessible name) | Result | Mode |
|---|---|---|
| Card header "News & Insights" button | open/close section | push |
| Preview body tap | open section | push |
| Preview row button | open section straight to that item | push |
| "View all news and insights" | open section | push |
| Chip "All" / "Report" / "Analysis" (group "News type") | `tab=` (null/report/analysis), page reset to 1 | replace |
| List row button (title text is the name) | open item panel `item={id}` | push |
| Pager "Previous page" / "Page {n}" / "Next page" | `page=` | replace |
| "‹ Back to list" / breadcrumb "News & Insights" | close item, focus back on its row, filters and page kept | push |
| "Read the original report" | opens publisher URL in a new tab | external |
| Breadcrumb "Match details" / "Collapse News & Insights" / header | close section | push |
| "Try again" (error note) | refetch this section only | — |

### 1.5 States
- Empty (current local data): preview "No match news or analysis is stored for this match."; opened: chips + same
  sentence + newsBasis note (card 343 x 247px measured).
- Populated, reports only (analysis withheld or no revision): only "Report" pills.
- Populated with analysis (published revision with available analysis): reports then 2–4 "Analysis" reasons + 1
  uncertainty item.
- Filtered to a type with no items: the empty sentence under the chips.
- Multi-page: > 10 items -> Pager.
- Limited coverage: extra Note "Limited news coverage".
- Item without URL (all analysis, some reports): no external link; reports without URL still show reportNote that
  says "open the original report" (no link to open).
- Item with unknown publish time: row meta shows publisher only; panel shows "Unknown".
- Loading / error: see 0.4. Preview-read failure looks identical to empty.
- Match status (upcoming/live/finished) does not change this section; analysis items exist only once a revision is
  published.

### 1.6 Current phone layout (375px)
Closed: right-column card 168 x 137px at y=1205 (empty). Header one line; preview 150px wide; "View all news and
insights" wraps to two lines with the arrow alone on the second line. Populated: pill above a 2-line title and a
muted meta line; still only one row visible.
Opened: card jumps to a full-width row at y=1338 and scrolls to the top; breadcrumbs (17px), chip row (26px), rows
(full width, pill left of a 2-line title), notes, "Collapse News & Insights" at the bottom. Phone top bar is not
sticky; the 43px tab bar stays fixed at the bottom.
Item panel: replaces the list inside the same card; "‹ Back to list" above the title; external link at the bottom.

### 1.7 Friction points
| Criterion | Issue | Evidence |
|---|---|---|
| Simplicity / Easy navigation | Closed card at 375px shows 1 of the 3 preview items and hides the item count, so the visitor cannot tell how much news exists before opening. | `info-sections.tsx:31-34` (`17rem` rule), `details-ui.tsx:101` (meta hidden <= 16rem); measured card width 168px |
| Uniformity | "View all news and insights" wraps to 2 lines (36px) and orphans the arrow; same for "View full match context", unlike the one-line links of full-width cards. | measured 150 x 36px; `reference/05-detail-sections.jpg` |
| Easy navigation | Opening News moves the card from the right column (y=1205) to a new full-width row below Players/Injuries (y=1338); with reduced motion the page jumps. | measured; `match-details.tsx:128-137` (`row dense`, open card spans 1/-1) |
| Accessibility | Small targets: chips 26px tall with 11px text; breadcrumb buttons 17px tall with 11px text; LinkButtons 24px. | `details-ui.tsx:152, 169, 236, 243`; measured |
| Accessibility | "Read the original report" opens a new tab but neither text nor accessible name says so (icon is `aria-hidden`). | `info-sections.tsx:107-108`, `details-icons.tsx:8-11` |
| Uniformity | Three different link treatments for the same "text action" role: blue bold 12px LinkButton, blue bold 13px external link, teal underlined TextLink in History. Detail bullets use an inline 13px style while Notes are 12px. | `details-ui.tsx:148-164`, `info-sections.tsx:36-45, 104`, `controls.tsx:128-145` |
| Simplicity | The basis note is shown under the empty message and on every list page; limited-coverage note adds another line; item panel adds a third note. | `info-sections.tsx:106, 115-118` |
| Simplicity | Breadcrumb item label is the title cut at 60 characters with no ellipsis. | `info-sections.tsx:91` |
| Accessibility / States | When the insights preview read fails, the card says "No match news or analysis is stored for this match." — a failure reads as "no news". | `info-sections.tsx:92-93`, `match-detail-route.tsx:27-32` (preview null on failure) |
| Short flows | Two closing levels inside one card: "‹ Back to list" at the top of an item, "Collapse News & Insights" only at the very bottom; no close control near the top of a long list except the 17px breadcrumb or the header chevron. | `section-card.tsx:41-48, 58` |

### 1.8 Must keep
- Labels: "News & Insights", "View all news and insights", "Collapse News & Insights", chips "All" / "Report" /
  "Analysis" in group "News type", "‹ Back to list", "Publisher", "Source published", "Source retrieved", "Unknown",
  "Read the original report".
- Report vs Analysis must stay visibly distinct (pill text, not colour alone) and the two explanatory notes
  (`details.analysisNote`, `details.reportNote`) plus `details.newsBasis` and `match.limitedNews` must remain.
- URL state: `section=news`, `tab`, `page`, `item`; open/close push, tab/page replace; deep links render server-side.
- External link only for https URLs, `rel="noopener noreferrer"`, `referrerPolicy="no-referrer"`, new tab.
- Accessible: header disclosure button with `aria-expanded`/`aria-controls`; chips `aria-pressed` in a labelled group;
  pager `nav` "Pages" with named buttons and `aria-current="page"`; `<time dateTime>`; focus moves to the hidden
  heading / item `<h4>` and back to the originating row; loading `role="status"`, error `role="alert"` + "Try again".
- Every page of the complete collection stays reachable (no silent truncation beyond the 80-item cap).
- 4.5:1 text contrast (pill text/soft and link colours above pass).

### 1.9 Sample data (populated, existing fields only; same fixture as `detail.md`: Arsenal v Liverpool)
Variant A (matches `detail.md` overview, analysis withheld): meta "3 items"
1. Report · "Arteta confirms Saka fit for Liverpool visit" · "BBC Sport · Oct 16, 2026, 18:05 EAT"
2. Report · "Liverpool travel with full-strength squad for Emirates trip" · "Liverpool Echo · Oct 16, 2026, 12:40 EAT"
3. Report · "Arsenal unbeaten in last nine home league games" · "Sky Sports · Oct 15, 2026, 21:10 EAT"

Variant B (revision with available analysis): meta "6 items" = the 3 reports above, then
4. Analysis · "Arsenal have lost one of their last ten stored home league results." · "Goal Hint analysis · Oct 16, 2026, 09:12 EAT"
5. Analysis · "Liverpool scored in each of their last five stored away results." · "Goal Hint analysis · Oct 16, 2026, 09:12 EAT"
6. Analysis · "Team news after the evidence cutoff could change the starting line-ups." · "Goal Hint analysis · Oct 16, 2026, 09:12 EAT"

Item panel for item 1: h4 "Arteta confirms Saka fit for Liverpool visit"; Pill "Report"; Publisher "BBC Sport";
Source published "Oct 16, 2026, 18:05 EAT"; Source retrieved "Oct 16, 2026, 18:40 EAT"; bullets "Saka trained fully on
Thursday and is available for selection." / "Ben White remains out with a knee injury."; Note reportNote; link
"Read the original report". Breadcrumb: "Match details / News & Insights / Arteta confirms Saka fit for Liverpool visit".
Item panel for item 4: Pill "Analysis"; Publisher "Goal Hint analysis"; Source published "Oct 16, 2026, 09:12 EAT";
no "Source retrieved", no bullets, Note analysisNote, no external link.

---

## 2. Screen `context`: Match Context section view

### 2.1 Identity and entry
- Title: "Match Context" (`details.section.context`, en.ts:497). Accent amber, ContextIcon. No header meta.
- Preview card: right column, row 4 at 375px (beside Injuries & Suspensions).
- Opened section: header, preview tap or "View full match context" (`details.viewAll.context`, en.ts:507) -> `?section=context`.
- Item panel (last result record): tap a "Last" row -> `?section=context&item={fixtureId}`; deep links to an id that
  is not one of the two last results fall back to the list.
- Leaves the page: the "Next" fixture row is a link to that fixture's Match details page; "Open this match's page"
  in the record panel goes to the past fixture's page.

### 2.2 Purpose / user task
Check the fixture's setting (competition, country, round, kickoff, status) and each team's schedule load: rest days
before kickoff, last stored verified result and next stored fixture. Venue, weather, standings are explicitly not
collected.

### 2.3 Content blocks (ordered)

**A. Preview card (closed)** (`info-sections.tsx:135-141`) — Facts, stacked label-over-value at 168px:
1. "Competition" (`details.competition`, en.ts:551) -> "{competition name} · {round}" (either part omitted when
   missing; "Competition unavailable" `match.competitionUnknown` en.ts:293 when both are missing).
2. "Venue" (`details.venue`, en.ts:532) -> "Not available" (`details.notAvailable`, en.ts:439) — always.
3. "Weather" (`details.weather`, en.ts:616) -> "Not available" — always.
4. LinkButton "View full match context →".

**B. Opened section** (`info-sections.tsx:142-180`)
1. Breadcrumbs "Match details" / "Match Context".
2. (Loading/error note.)
3. Facts (two columns at 375px: label column 130px, value 184px, both 12px):
   - "Competition" -> competition logo (18px) + name, or "Competition unavailable".
   - "Country" (`details.country`, en.ts:614) -> country or "Not available".
   - "Round" (`details.round`, en.ts:615) -> round or "Not available".
   - "Kickoff" (`match.kickoff`, en.ts:295) -> `<time>` "Oct 17, 2026, 14:30 EAT" or "Kickoff time not confirmed"
     (`details.kickoffUnknown`, en.ts:427).
   - "Status" (`details.status`, en.ts:554) -> match status label (`match.status.*`, en.ts:321-332: "Scheduled",
     "Upcoming", "Ended", "Live", "Finished", "Finished after extra time", "Finished after penalties", "Postponed",
     "Canceled", "Abandoned", "Awarded", "Match status unavailable").
   - "Venue" -> "Not available"; "Weather" -> "Not available"; "Standings" (`details.standings`, en.ts:617) -> "Not available".
   - "Rest before kickoff ({team})" (`details.restFor`, en.ts:618) for home, then away -> "{days} days"
     (`details.restDays`, en.ts:619; max 1 decimal, e.g. "6.9 days") or "Not available".
4. Note "Rest is derived from each team's last stored verified result; earlier fixtures the provider has not imported
   are not counted." (`details.restBasis`, en.ts:620).
5. Bold "Surrounding fixtures" (`details.schedule`, en.ts:621).
6. List, one block per team (home, then away), 12px:
   - Bold team name.
   - Last result: `RowButton` [Pill "Last" (`details.lastResult`, en.ts:622, teal)] "{home} {homeGoals}–{awayGoals}
     {away}" [`<time>` "Sat, Oct 10"], or Note "No earlier result stored." (`details.noLastResult`, en.ts:624).
   - Next fixture: link [Pill "Next" (`details.nextFixture`, en.ts:623, violet)] [16px crest] "{home} – {away}"
     [date "Wed, Oct 21" right-aligned], or Note "No later fixture stored." (`details.noNextFixture`, en.ts:625).
7. Note "Venue, weather and standings are not collected yet, so none are shown." (`details.contextMissing`, en.ts:626).
8. LinkButton "Collapse Match Context".

**C. Item panel: last-result record** (`RecordPanel`, `team-sections.tsx:97-112`)
1. Breadcrumbs "Match details" / "Match Context" / "{home} v {away}" (`match.title`, en.ts:294).
2. "‹ Back to list"; `<h4>` "{home} v {away}".
3. Facts: "Date" (`details.date`, en.ts:550) -> `<time>` "Oct 10, 2026, 17:00 EAT"; "Competition" -> name or
   "Competition unavailable"; "Score" (`details.score`, en.ts:553) -> bold "{home} {n} – {n} {away}"; "Status" ->
   "Finished" / "Finished after extra time" / "Finished after penalties". Unknown team names -> "Team unavailable"
   (`details.teamUnknown`, en.ts:549).
4. Note "Verified regulation-time score, including stoppage time and excluding extra time and penalties."
   (`details.regulationNote`, en.ts:555).
5. Link "Open this match's page" (`details.openMatch`, en.ts:556) -> that fixture's Match details page.

Data fields (`match-insights.ts:56-61`): `competition {id, name, country, logoUrl, round}`, `kickoffAt`,
`restDays {home, away}` (days, nullable), `lastResults {home, away}` (InsightResult: fixtureId, slug, kickoffAt,
competition, home/away team {id, name, logoUrl}, homeGoals, awayGoals, status), `nextFixtures {home, away}`
(fixtureId, slug, kickoffAt, competition, home, away). Kickoff and status in the opened view come from the live
fixture (`data.fixture`), so they update with polling.

### 2.4 Controls and actions
| Control | Result | Mode |
|---|---|---|
| Card header "Match Context" / preview tap / "View full match context" | open section | push |
| "Last" row button (name = pill + score text + date) | open record panel `item={fixtureId}` | push |
| "Next" row link (name = "Next {home} – {away} {date}") | navigates to the next fixture's Match details page | navigation |
| "‹ Back to list" / breadcrumb "Match Context" | close record panel, focus back on the row | push |
| "Open this match's page" | navigates to the past fixture's page | navigation |
| Breadcrumb "Match details" / "Collapse Match Context" / header | close section | push |
| "Try again" | refetch section | — |

### 2.5 States
- Typical today (verified local): preview "Primera División · Apertura - 21", Venue/Weather "Not available"; opened:
  Country "Bolivia", Round "Apertura - 21", Kickoff "Oct 13, 2026, 00:15 EAT", Status "Finished", rest "Not
  available" for both, both teams "No earlier result stored." / "No later fixture stored." (`info-shots/context-open.jpg`;
  opened card 343 x 690px).
- Populated: rest days, Last and Next rows per team.
- Upcoming / live / finished / postponed: only the "Status" value (and kickoff time) change; a postponed match shows
  "Postponed" and possibly "Kickoff time not confirmed".
- Missing competition data: "Competition unavailable"; missing country/round: "Not available".
- Record panel open (item).
- Loading / error (rare: preview normally holds the section).
- Venue, weather, standings: always "Not available" (data not collected).

### 2.6 Current phone layout (375px)
Closed: right-column card 168 x 236px at y=1350 — the tallest two-up card because the stacked Facts take 6 lines;
"View full match context" wraps with an orphan arrow. Injuries & Suspensions beside it is 125px tall, leaving a
111px gap under that card.
Opened: full-width row at y=1487; two-column Facts, long labels wrap ("Rest before kickoff (Independiente
Petrolero)" takes 3 lines in the 130px label column); notes; "Surrounding fixtures" blocks separated by a divider;
"Collapse Match Context" at the bottom (y=2142). Opened card is 690px tall even with empty data — nearly the whole
769px visible area above the tab bar; with Last/Next rows populated it exceeds one screen.

### 2.7 Friction points
| Criterion | Issue | Evidence |
|---|---|---|
| Simplicity | Preview spends 2 of its 3 rows on values that are always "Not available" (Venue, Weather); the opened view repeats 3 permanent "Not available" rows and then a note saying they are not collected. | `info-sections.tsx:137-141, 153-155, 179` |
| Simplicity | Kickoff, status and competition repeat what the banner directly above already shows; the preview's only fact (competition · round) is also in the banner, so the card adds nothing until opened. | `info-sections.tsx:138, 150-152`; banner in `reference/04-detail-top.jpg` |
| Uniformity | Surrounding fixtures mix a button (Last: opens a panel in place) and a link (Next: leaves the page) with the same pill-row look. | `info-sections.tsx:166-175` |
| Accessibility | The "Next" link has no minimum height (12px text, ~20px target) while the "Last" row is 34px. | `info-sections.tsx:164, 171` vs `details-ui.tsx:375` |
| Simplicity | In the 130px label column "Rest before kickoff ({team})" wraps to 2–3 lines and pushes the list down. | `info-shots/context-open.jpg`; `details-ui.tsx:409-428` |
| Easy navigation | Opened card is 690px with empty data (of 769px visible above the tab bar) and longer than a screen when populated; the only close controls are the 17px breadcrumb at the top and "Collapse Match Context" at the bottom. | measured |
| Uniformity | The preview packs competition and round into one row, the opened view splits them and adds Country — the same fact is shown two ways. | `info-sections.tsx:138, 145-149` |
| States | A null last-result team name renders empty text in the row (no "Team unavailable" fallback, unlike the record panel). | `info-sections.tsx:168` vs `team-sections.tsx:99` |

### 2.8 Must keep
- Labels listed in 2.3 verbatim, including every explicit "Not available", "Kickoff time not confirmed",
  "No earlier result stored.", "No later fixture stored.".
- Notes `details.restBasis`, `details.contextMissing`, `details.regulationNote` (no invented venue/weather/standings).
- `<time dateTime>` on kickoff and fixture dates; Last = in-page record panel (`item=`), Next = link to the other
  match page (prefetch off).
- URL state `section=context`, `item={fixtureId}`; push semantics; focus return to the row.
- Status labels from `match.status.*`; regulation-time basis for scores.

### 2.9 Sample data (Arsenal v Liverpool, upcoming)
Preview: "Competition" "Premier League · Regular Season - 8"; "Venue" "Not available"; "Weather" "Not available".
Opened: Competition [PL logo] "Premier League"; Country "England"; Round "Regular Season - 8"; Kickoff
"Oct 17, 2026, 14:30 EAT"; Status "Scheduled"; Venue / Weather / Standings "Not available";
"Rest before kickoff (Arsenal)" "6.9 days"; "Rest before kickoff (Liverpool)" "6.8 days".
Surrounding fixtures:
- Arsenal — [Last] "Arsenal 2–0 Fulham" "Sat, Oct 10"; [Next] (crest) "Arsenal – Brentford" "Wed, Oct 21".
- Liverpool — [Last] "Liverpool 3–1 Everton" "Sat, Oct 10"; [Next] (crest) "Liverpool – Chelsea" "Sat, Oct 24".
Record panel (Arsenal 2–0 Fulham): Date "Oct 10, 2026, 17:00 EAT"; Competition "Premier League"; Score
"Arsenal 2 – 0 Fulham"; Status "Finished"; regulation note; "Open this match's page".
Live variant: Status "Live". Finished variant: Status "Finished". Postponed variant: Status "Postponed".

---

## 3. Screen `referee`: Referee section view

### 3.1 Identity and entry
- Title: "Referee" (`details.section.referee`, en.ts:498). Accent violet, RefereeIcon (whistle). No meta.
- Preview card: full row at 375px when nothing is open or History is open; two-up beside Match Context when another
  section is open (`match-details.tsx:134-137`, measured).
- Opened: header, preview tap or "View referee details" (`details.viewAll.referee`, en.ts:508) -> `?section=referee`.
- No item level.

### 3.2 Purpose / user task
Tell the visitor who officiates and the official's statistics. Today no referee data is collected, so the screen's
real task is to state that honestly.

### 3.3 Content blocks (ordered) (`info-sections.tsx:184-195`)
**A. Preview card**: Facts "Referee" (`details.official`, en.ts:627) -> "Not available" (label and value side by
side on the full-width card: 44px / 270px columns); LinkButton "View referee details →".
**B. Opened section**:
1. Breadcrumbs "Match details" / "Referee".
2. Facts: "Referee" -> "Not available"; "Officiating statistics" (`details.refereeStats`, en.ts:628) -> "Not available".
3. Note "Referee assignments and officiating statistics are not collected yet, so no official or statistics are
   shown." (`details.refereeMissing`, en.ts:629).
4. LinkButton "Collapse Referee".

Data: `referee: { state: "not-available" }` only (`match-insights.ts:62-63`); the component reads no data.

### 3.4 Controls and actions
| Control | Result | Mode |
|---|---|---|
| Card header "Referee" / preview tap / "View referee details" | open section | push |
| Breadcrumb "Match details" / "Collapse Referee" / header | close section | push |

### 3.5 States
Only one: not available (all match statuses, both themes). No loading, error or populated state exists in code.
Layout variants: full row (overview) vs two-up (another section open).

### 3.6 Current phone layout (375px)
Closed: full-width card 343 x 108px at y=1594: header row, "Referee  Not available", "View referee details →"
(`reference/06-detail-bottom.jpg`). Opened: 343 x 212px: breadcrumbs, two Facts rows, the note, "Collapse Referee".
When News or Context is open the closed Referee card drops to 168px beside Match Context.

### 3.7 Friction points
| Criterion | Issue | Evidence |
|---|---|---|
| Short flows / Simplicity | Opening the section yields only one more "Not available" row and a note; "View referee details" promises details that do not exist. | `info-sections.tsx:184-195`; en.ts:508, 627-629 |
| Simplicity | "Referee" is repeated four times in the open card: header, breadcrumb, hidden h3 and the Facts label (`details.official` = "Referee"). | measured text "Referee \| Match details \| Referee \| Referee \| Referee \| Not available …"; en.ts:498, 627 |
| Uniformity / Easy navigation | The card is a full-width row on the overview but becomes two-up whenever another section opens, so its position and size change. | `match-details.tsx:134-137`; measured y=1594 full vs 1593 two-up |
| Simplicity | A full-width 108px card (plus 8px gap) is spent on a permanent placeholder between the useful cards and Prediction History. | measured |

### 3.8 Must keep
- Title "Referee", "View referee details" / "Collapse Referee" pattern consistent with other cards (or the same
  pattern if relabelled within existing strings), and the explicit "Not available" + `details.refereeMissing` note:
  no invented official or statistics.
- `section=referee` URL state and the shared header/breadcrumb/collapse behaviour.

### 3.9 Sample data
Always: Preview "Referee: Not available". Opened: "Referee: Not available", "Officiating statistics: Not available",
note `details.refereeMissing`. (Identical for Arsenal v Liverpool upcoming, live or finished.)

---

## 4. Screen `history`: Prediction History section view (incl. revision history and snapshots)

### 4.1 Identity and entry
- Title: "Prediction History" (`details.section.history`, en.ts:499). Accent teal, HistoryIcon. Always a full-width
  row (`match-details.tsx:132`).
- Opened: header, preview tap or "View prediction history" (`details.viewAll.history`, en.ts:509) -> `?section=history`.
- Server sub-levels (ordinary links, full server render, `prefetch={false}`):
  - Select a publication: "Publication {n}" -> `?revision={id}&revisionAnchor={n}&cycleAnchor={n}[&limit]#revision-history`.
  - Select a cycle: "Inspect this cycle’s retained prediction" -> `?cycle={id}&revisionAnchor=…&cycleAnchor=…#revision-history`.
  - Older pages: "Older publications" / "Older cycles" -> `?revisionBefore=…` / `?cycleBefore=…` (+ anchors, limit).
  - Restart: "Latest history" -> `?limit={limit}#revision-history`.
  (`history-page.ts:8-26`, `revision-history.tsx:74, 88, 99, 106, 108`.)
- Intended auto-open: a URL with history keys but no `section` should open the History section once
  (`match-details.tsx:221-227`). See frictions 4.7 #1–#3 for what actually happens.
- Exit: "Collapse Prediction History", breadcrumb "Match details", header, browser Back; "Back to current match
  summary" jumps to the banner (`#current-match-summary`, `match-banner.tsx:183`).

### 4.2 Purpose / user task
Audit how this match's prediction changed: list every stored publication (newest first) with its run date, cycle,
source and status (current / locked / superseded / void), list schedule cycles with their timing, and inspect any
earlier publication or cycle as a read-only snapshot — without changing the current or locked prediction, results or
performance counts.

### 4.3 Content blocks (ordered)

**A. Preview card (closed)** (`info-sections.tsx:198-208`)
1. Header: icon + "Prediction History" + meta "{count} revision(s)" (`details.revisionCount`, en.ts:639) with "+"
   appended when another page exists (e.g. "10 revisions+"); meta visible (full-width card) + chevron.
2. Note "Latest revision published {time}" (`details.latestRevision`, en.ts:630 + `<time>`), or "No prediction
   revision has been published for this match." (`details.noRevisions`, en.ts:631).
3. LinkButton "View prediction history →".
Preview data comes from the live, polled detail response (`data.history.revisions.entries`).

**B. Opened section** — card shell + the server-rendered `RevisionHistory` (`revision-history.tsx:29-112`) wrapped in
`HistoryBody`, which below desktop removes the inner frame, sets 13px body, 14px headings, 10px section padding and
28px minimum link/summary height (`info-sections.tsx:50-65`):
1. Breadcrumbs "Match details" / "Prediction History".
2. Native disclosure `<details id="revision-history" open>` with summary "Prediction revision history"
   (`history.title`, en.ts:696) — 28px tall, collapsible on its own.
3. BodyText "Inspect stored publications and schedule cycles. Viewing history does not change the current or locked
   prediction, results or performance counts." (`history.readOnly`, en.ts:697).
4. MutedText "Revision and cycle labels reflect this history read. Use latest history to see newer publications; the
   main forecast updates separately." (`history.readClock`, en.ts:136).
5. MutedText "Stored data observed: {time}" (`detail.observed`, en.ts:663).
6. TextLink "Back to current match summary" (`history.backToSummary`, en.ts:698) -> `#current-match-summary`.
7. Error surface (only when the extra history read failed), `role="status"`: "History could not be loaded. The match
   summary and available publications remain visible. Try again shortly." (`history.failed`, en.ts:725) or
   "History requests are temporarily busy. The match summary and available publications remain visible. Try again
   shortly." (`history.busy`, en.ts:726) + ButtonLink "Try again" (same query).
8. Selected snapshot (only with `revision` or `cycle` in the URL): plain open disclosure, summary "Historical
   prediction snapshot" (`history.historicalSnapshot`, en.ts:714) or "Inspect prediction snapshot"
   (`history.inspectSnapshot`, en.ts:715), containing — see block C.
9. Heading "Publications" (`history.publications`, en.ts:699), MutedText "Newest publication first, using recorded
   revision order. Run dates use East Africa time; publication times show when each snapshot was actually
   published." (`history.order`, en.ts:700).
10. Publication list (`<ol reversed>`, item number = fixture revision; default list markers visible), each item:
    - TextLink "Publication {number}" (`history.publication`, en.ts:701), `aria-current="true"` when selected.
    - "Daily run date (EAT): {Friday, October 16, 2026}" (`history.runDate`, en.ts:702).
    - "Cycle {n} · Revision {n} within this cycle" (`history.cycle` en.ts:704, `history.cycleRevision` en.ts:703).
    - Sources: "AI prediction" and/or "API-Football fallback" joined by " · " (`market.source.*`, en.ts:415-416).
    - Status labels (plain text, any that apply): "Current prediction", "Locked prediction", "Superseded
      publication", "Void cycle" (`history.status.*`, en.ts:709-713; logic `history-page.ts:27-31`).
    - "Published: {time}" (`match.published`, en.ts:307).
    Empty: "No publications in this history page." (`history.noPublications`, en.ts:719).
11. ButtonLink (secondary, bordered, 36px) "Older publications" (`history.olderPublications`, en.ts:721) when a next
    page exists.
12. Heading "Schedule cycles" (`history.cycles`, en.ts:708). Cycle list (`<ol reversed>`, number = ordinal); each item
    is a plain disclosure with summary "Cycle {n} · {Open | Closed | Void}" (`history.cycle.*`, en.ts:705-707),
    expanding to the cycle summary (block D) + TextLink "Inspect this cycle’s retained prediction"
    (`history.inspectCycle`, en.ts:723). Empty: "No schedule cycles in this history page." (`history.noCycles`, en.ts:720).
13. ButtonLink (secondary) "Older cycles" (`history.olderCycles`, en.ts:722) when a next page exists.
14. TextLink "Latest history" (`history.latest`, en.ts:724) — only when any history query is in the URL.
15. LinkButton "Collapse Prediction History".

**C. Selected snapshot contents** (`revision-history.tsx:51-64`; `match-detail-content.tsx:15-136`)
1. BodyText "This is a read-only publication inspection. The primary match summary above retains the applicable
   current or locked prediction. Missing markets remain unavailable in this snapshot." (`history.snapshotDisclosure`, en.ts:716).
2. Heading (h3) "Publication {n}"; BodyText status: "Current prediction" / "Locked prediction" / "Void cycle" /
   "Historical publication" (`history.status.{applicability}`, en.ts:709-713); MutedText "Revision {n} within this
   cycle"; "Published: {time}".
3. Cycle summary (block D) for the selected cycle.
4. Four market blocks (bordered `Surface`s stacked one per row on phones, `DetailMarketGrid`), one per family, in
   order "Match result", "Double chance", "Total goals (2.5)", "Both teams to score" (`market.family.*`, en.ts:387-390). Each:
   - Heading (h2) family name.
   - "Prediction: **{selection}**" (`match.prediction` en.ts:304; selection labels `market.selection.*` en.ts:391-400:
     "Home win", "Draw", "Away win", "Home or draw", "Away or draw", "Home or away", "Over 2.5", "Under 2.5", "Yes",
     "No") or "Prediction: **Unavailable for this market**" (`match.predictionUnavailable`, en.ts:305).
   - "Estimated probability: **{n}%**" (`probability.estimated`; "Less than 1%" / "More than 99%" at the extremes).
   - Historical snapshot: MutedText "This historical selection is excluded from headline settlement and performance
     counts." (`history.noSettlement`, en.ts:717). Otherwise "Prediction outcome" (`match.outcome`, en.ts:306) +
     outcome chip with icon: "Correct" / "Incorrect" / "Pending" / "Void" / "Unavailable" (`outcome.*`, en.ts:736-743).
   - Outcome explanation (server text): "Awaiting a verified regulation-time result." / "Settled against the verified
     regulation-time result." / "The verified regulation-time result was corrected; the original selected pick is
     preserved." / void texts e.g. "This prediction cycle was voided because the match was postponed." (en.ts:282-288,
     `detail-read.ts:86-87`); plus "Outcome settled: {time}", "Result correction applied: {time}", "Cycle voided: {time}".
   - Unavailable market: reason text (`detail.unavailable.*`, en.ts:680-683), e.g. "No prediction has been published
     for this market in the applicable cycle.".
   - Available market: source "AI prediction" / "API-Football fallback"; "Provisional estimate" (`match.provisional`);
     fallback reason (`detail.fallback.*`, en.ts:690-695, e.g. "API-Football statistical fallback was used after the AI
     request timed out."); "Published: {time}".
   - Disclosure "Alternative selections" (`detail.alternatives`, en.ts:670): each other selection + "Estimated
     probability: {n}%"; Double chance adds "Double-chance selections overlap; their probabilities do not sum to 100%."
     (`detail.overlappingProbabilities`, en.ts:672).
   - Disclosure "Source attribution and timing" (`detail.sourceTiming`, en.ts:671): "Source generated: {time|Unknown}",
     "Source retrieved: {time}", "Source last updated: {time|Unknown}" (en.ts:658-660), then each cited source's
     publisher (link when a safe URL exists).
5. "Prediction analysis" surface (h2, `detail.analysis` en.ts:648): "These reasons describe the selected complete
   revision. Each market identifies its AI or provider source." (`detail.analysisBasis`, en.ts:649); "Limited news
   coverage" when flagged; numbered reasons (2–4) each followed by citation links (publisher names); h3 "Key
   uncertainty" (`detail.uncertainty`, en.ts:650) + text + citations — or "The original explanation is unavailable
   because its source permissions or links could not be confirmed. Stored probabilities remain visible."
   (`detail.analysisWithheld`, en.ts:652); then "Evidence cutoff: {time}", "Prediction generation completed: {time}",
   "Published: {time}" (en.ts:657, 661, 307); then "Estimated probabilities are not guarantees. Evidence coverage and
   age are separate from the probability; missing information does not confirm that a team is unaffected."
   (`detail.probabilityDisclosure`, en.ts:673).
6. Disclosure "Sources and evidence times" (`detail.sources`, en.ts:653): per source: publisher; title (link when URL);
   "Source link unavailable." when no URL; "Source published", "Source retrieved", "Source last updated" times. Empty:
   "No permitted source attribution is available." (`detail.noSources`, en.ts:654).
7. Cycle selected but no eligible publication: "No eligible prediction is available for this cycle."
   (`history.noSnapshot`, en.ts:718).

**D. Cycle summary** (`revision-history.tsx:15-27`): "Cycle {n} · {Open|Closed|Void}"; void reason explanation
(e.g. "This prediction cycle was voided because the match was postponed."); "Kickoff: {time}"; "Publication cutoff:
{time}" (`history.cutoff`, en.ts:727); "Cycle opened: {time}" (`history.opened`, en.ts:728); when set: "Cycle closed:"
(en.ts:729), "Prediction locked:" (`detail.locked`, en.ts:664), "Cycle voided:" (`detail.voided`, en.ts:667). Each time
line is `MutedText` "Label: value" with `<time>` in the device zone (`LocalTime`).

Data fields: `history.limit` (default 10, max 20); `revisions {anchor, entries[], next}`; entry =
`revisionId, cycleId, runId, runSequence, fixtureRevision, cycleRevision, evidenceCutoffAt, generationCompletedAt,
publishedAt, runDate, sources[], cycle`; `cycles {anchor, entries[], next}`; cycle = `id, ordinal, state
(open|closed|void), currentRevisionId, lockedRevisionId, kickoffAt, cutoffAt, openedAt, closedAt, lockedAt, voidedAt,
voidReason {code, explanation}`; snapshot = revision + `historical`, `applicability (current|locked|void|historical)`,
`markets[]` (selection, probabilities, alternatives, source {kind, provisional, fallbackReason, sourceIds},
timestamps), `unavailableMarkets[]`, `analysis {state, reasons, uncertainty, limitedNews, sources[]}`, `outcomes[]`
(`match-detail.ts:5-71`).

### 4.4 Controls and actions
| Control | Result | Mode |
|---|---|---|
| Card header "Prediction History" / preview tap / "View prediction history" | open section | push |
| Summary "Prediction revision history" | collapses/expands the inner list (card stays open) | native, no URL |
| "Back to current match summary" | jumps to the banner at the top of the page | hash |
| "Publication {n}" | server navigation selecting that publication; snapshot shown in block 8 | navigation (drops `section`, see 4.7) |
| Cycle summary "Cycle {n} · {state}" | expands that cycle's times | native |
| "Inspect this cycle’s retained prediction" | server navigation selecting the cycle | navigation |
| "Older publications" / "Older cycles" | next page of that list, other list's cursor kept | navigation |
| "Latest history" | restart with fresh anchors | navigation |
| "Try again" (history error) | reload same history query | navigation |
| Snapshot disclosures "Alternative selections", "Source attribution and timing", "Sources and evidence times" | expand in place | native |
| Source publisher / title links | open the source URL (same tab; `rel="noopener noreferrer"`) | external |
| Breadcrumb "Match details" / "Collapse Prediction History" / header | close section | push |
| Browser Back | previous history page / selection | navigation |

### 4.5 States
- No revisions (current local data): preview "No prediction revision has been published for this match.", no meta;
  opened: intro texts + "No publications in this history page." + "No schedule cycles in this history page."
  (card 343 x 538px; `info-shots/history-open-empty.jpg`).
- Cycle open, no publication yet: publications empty, "Cycle 1 · Open" listed.
- Upcoming with publications: latest entry "Current prediction"; earlier ones "Superseded publication".
- Live / finished (cycle closed): locked entry "Locked prediction", others "Superseded publication"; cycle "Closed" with
  "Prediction locked" time; snapshot outcomes "Pending" until settlement, then "Correct" / "Incorrect" with "Outcome
  settled"; corrected results add "Result correction applied".
- Void / postponed: entries also "Void cycle"; cycle "Void" with reason and "Cycle voided"; a new cycle (Cycle 2 ·
  Open) may follow; outcomes "Void".
- Selected historical publication: summary "Historical prediction snapshot", status "Historical publication",
  no outcome chips (noSettlement text instead).
- Selected current/locked publication or cycle: summary "Inspect prediction snapshot", outcome chips shown.
- Cycle without eligible prediction: "No eligible prediction is available for this cycle.".
- Analysis withheld / no sources / source without link / unknown times ("Unknown").
- More pages: "Older publications" / "Older cycles"; meta "{n} revisions+".
- Paged or selected view: "Latest history" link at the end.
- History read failed / busy: error surface + "Try again" (primary content and initial history stay visible).
- Live polling: preview meta and latest time can change; the opened list is the server-rendered read and only changes
  after a navigation ("Stored data observed" labels its age).
- No JavaScript: the inner history links and native disclosures work, but section open/close buttons do not.

### 4.6 Current phone layout (375px)
Closed: full-width card 343 x 108px at y=1710, the last card before the page disclaimer. Header shows meta at the
right of the title when revisions exist.
Opened (empty data, measured): card 343 x 538px: breadcrumbs (y+56), the triangle summary "Prediction revision
history" (28px), a 3-line BodyText, a 3-line muted note, the observed time, the teal underlined "Back to current match
summary" (28px), heading "Publications" (14px) + 3-line note + empty sentence, heading "Schedule cycles" + empty
sentence, "Collapse Prediction History". Populated: each publication adds ~6 stacked lines (number marker + link + 5
text lines); 10 per page; the selected snapshot (4 bordered market boxes + analysis box + sources disclosure) sits
**above** the Publications list, under the intro. Inner `section` boxes keep a 1px border and 10px padding inside the
card (box-in-box). The phone top bar is not sticky; the fixed tab bar covers the last 43px.

### 4.7 Friction points
| Criterion | Issue | Evidence |
|---|---|---|
| Short flows / Easy navigation (defect) | Every server link inside the opened history ("Publication {n}", "Inspect this cycle’s retained prediction", "Older publications", "Older cycles", "Latest history", "Try again") is built from the route path plus history keys only, so it drops `section=history`. After the navigation the History card renders closed and the `#revision-history` target no longer exists; the visitor must find and reopen the card to see the snapshot they asked for. The auto-open runs once per mount and the client navigation does not remount. | `history-page.ts:8-26`; `revision-history.tsx:74, 88, 99, 106, 108`; `match-details.tsx:221-227`; verified on dev server: after "Latest history" URL `?limit=10#revision-history`, header `aria-expanded="false"`, no `#revision-history` element |
| Short flows (defect) | Fresh load of a history URL (e.g. `?limit=10`) rewrites the URL to `?limit=10&section=history` but the card stays closed; the first tap on "View prediction history" toggles `section` off (URL back to `?limit=10`), only the second tap opens it. | `match-details.tsx:226` (`go(..., "replace")` during hydration), `use-match-view.ts:23-28`, `section-card.tsx:29`; verified on dev server |
| Accessibility (no-JS) | Because history links drop `section` and section toggles are JS buttons, a visitor without JavaScript cannot reach the history list from any history link, contrary to the documented no-JS support. | `docs/revision-history-page.md` ("works with JavaScript disabled"); `section-card.tsx:32-47` |
| Simplicity | Nested disclosures: the open card contains a second collapsible "Prediction revision history", then per-cycle disclosures, the snapshot disclosure, and per-market "Alternative selections" / "Source attribution and timing" plus "Sources and evidence times" — up to four expander levels in one card; collapsing the inner one leaves an open card showing only a summary line. | `revision-history.tsx:38-39, 51, 95`; `match-detail-content.tsx:45-68, 104-119` |
| Simplicity | Three explanatory paragraphs, a timestamp and a back link come before any data; the list is 538px tall with zero entries. | `revision-history.tsx:41-44, 67`; measured |
| Uniformity | The snapshot uses different market and pick labels ("Match result", "Total goals (2.5)", "Home win") from the rest of Match details ("Match result (1X2)", "Over/Under 2.5 goals", "Arsenal win"). | `match-detail-content.tsx:27-29` (`market.family.*`, `market.selection.*`, en.ts:387-400) vs `labels.ts:7-13` (`details.market.*`, `details.pick.*`, en.ts:467-480) |
| Uniformity | Server UI primitives (Surface, SectionHeading, BodyText/MutedText, teal underlined TextLink, bordered ButtonLink) instead of the card primitives used by every other section (Facts, Note, Pill, blue LinkButton): statuses are plain text, times are "Label: value" sentences, three action styles in one card. | `revision-history.tsx:8-10`; `controls.tsx:37-145`; `details-ui.tsx:148-164, 391-428` |
| Accessibility | Heading order is inverted: card h2 -> hidden h3 -> "Publications"/"Schedule cycles" h2 -> "Publication {n}" h3 -> market names h2 -> "Key uncertainty" h3. | `revision-history.tsx:56, 66, 91`; `match-detail-content.tsx:27, 86, 95`; `section-card.tsx:45` |
| Simplicity | Duplicate numbering: `<ol reversed>` default markers ("3.", "2.") next to "Publication 3"; cycles "1." next to "Cycle 1 · Open". | `revision-history.tsx:69, 93`; `global-style.tsx:45-48` |
| Simplicity | Each publication is 6 stacked lines; statuses are unstyled text, so "Current" / "Locked" / "Superseded" / "Void" do not stand out. | `revision-history.tsx:73-84` |
| Easy navigation | The selected snapshot renders above the Publications list; after choosing an entry lower down, the result appears above the intro texts, and the anchor lands at the top of the region. | `revision-history.tsx:51-64` before `65-89` |
| Simplicity | Meta "10 revisions+" appends "+" to a pluralised phrase. | `info-sections.tsx:202` |
| Simplicity | `history.readClock` tells the visitor to "Use latest history", but the "Latest history" link only exists when a history query is present. | en.ts:136; `revision-history.tsx:108` |
| Accessibility | Phone targets reduced to 28px for summaries and text links (desktop 44px). | `info-sections.tsx:56, 63`; measured |
| Simplicity / States | The preview (count, latest time) follows live polling while the opened list is the server-rendered read, so the two can disagree until the next navigation. | `info-sections.tsx:200-205`; `live-match-detail.tsx:60`; `match-detail-page.tsx:21-22` |
| Easy navigation | "Back to current match summary" scrolls to the banner but leaves this long section open; "Collapse Prediction History" sits at the very end. | `revision-history.tsx:44`; `section-card.tsx:47` |

### 4.8 Must keep
- Read-only guarantees and their texts: `history.readOnly`, `history.readClock`, `history.snapshotDisclosure`,
  `history.noSettlement`, `detail.analysisBasis`, `detail.probabilityDisclosure`, `detail.overlappingProbabilities`,
  page `details.disclaimer`.
- All status vocabulary: "Current prediction", "Locked prediction", "Superseded publication", "Historical
  publication", "Void cycle"; cycle states "Open"/"Closed"/"Void"; void reason explanations; outcome labels.
- Every timestamp label (Stored data observed, Daily run date (EAT), Published, Kickoff, Publication cutoff, Cycle
  opened/closed, Prediction locked, Cycle voided, Evidence cutoff, Prediction generation completed, Source
  generated/retrieved/last updated, Outcome settled, Result correction applied) with `<time dateTime>`; unknown ->
  "Unknown".
- Server-rendered, no-JS history: native `<details>/<summary>`, ordinary links with `prefetch={false}`, validated
  cursors (`revision`, `cycle`, `limit`, anchors, `…Before`), `#revision-history` landing, "Latest history" restart,
  bounded pages (default 10, max 20), anchors pinned while browsing, inline retry on failure, prelaunch
  `noindex, follow` on history views.
- `aria-current="true"` on the selected publication; ordered lists numbered by stored revision / ordinal.
- Historical snapshots never show settlement chips; missing markets stay "Unavailable for this market" with their
  reason; analysis withheld text when permissions fail; source links only for safe https URLs.
- Separation of probability, source and outcome (no confidence/value ratings, no odds in history).

### 4.9 Sample data (Arsenal v Liverpool, upcoming, 3 revisions; aligns with `detail.md`)
Preview: meta "3 revisions"; "Latest revision published Oct 16, 2026, 09:12 EAT"; "View prediction history".
Opened intro: "Stored data observed: Oct 16, 2026, 18:45 EAT".
Publications:
- 3. "Publication 3" · "Daily run date (EAT): Friday, October 16, 2026" · "Cycle 1 · Revision 3 within this cycle" ·
  "AI prediction" · "Current prediction" · "Published: Oct 16, 2026, 09:12 EAT"
- 2. "Publication 2" · "Daily run date (EAT): Thursday, October 15, 2026" · "Cycle 1 · Revision 2 within this cycle" ·
  "AI prediction · API-Football fallback" · "Superseded publication" · "Published: Oct 15, 2026, 09:05 EAT"
- 1. "Publication 1" · "Daily run date (EAT): Wednesday, October 14, 2026" · "Cycle 1 · Revision 1 within this cycle" ·
  "API-Football fallback" · "Superseded publication" · "Published: Oct 14, 2026, 09:20 EAT"
Schedule cycles: 1. "Cycle 1 · Open" -> "Kickoff: Oct 17, 2026, 14:30 EAT", "Publication cutoff: Oct 17, 2026,
14:25 EAT", "Cycle opened: Oct 10, 2026, 14:30 EAT", "Inspect this cycle’s retained prediction".
Selected "Publication 2" (historical): summary "Historical prediction snapshot"; h3 "Publication 2"; "Historical
publication"; "Revision 2 within this cycle"; "Published: Oct 15, 2026, 09:05 EAT"; cycle summary as above; markets:
- Match result — Prediction: Home win · Estimated probability: 46% · noSettlement note · "AI prediction" · Published;
  Alternative selections: Draw 28%, Away win 26%; Source attribution and timing: Source generated Oct 15, 2026, 08:58
  EAT; Source retrieved Oct 15, 2026, 08:40 EAT; Source last updated Unknown; "BBC Sport".
- Double chance — Home or draw · 74%; alternatives Away or draw 54%, Home or away 72%; overlap note.
- Total goals (2.5) — Over 2.5 · 59% · "API-Football fallback" · "Provisional estimate" · "API-Football statistical
  fallback was used after the AI request timed out."; alternative Under 2.5 41%.
- Both teams to score — Prediction: Unavailable for this market · "This revision has insufficient validated data for
  this market."
- Prediction analysis — 2 reasons (e.g. "Arsenal have lost one of their last ten stored home league results." [BBC
  Sport]; "Liverpool scored in each of their last five stored away results." [Sky Sports]); Key uncertainty "Team news
  after the evidence cutoff could change the starting line-ups."; Evidence cutoff Oct 15, 2026, 08:30 EAT; Prediction
  generation completed Oct 15, 2026, 09:01 EAT; Published Oct 15, 2026, 09:05 EAT; probability disclosure.
Finished variant (after kickoff): Publication 3 "Locked prediction"; "Cycle 1 · Closed" with "Cycle closed" and
"Prediction locked: Oct 17, 2026, 14:25 EAT"; selected locked snapshot shows "Prediction outcome" chips: Match result
"Correct" + "Settled against the verified regulation-time result." + "Outcome settled: Oct 17, 2026, 17:02 EAT".
Postponed variant: "Cycle 1 · Void", "This prediction cycle was voided because the match was postponed.", "Cycle voided:
…"; entries add "Void cycle"; outcomes "Void"; "Cycle 2 · Open" for the new date.

---

## 5. Cross-screen observations (for the 5 criteria)
- **Uniformity:** the four cards share one shell (header button, preview, "View …", breadcrumbs, collapse) but History
  swaps to a different component system inside the card (server layout primitives, teal underlined links, native
  disclosures, different market/pick labels). Link-buttons wrap differently in two-up vs full-width cards. Referee
  and History change between full-row and two-up depending on what else is open.
- **Simplicity:** Context and Referee previews are mostly permanent "Not available" rows; several notes repeat
  "not collected" information; History front-loads three explanatory paragraphs.
- **Accessibility:** contrast tokens pass 4.5:1; weak spots are target sizes (17px breadcrumbs, 24–28px links, 26px
  chips, ~20px "Next" link), the inverted heading order in History, the new-tab link without warning, and no-JS
  history access.
- **Easy navigation:** these cards sit 1.5–2 screens below the fold; opening reflows the grid; the History links
  collapse the section they were tapped in; close controls are a tiny breadcrumb at the top and a link at the bottom.
- **Short flows:** a news item is 1 tap from the preview row (good); a past prediction snapshot currently takes open
  card -> tap publication -> card closes -> reopen (and on first load possibly a wasted tap) -> scroll past intro.

## 6. Shared components seen (file refs)
- Section card shell and item panel: `SectionCard`, `ItemPanel`, `useReturnFocus` — `src/components/match/details/section-card.tsx:13-74`
- Card primitives: `Card`, `CardHeader`, `IconBadge`, `PreviewArea`, `LinkButton`, `Crumbs`/`Breadcrumb`, `HiddenHeading`, `PanelHeading`, `Panel`, `PanelBar`, `ChoiceGroup`/`Choices`, `Note`, `Strong`, `SectionState`, `Pager`, `RowList`, `RowButton`, `Pill`, `Facts`, `Crest`, `useRevealOnOpen` — `src/components/match/details/details-ui.tsx`
- Info sections: `NewsSection`, `ContextSection`, `RefereeSection`, `HistorySection`, `NewsRow`, `PreviewNews`, `ExternalLink`, `HistoryBody` — `src/components/match/details/info-sections.tsx`
- Record panel (Context last result): `RecordPanel` — `src/components/match/details/team-sections.tsx:97-112`
- Section icons: `NewsIcon`, `ContextIcon`, `RefereeIcon`, `HistoryIcon`, `ExternalIcon`, `BackIcon` — `src/components/match/details/details-icons.tsx`
- URL view state: `useMatchView`, `useInsightSection` — `src/components/match/details/use-match-view.ts`; `src/domain/match-view.ts`
- Grid and page frame (phone bar, card grid, disclaimer): `src/components/match/details/match-details.tsx`
- Revision history: `RevisionHistory`, `CycleSummary` — `src/app/_components/revision-history.tsx`; `HistorySnapshot`, `MarketPrediction`, `RevisionAnalysis`, `DetailTime` — `src/app/_components/match-detail-content.tsx`; link builders `src/server/matches/history-page.ts`
- Server UI primitives used by history: `Disclosure` (`src/components/ui/disclosure.tsx`), `Stack`, `Inline`, `Surface`, `SectionHeading`, `BodyText`, `MutedText` (`src/components/ui/layout.tsx`), `ButtonLink`, `TextLink` (`src/components/ui/controls.tsx`), `LocalTime` (`src/components/ui/local-time.tsx`), `StatusText` (`src/components/ui/feedback.tsx`)
- Market display in snapshots: `ProbabilityLabel` (`src/components/match/probability-label.tsx`), `OutcomeBadge` (`src/components/match/outcome-badge.tsx`), `DetailMarket`/`DetailMarketGrid` (`src/components/match/detail-styles.tsx`)
- Shell: fixed bottom tab bar `TabBar` (`src/components/navigation/shell-styles.tsx:348`), `PublicShell` (`src/app/_components/public-shell.tsx`)
- Tokens: `src/styles/theme.ts`, `assets/brand/brand-tokens.json`, `src/styles/global-style.tsx`
