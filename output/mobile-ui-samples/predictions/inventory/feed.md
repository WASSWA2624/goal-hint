# Mobile UI inventory: Predictions feed (group `feed`)

Screen id: `feed`. Viewport: 375 px phone (everything below 64rem uses this layout).
Source of truth: code read on 2026-10-13 plus a 375 px read of the running dev app (`http://localhost:3000`).
All quoted UI text is copied from `src/i18n/messages/en.ts` (or the file named next to it). Do not paraphrase it.

Reference images of the current UI: `output/mobile-ui-samples/predictions/reference/01-feed-top.jpg` (collapsed),
`02-feed-filters-open.jpg` (Advanced filters open), `03-feed-upcoming.jpg` (next-day feed, upcoming cards),
`00-template-feed-mobile.webp` (original product template; layout reference only, its content such as "My Picks",
"Leagues", "Profile", the bell, "1D/Rng" and odds selects is NOT in today's scope).

> Correction to the brief: the local DB does contain some published picks (API-Football fallback, locked) for
> 2026-10-13. Sorting Today by probability shows populated cards (Win, Loss, Pending). Most other fixtures show
> "—" because they were "Not predicted".

---

## 1. Identity and entry

| Item | Value |
| --- | --- |
| Routes | `/en` (Today, relative) and `/en/predictions/YYYY-MM-DD` (named EAT day). Both use `createFeedRoute` (`src/app/_components/feed-route.tsx:21-49`) -> `MatchFeedPage` (`match-feed-page.tsx:10-17`) -> `PublicShell app compact search={null}` -> `FeedSurface` (`feed-surface.tsx:151-157`). |
| Variants (same screen) | Today/Matches: default `status=all`. Live: `?status=live`. Results: `/en/predictions/<yesterday>?status=finished`. `current` tab is chosen in `match-feed-page.tsx:14`. |
| How reached | Bottom tab bar: "Matches" (Today), "Live", "Results" (`public-shell.tsx:53-58`). Home logo link "Goal Hint home" (brand bar). Footer/More links lead away. Match details pages link back with "Back to Predictions" / "Back to matches" using the stored feed URL (`feed-surface.tsx:103-106`, key `goalhint:feed-href`). Typing/sharing any feed URL. |
| Device zone | After hydration an unzoned relative entry is replaced once with the device zone, e.g. `/en` -> `/en?tz=Africa%2FKampala` (`feed-surface.tsx:83-88`, `domain/device-feed.ts`). Tab links become `/en?tz=…`, `/en?tz=…&status=live`, `/en/predictions/<yesterday>?tz=…&status=finished`. |
| Purpose / user task | Scan the day's football fixtures and see, per match, the shown pick (market, pick, estimated probability) and its result; narrow by search, date/time, markets, leagues, countries and probability; reorder; open a match for analysis. Live/Results reuse the list for in-play and finished fixtures. |
| Document title | Home: "Goal Hint \| Daily Football Predictions". Dated: "Football predictions for Tuesday, October 13, 2026 \| Goal Hint". Page >1: "Football predictions for Tuesday, October 13, 2026 · Page 5 \| Goal Hint" (`server/seo/metadata.ts:26-34`). |
| Page heading (h1) | Visually hidden on phones (`feed-header.tsx:27-38`): "Today's Matches" / "Tomorrow's Matches" (only for `when=tomorrow`) / "Live Matches" / "Results" / "Football Predictions" (any other date or range) (`feed-header.tsx:54-61`). |

---

## 2. Current phone layout at 375 px (top to bottom)

Measured in the running app (x, y, width, height in CSS px). Page canvas colour `theme.color.page`
(dark `#141C22`, light `#CEDBE3`); content gutters 8 px (`components/ui/layout.tsx:57-63`); feed blocks separated by 8 px.

| y (px) | Block | Notes |
| --- | --- | --- |
| 0-48 | **Brand bar** (sticky) | Full-bleed navy/charcoal bar `theme.header.background`, 2 px teal bottom edge, min 48 px. Left: inverse "Goal Hint" logo 160 px wide, link to `/en`, accessible name "Goal Hint home". Right: theme button 32x32 (sun in dark, moon in light). Only element that stays visible while scrolling (`feed-header.tsx:16-25`, `app-brand-bar.tsx:12-46`). The desktop shell header is hidden on phones (`shell-styles.tsx:68-78`). |
| 56-100 | **Search row** | Search field 250x44 (magnifier icon + input, placeholder "Search teams or leagues") and **Advanced filters** toggle 101x44 (two-line label "Advanced filters" + chevron, optional count badge in the top-right corner) (`feed-filters.tsx:524-537`). Scrolls away. |
| (104-319 when open) | **Advanced filters fields** | Hidden by default; when open, a 215 px bordered block inserted here (see section 5). |
| 104-144 | **Sort + actions row** | Sort select 208x40 showing the current choice (e.g. "Earliest first"), then "Clear" (reset icon) and "Apply" (filter icon, teal fill) buttons, 147 px together, 40 px tall (`feed-header.tsx:188-217`, `feed-filters.tsx:350-376`). Scrolls away. |
| 152-176 | **Applied filter summary chips** | Read-only chips, wraps to extra lines when more filters apply (`feed-controls.tsx:40-72`). |
| 184-197 | **Result count** | Right-aligned muted 11 px text "294 matches" (`feed-header.tsx:220-232`). The "Predicted Matches" h2 and "Showing 1–30 of 294 matches" are visually hidden on phones. |
| 205 onward | **Match cards** | One column, 359x~121 px each, 6 px gap, 30 per page (`match-card-list.tsx:44-61`). About 4.5 cards fit above the tab bar on an 812 px screen. 30 cards ≈ 3,600 px of scroll. |
| end of list | **Pagination bar** | "Showing 121–150 of 294 matches" (12 px muted), then one row of up to 9 equal slots 36x32: ‹ 1 … 4 5 6 … 10 › (`feed-pagination.tsx:37-63`). |
| after list | **Footer** | ~139 px: brand mark + "© 2026 Goal Hint"; links Help · Privacy · Terms · Contact; note "Estimated probabilities, not guarantees. No betting advice." Bottom padding clears the tab bar (`shell-styles.tsx:371-425`, `public-shell.tsx:88-108`). |
| fixed 769-812 | **Bottom tab bar** | Fixed, 42 px + 1 px top border + safe-area inset, dark bar in both themes (`shell-styles.tsx:347-368`). |

Stacking: brand bar z 30, More popup z 25, tab bar z 20, picker popups z 15, filter fields z 2, card link z 1.

---

## 3. Content blocks (ordered, exact labels and fields)

### 3.1 Skip link
"Skip to main content" (visible only on keyboard focus) -> `#main-content` (`public-shell.tsx:67`).

### 3.2 Brand bar (`AppBrandBar`)
- Logo image (alt ""), link `/en`, aria-label "Goal Hint home".
- Theme toggle button: aria-label/title "Switch to light theme" (dark mode, sun icon) or "Switch to dark theme" (light mode, moon icon). These two strings are hard-coded in `components/ui/theme-toggle.tsx:32`, not in `en.ts`.

### 3.3 Search row (inside the filter `<form>`, aria-label "Search and filter matches")
- Search input: type search, name `q`, placeholder "Search teams or leagues", aria-label "Search matches", max 120 characters. Typing edits the draft only; Enter submits the whole draft (search + filter edits) (`feed-filters.tsx:525-530`, `519-522`).
- Advanced filters toggle: visible text "Advanced filters" + chevron (rotates 180° and the button fills teal when open). Accessible name/title: "Show advanced filters" / "Hide advanced filters"; with active panel filters: "Show advanced filters, 2 active". Badge: number of active panel filters (leagues + countries + non-default markets + probability + odds + time) shown as a tiny teal number (`feed-filters.tsx:81-108`, `531-536`; count rule `domain/feed-query.ts:326-330`). Search, date, sort and status are not counted.

### 3.4 Sort + actions row (`FeedFilterToolbar`)
- Sort select (no visible label on phones; aria-label "Sort by"). Options in this order:
  "Highest chance" (probability desc), "Lowest chance" (probability asc), "Earliest first" (kickoff asc, default), "Latest first" (kickoff desc) (`feed-header.tsx:182-185`, en.ts `feed.sort.compact.*`). Choosing an option navigates immediately (page reset to 1).
- "Clear" button (reset icon; native `type=reset`): clears search, time, leagues, countries, markets (back to "Match result"), probability, odds and sort (back to "Earliest first"); keeps the applied date/range, status and page size; applies at once (`feed-filters.tsx:513-518`, `domain/feed-controls.ts:12-16`).
- "Apply" button (filter icon, teal fill, aria-label "Apply filters"): submits the complete draft; disabled (50 % opacity) while any field is invalid (`feed-filters.tsx:366-376`).
- Both buttons are outside the collapsible section and always visible, even when the fields are collapsed.

### 3.5 Applied filter summary chips (list aria-label "Applied filters")
Read-only `<li>` chips (13 px, muted text on brand-soft fill, 1 px border, square). Each has a `title` with the long form. Always shows 4 chips, then optional ones (`feed-controls.tsx:51-68`):
1. Date: "Tue, Oct 13" (title "Tuesday, October 13, 2026"); range "Tue, Oct 13 – Thu, Oct 15".
2. Markets: "Match result" (default) or the single family name, or "Markets: 2 selected" (title lists names). Family names: "Match result", "Double chance", "Total goals (2.5)", "Both teams to score".
3. Leagues: "All leagues" / league name / "Leagues: 3 selected".
4. Countries: "Any country" / country name / "Countries: 2 selected".
5. (optional) Time: "18:00–23:59" (title = IANA zone, e.g. "Africa/Kampala").
6. (optional) Probability: "50% - 100%" (title "Probability").
7. (optional) Odds: "Odds: 1.50-3.00" (only when provider odds are enabled; currently off).
8. (optional) Search: "Search: arsenal".
Status (live/finished) is never shown as a chip.

### 3.6 Seven-day note (conditional)
"Predictions become available within seven days of the match." (12 px muted) when the selected range ends after today + 6 days (`feed-surface.tsx:130`).

### 3.7 Results toolbar
- h2 "Predicted Matches" (visually hidden on phones).
- "Showing {first}–{last} of {total} matches" (visually hidden on phones).
- Visible: "{n} match" / "{n} matches", e.g. "294 matches" (omitted when the read failed with no earlier result) (`feed-header.tsx:220-232`).

### 3.8 Match list (region aria-label "Matches in the selected dates", `aria-busy` while loading)
Native list (`role="list"`, aria-label "Matches in the selected dates") of `MatchCard` items. Numbering (desktop "#" column) continues across pages; not shown on phones.

#### Match card (phone tile, `components/match/match-card.tsx`)
Whole card is one link (single tab stop) to `/en/matches/{fixtureId}/{home-vs-away}`; accessible link text "View analysis for {home} v {away}"; card heading (hidden) "{home} v {away}". Press shows an 8 % tint over the card. Four visible rows:

| Row | Left | Centre | Right |
| --- | --- | --- | --- |
| 1 When | Kickoff day "Tue, Oct 13" (muted 12 px) + time "14:30" (medium) + zone " EAT" (muted; device zone label after hydration, e.g. "GMT+3"). Unknown kickoff: "Kickoff unavailable". `title` = full instant "Oct 13, 2026, 14:30 EAT". | | Status badge (12 px, square, tinted): see states. |
| 2 League | Country flag 16x11 (local SVG; globe for "World", flag glyph if missing) + 3-letter code "THA" (muted; "–" if none) | | League name "Thai League 2" (ellipsis) + competition logo 16 px (trophy glyph if missing) at the outer edge. Unknown: "Competition unavailable". |
| 3 Teams | Home name (right-aligned, ellipsis) + home crest 20 px (initials disc "KA" if no logo) | Upcoming: "VS" (muted). Live/final: score "1 – 0" (14 px bold; live score in live red). Live/final without score: "–". | Away crest + away name (ellipsis). Unknown names: "Home team unavailable" / "Away team unavailable". |
| 4 Pick strip | 4 equal cells divided by thin lines, top divider. Caption (10 px muted) above value (12 px bold): "Market" -> market code; "Pick" -> pick code (+ "Odds 1.85" line under it only when provider odds exist; currently never); "Prob." -> "45%"; "Result" -> outcome. | | |

Field vocabularies (exact):
- Market codes: "1X2", "DC", "O/U 2.5", "BTTS".
- Pick codes: "1", "X", "2", "1X", "X2", "12", "Over", "Under", "Yes", "No". No pick: "—".
- Probability: "45%", boundaries "<1%" and ">99%". No pick: "—" (never 0 %).
- Result: "Win" (green, correct), "Loss" (red, incorrect), "Pending" (amber), "Void" (neutral), "—" (no prediction).
- Shown market: the most likely published pick among the selected markets (`domain/feed-presentation.ts:11-13`).

Status badge (row 1, right) labels and tones (`match-card.tsx:544-560`):
- Scheduled: "Upcoming" (neutral). Finished (regulation/extra time/penalties): "Ended" (neutral).
- Live: elapsed minute "67′", stoppage "90+3′"; paused/no minute shows the phase: "HT", "Break", "Penalties", "Interrupted", "Suspended", "1st half", "2nd half", "Extra time"; unknown in-play minute shows "–". Red tone (interrupted/suspended amber). Spoken: e.g. "Live, 2nd half, 67 minutes played" (phase omitted for "In play").
- "Postponed" (amber), "Canceled" (red), "Abandoned" (red), "Awarded" (neutral), unknown status "–" (spoken "Match status unavailable").
- The final-state chip ("FT", "AET", "Pens", with "*" = "Score after 90 minutes") exists but is visually hidden on phone tiles (`match-card.tsx:333-335`); only screen readers get it.

Hidden on phones (screen reader / `title` only):
- Pick tooltip: "{source} · Provisional estimate · Published: Oct 13, 2026, 12:31 EAT[ · Odds: 1.85]" where source is "AI prediction" or "API-Football fallback" (`match-card.tsx:657-660`, `712`).
- No-pick reason (shown visually only as "—"): "Not available for this market", "Predictions start within 7 days", "Prediction updating", "Not predicted", "No prediction locked", "Prediction failed", "Awaiting prediction".
- Spoken pick: "Match result prediction: Home win, estimated probability 45%. Locked prediction. Prediction outcome: Correct" / "Match result prediction unavailable: Not predicted".
- Card notes (`aria-describedby`, visually hidden on tiles, `match-card.tsx:482`): "Prediction update in progress", "Update delayed", "Score and result updates delayed", "Limited news coverage", "Partial coverage", "No prediction was locked for this market.", void explanations (e.g. "This prediction cycle was voided because the match was postponed."), and any supplied availability message.

### 3.9 Pagination bar (only when total pages ≥ 1)
- Text: "Showing 121–150 of 294 matches".
- Nav aria-label "Match pages": previous arrow (aria-label/title "Previous page", disabled as a dimmed span on page 1), numbered links (aria-label "Page 4", current page teal fill with `aria-current="page"`), gaps "…" (role img, "More pages"), next arrow ("Next page"). Pattern: at most 7 numbers/gaps, e.g. `‹ 1 2 3 4 … 10 ›`, `‹ 1 … 4 5 6 … 10 ›`, `‹ 1 … 7 8 9 10 ›` (`domain/feed-presentation.ts:44-58`). Links are ordinary `<a href>` with all filters preserved.
- Error line + button (after a failed background refresh/restore; `feed-pagination.tsx:51-52`): "The match list changed. Your loaded cards are retained. Refresh the list before loading more." + "Refresh match list"; "More matches could not be loaded. Your loaded cards are retained. Try again." + "Retry loading matches"; "Search is busy. Your loaded cards are retained. Try again shortly." + "Retry loading matches".

### 3.10 Footer (shell)
"© 2026 Goal Hint" with brand mark; nav "Information": "Help", "Privacy", "Terms", "Contact"; note "Estimated probabilities, not guarantees. No betting advice."

### 3.11 Bottom tab bar (nav aria-label "App sections")
Equal-width columns, icon above a 10 px label; current item in inverse teal with a 2 px top indicator and bold label (`shell-styles.tsx:181-213`).
- Destinations in order: "Matches" (home icon; teal), "Live" (radio-waves icon), "Results" (check-circle), "Slip builder" (slip icon), "Help" (?), "Privacy" (shield), "Terms" (document), "Contact" (mail).
- Server HTML shows "Matches", "Live", "Results" + "More"; after hydration at 375 px it measures and shows "Matches", "Live", "Results", "Slip builder", "Help", "More" (`responsive-navigation.tsx:41-139`, `navigation-fit.ts`).
- "More" (three-dot icon, native `<details>`): popup above the bar, light surface, 40 px rows with icon + label: "Privacy", "Terms", "Contact" (at 375 px). Closes on Escape, outside tap or link tap. "More" gets `aria-current` when the current page is inside it.

---

## 4. Controls and destinations

| Control | Result / destination |
| --- | --- |
| Logo "Goal Hint home" | `/en` (Today; device-zone replaced after hydration). |
| Theme toggle | Switches light/dark, stored locally; no navigation. |
| Search field + Enter | Applies the whole draft (search + any unapplied panel edits) -> `router.push(feedQueryHref)` with `q=…`, page 1. Without JS: GET form to the same URL with hidden applied parameters. |
| Advanced filters toggle | Opens/collapses the fields section in place (no URL change). Escape inside the form closes it and returns focus to the toggle; outside taps do not close it. Open state persists after Apply. |
| Sort select | Immediate navigation with `sort`/`dir` (e.g. `?sort=probability`, `?dir=desc`), page 1. Discards any unapplied draft edits (the draft is reset whenever the applied query changes: `state/feed.ts:42-44`). |
| Clear | Immediate navigation to the reset query (see 3.4). |
| Apply | Navigation to the validated draft, page 1. Disabled while dates/times/probability are invalid. |
| Summary chips | Not interactive (no tap action). |
| Match card (anywhere) | `/en/matches/{fixtureId}/{slug}` (Match details). Back from details returns to the exact feed URL; scroll position, loaded pages and focused card are restored (`use-feed-pagination.ts:110-136`). |
| Pagination ‹ / number / › | `/en/predictions/2026-10-13?page=N` (all filters kept; page 1 omits `page`). |
| Pagination retry/refresh button | Re-fetches the loaded pages via `/api/matches`. |
| Error "Try again" | Re-runs the same URL (refresh). |
| Tab "Matches" | `/en?tz=<zone>` (Today, all statuses). |
| Tab "Live" | `/en?tz=<zone>&status=live`. |
| Tab "Results" | `/en/predictions/<yesterday>?tz=<zone>&status=finished`. |
| Tab "Slip builder" | `/en/slips`. |
| Tab/More "Help", "Privacy", "Terms", "Contact"; footer links | `/en/help`, `/en/privacy`, `/en/terms`, `/en/contact`. |
| Browser Back | Normal history; feed restores its checkpoint. There is no in-page back control on the feed (it is a top-level tab). |

URL parameters (all state is URL-addressable; `domain/feed-query.ts:71`): `date`/route date, `from`/`to`, `when` (today, tomorrow, next-3-days, next-7-days, next-30-days), `timeFrom`, `timeTo`, `tz`, `q`, `league`, `country`, `status`, `market`, `prob`, `odds` (disabled), `picks`, `sort`, `dir`, `page`, `pageSize`. Unknown or invalid parameters return the 404 page.

---

## 5. Advanced filters expanded state (part of this screen; nested panel)

Opened by the "Advanced filters" toggle; renders between the search row and the sort/actions row as one bordered surface block (`feed-filters.tsx:538-578`). All edits are drafts until Apply (or Enter in search). Order:

1. Date pair (fieldset "Date range"): "From date" | "To date" native date inputs side by side (label left of value at this width). Equal dates = one day; up to 31 days. Invalid: red border + alert "Choose a range of up to 31 days, with the end on or after the start." Sample: 13/10/2026 – 13/10/2026.
2. Time pair (fieldset "Time range"): "From time" | "To time" native time inputs (blank = all day; `title` shows the zone). Invalid: "Enter both times, with To time at or after From time."
3. "Markets" picker row: label left, summary right ("Match result" / "4 selected"), chevron. Opens a checklist (no search): "Match result", "Double chance", "Total goals (2.5)", "Both teams to score"; at least one stays selected.
4. "Leagues" picker row: "All leagues" / name / "3 selected". Opens a popover (320 px wide) with search "Find Leagues" and up to 1,000 checkbox rows "League name" + fixture count (e.g. "Challenge Cup 20"; hidden ", Scotland"), max 50 selected; empty: "No options for these dates".
5. "Countries" picker row: "Any" / flag + name / "2 selected". Popover with search "Find Countries", rows flag + name + count (e.g. "World 75", "England 64"), max 50.
6. Probability row: "Prob." label, "Min" [0] – "Max" [100] decimal inputs, "%" suffix (aria-labels "Minimum Probability", "Maximum Probability"). Invalid: "Enter values from 0 to 100. Min must be less than or equal to Max."
7. "Odds unavailable" muted note (hidden text ". Odds filtering starts once bookmaker odds are imported.").

Picker popovers: checkbox rows 36 px, list max 16rem tall with scroll, close on outside tap or Escape; there is no "Done" button. Measured at 375 px: section 359x215, picker rows 30 px tall, date/time inputs ~24 px inside 30 px boxes, probability inputs 28 px.

---

## 6. States

| State | What shows (exact text) | Source |
| --- | --- | --- |
| Ready (populated) | Toolbar count "294 matches", cards, pagination. | `feed-surface.tsx:45-76` |
| Insufficient data (fixtures but no picks for the market) | Cards listed with "—"; no page message (the server message "Predictions are unavailable for the selected market. Available fixtures are shown." is not rendered). | `feed-surface.tsx:66` |
| No filter matches | Count "0 matches"; empty card: title "No matches for these filters", text "Nothing matches these filters in the available data." No pagination. | `feed.state.no-filter-matches`, `feed.noFilterMatches` |
| No fixtures | "No fixtures confirmed" / "No fixtures are recorded for these dates." | |
| Data unavailable (incomplete coverage, no rows) | "Fixture data unavailable" / "Fixture coverage is incomplete or unavailable. Try again later." (seen locally on Results for 2026-10-12). | |
| Page out of range | "Match page unavailable" / "This page is beyond the available matches. Use the previous page link." plus pagination; currently shows the faulty text "Showing 2,941–294 of 294 matches". | `feed-pagination.tsx:41,50` |
| Read failed | Empty card "Matches temporarily unavailable" / "Matches are temporarily unavailable. Try again shortly." + secondary button "Try again". No count. | `feed-surface.tsx:134-139` |
| Rate limited | "Search temporarily busy" / "Search is busy. Try again shortly." + "Try again". | |
| Failed with earlier result | Error card, then "Showing the previous successful result for the dates and filters below." and a plain line "Applied: Match result · All match statuses · Kickoff (Earliest)[ · leagues][ · countries][ · 50% - 100%][ · Search matches: “arsenal”]", then the earlier cards (no pagination). | `feed-surface.tsx:140-145`, `feed-controls.tsx:75-88` |
| Loading / navigating | Results dim to 60 % opacity (`aria-busy`); polite announcement "Updating matches…"; pagination restore "Restoring your match list…", "Loading matches…". No spinner/skeleton. | `feed-surface.tsx:36-40,118-122` |
| Announcements | Polite live region: "294 matches" / state title / error text / "Match list restored. Showing 60 of 294 available matches." etc. | `feed-surface.tsx:131` |
| Live refresh | Background poll every 20 s when a match is live, a kickoff is within 30 min or a run is updating; otherwise 60 s; pauses when hidden/offline; midnight rollover. No visible indicator. | `domain/live-refresh.ts:8-18` |
| Filters collapsed / expanded | Toggle chevron down/up, filled teal when expanded; count badge when panel filters active. | |
| Draft invalid | Apply disabled; red borders and alert text in the panel. | |
| Card: upcoming | "Upcoming", "VS", pick or "—". | |
| Card: live | Red minute badge ("67′", "90+3′", "HT", "–"), red bold score, Result "Pending". | |
| Card: finished | "Ended", score, Result "Win"/"Loss"/"Pending"/"Void"/"—". | |
| Card: postponed/canceled/abandoned/awarded | Status badge with that label; "VS"; usually "—" pick. | |
| Card: provisional / source | Only in tooltip/SR ("Provisional estimate", "AI prediction" or "API-Football fallback"). | |
| Card: void | Result "Void" + hidden void explanation note. | |
| Card: locked | Only in SR text ("Locked prediction"); no visible lock on phones. | |
| Theme | Dark (`#1E2932` cards on `#141C22`) and light (white cards on `#CEDBE3`); tab bar stays dark in both. | `styles/theme.ts` |
| 404 (invalid query/date) | Non-app shell page "Page not found" / "This address does not have a page. Use the navigation to continue." | `app/not-found.tsx` |
| Variant: Live | Same layout; hidden h1 "Live Matches"; tab "Live" current; only live fixtures; date chip still today. | |
| Variant: Results | Hidden h1 "Results"; tab "Results" current; yesterday's finished fixtures; date chip "Mon, Oct 12". | |
| Variant: other date / range | Hidden h1 "Football Predictions" (also for tomorrow picked via dates); "Tomorrow's Matches" only for `when=tomorrow`. | |

---

## 7. Friction points against the five criteria

Uniformity
1. Two interaction models in one row: sort applies immediately, while search and panel fields wait for Apply; a sort change silently discards unapplied panel edits (`feed-header.tsx:193`; `feed-filters.tsx:405`; `state/feed.ts:42-44`).
2. Picker popovers use a third model: checkbox edits inside a popover with no Done button, which then still need the outer Apply (`filter-parts.tsx:260-289`).
3. Desktop gets tappable removable chips (`FilterChip`, `feed-filters.tsx:486-488`) and quick date presets (`feed-header.tsx:72-74`); phones get read-only summary chips (`feed-controls.tsx:69-71`) and no presets.
4. Control heights differ across the top area: 44 px search/toggle, 40 px sort/Clear/Apply, 30 px picker rows, ~30 px date/time boxes, 28 px probability inputs, 32 px theme button, 32 px pagination (`feed-filters.tsx:66,88,152,203`; `feed-header.tsx:166`; `feed-range-fields.tsx:27,61`; `theme-toggle.tsx:12-13`; `pagination-styles.ts:30`).
5. Status tones: finished extra-time/penalty games show only "Ended"; the "FT"/"AET"/"Pens" chip is hidden on tiles (`match-card.tsx:333-335`, `555`), unlike desktop.

Simplicity
6. Four always-on default chips ("Tue, Oct 13", "Match result", "All leagues", "Any country") repeat defaults and add a row of noise (`feed-controls.tsx:51-59`).
7. "Clear" and "Apply" stay visible while the fields are collapsed, so the first screen shows 5 controls before any match (`feed-surface.tsx:94-95,127-128`; `feed-filters.tsx:579`).
8. The pick strip repeats the same caption row ("Market Pick Prob. Result") and the same market code "1X2" on every card; pick codes ("1", "X2") need decoding (`match-card.tsx:706-736`).
9. The pagination summary ("Showing 121–150 of 294 matches") repeats the toolbar count (`feed-pagination.tsx:50`).
10. "Odds unavailable" occupies space for a disabled feature (`feed-filters.tsx:553`), though it must stay (see must-keep).

Accessibility
11. Small targets below 44 px: picker rows 30 px, date/time inputs 24 px tall, probability inputs 28 px, pagination 36x32, theme button 32x32, tab items 42 px (`feed-filters.tsx:152,203`; `feed-range-fields.tsx:61`; `pagination-styles.ts:30`; `theme-toggle.tsx:12-13`; `shell-styles.tsx:188`).
12. Small text: tab labels 10 px (`shell-styles.tsx:191`), pick captions 10 px (`match-card.tsx:392`), filter count badge 10 px (`feed-filters.tsx:105`), result count 11 px (`feed-header.tsx:134`).
13. Information parity: card notes (partial coverage, delays, void reasons) are visually hidden on phones (`match-card.tsx:482`); no-pick reasons and source/provisional/published details exist only in `title` tooltips, unreachable by touch (`match-card.tsx:712-717`).
14. Low card separation: dark card surface vs page 1.16:1 and border vs page 2.05:1; light border vs page 1.07:1, card vs page 1.41:1 (`styles/theme.ts:187-191,308-311`). Text pairs pass 4.5:1 (e.g. light muted on white 6.59:1, Apply white on teal 4.86:1).
15. No visible page title on phones (h1 and "Predicted Matches" are visually hidden: `feed-header.tsx:27-38,102-116`); Live/Results differ only by the tab highlight.
16. Theme toggle names are hard-coded English (`theme-toggle.tsx:32`).
17. Tab bar re-flows after hydration (3 + More, then 5 + More) (`responsive-navigation.tsx:52`; `navigation-fit.ts:1`).

Easy navigation
18. Only the brand bar is sticky (`feed-header.tsx:16-25`); search, sort, filters and the count scroll away, and pagination exists only after 30 cards (~3,600 px).
19. No visible date context beyond the small first chip; no previous/next day or quick presets on phones although the domain provides them (`domain/feed-date-navigation.ts:5-23`) and strings exist ("Previous day", "Next day", "Tomorrow", "Next 3 days", "Next 7 days", "Next 30 days").
20. "More" holds Privacy/Terms/Contact, which duplicate footer links, while "Help" and "Slip builder" move in or out of More depending on width (`public-shell.tsx:59-62,94-105`).
21. Results opens yesterday's date by default with no visible title; an empty yesterday shows only an error-style empty card.

Short flows
22. Changing the day takes 5+ steps: open Advanced filters -> From date -> pick -> To date -> pick -> Apply (`feed-dates.tsx:15-41`; `feed-filters.tsx:539-542`).
23. Removing one applied filter takes 3+ steps (open panel -> picker -> uncheck -> Apply) because chips are not interactive (`feed-controls.tsx:69-71`).
24. The empty state "No matches for these filters" has no inline Clear action; users must scroll up to Clear (`feed-surface.tsx:66`).
25. The panel stays open after Apply (`feed-surface.tsx:91`), pushing results 215 px down; users must collapse it.
26. Correctness bug visible to users: out-of-range page prints "Showing 2,941–294 of 294 matches" (`feed-pagination.tsx:41,50`).

---

## 8. Must-keep constraints

- URL-addressable state for everything in section 4; canonical URLs; `tz` handling; page reset to 1 on filter, search or sort change; 404 for invalid queries.
- No-JS operation: filter form is a GET form with hidden applied parameters (`feed-filters.tsx:508-523`); pagination, date presets, chips (desktop), cards and tab links are real `<a href>`; More uses native `<details>`.
- One keyboard stop per card; accessible names: "View analysis for {home} v {away}", "Search matches", "Sort by", "Show advanced filters"/"Hide advanced filters"(+", N active"), "Apply filters", "Applied filters", "Matches in the selected dates", "Match pages", "Previous page"/"Next page"/"Page N"/"More pages", "App sections", "Goal Hint home", "Skip to main content".
- Polite live region announcements and `aria-busy` dimming; focus restoration on Back; Escape closes the filter section and pickers.
- Text contrast 4.5:1 (3:1 only for large text on gradients); 3 px focus ring; outcomes always use text (Win/Loss/Pending/Void), never colour alone; decorative icons `aria-hidden`.
- Missing predictions show "—" (never 0 % or Pending); probabilities "<1%"/">99%" at boundaries; the shown pick is the most likely among selected markets; Result never settles from a live score.
- Disclaimers and honesty notes: footer "Estimated probabilities, not guarantees. No betting advice."; "Odds unavailable" + "Odds filtering starts once bookmaker odds are imported."; "Predictions become available within seven days of the match."; "Provisional estimate" and source labels; no sample or invented forecasts.
- Limits: dates up to 31 days, 50 leagues, 50 countries, search 120 characters, at least one market ("Keep at least one market selected.").
- iOS: inputs/selects at 16 px to avoid zoom; tab bar respects `env(safe-area-inset-bottom)`.
- Device time zone display after hydration with EAT fallback; 24-hour times.
- Markets in scope only: Match result, Double chance, Total goals (2.5), Both teams to score. Odds display stays off (`publicPolicy.features.providerOdds = false`).
- Dormant capabilities (exist in code/strings but not rendered on phones today; use only if the reviewer agrees they are in scope): quick date presets (`DatePresets`), previous/next day links (`feedDateNavigation`), "Load more matches" (`use-feed-pagination.ts:138`, en.ts `feed.pagination.loadMore`), subtitle "AI picks • Updated daily" (`feed.subtitle`). The template's "My Picks", "Leagues", "Profile", notifications and odds selects are out of scope.

---

## 9. Realistic populated sample (Today, 375 px, dark theme)

Top: brand bar · search "Search teams or leagues" · "Advanced filters" · sort "Highest chance" · "Clear" · "Apply" ·
chips "Tue, Oct 13" "Match result" "All leagues" "Any country" · count "294 matches".

1. "Tue, Oct 13 14:30 EAT" · "Ended" | "THA" · "Thai League 2" | "Kanchanaburi" 1 – 0 "Police Tero" | 1X2 · 1 · 45% · Win (green).
2. "Tue, Oct 13 15:00 EAT" · "–" (live, red) | "LBN" · "Premier League" | "Tripoli SC" 2 – 0 "Al Akhaa Al Ahli" (red score) | 1X2 · 1 · 45% · Pending (amber).
3. "Tue, Oct 13 15:00 EAT" · "Ended" | "KVX" · "Superliga" | "Ballkani" 0 – 1 "Drita" | 1X2 · 1 · 45% · Loss (red).
4. "Tue, Oct 13 15:30 EAT" · "90+3′" (red) | "IRN" · "Persian Gulf Pro League" | "ZOB Ahan" 1 – 2 "Sepahan FC" | 1X2 · X · 45% · Pending.
5. "Tue, Oct 13 16:00 EAT" · "67′" (red) | "INT" (globe) · "Olympics Women - Qualification CAF" | "Zimbabwe W" 0 – 4 "Malawi W" | 1X2 · X · 45% · Pending.
6. "Tue, Oct 13" · "Postponed" (amber) | "PAN" · "Liga Panameña de Fútbol" | "Sporting San Miguelito" VS "Tauro FC" | 1X2 · — · — · —.
7. "Wed, Oct 14 01:30 EAT" · "Upcoming" | "BRA" · "Serie B" | "Athletic Club" VS "Londrina" | 1X2 · — · — · — (reason "Not predicted").
With all four markets selected, e.g. chip "Markets: 4 selected" and card "DC · 1X · 90% · Win".
Pick tooltip sample: "API-Football fallback · Provisional estimate · Published: Oct 13, 2026, 12:31 EAT".
Pagination: "Showing 1–30 of 294 matches" · ‹ 1 2 3 4 … 10 ›. Live tab sample count "24 matches".

---

## 10. Shared components (for uniformity across screens)

- `PublicShell` (`src/app/_components/public-shell.tsx`): skip link, desktop header, main, footer, phone tab bar.
- `AppBrandBar` (`src/components/navigation/app-brand-bar.tsx`): phone top bar with logo + `ThemeToggle` (`src/components/ui/theme-toggle.tsx`), shared with other app screens.
- `ResponsiveNavigation` + `MoreMenu`/`TabBar`/`TabLink`/`MoreList` (`src/components/navigation/responsive-navigation.tsx`, `shell-styles.tsx`, `navigation-fit.ts`).
- `FeedHeader`, `FeedFilterToolbar`, `ResultsToolbar` (`src/components/match/feed-header.tsx`); `FeedFilters`, `FeedFilterActions` (`feed-filters.tsx`); `FeedActiveFilterSummary`, `FeedAppliedSummary`, `FeedNote` (`feed-controls.tsx`); `DateRangePicker`, `DatePresets` (`feed-dates.tsx`); `FeedTimeFilter` (`feed-time.tsx`); `RangeFields` (`feed-range-fields.tsx`).
- Filter primitives: `OptionPicker`, `CompactSelect`, `FilterChip`, `ChipText`, `IconButton`, `OptionLogo`, `focusRing` (`src/components/match/filter-parts.tsx`).
- `MatchCard`, `MatchCardList`, `TeamLogo`, match icons (`src/components/match/match-card.tsx`, `match-card-list.tsx`, `team-logo.tsx`, `match-icons.tsx`).
- `FeedPagination` + `paginationListStyles` (`src/components/match/feed-pagination.tsx`, `src/components/ui/pagination-styles.ts`), `useFeedPagination`, `useLiveRefresh`.
- `EmptyState`, `StatusText` (`src/components/ui/feedback.tsx`); `OutcomeBadge`, `ProbabilityLabel` (detail page use); `Button`, `ButtonLink`, `TextLink` (`src/components/ui/controls.tsx`); `Stack`, `Container`, `PageMain`, `MutedText` (`src/components/ui/layout.tsx`); icons (`src/components/ui/icons.tsx`); `BrandLogo`, `BrandMark` (`src/components/ui/brand.tsx`); `VisuallyHidden`.
- Tokens: `src/styles/theme.ts` (light/dark, market hues, outcome tones, `header.*`, compact type scale 10/11/12/13/14/16/18/20 px, radius 0, focus 3 px) and `assets/brand/brand-tokens.json` (navy `#0B1F33`, teal `#007F7A`, tealOnDark `#39D5CA`, Manrope).

---

## Completeness review

Review of all seven inventory files (`feed`, `filters`, `detail`, `markets`, `team`, `squad`, `info`) against the code on
2026-10-13. Method: re-read every component reachable from the feed on a phone; machine-checked every quoted label
in the seven files against `src/i18n/messages/en.ts` (everything not found verbatim was sample data, a composed
string or the hard-coded theme-toggle labels, so no invented labels were found); machine-checked every `file:line`
reference against file length.

### A. Nested views that have no screen id of their own

| Proposed id | View | Parent | How it is reached | Where it is inventoried | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `picker` | Filter checklist popover: "Markets" (4 rows, no search), "Leagues" / "Countries" ("Find Leagues" / "Find Countries", up to 1,000 rows with logo or flag and fixture count, "No options for these dates") | `filters` | Tap the "Markets", "Leagues" or "Countries" trigger in the open Advanced filters panel. No URL state; draft only until Apply. | `filters.md` §4.5 (accurate); `feed.md` §5 (row size wrong, see C1) | **Own sample set.** It is the deepest step of the feed's longest flow and has its own layout problems: opens downward only, autofocus opens the keyboard, z-index 15 sits under the tab bar (z 20), no Done control (`filter-parts.tsx:192-206, 260-289`; `feed-filters.tsx:150-163`). |
| `player` | Player details item panel: "Team", "Shirt number", "Position", "Lineup role", "Availability", "Reported" (injured only), "Expected return" = "Not provided by the source", note `details.playerStatsMissing` | `lineups`, `players`, `injuries` | `?section=lineups|players|injuries&item=<home|away>-<id>` from a pitch button ("Open player details: {player}"), a starter/substitute row, a player row or an injury row | `squad.md` §0.7 | **Own sample set.** One view with three parents; designing it inside three section sets would produce three versions. |
| `snapshot` | Prediction snapshot: selected publication (`?revision=`) or cycle (`?cycle=`). Summary "Historical prediction snapshot" / "Inspect prediction snapshot", h3 "Publication {number}", status, cycle summary, four market blocks (each with "Alternative selections" and "Source attribution and timing" disclosures), "Prediction analysis", "Sources and evidence times" | `history` | "Publication {number}" or "Inspect this cycle’s retained prediction" -> full server navigation `?revision=…|cycle=…&revisionAnchor=…&cycleAnchor=…#revision-history` (`history-page.ts:18-26`) | `info.md` §4.3 C-D | **Own sample set.** It has its own URL and is the largest single view reachable from the feed (four market blocks plus analysis and sources, `match-detail-content.tsx:21-136`). |
| `more` | Tab bar "More" overflow popup (native `<details>`): light surface above the bar, `min(16rem, 100vw - 16px)` wide, 40 px rows with icon + label; at 375 px after hydration it holds "Privacy", "Terms", "Contact" | shell (every screen) | Tap "More" in the bottom tab bar | `feed.md` §3.11; `detail.md` B7 | Fold into `feed`: at least one feed sample shows it open. The same component serves the details pages (`shell-styles.tsx:221-300`). |
| `record` | Match record item panel (`RecordPanel`): h4 "{home} v {away}", "Date", "Competition", "Score", "Status", note `details.regulationNote`, link "Open this match's page" | `h2h`, `form`, `context` | `item=<fixtureId>` from an H2H meeting row, a Form result row or a Context "Last" row | `team.md` 2C/3C; `info.md` §2.3 C | Fold into `h2h` as the canonical design; `form` and `context` reuse it unchanged (`team-sections.tsx:97-112`). |
| `news-item` | News item panel: Pill "Report"/"Analysis", "Publisher", "Source published", "Source retrieved", bullets, note, "Read the original report" | `news` | `?section=news&item=<id>` | `info.md` §1.3 C | Fold into `news`. |
| `detail-search` | Details header search row: placeholder "Search teams, leagues…", button "Search", GET to `/{locale}?q=` | `detail` | Search icon in the details phone bar ("Search matches" / "Close search") | `detail.md` B0a | Fold into `detail`. |

Sibling destinations (not nested in the prediction screen; do not design): "Slip builder" `/en/slips`; "Help",
"Privacy", "Terms", "Contact" (tab bar, More and footer); `/en/how-it-works` (permanent redirect to `/en/help`);
external publisher/source links (News "Read the original report" and market-panel citations open a new tab;
history snapshot source links open in the same tab); another fixture's Match details page ("Next" fixture row,
"Open this match's page"), which is the `detail` screen again; the 404 page.

