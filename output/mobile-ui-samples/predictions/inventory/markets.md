# Inventory: All Markets & Odds (`markets`) and the nested market panel (`market`)

Scope: phone (375 px CSS) UI of the GoalHint match-details page, `/[locale]/matches/[fixtureId]/[slug]`.
Read-only inventory of what exists today. All quoted labels are the English strings from
`src/i18n/messages/en.ts` (key in brackets). Nothing here is a proposal; "Friction" lists observations
against the five judging criteria (Uniformity, Simplicity, Accessibility, Easy navigation, Short flows).

Primary source files

| File | What it owns |
| --- | --- |
| `src/components/match/details/markets-card.tsx` | `MarketsCard` (list screen) and `MarketPanel` (nested panel), search hook |
| `src/components/match/details/details-ui.tsx` | Card, CardHeader, Crumbs, Panel, PanelHeading, ChoiceGroup chips, RowList/RowButton, Pill, Bar, Facts, Note, LinkButton, focus/reveal hooks |
| `src/components/match/details/match-banner.tsx` | Top-pick button and 2x2 `MarketTiles` (both open the panel); `familyIcon` / `familyAccent` |
| `src/components/match/details/labels.ts` | `pickLabel`, `marketName`, `percent` |
| `src/components/match/details/section-card.tsx` | `useReturnFocus` (focus back to the row) |
| `src/components/match/details/match-details.tsx` | Page order, phone top bar, provider wiring (`ViewProvider value={markets}`) |
| `src/components/match/details/use-match-view.ts` | URL push/replace semantics |
| `src/domain/match-view.ts` | URL keys `mk`, `mcat`, `mq`, `market`; 13 market categories |
| `src/domain/match-details.ts` | `marketCategoryMembers`, `marketRow`, `featuredFamily`, `visibleMarkets`, `marketOutcomes`, `exclusiveFamily` |
| `src/domain/markets.ts` | The four families and selection codes; `presentMarketProbabilities` (group rounding, boundary labels) |
| `src/domain/match-detail.ts` | Detail DTO: per-market `source`, `timestamps`, `alternatives`, `outcomes`, `analysis`, `unavailableMarkets`, `odds` |
| `src/domain/detail-presentation.ts` | `detailAnalysis` (withholds explanation when a citation is unsafe) |
| `src/app/_components/match-detail-content.tsx` | Prediction-History snapshot: the *other* rendering of the same per-market data (for uniformity comparison) |
| `docs/match-details.md`, `docs/markets.md`, `docs/provider-odds.md`, `docs/match-detail-page.md` | Contracts (URL state, odds off, rounding/boundary labels) |

Reference captures (current UI, local DB has no published forecasts so everything reads "Not available"/"—"):
`output/mobile-ui-samples/predictions/reference/04-detail-top.jpg` (dark, markets card under the tiles),
`05-detail-sections.jpg` (card footer notes), `07-detail-finished-light.jpg` (light theme, finished 4–2 match).
No capture exists of the market panel; its description below is derived from code.

---

## Domain facts every design must respect

* Exactly four published families (`publicPolicy.markets`, `src/domain/public-policy.ts:11-16`), always in this order:

  | Family code | Row/panel name `details.market.*` | Short code `market.code.*` (tiles, top pick) | Feed name `market.family.*` | Icon (`familyIcon`) | Details accent (`familyAccent`) | Theme market hue (`theme.color.market`) |
  | --- | --- | --- | --- | --- | --- | --- |
  | `match-result` | "Match result (1X2)" | "1X2" | "Match result" | ResultIcon (circle/crosshair) | orange | emerald `#00824A` |
  | `double-chance` | "Double chance" | "DC" | "Double chance" | ShieldIcon | violet | violet `#7C3AED` |
  | `total-goals` | "Over/Under 2.5 goals" | "O/U 2.5" | "Total goals (2.5)" | GoalsIcon (ball) | blue | blue `#2563EB` |
  | `both-teams-to-score` | "Both teams to score" | "BTTS" | "Both teams to score" | BothTeamsIcon (two circles) | teal | orange `#C2410C` |

* Selections and their pick labels `details.pick.*` (team names substituted):
  * match-result: `home-win` "{home} win", `draw` "Draw", `away-win` "{away} win"
  * double-chance: `home-or-draw` "{home} or draw", `away-or-draw` "{away} or draw", `home-or-away` "{home} or {away}"
  * total-goals: `over-2.5` "Over 2.5", `under-2.5` "Under 2.5"
  * both-teams-to-score: `yes` "Yes", `no` "No"
* Double chance is derived from match result (same source); its three probabilities overlap (sum about 200%).
  The other three families are mutually exclusive and sum to 100%.
* The chosen pick is the highest unrounded probability; ties use the order above (`src/domain/markets.ts:139-151`).
* Featured ("Top pick") family = highest stored selected probability, then higher fresh price, then policy order
  (`src/domain/market-ranking.ts:15-29`). In practice double chance usually wins because its pick sums two outcomes.
* Bookmaker odds are OFF: `publicPolicy.features.providerOdds = false` (`src/domain/public-policy.ts:24-26`); detail
  `odds` and `fixture.prices` are always `[]` (`docs/provider-odds.md:166-186`). Every odds cell renders "—". No
  bookmaker name, link, comparison, movement, value rating or bet prompt may appear.
* Outcome status per market pick: `correct` "Correct", `incorrect` "Incorrect", `pending` "Pending", `void` "Void"
  (plus `unavailable` "Unavailable" used elsewhere) (`en.ts:736-743`). A live score never settles a pick.
* Per-market source: `market.source.ai` "AI prediction" or `market.source.api-football` "API-Football fallback"; can be
  `provisional` ("Provisional estimate") and carry a whitelisted fallback reason (6 texts, see panel).