### B. States missing or under-specified

1. **Empty Live tab (and empty Results).** Status is a filter (`server/matches/feed-read.ts:58-59`), while the
   empty-state choice counts every fixture in the date cohort (`server/matches/feed-service.ts:90-91`). So Live
   outside match hours shows count "0 matches" and the empty state "No matches for these filters" / "Nothing matches
   these filters in the available data.", although the visitor applied no filter. The same happens on Results when
   yesterday has fixtures but none finished. This is the most common Live state and needs a sample. Only existing
   strings may be used.
2. **No busy feedback on link navigations.** The 60 % dimming and "Updating matches…" only wrap `apply()` (Apply,
   Clear, Sort, Enter) and the first device-zone replace (`feed-surface.tsx:82-88, 111`). Tab bar links, pagination
   links (`feed-pagination.tsx:47, 58`), card taps and "Back to matches" are plain `next/link` navigations. There is
   no `loading.tsx` anywhere under `src/app`, so the old screen stays unchanged until the server answers. This
   affects Easy navigation and Short flows on every screen.
3. **Unexpected server error.** There is no `error.tsx` or `global-error.tsx` under `src/app`. Errors other than
   handled read failures (`feed-route.tsx:32`; `match-detail-route.tsx:48`) fall through to the unbranded Next.js
   error page, with no tab bar. Note it only; do not design a new screen for it.
4. **Silent limits on phones.** Unticking the last market does nothing (`feed-filters.tsx:41-44, 465`). The string
   "Keep at least one market selected." is used only as a desktop chip `title` (`feed-filters.tsx:489`). The 51st
   league or country tap is ignored with no message (`feed-filters.tsx:37-38`). `filters.md` records this correctly.
   `feed.md` §8 implies the message is shown on phones; it is not. Because the string already exists, a design may
   show it on phones without adding scope.
5. **Before hydration.** The server HTML shows 3 tabs + "More" (More then holds "Slip builder", "Help", "Privacy",
   "Terms", "Contact"), with times in EAT. After hydration it shows 5 tabs + "More" and the device zone. Samples
   should show the hydrated state (`responsive-navigation.tsx:52`; `feed-surface.tsx:86-88`).
6. **404 shell.** The 404 page uses `PublicShell` with no `current`. No tab is highlighted, and on phones the shell
   header shows the logo and theme toggle only, with no back control (`app/not-found.tsx`; `shell-styles.tsx:68-78`).

### C. Corrections to the existing inventory text

`feed.md`
1. §5 "checkbox rows 36 px": on phones, `PhonePicker` sets checklist rows to 32 px (2rem) and the Find box to 32 px
   with 16 px text. The popover is square, has no shadow and is capped at the field width (`feed-filters.tsx:150-163`).
   36 px is the unstyled default in `filter-parts.tsx:208-235`. `filters.md` §4.5 has the right values.