* Unavailable reasons (`detail.unavailable.*`): `not-published`, `no-locked-selection`, `unsupported`, `insufficient-data`.
* Prediction refresh state (`detail.refresh.*`, from `fixture.update.prediction`): `updating`, `delayed`, `current`,
  `unavailable`, `outside-window`, `locked`.

## URL state (both screens)

From `src/domain/match-view.ts:18-96` and `src/components/match/details/use-match-view.ts:20-33`.

| Key | Values | Default (omitted from URL) | History mode when changed |
| --- | --- | --- | --- |
| `mk` | `closed` collapses All Markets & Odds | open | push (header toggle, "Show all markets") |
| `mcat` | `popular`, `results`, `goals`, `btts`, `double-chance`, `draw-no-bet`, `handicaps`, `corners`, `cards`, `halves`, `correct-score`, `clean-sheets`, `specials` | `popular` | replace |
| `mq` | search text, NFC-normalized, control chars stripped, max 80 chars | empty | replace, written 300 ms after typing stops (`markets-card.tsx:184-208`) |
| `market` | one of the four family codes | none (list shown) | push (open from row, tile, top pick; close from breadcrumb/back/collapse) |

Invalid values fall back to defaults (e.g. `market=corners` -> list, `mcat=bogus` -> Popular); all other query keys
(`section`, `item`, revision history keys) are preserved. A deep link such as
`/en/matches/{id}/{slug}?market=total-goals` server-renders the panel, then focuses its heading and scrolls the card
into view once after `load` (`details-ui.tsx:432-468`). Opening/closing the panel adds a history entry, so the phone/
browser Back gesture closes the panel; category and search changes do not create history entries.

---

## Screen 1 — `markets`: All Markets & Odds

### Entry

* Tap a match card in the predictions feed (`/en`, `/en/predictions/{date}`, Live/Results tabs) -> `matchHref(...)`
  -> `/en/matches/{fixtureId}/{slug}` (`src/components/match/match-card.tsx:738`). The card is expanded by default
  (`defaultMatchView.marketsOpen = true`, `match-view.ts:35`). The feed card's shown market is NOT carried into the
  URL, so the page always opens on the list (Popular), never on that market's panel.
* Direct URL with any of `mk`, `mcat`, `mq` (e.g. `?mcat=goals`, `?mq=btts`, `?mk=closed`).
* Returning from the nested panel (breadcrumb "Markets", "‹ Back to all markets", or Back gesture).

### Purpose / user task

See every supported market for this fixture in one list: our pick per market, its estimated probability, (absent)
odds, then drill into one market. Secondary: filter by category or search by market name/code. It is the overview of
the four published families plus an honest statement that other market types are not published.

### Position on the page (375 px, top to bottom)

1. Phone top bar (in-flow, NOT sticky, 52 px, navy `#102A3A` / dark `#10181D`, 2 px teal bottom edge;
   `match-details.tsx:42-56,187-195`): back arrow link (aria-label "Back to matches" `details.backToMatches`) ->
   stored feed URL or `/en`; centred title "Match details" (`details.title`); theme toggle ("Switch to dark theme" /
   "Switch to light theme"); search toggle ("Search matches" / "Close search") opening a form (placeholder
   "Search teams, leagues…", button "Search") that GETs the feed with `q`.
2. Match banner: competition (logo, name, "round · country"), kickoff day + time + zone (e.g. "Sat, Oct 18" / "17:30
   EAT"), home crest+name+last-five W/D/L, "VS" or score "4 – 2" with status ("Finished", "67′", "HT"…), away team,
   then the full-width "Top pick" button (see entries to the `market` screen).
3. 2x2 market tiles (`MarketTiles`, `match-banner.tsx:227-288`): one per family with icon, short code ("1X2", "DC",
   "O/U 2.5", "BTTS"), pick (or "Not available"), probability (or "—"), odds chip "—", chevron. Featured tile has
   orange soft background and `#FDBA74` border.
4. **All Markets & Odds card** (this screen; full width, `match-details.tsx:132,242`).
5. Section cards two-up (Team Comparison, Head to Head, …), page disclaimer, site footer.
6. Fixed bottom tab bar (42 px + safe area, `shell-styles.tsx:348-358`): Matches (current), Live, Results,
   Slip builder, Help, More at 375 px (narrower phones collapse extras into More, see capture 07).

In capture 04 (viewport ~375x550) the card header sits about 305 CSS px from the top; the four rows end around
480 px; the footer notes fall under the tab bar until scrolled.

### Ordered content blocks (exact labels)

Card: `section[data-section="markets"]`, `aria-labelledby="section-markets-title"`, 1 px border, square corners,
padding 9/8/10 px, container query name `details-card` (`details-ui.tsx:53-68`). Inner width at 375 px ≈ 325 px
(20.3 rem), which selects the one-line table layout.

1. **Card header** (`CardHeader`, `details-ui.tsx:122-134`; `markets-card.tsx:222-225`)
   * `h2#section-markets-title` containing a disclosure `button` (`aria-expanded`, `aria-controls="section-markets"`).
   * Orange icon badge (bar-chart `MarketsIcon`), title "All Markets & Odds" (`details.allMarkets`, 13 px bold),
     meta `small` "{count} of {total} published" (`details.publishedCount`, e.g. "4 of 4 published",
     "0 of 4 published"; 11 px muted; count = `snapshot.markets.length`, total = 4), chevron (rotated 90° and blue
     when expanded).
2. **Search field** (`markets-card.tsx:22-35,228-229`): magnifier icon + `input type="search"`, placeholder and
   aria-label "Search markets" (`details.searchMarkets`), maxLength 80, 30 px tall, 12 px text. Filters as you type
   (deferred value); matches the string "{full name} {short code}" of each family across all categories, e.g. "goals",
   "btts", "1x2", "dc", "over" (`markets-card.tsx:217-218`, `match-details.ts:50-54`). Team names and pick labels are
   not searchable.
3. **Category chips** (`ChoiceGroup`, `details-ui.tsx:225-260`; shown only while the search is empty,
   `markets-card.tsx:230-232`): `role="group"` aria-label "Market categories" (`details.categories`); 13 `button`s
   with `aria-pressed`, single horizontal row, `overflow-x: auto` with the scrollbar hidden. Labels in order:
   "Popular", "Results", "Goals", "Both teams", "Double chance", "Draw no bet", "Handicaps", "Corners", "Cards",
   "Halves", "Correct score", "Clean sheets", "Players & specials" (`details.category.*`). Pressed chip = solid blue
   fill with `onBrand` text; others muted fill. 26 px tall, 11 px text. At 375 px about 4.5 chips are visible ("Double ch"
   is clipped at the edge in capture 04).
   Category membership (`match-details.ts:14-28`): Popular = all four; Results = 1X2; Goals = O/U 2.5 + BTTS;
   Both teams = BTTS; Double chance = DC; the other eight are always empty.
4. **Column header row** (`Head`, `aria-hidden="true"`, only when card inner width ≥ 20 rem; `markets-card.tsx:39-54,234-235`):
   "Market" (`details.market`), "Our prediction" (`details.prediction`), "Probability" (`details.probability`),
   "Odds" (`details.odds`), blank chevron column. 11 px bold muted on `cardHeader` fill. At 375 px "Our prediction"
   wraps to two lines (capture 04).
5. **Market rows** (`RowList` `ul` > `li` > `MarketRow` button; `markets-card.tsx:236-251`), one per visible family
   in policy order, separated by 1 px rules. Each row:
   * Name cell: family icon badge (22 px, family accent) + full name ("Match result (1X2)", "Double chance",
     "Over/Under 2.5 goals", "Both teams to score"), single line with ellipsis — at 375 px truncated to
     "Match resu…", "Double cha…", "Over/Unde…", "Both team…".
   * Prediction cell: `Pill` with the pick label ("Arsenal win", "Arsenal or draw", "Over 2.5", "Yes"). Orange pill
     for the featured family, blue for others; unpublished -> blue pill "Not available" (`details.notAvailable`) at
     opacity 0.7.
   * Probability cell: bold whole percent "48%" (`percent()`, `Math.round(p*100)`), or "—" when unpublished. A
     horizontal probability bar (orange gradient) follows the number only when the card is < 20 rem (phones < ~360 px)
     or ≥ 27 rem; at 375 px the bar is hidden (`markets-card.tsx:65-67`).
   * Odds cell: "—" in a muted chip, `title` "Bookmaker odds are not imported yet." (`details.oddsMissing`).
   * Chevron ">".
   * Accessible name (aria-label): "Open {market} details: {pick}, estimated probability {probability}"
     (`details.tileOpen`), e.g. "Open Match result (1X2) details: Arsenal win, estimated probability 48%";
     unpublished: "Open Double chance details: Not available, estimated probability —".
   * Row min height 34 px, 12 px text.
   * Narrow variant (card < 20 rem, i.e. 320–359 px phones): no header row; each row becomes two lines
     `name | pick | chevron` over `probability+bar | odds | chevron` (`markets-card.tsx:55-63`).
6. **Empty results notes** (instead of rows, `markets-card.tsx:252-253`):
   * Search with no match: "No supported market matches “{query}”." (`details.noMarketMatch`).
   * Empty category: "No {category} markets are published for this match." (`details.noCategoryMarkets`, e.g.
     "No Corners markets are published for this match.", "No Players & specials markets are published for this match.").
     The column header row still renders above this note.
7. **Supported-markets note** (empty category and no search only, `markets-card.tsx:255`): "Goal Hint currently
   publishes match result (1X2), double chance, total goals over/under 2.5 and both-teams-to-score probabilities."
   (`details.supportedMarkets`).
8. **Footer notes** (dashed top rule, `markets-card.tsx:256-259`), 12 px muted:
   * "Odds show as — because bookmaker odds are not imported yet; no odds comparison, movement or value rating is shown." (`details.oddsFooter`)
   * "Probabilities are Goal Hint estimates, not bookmaker odds and not guarantees." (`details.probabilityNotOdds`)
9. **Collapsed variant only**: body hidden, then a text button "Show all markets" (`details.showMarkets`,
   `markets-card.tsx:262`).

### Actions

| Control | Result |
| --- | --- |
| Card header button "All Markets & Odds" | Toggles expanded/collapsed; collapsing also closes any open market panel; writes/removes `mk=closed` (push) |
| "Show all markets" (collapsed only) | Expands (removes `mk`, push) |
| Search input | Filters rows live; hides category chips while non-empty; writes `mq` after 300 ms (replace). Native search-field clear (where the browser shows one) empties it |
| Category chip | Selects category (`mcat`, replace); pressing the current chip does nothing |
| Market row (whole row button) | Opens the `market` panel for that family in place of the list (`market=<family>`, push); focus moves to the panel heading and the card scrolls to the top of the viewport |
| Market tile (above the card) | Same as row; also forces the card open |
| Top pick button (banner) | Opens the featured family's panel; disabled when nothing is published |
| Phone bar back arrow | Leaves to the feed URL saved in session storage (filters kept) or `/en` |
| Browser/OS Back | Steps back through panel open/close and collapse/expand entries (not categories or search) |
| Bottom tab bar | App sections (Matches, Live, Results, Slip builder, Help, More) |

### States

* **Expanded (default)** / **Collapsed** (`mk=closed`: header + "Show all markets" only; header meta still shows the count).
* **Published count** 0–4 of 4 in header meta.
* **Fully populated**: four rows with pick pills, percentages, "—" odds; featured row pill orange.
* **Partially published**: e.g. "3 of 4 published"; the missing family's row shows the "Not available" pill and "—".
  The stored reason is only visible after opening its panel.
* **Nothing published** (every captured fixture today): "0 of 4 published", four "Not available" rows, banner
  "No prediction published" + reason (`match.noPickReason.*`: "Not predicted", "Predictions start within 7 days",
  "Prediction updating", "Awaiting prediction", "Prediction failed", "No prediction locked", "Not available for this market").
* **Category selected**: 13 variants; 8 of them always show the empty note + supported-markets note.
* **Search active**: chips hidden; rows from all categories that match; or "No supported market matches “…”."
* **Upcoming / live / finished / void fixtures**: the table looks identical; rows never show outcome badges or the
  score. Status, live minute and score appear only in the banner above. (Outcome lives inside the panel.)
* **Live refresh**: the page polls `GET /api/matches/{id}` every 20 s (live, updating run, or kickoff within 30 min)
  or 60 s otherwise and re-renders in place without any loading indicator; a failed poll silently keeps the last data
  (`live-match-detail.tsx:42-59`, `docs/match-details.md:50-52`).
* **Loading**: none for this card (server-rendered with the page).
* **Page error** (whole detail page, `match-detail-page.tsx:19-27`): heading "Match temporarily unavailable", text
  "The stored match could not be loaded." or "Match requests are temporarily busy.", description "Try again shortly.
  This page reads stored data; opening it does not generate a prediction.", button "Try again". Unknown fixture -> 404.
* **Panel open**: the list is replaced by the `market` screen inside the same card (header stays).
* **Theme**: light (white cards on `#CEDBE3` page, capture 07) or dark (`#1E2932` cards on `#141C22`, capture 04).

### Current phone layout (375 px)

Full-width card directly under the 2x2 tiles. Top line: orange chart badge, "All Markets & Odds", small grey
"0 of 4 published", down chevron at the far right. Below: a 30 px search box spanning the card, then one horizontally
scrolling chip row (Popular pressed in solid blue; "Double ch" clipped at the right edge, no fade or arrow). Then a
grey header strip "Market | Our / prediction | Probability | Odds", and four 34 px rows: coloured icon square +
truncated name, a small pill (blue or orange, clipped text), percent or "—", a grey "—" chip, ">" chevron. A dashed
rule, then two muted 12 px notes. Nothing in the card is sticky; the only fixed element is the bottom tab bar.

### Frictions

| Criterion | Issue | Evidence |
| --- | --- | --- |
| Simplicity | The same four picks are shown three times in a row on first view: Top pick button, 2x2 tiles, then the table (pick, %, odds "—" each time) | `match-details.tsx:239-242`; `match-banner.tsx:208-216,269-288`; `markets-card.tsx:236-251`; capture 04 |
| Simplicity | 8 of 13 category chips can never contain a market; each shows an empty note plus the supported-markets note; "Goals" overlaps "Both teams" | `match-details.ts:14-28`; `markets-card.tsx:252-255` |
| Simplicity | Card title promises "Odds", but odds are always "—"; the odds column, tile odds chips, footer note and panel rows all exist only to say odds are absent | `markets-card.tsx:247,257`; `public-policy.ts:24-26`; `en.ts:434-437` |
| Uniformity | Three names for one family set: tiles use codes ("1X2", "O/U 2.5"), rows use long names ("Over/Under 2.5 goals"), feed cards use "Total goals (2.5)"; breadcrumb calls the card "Markets" while its title is "All Markets & Odds" | `match-banner.tsx:280`; `labels.ts:11-13`; `en.ts:387-404,441-442,467-470`; `match-card.tsx:651` |
| Uniformity | Family colours differ from the app-wide market hues: details use `familyAccent` (1X2 orange, BTTS teal) while theme tokens and feed cards use 1X2 emerald, BTTS orange ("Each market family keeps one hue on every card, row and filter state") | `match-banner.tsx:19-21`; `theme.ts:209-220`; `match-card.tsx:403-406` |
| Uniformity | Percent rounding differs from the feed: details use `Math.round` with no boundary labels ("0%"/"100%" possible, groups may total 99/101), feed uses largest-remainder groups and "<1%"/">99%"; docs require boundary labels | `labels.ts:14-16`; `markets.ts:299-343`; `match-card.tsx:654-656`; `docs/markets.md:23-25`; `docs/match-detail-page.md:31-32` |
| Uniformity | Control heights below the theme's own phone control height (36 px, `control.compactHeight`): chips 26 px, search 30 px, rows 34 px, header 30 px | `theme.ts:267`; `details-ui.tsx:236,375`; `markets-card.tsx:27`; `details-ui.tsx:83` |
| Uniformity | Pill colour rule: featured row orange, other rows blue, panel always orange for every market | `markets-card.tsx:142,244` |
| Accessibility | "Not available" pill is drawn at opacity 0.7: blue text on blue tint drops to ≈3.6:1 (light) / ≈4.4:1 (dark), below 4.5:1 for 11 px bold text | `markets-card.tsx:244`; `theme.ts` accent.blue text/soft |
| Accessibility | Pill text is clipped without an ellipsis ("Not availabl" in captures 04/07) because `text-overflow` does not apply to an inline-flex box; long picks such as "Manchester United or draw" will be cut silently | `details-ui.tsx:391-407`; captures 04, 07 |
| Accessibility | Search input text is 12 px; iOS Safari zooms the page when focusing inputs under 16 px | `markets-card.tsx:34` |
| Accessibility | Odds explanation lives only in a `title` tooltip, unreachable on touch; unavailable rows announce "estimated probability —" | `markets-card.tsx:242,247`; `labels.ts:15` |
| Accessibility | Small text throughout (11 px chips/headers/pills, 12 px rows and notes) on a 375 px screen | `details-ui.tsx:243,265,381,401`; `markets-card.tsx:51` |
| Easy navigation | Chip row scrolls horizontally with a hidden scrollbar and no edge affordance; 8+ chips are off-screen | `details-ui.tsx:231-233`; capture 04 |
| Easy navigation | Chips disappear while a search query exists (layout jumps, category context lost) | `markets-card.tsx:230` |
| Easy navigation | Market names truncate to "Match resu…" / "Over/Unde…" at 375 px, so rows are told apart mostly by icon colour | `markets-card.tsx:37,68-69`; capture 04 |
| Easy navigation | Table layout switches between 375 px (one line, no bar) and 360 px phones (two lines, with bar), so the same phone class sees two layouts | `markets-card.tsx:36-67` |
| Easy navigation | Empty category still renders the column header strip above the "No … markets" note | `markets-card.tsx:234-253` |
| Short flows | Outcome (Correct/Incorrect/Pending/Void) is not shown in rows or tiles; on finished matches each market must be opened to see whether the pick won, although the data is already loaded (`snapshot.outcomes`) and the feed card shows it | `markets-card.tsx:236-251`; `match-details.ts:35-37`; `match-card.tsx:653` |
| Short flows | The feed card's shown market (e.g. a BTTS-filtered feed) is not passed to the details URL, so reaching that market takes an extra tap | `match-card.tsx:641,738`; `match-view.ts:84` |

### Must keep

* All four families, in policy order, each with: family name, our pick (team-named), estimated probability, odds "—",
  and a way to open its panel. Unpublished families stay listed with "Not available" (never hidden or back-filled
  from another revision, `docs/match-detail-page.md:27-28`).
* "{count} of {total} published" count; featured-family emphasis (one pick only, chosen by `featuredFamily`).
* The 13 category labels and their memberships, or at least the honest empty-category messages
  ("No {category} markets are published for this match." + `details.supportedMarkets`) if categories are shown.
  No market beyond the four may be invented (exact score, corners etc. are excluded by policy).
* Search by market name/code with "No supported market matches “{query}”."; 80-char limit.
* URL-addressable state: `mk=closed`, `mcat`, `mq`, `market`; push for open/close, replace for category/search;
  deep links render server-side; unrelated query keys preserved; Back closes the panel.
* Accessible names: disclosure heading button with `aria-expanded`/`aria-controls`; search aria-label "Search markets";
  chips as a labelled group ("Market categories") with `aria-pressed`; row/tile names "Open {market} details: {pick},
  estimated probability {probability}"; tiles list aria-label "Market summaries"; decorative icons/bars `aria-hidden`.
* Focus: opening a market focuses its heading; closing returns focus to that market's row (`useReturnFocus`).
* Text contrast ≥ 4.5:1 in light and dark (market tokens are tested at 4.5:1, `tests/market-colors.test.mjs`);
  tap targets ≥ 24 px (WCAG 2.5.8).
* Disclaimers verbatim: `details.oddsFooter`, `details.probabilityNotOdds`; page-level `details.disclaimer`
  ("Estimated probabilities are not guarantees and are not betting advice. Opening a section reads stored data; it never starts a new prediction.")
  and footer note "Estimated probabilities, not guarantees. No betting advice."
* Odds rendered only as "—" while `providerOdds` is off; no odds value, comparison, movement, value rating,
  bookmaker branding or link; no confidence rating.
* Phone top bar (back to feed, title, theme toggle, search) and the fixed bottom tab bar.

### Sample populated data (only existing fields)

Fixture: Premier League · England · "Regular Season - 8"; "Sat, Oct 18" "17:30 EAT"; Arsenal v Liverpool; scheduled.
Revision: AI prediction for all groups, published "Oct 13, 2026, 09:12 EAT".

| Row | Our prediction | Probability | Odds | Pill colour |
| --- | --- | --- | --- | --- |
| Match result (1X2) | Arsenal win | 48% | — | blue |
| Double chance | Arsenal or draw | 75% | — | orange (featured) |
| Over/Under 2.5 goals | Over 2.5 | 58% | — | blue |
| Both teams to score | Yes | 61% | — | blue |

Header meta "4 of 4 published". Top pick button: "Top pick" / "DC – Arsenal or draw" / "Odds: — · AI prediction" /
"75%" "Estimated probability". Tiles: "1X2 · Arsenal win · 48% · —", "DC · Arsenal or draw · 75% · —",
"O/U 2.5 · Over 2.5 · 58% · —", "BTTS · Yes · 61% · —".
Partial variant: "3 of 4 published", BTTS row "Not available" / "—".
Finished variant (capture 07 fixture): RB Bragantino 4 – 2 Cruzeiro, "Finished"; rows unchanged (outcome only in panel).
Search "goals" -> Over/Under 2.5 goals. Search "corners" -> "No supported market matches “corners”.".
Chip "Cards" -> "No Cards markets are published for this match." + supported-markets note.

---

## Screen 2 — `market`: nested market panel

### Entry (all push `market=<family>`)

* Tap a market row in All Markets & Odds (`markets-card.tsx:241`).
* Tap a 2x2 market tile above the card (`match-banner.tsx:277`; also sets `marketsOpen`).
* Tap the "Top pick" button in the banner (featured family; `match-banner.tsx:208-210`), aria-label
  "Open top pick: {market}, {pick}, estimated probability {probability}" (`details.featuredOpen`).
* Direct URL `?market=match-result|double-chance|total-goals|both-teams-to-score` (ignored while `mk=closed`).

### Purpose / user task

Understand one market: our pick and its estimated probability, all outcomes with probabilities, where the prediction
came from and when, whether the pick has been settled, and the generated explanation with cited sources. Then return
to the list.

### Ordered content blocks (exact labels)

The panel replaces the search/chips/table/footer inside the same card; the card header ("All Markets & Odds ·
N of 4 published") stays above it. `Panel` = 1 px top rule, 8 px top padding, 10 px gaps (`details-ui.tsx:207-214`);
`data-market-panel={family}`.

1. **Breadcrumb** (`Crumbs`, `nav` aria-label "Location in match details" `details.breadcrumb`; 11 px):
   "Match details" (button: closes the panel and any open section) / "Markets" (button: closes the panel) /
   "{market name}" (current, `aria-current="location"`, bold) (`markets-card.tsx:137-138`).
2. **Heading** `h3` (14 px bold, receives focus, `tabIndex=-1`): the market name, e.g. "Match result (1X2)".
   No family icon or colour.

Populated (an item exists for this family in the applicable revision):

3. **Key facts** (`Facts` `dl`, label column fit-content(40%), 11 px muted labels / 12 px values):
   * "Our prediction" (`details.prediction`) -> orange pill with pick label, e.g. "Arsenal win".
   * "Estimated probability" (`details.estimatedProbability`) -> bold "48%".
   * "Odds" (`details.odds`) -> "— " + note "Bookmaker odds are not imported yet." (`details.oddsMissing`).
4. **"All outcomes"** sub-heading (`details.allOutcomes`; 12 px uppercase muted, letter-spaced).
5. **Outcome list** (`ul` aria-label "All outcomes"; `markets-card.tsx:147-154`): one `li` per selection in canonical
   order; grid "label (min 7 rem) | bar | percent (3 rem)". Label = pick label; the chosen one is bold with
   " · predicted" (`details.predicted`). Bar (6 px, `aria-hidden`) orange for the pick, blue for the others; percent
   right-aligned. This is the panel's "alternatives" view: it lists all selections from `market.probabilities`
   (the DTO's `alternatives` array is not used here).
6. **Outcome-set note**: "These outcomes are mutually exclusive; their probabilities add up to 100% before rounding."
   (`details.exclusiveOutcomes`) for 1X2, O/U 2.5, BTTS; for double chance "Double-chance selections overlap; their
   probabilities do not sum to 100%." (`detail.overlappingProbabilities`).
7. **"Source and timing"** sub-heading (`details.sourceAndTiming`).
8. **Source/timing facts** (`markets-card.tsx:157-166`):
   * "Prediction source" (`details.source`) -> "AI prediction" or "API-Football fallback", plus " · Provisional estimate" when provisional.
   * "Fallback" (`details.fallback`; only when a fallback reason exists) -> one of:
     "API-Football statistical fallback was used because the AI prediction was unavailable." (ai-failure),
     "…was used after the AI request timed out." (ai-timeout),
     "…was used because AI evidence was insufficient." (ai-insufficient-evidence),
     "…was used because the AI budget was exhausted." (ai-budget-exhausted),
     "API-Football statistical fallback supplied a probability group missing from the AI output." (ai-missing-group),
     "API-Football statistical fallback replaced an invalid AI probability group." (ai-invalid-group).
   * "Published" (`match.published`) -> `time`, e.g. "Oct 13, 2026, 09:12 EAT" (device time zone label).
   * "Evidence cutoff" (`detail.evidenceCutoff`) -> time.
   * "Source retrieved" (`detail.retrieved`) -> time.
   * "Source last updated" (`detail.providerUpdated`) -> time or "Unknown" (`detail.unknownTime`).
   * "Bookmaker quote source" (`details.bookmakerSource`) -> always "Not available".
   * "Prediction outcome" (`match.outcome`) -> outcome badge (icon + "Correct" / "Incorrect" / "Pending" / "Void";
     defaults to "Pending" when no outcome row). Omitted when the revision is historical.
9. **"Explanation"** sub-heading (`details.explanation`).
10. **Explanation body** (`markets-card.tsx:168-174`), revision-wide (identical in all four panels):
    * Available: note "Generated explanation for this revision, with its permitted sources linked."
      (`details.explanationGenerated`), then an ordered list of 2–4 reasons; each reason ends with its cited
      publishers as external links (publisher name + external icon; `target="_blank"`, `rel="noopener noreferrer"`,
      `referrerPolicy="no-referrer"`); last item "**Key uncertainty:** {text}" (`detail.uncertainty`) with its citations.
    * Withheld: "The original explanation is unavailable because its source permissions or links could not be confirmed. Stored probabilities remain visible." (`detail.analysisWithheld`)
    * No analysis: "No prediction analysis is available for this cycle." (`detail.analysisUnavailable`)
11. **Probability disclosure** note: "Estimated probabilities are not guarantees. Evidence coverage and age are separate from the probability; missing information does not confirm that a team is unaffected." (`detail.probabilityDisclosure`)

Unavailable (no item for this family):

3'. Note `detail.unavailable.{reason}`:
   * "No prediction has been published for this market in the applicable cycle." (not-published)
   * "No eligible prediction was locked for this market." (no-locked-selection)
   * "This revision does not contain a supported probability group for this market." (unsupported)
   * "This revision has insufficient validated data for this market." (insufficient-data)
4'. Note `detail.refresh.{fixture.update.prediction}`:
   * "Prediction update in progress; any displayed forecast retains its original publication time." (updating)
   * "Prediction update delayed; the previous complete forecast is retained with its original publication time." (delayed)
   * "A stored forecast is available. Check its publication and evidence times for age." (current)
   * "No stored prediction is available." (unavailable)
   * "New predictions become available within seven days of the match." (outside-window)
   * "This prediction cycle is closed to new publications." (locked)

Always last:

12. **"‹ Back to all markets"** text button (`details.backToMarkets`, blue, 12 px bold, 24 px min height).

### Actions

| Control | Result |
| --- | --- |
| Breadcrumb "Match details" | Closes the panel and any open section/item (push) |
| Breadcrumb "Markets" | Closes the panel -> list (push); focus returns to that market's row |
| "‹ Back to all markets" | Same as "Markets" |
| Card header "All Markets & Odds" | Collapses the whole card and clears `market` (push) |
| Browser/OS Back | Returns to the list (or the previously opened market) |
| Another tile / Top pick above | Switches the panel to that family (push) |
| Citation link (publisher ↗) | Opens the permitted source in a new tab |
| Phone bar back arrow | Leaves to the feed (does not close the panel first) |

On open: heading focused, card scrolled to the top of the viewport (smooth unless reduced motion; instant on first
load of a deep link, after `load`, overriding scroll restoration once) (`details-ui.tsx:432-468`).

### States

* **Populated / open cycle (upcoming)**: applicability `current`; outcome "Pending".
* **Provisional**: source "AI prediction · Provisional estimate" (or fallback · provisional).
* **Fallback source**: "API-Football fallback" + "Fallback" row with one of six reasons.
* **Locked after cutoff / live**: applicability `locked`; outcome "Pending" (a live score never settles).
* **Finished, settled**: "Correct" or "Incorrect" badge (outcome tones: correct green `#007754`, incorrect red `#9C2328`,
  pending amber `#8B5700`, void grey `#515C6B` in light theme).
* **Finished, awaiting verified regulation result**: "Pending".
* **Void cycle** (postponed, canceled, abandoned, awarded, invalid cutoff, ineligible): "Void".
* **Historical revision**: outcome row omitted (not normally reachable from this card, which shows the applicable revision).
* **Double chance**: overlap note instead of the mutually-exclusive note; percents total about 200%.
* **Unknown times**: "Unknown".
* **Explanation**: available / withheld / unavailable (3 variants above).
* **Market unavailable**: reason note (4) × refresh note (6), no facts or outcomes.
* **Loading / error**: none of its own (server-rendered); page-level error as in the list screen; silent live refresh
  can change values (e.g. outcome Pending -> Correct) while open.
* **Light / dark theme.**

### Current phone layout (375 px)

Not captured; from code. After opening, the page scrolls so the markets card top sits 12 px below the viewport top
(the phone bar has scrolled away; it is not sticky). Visible top-to-bottom: card header row ("All Markets & Odds ·
4 of 4 published ⌄"), a thin rule, the 11 px breadcrumb "Match details / Markets / Match result (1X2)", the 14 px
heading, a two-column facts list (labels about 40% width), the uppercase "ALL OUTCOMES" label, 2–3 outcome rows with
thin bars and right-aligned percents, a muted note, "SOURCE AND TIMING" with 6–8 label/value rows, "EXPLANATION" with
a note and a numbered list of 2–4 paragraphs plus links, the probability disclosure note, and finally
"‹ Back to all markets". Populated height is roughly 800–900 px, so the only full-size back control sits one to one
and a half screens below the heading; the fixed 42 px tab bar overlays the bottom. Nothing in the panel is sticky.

### Frictions

| Criterion | Issue | Evidence |
| --- | --- | --- |
| Easy navigation | The only explicit back button is at the very bottom of a long panel; at the top there is only an 11 px breadcrumb whose buttons have zero padding (≈15 px tall targets) | `markets-card.tsx:137-138,180`; `details-ui.tsx:166-184` |
| Easy navigation | The phone bar back arrow leaves the page instead of closing the panel; the bar is not sticky, so after the reveal scroll it is off-screen anyway | `match-details.tsx:42-56,188`; `details-ui.tsx:443` |
| Easy navigation | Closing a panel opened from a tile or the Top pick returns focus to the table row, not to the control that opened it | `markets-card.tsx:214`; `section-card.tsx:65-74`; `match-banner.tsx:209,277` |
| Simplicity | Three ways back with three names: "Match details", "Markets", "Back to all markets"; card title is "All Markets & Odds" | `markets-card.tsx:137-138,180`; `en.ts:417,422,441-442` |
| Simplicity | Two facts rows exist only to say data is absent ("Odds — Bookmaker odds are not imported yet.", "Bookmaker quote source Not available") | `markets-card.tsx:144,164` |
| Simplicity | The explanation and its citations are revision-wide and repeat identically in every market panel | `markets-card.tsx:130,168-174` |
| Uniformity | Panel pick pill is always orange, while list rows use orange only for the featured family | `markets-card.tsx:142` vs `244` |
| Uniformity | Heading has no family icon/colour although rows and tiles identify families by icon+colour | `markets-card.tsx:139` vs `243` |
| Uniformity | The same per-market data is rendered differently in Prediction History ("Prediction", "Alternative selections" and "Source attribution and timing" disclosures, `market.family.*` names, shared `ProbabilityLabel` group rounding) | `match-detail-content.tsx:21-71` vs `markets-card.tsx:126-182` |
| Uniformity / Accessibility | Percentages use `Math.round` per outcome: exclusive groups can show 99% or 101%, and extreme values show "0%"/"100%" instead of the required "Less than 1%"/"More than 99%" | `labels.ts:14-16`; `markets-card.tsx:143,152`; `docs/markets.md:23-25` |
| Accessibility | External citation links open a new tab with no text or accessible hint (icon is decorative); link text is only the publisher name | `markets-card.tsx:132-135`; `details-icons.tsx:41` |
| Accessibility | Outcome rows rely on a 7 rem minimum label column; long team-named picks ("Manchester United or draw · predicted") wrap and squeeze the bar on 375 px | `markets-card.tsx:83,150` |
| Short flows | Settlement detail that exists in the data (outcome explanation, settled/corrected/voided times) is not shown here; it only appears in the Prediction History section | `match-detail.ts:33-36`; `match-detail-content.tsx:33-38`; `markets-card.tsx:165` |
| Short flows | Comparing markets means close -> open -> close for each; no next/previous between families (four items only) | `markets-card.tsx:131,180,241` |

### Must keep

* Breadcrumb trail semantics (Match details -> Markets -> market) or an equivalent visible location plus a clearly
  labelled way back to the list ("Back to all markets") and Back-gesture support via the `market` URL key.
* Focus moves to the panel heading on open; returns to the opener's row on close; reduced-motion respected.
* Facts and labels exactly as listed: "Our prediction", "Estimated probability", "Odds" with "—" and
  "Bookmaker odds are not imported yet.", "All outcomes" with " · predicted", the exclusive/overlap note,
  "Source and timing" with "Prediction source", optional "Fallback", "Published", "Evidence cutoff",
  "Source retrieved", "Source last updated", "Bookmaker quote source", "Prediction outcome".
* Every selection of the family with its own probability; the pick marked in text (not colour only).
* Source label per market (AI vs API-Football fallback), provisional marker and the whitelisted fallback reason.
* Times kept separate; unknown times say "Unknown"; never imply freshness from publication time.
* Outcome badge with icon + text; independent of the live/final score; omitted for historical revisions.
* Explanation states (available with citations, withheld, unavailable) and the "Key uncertainty" item; only permitted
  HTTPS sources, `rel="noopener noreferrer"`, `referrerPolicy="no-referrer"`.
* Disclaimer `detail.probabilityDisclosure` verbatim in the panel; double-chance overlap note.
* Unavailable state: both the reason note and the refresh-state note.
* No odds values, bookmaker identity, links, betting prompts, confidence or value ratings.
* Contrast ≥ 4.5:1 (light and dark), targets ≥ 24 px, outcome tones from `theme.color.outcome`.

### Sample populated data (only existing fields)

Arsenal v Liverpool, panel `?market=match-result`:

* Breadcrumb: "Match details / Markets / Match result (1X2)"; heading "Match result (1X2)".
* Our prediction: [Arsenal win] · Estimated probability: 48% · Odds: — Bookmaker odds are not imported yet.
* ALL OUTCOMES: "Arsenal win · predicted" 48% (orange bar) · "Draw" 27% · "Liverpool win" 25%.
  Note: "These outcomes are mutually exclusive; their probabilities add up to 100% before rounding."
* SOURCE AND TIMING: Prediction source "AI prediction" · Published "Oct 13, 2026, 09:12 EAT" · Evidence cutoff
  "Oct 13, 2026, 08:55 EAT" · Source retrieved "Oct 13, 2026, 08:41 EAT" · Source last updated "Unknown" ·
  Bookmaker quote source "Not available" · Prediction outcome [Pending].
* EXPLANATION: "Generated explanation for this revision, with its permitted sources linked." then
  1. "Arsenal have won four of their last five home league matches and conceded twice in that run." BBC Sport ↗
  2. "Liverpool will be without their first-choice centre-back, reported out with a hamstring injury." The Guardian ↗
  3. "Key uncertainty: Arsenal's midfield rotation after a midweek European match is not confirmed." Sky Sports ↗
  (reason texts are illustrative; real ones are stored AI explanations)
* Disclosure note, then "‹ Back to all markets".

Variants:

* `?market=double-chance`: [Arsenal or draw] 75%; outcomes "Arsenal or draw · predicted" 75%, "Liverpool or draw" 52%,
  "Arsenal or Liverpool" 73%; overlap note.
* `?market=total-goals` with fallback: [Over 2.5] 58%; "Under 2.5" 42%; Prediction source "API-Football fallback";
  Fallback "API-Football statistical fallback was used after the AI request timed out."
* Finished (RB Bragantino 4 – 2 Cruzeiro), `?market=both-teams-to-score`: [Yes] 63%, "No" 37%, Prediction outcome [Correct].
* Postponed fixture: any market -> Prediction outcome [Void].
* Unavailable BTTS: "This revision has insufficient validated data for this market." + "A stored forecast is available. Check its publication and evidence times for age." + "‹ Back to all markets".

---

## Shared components (file refs)

* Phone top bar `PhoneHeader`/`PhoneBar`, not sticky, back link + title + theme toggle + search toggle/form — `src/components/match/details/match-details.tsx:42-102,171-203`; `src/components/ui/theme-toggle.tsx:30-37`.
* Fixed bottom tab bar `TabBar`/`TabLink` (42 px, adaptive overflow into "More") — `src/components/navigation/shell-styles.tsx:181-210,348-368`; `src/app/_components/public-shell.tsx:109-111`.
* Details `Card` (square, 1 px border, container query `details-card`) and `CardHeader` disclosure (icon badge, title, meta, rotating chevron) — `details-ui.tsx:53-134`.
* `IconBadge` + `familyIcon`/`familyAccent` — `details-ui.tsx:108-119`; `match-banner.tsx:16-21`; icons `details-icons.tsx:13,37-41`.
* Search field (`Search` label + input) — `markets-card.tsx:22-35`.
* Filter chips `ChoiceGroup`/`Choices` (`aria-pressed` buttons, horizontal scroll) — `details-ui.tsx:225-260`.
* `RowList`/`RowButton` (row buttons with chevron) — `details-ui.tsx:363-389`; `MarketRow` grid — `markets-card.tsx:55-76`.
* `Pill` — `details-ui.tsx:391-407`; `Bar` probability track — `details-ui.tsx:280-302`.
* `Facts` definition list — `details-ui.tsx:409-428`; `Note` — `details-ui.tsx:262-268`; `LinkButton` — `details-ui.tsx:148-164`.
* `Crumbs` breadcrumb, `Panel`, `PanelHeading` — `details-ui.tsx:166-214`.
* `OutcomeBadge` -> `StatusText` (icon + label, outcome tones) — `src/components/match/outcome-badge.tsx:10-12`; `src/components/ui/feedback.tsx:28-37,155-168`.
* Top-pick button `Featured` and 2x2 `MarketTiles` — `match-banner.tsx:128-165,208-223,227-288`.
* Focus/scroll helpers `useRevealOnOpen`, `scrollClearance`, `useReturnFocus` — `details-ui.tsx:46-50,432-468`; `section-card.tsx:65-74`.
* URL view state `useMatchView` + `parseMatchView`/`serializeMatchView` — `use-match-view.ts:20-33`; `match-view.ts:53-96`.
* Label helpers `pickLabel`, `marketName`, `percent` — `labels.ts:7-16`.
* Theme tokens: market hues `theme.ts:209-220,328-333`, accents, outcome tones, type scale (micro 10 / caption 11 / secondary 12 / body 13 / emphasis 14 / section 16 / title 18 / hero 20 px), `control.compactHeight` 2.25 rem — `src/styles/theme.ts`; brand `assets/brand/brand-tokens.json` (navy `#0B1F33`, teal `#007F7A`, Manrope, 0 px radius).