2. §8 "Limits … ('Keep at least one market selected.')": desktop only (see B4).
3. §8 "chips (desktop)" and the brief's "no-JS chip links": removable chip links (`FilterChip`) exist only on desktop.
   Phone summary chips are plain `<li>` (`feed-controls.tsx:69-71`). Without JavaScript, the phone filter fields
   cannot be opened at all (`filters.md` §6 "No JavaScript"). The constraint holds for links that exist on phones
   (cards, pagination, tabs, More); it does not mean the phone chips are links today.
4. §7 #19 cites `domain/feed-date-navigation.ts:5-23`, but the file has 21 lines (use `:5-21`).

`detail.md`
5. §5 "Results → today's results": wrong. Results opens **yesterday's** finished fixtures (`feedDefaults.results.dayOffset = -1`,
   `domain/feed-query.ts:62-65`; `domain/navigation.ts:14-18`).
6. §2 "its visible part is a chevron": on phone tiles the chevron is hidden (`match-card.tsx:502`,
   `> svg { display: none; }`). The whole tile is the link, and its only visible affordance is the 8 % press tint.
7. §2 and §6 "History auto-open … the history section opens automatically": contradicted by the verified defect in
   `info.md` §4.7. History links are built from the route path plus history keys only, so they drop `section`
   (`server/matches/history-page.ts:8-26`, `app/_components/revision-history.tsx:74, 88, 99, 106, 108`). After
   "Publication {number}", "Older publications", "Latest history" and the other history links, the History card
   renders closed. On a fresh load the first tap closes it again. Treat `info.md` as authoritative.
8. B7 "More … with the remaining Help, Privacy, Terms, Contact": at 375 px after hydration, "Help" is a visible tab and
   More holds "Privacy", "Terms", "Contact" (measured in `feed.md`/`info.md`; `reference/01-feed-top.jpg`).
9. Stale line references: `match-detail-route.tsx:90-92` -> `:59-62`; `:95` -> `:65`; `:57-62` -> `:26-32`;
   `match-view.ts:296` -> `:35`; `use-match-view.ts:113-121` -> `:23-28`.

### D. Recommended screen list (5 samples each, navigation order)

`feed` (includes Live/Results variants, the empty-Live state and the More menu open) -> `filters` -> `picker` ->
`detail` (includes the header search row and the unavailable / rate-limited states) -> `markets` -> `market` ->
`stats` -> `h2h` (canonical `record` panel) -> `form` -> `lineups` -> `players` -> `news` (with the item panel) ->
`injuries` -> `player` -> `context` -> `referee` -> `history` -> `snapshot`.
