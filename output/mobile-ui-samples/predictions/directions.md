# Predictions mobile UI: five design directions (A–E)

Design-lead brief for the screen agents. Each agent draws one screen (of the 18 below) in all five directions. Every
direction is applied **identically on every screen**: same components, same navigation model, same sizes. Read §1–§3
once, then the section of your screen inside each direction (§4–§8). Copy component markup from
`canvas/kit-preview.html` (one column per direction; shared specimens: tab bar + More popover and checklist rows in
column C, pager / note / empty state in column E) and style only with `canvas/project/kit.css` (no per-screen CSS;
inline `style` is allowed only for layout custom properties such as `--w`, `--gap` and popover offsets).

Screens (ids used everywhere below): `feed`, `filters`, `picker`, `detail`, `markets`, `market`, `stats`, `h2h`, `form`,
`lineups`, `players`, `news`, `injuries`, `player`, `context`, `referee`, `history`, `snapshot`.

---

## 0. The five directions at a glance

| | A · Refined Accordion | B · Sheet Stack | C · Page Stack | D · Tabbed Hub | E · Thumb Dock |
| --- | --- | --- | --- | --- | --- |
| Model | One page per screen; things open **in place**; sticky headers carry the exit | Two stable bases (list, match overview); every deeper level is **one bottom sheet** | Every level is a **full page** with one app bar; back always goes up one level | **Flat tabs**: one view at a time, siblings one tap away | A **dock above the tab bar** holds back + previous/next; pages step sideways |
| Feed day change | Date stepper under the title | "Match dates" sheet (one-tap presets) | Sticky date stepper | Sticky date tabs (presets) + ‹ › | Day stepper in the dock |
| Feed filters | In-place criteria accordion (Slip builder pattern) | "Filters and order" sheet, pickers push inside | "Filters and order" page → option pages | Full-screen panel with filter tabs | One full-screen form; dock turns into Clear · Apply |
| Feed card | Classic 4-row card, one-line pick strip | Template card, solid hue probability block | Edge-to-edge scoreboard rows | Table card under one column header | Pick-first card (headline strip) |
| Match overview | Single column of expandable section cards with previews | 2-up equal-height launcher tiles | Index of grouped rows (hub) | "Markets" tab + sticky section tab strip + pinned views list | Start page with a 2-column jump grid |
| Section filters | Labelled wrapping chips | Labelled selects in a sticky sheet sub-header | Select rows in a grouped list | Select chips ("Last 5 ▾") | Labelled segmented controls |
| Item panels | Replace the list in place under a sticky back row | Pushed step inside the same sheet | Own page | Replace the tab content under a pinned back row | Own page; dock steps to previous/next item |
| Risk / cost | Lowest (layout + CSS) | Medium-high (sheet primitive) | Medium (page shells) | High (tab strip + condensed header) | Medium (dock + page shells) |

---

## 1. Judging summary (how the five were chosen)

Fifteen proposals came in (three lenses × five). They clustered into five navigation models, so each final direction
is the strongest member of one cluster with the best ideas grafted from the others. Every final direction is checked
against all five criteria:

- **Uniformity** – one tab bar, one status badge, one market-hue system, one outcome badge, one row family and one
  item template per direction; feed and details share the same top-bar height and 16 px gutters.
- **Simplicity** – the same four picks appear at most twice on the overview (top pick + one list); default filter
  chips, idle Clear/Apply and repeated caption rows are gone.
- **Accessibility** – 12 px text floor, 16 px inputs, ≥44 px targets, visible labels, title-only information made
  visible, outcome/status always icon + text, pitch contrast fixed, full market names in visible text.
- **Easy navigation** – the exit is always on screen (sticky header, sheet header, app bar, tab strip or dock); the
  origin tab stays current on details; history links keep `section=history`.
- **Short flows** – day change ≤ 2 taps, removing one filter = 1 tap, every section ≤ 2 taps from the overview top,
  market outcome visible on the overview.

Grafts per direction are listed in each direction's header. Rejected ideas are listed in §9.

---

## 2. Shared rules (all directions, all screens)

### 2.1 Canvas and artboards

- **Dark theme only.** Every colour comes from a `kit.css` custom property (§2.2). No hex values in sample HTML.
- **Artboard = one phone viewport, 390 × 844 px**, no device frame, **no fake status bar**, no notch, no home bar.
  Root markup (copy exactly):

  ```html
  <figure class="gh-board">
    <figcaption class="gh-board__cap">B · feed · F1 Today</figcaption>
    <div class="gh-phone dir-b"> <!-- top bar, sticky rows, .gh-screen content, dock, tab bar --> </div>
  </figure>
  ```

- `.gh-phone` is a 390 × 844 flex column with `overflow: hidden`. Put elements in this order: top bar → sticky rows →
  `<main class="gh-screen">` (scrolling content; clip whatever falls below) → dock (E only) → tab bar. Fixed and
  sticky things are simply drawn at their position; to show a scrolled state, start `.gh-screen` content mid-page and
  keep the sticky rows on top.
- Overlays (sheets, popovers, full-screen layers) are absolutely positioned inside `.gh-phone` (`.gh-scrim`,
  `.gh-sheet`, `.gh-popover`, `.gh-layer`). Sheets and layers cover the tab bar; popovers sit above it.
- Fonts: Manrope 400/500/600/700/800 from Google Fonts (`<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">`) plus `<link rel="stylesheet" href="kit.css">`.
- **Artboard set per screen (identical in all five directions):**

  | Screen | Artboards (caption suffix) |
  | --- | --- |
  | feed | F1 Today · F2 More open · F3 Live · F4 Results · F5 Empty Live |
  | filters | S1 Draft · S2 Dates + error · S3 Applied (0 matches) |
  | picker | P1 Leagues · P2 Markets (last market) |
  | detail | D1 Overview top · D2 Overview sections · D3 Search open · D4 Unavailable |
  | markets | M1 Popular list · M2 Empty category (Cards) |
  | market | K1 Match result (1X2) top · K2 Source and explanation |
  | stats | T1 Open · T2 Metric item (Points per game) |
  | h2h | H1 Open · H2 Record panel |
  | form | R1 Open (Both teams) |
  | lineups | L1 Open (pitch) · L2 Starting XI and substitutes |
  | players | Y1 Open (page 1) |
  | news | N1 Open list · N2 News item |
  | injuries | I1 Open |
  | player | Q1 Player panel (Walace, from Players) |
  | context | C1 Open facts · C2 Surrounding fixtures |
  | referee | Z1 Open |
  | history | HI1 Publications · HI2 Schedule cycles |
  | snapshot | SN1 Snapshot top · SN2 Markets and analysis |

### 2.2 Tokens and type (all from `kit.css`)

Colours (dark values from `src/styles/theme.ts`): `--gh-page #141C22`, `--gh-surface #1E2932`, `--gh-surface-2 #18232B`
(surfaceMuted / cardHeader), `--gh-raised #253541` (rowHover), `--gh-border #3C505E` (dividers),
`--gh-control #69808F` (every tappable boundary, ≥3:1), `--gh-text #F2F7F8`, `--gh-muted #B1BEC8`,
`--gh-brand #53D5C6` (brand, link, focus), `--gh-brand-soft #183C3B`, `--gh-on-brand #102A3A`, `--gh-header #10181D`,
`--gh-header-control #1B2A34`. Outcomes `--gh-correct/-bg`, `--gh-incorrect/-bg`, `--gh-pending/-bg`,
`--gh-void/-bg`. Live `--gh-live/-bg`. Market hues (set with a class on any element): `.mkt-1x2` emerald
`#70DEA4/#1C342B`, `.mkt-dc` violet `#C6AEFF/#322B45`, `.mkt-ou` blue `#9EC5FF/#233449`, `.mkt-btts` orange
`#FFBA8F/#3D2D25` → exposes `--hue` / `--hue-bg`. Section accents (`.acc-orange`, `.acc-violet`, `.acc-emerald`,
`.acc-blue`, `.acc-red`, `.acc-amber`, `.acc-teal`) → `--acc` / `--acc-bg`. Pitch `--gh-pitch-1/-2`, `--gh-white`.

Section accents (from the app): Markets orange · Team Comparison orange · Head to Head violet · Team Form emerald ·
Lineups emerald · Players blue · News & Insights blue · Injuries & Suspensions red · Match Context amber · Referee
violet · Prediction History teal.

Contrast (computed from these tokens by the reviewer, 2026-10-13): every text pair the kit uses is ≥ 6.33:1 (lowest:
`--gh-muted` on `--gh-brand-soft` or the teal tint 6.33:1; muted on the other hue tints 6.67–7.45:1; each hue on its
own tint 6.69–8.71:1; `--gh-on-brand` on `--gh-brand` 8.27:1 and on the four market hues 7.71–8.96:1; form letters
7.42–8.96:1; outcome and live text on their tints 7.05–8.71:1; white pitch names 7.13 / 9.11:1). Non-text:
`--gh-control` is 3.06 (on raised) to 4.34:1 (on header); the focus ring `--gh-brand` is ≥ 6.69:1 on every
background. `--gh-border` (2.05:1 on page, 1.76:1 on surface) and the card fill (1.16:1 on page) are decorative only,
so **every tappable card (`.gh-match`, `.gh-tile`, `.gh-jump__btn`) draws its edge in `--gh-control`**; plain
containers (`.gh-card`, `.gh-banner`, groups) keep `--gh-border`.

Type scale (Manrope; one scale for all directions; **12 px is the floor for any text**):
12 caption/badges · 13 meta & notes · 14 secondary labels · 15 body & rows · 16 inputs & card titles · 17 sheet/app-bar
titles & item titles · 20 page h1 · 22 E page titles & hero names · 28 score & hero probability. Weights 400/600/700/800.
Line height 1.45 body, 1.25 headings. Radius **0** everywhere; only crests, avatars and W/D/L letters are circles.

### 2.3 Accessibility rules

- Every tappable element is ≥ 44 px tall (rows, chips, tabs, segments, pager slots, icon buttons, dock slots).
- Text contrast ≥ 4.5:1 (all token pairs pass); interactive boundaries use `--gh-control`.
- Real elements only: `<a href="#">` for navigation, `<button type="button">` for actions, `<input>`/`<select>` with a
  visible `<label>` (or `aria-label` with an existing string when the design has no visible label), `aria-current`
  on current tab/page, `aria-pressed` on toggle chips/segments, `aria-expanded` on disclosures.
- Icon-only buttons carry `aria-label` with the existing string (e.g. "Back to matches", "Search matches",
  "Switch to light theme", "Close filters", "Previous day", "Next day", "Collapse Head to Head").
- Icons: **inline stroke SVG only** from the icon sheet (§2.6), `aria-hidden="true"`. The `external` icon marks only
  links that leave Goal Hint (publisher links, "Read the original report"); links to another Match details page
  ("Open this match's page", Match Context "Next" rows) use `arrow-right`. **No emoji, no icon fonts, no
  images.** Crests are initials discs (the app's own fallback), flags are the neutral `.gh-flag` swatch next to the
  3-letter code (World uses the globe icon), competition logos are the trophy glyph in `.gh-complogo`.
- No information only in a tooltip: time zone, odds explanation, league country, probability help and no-pick
  reasons are printed.
- Outcome and status always icon + text; market family always code or name + hue, never hue alone.
- Feed cards are one `<a class="gh-match">` **without** `aria-label` (an `aria-label` would hide the score, pick and
  outcome from screen readers): the first child is `<span class="gh-sr">View analysis for {home} v {away}.</span>`
  and the visible content follows. Market rows, the top pick and stat bars keep the app's existing `aria-label`
  contracts quoted in this file.
- Inputs are 16 px text. Focus: `kit.css` §17 ships `:focus-visible` rings (3 px `--gh-brand`, 2 px offset; inset on
  full-bleed rows; framed fields ring the frame; hidden checkboxes ring their row; `--gh-text` ring on brand-filled
  controls). Artboards do not need a focused state; if one is shown, put `.gh-focus` on that single element.

### 2.4 Content and scope rules

- Use **exact `src/i18n/messages/en.ts` strings** (quoted in this file). Composed strings only join existing strings
  with " · ", " – " or ":" (e.g. "294 matches · Highest chance", "Last 5 · All venues").
- Sample data = §2.7 only. Realistic values only for fields that exist.
- **Out of scope everywhere:** odds values, bookmaker names/links, odds movement, value or confidence ratings,
  notifications/bell, profile/accounts, "My Picks", a "Leagues" tab, favourites, share buttons, live count preview
  ("Show N matches"), player stats/photos/ratings, managers, return dates, venue/weather/standings values, referee
  names, markets beyond the four families. Disabled features stay visible and explained: "Odds unavailable" +
  "Odds filtering starts once bookmaker odds are imported."; odds cells show "—" with "Bookmaker odds are not imported
  yet." where a panel has room; "Bookmaker quote source" = "Not available".
- Must-keep notes appear where specified: `details.disclaimer` (overview end), `details.oddsFooter` +
  `details.probabilityNotOdds` (once per markets list), `detail.probabilityDisclosure` (market panel),
  `details.regulationNote` (record panel), basis notes per section, footer "Estimated probabilities, not guarantees.
  No betting advice."
- Missing predictions show "—" (never 0 %). Probabilities use "<1%"/">99%" at the boundaries.
- Picks: team-named labels from `details.pick.*` ("RB Bragantino win", "RB Bragantino or draw", "Under 2.5", "Yes")
  everywhere, except direction D's feed table which shows codes (`market.pick.*`: "1", "X") under a column header.
- Market names: full `details.market.*` names in visible text wherever a market is opened ("Match result (1X2)",
  "Double chance", "Over/Under 2.5 goals", "Both teams to score"); codes (`market.code.*`) only as the small hue chip.

### 2.5 Shared chrome (identical in all five directions)

- **Tab bar** `.gh-tabbar` (nav `aria-label="App sections"`), 56 px, `--gh-header` fill, 1 px `--gh-border` top
  rule, five equal slots: "Matches" (home icon), "Live" (live), "Results" (results), "Slip builder" (slip), "More"
  (more). Icon 22 px above a 12 px/600 label; current slot `--gh-brand` with a 3 px top indicator and 700 label
  (`aria-current="page"`). On every Match details screen the current slot is the origin tab: **"Matches"**.
- **More popover** `.gh-popover.gh-more-menu` (native `<details>` in the app): 240 px wide, right-aligned 8 px from the
  edge, 8 px above the tab bar (E: above the dock), `--gh-surface` with 1 px `--gh-control` border; four 48 px rows
  with icon + label: "Help", "Privacy", "Terms", "Contact". The "More" slot shows as current/expanded while open.
- **Top-bar search row** (details, D3 artboards) `.gh-searchrow`: 60 px row directly under the top bar, `--gh-surface`
  fill, search field (placeholder "Search teams, leagues…", aria "Search matches") + primary button "Search"; the
  search icon in the bar becomes a close icon with `aria-label="Close search"`, `aria-expanded="true"`.
- **Status badge** `.gh-badge` (one component on cards, banner and lists): scheduled "Upcoming" (neutral); finished
  "Ended" with sub-label "FT"/"AET"/"Pens" (neutral); live minute "67′"/"90+3′"/"HT"/"–" (`--live`); "Postponed"
  (`--warn`, amber); "Canceled"/"Abandoned" (`--incorrect`). Fact rows use the long words ("Finished").
- **Outcome badge** `.gh-badge--correct/--incorrect/--pending/--void` with icon (check / cross / clock / void):
  feed vocabulary "Win", "Loss", "Pending", "Void"; details vocabulary "Correct", "Incorrect", "Pending", "Void".
- **Market identity**: hue (§2.2) + icon (1X2 result-target, DC shield, O/U goals, BTTS two circles) + code chip
  `.gh-code` ("1X2", "DC", "O/U 2.5", "BTTS"). The Top pick uses its family hue (never orange by default).
- **Crest** `.gh-crest` initials disc: "RB" (RB Bragantino), "CR" (Cruzeiro), etc. Sizes 20 / 28 / 40 / 48.
- **Form letters** `.gh-form` 20 px solid circles with `--gh-on-brand` letters: W `--gh-correct`, D `--gh-void`, L
  `--gh-incorrect`, `role="img"` with
  "Last five results for {team}, oldest first: Win, Loss, …".
- **Pitch** `.gh-pitch`: stripes `--gh-pitch-1/-2`, 28 px white badges with `--gh-on-brand` numbers (13/800), white
  12/600 surnames (≥ 7:1), forwards at the top. Each badge + name is a 44 px button "Open player details: {player}".
- **Footer** `.gh-footer` (only drawn when a viewport reaches it): "© 2026 Goal Hint", links "Help" · "Privacy" ·
  "Terms" · "Contact", note "Estimated probabilities, not guarantees. No betting advice."

### 2.6 Icon sheet (24 × 24, `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`)

Use `<svg class="gh-ico" viewBox="0 0 24 24" aria-hidden="true">…</svg>` (kit sets fill/stroke), or put the sheet once
per page as a hidden sprite (`<symbol id="i-search" viewBox="0 0 24 24">…</symbol>`, exactly as in `kit-preview.html`)
and reference it with `<svg class="gh-ico" aria-hidden="true"><use href="#i-search"/></svg>`. Paths are the app's own.
The star is the only filled icon (`gh-ico--fill`).

| name | inner SVG |
| --- | --- |
| search | `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>` |
| close | `<path d="M6 6l12 12M18 6 6 18"/>` |
| chev-down | `<path d="m6 9 6 6 6-6"/>` |
| chev-up | `<path d="m6 15 6-6 6 6"/>` |
| chev-left | `<path d="m15 6-6 6 6 6"/>` |
| chev-right | `<path d="m9 6 6 6-6 6"/>` |
| arrow-right | `<path d="M5 12h14M13 6l6 6-6 6"/>` |
| external | `<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>` |
| filter | `<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5Z"/>` |
| reset | `<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>` |
| sun | `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>` |
| home | `<path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4v-8.5Z"/>` |
| live | `<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14"/>` |
| results | `<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.75 2.75L16.5 9.5"/>` |
| slip | `<path d="M5 3h14v18H5zM8 8h.01M11 8h5M8 12h.01M11 12h5M8 16h.01M11 16h5"/>` |
| more | `<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>` |
| help | `<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16.5h.01"/>` |
| shield | `<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>` |
| document | `<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h8"/>` |
| mail | `<rect x="3" y="5" width="18" height="14"/><path d="m3 6 9 7 9-7"/>` |
| calendar | `<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>` |
| clock | `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>` |
| trophy | `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 6h2.5a1.5 1.5 0 0 1 1.5 1.5V8a4 4 0 0 1-4 4M7 6H4.5A1.5 1.5 0 0 0 3 7.5V8a4 4 0 0 0 4 4"/>` |
| globe | `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z"/>` |
| check | `<path d="m5 12.5 4.5 4.5L19 7.5"/>` |
| cross | `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>` |
| void | `<circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/>` |
| notice | `<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>` |
| star | `<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3Z"/>` |
| m-1x2 | `<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>` |
| m-dc | `<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>` |
| m-ou | `<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3Z"/>` |
| m-btts | `<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M11 12h2"/>` |
| s-markets | `<path d="M5 20v-6M10 20V9M15 20v-8M20 20V4"/>` |
| s-stats | `<path d="M4 7h7M4 12h11M4 17h5M13 7h7M17 12h3M11 17h9"/>` |
| s-h2h | `<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0"/>` |
| s-form | `<path d="M3 17l5-5 4 3 6-7 3 3"/><path d="M18 8h3v3"/>` |
| s-lineups | `<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/><circle cx="12" cy="12" r="2.5"/><path d="M3 9h3v6H3M21 9h-3v6h3"/>` |
| s-players | `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>` |
| s-news | `<path d="M5 4h11v16H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z"/><path d="M16 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0M8 8h5M8 12h5M8 16h3"/>` |
| s-injuries | `<path d="M12 5v14M5 12h14"/>` |
| s-context | `<path d="M3 10c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4v-6Z"/><path d="M3 10c0 2 4 4 9 4s9-2 9-4"/>` |
| s-referee | `<path d="M3 10h9l4-3h5v4l-3 2v2a5 5 0 1 1-10 0v-1H3z"/><circle cx="13" cy="15" r="1"/>` |
| s-history | `<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>` |
| logo-mark | `<circle cx="12" cy="12" r="9"/><path d="M16.5 9.5A5 5 0 1 0 17 13h-5"/>` (teal, used in `.gh-logo`) |

### 2.7 Canonical sample data (use verbatim; nothing else)

**Feed – Today, Tue, Oct 13 2026, Matches tab.** Applied: defaults (markets "Match result", all leagues, any country),
order "Highest chance". Count "294 matches". Pagination "‹ 1 2 3 4 … 10 ›" (10 pages).

| # | When | Status badge | League | Teams / score | Pick (1X2) |
| --- | --- | --- | --- | --- | --- |
| 1 | Tue, Oct 13 · 03:00 EAT | Ended · FT | flag BRA · "Serie A" | RB Bragantino 4 – 2 Cruzeiro | "RB Bragantino win" (code pick "1") · 56% · Win |
| 2 | Tue, Oct 13 · 14:30 EAT | Ended · FT | THA · "Thai League 2" | Kanchanaburi 1 – 0 Police Tero | "Kanchanaburi win" ("1") · 45% · Win |
| 3 | Tue, Oct 13 · 15:00 EAT | live "–" | LBN · "Premier League" | Tripoli SC 2 – 0 Al Akhaa Al Ahli (live red) | "Tripoli SC win" ("1") · 45% · Pending |
| 4 | Tue, Oct 13 · 15:00 EAT | Ended · FT | KVX · "Superliga" | Ballkani 0 – 1 Drita | "Ballkani win" ("1") · 45% · Loss |
| 5 | Tue, Oct 13 · 15:30 EAT | live "90+3′" | IRN · "Persian Gulf Pro League" | ZOB Ahan 1 – 2 Sepahan FC | "Draw" ("X") · 45% · Pending |
| 6 | Tue, Oct 13 · 16:00 EAT | live "67′" | globe INT · "Olympics Women - Qualification CAF" | Zimbabwe W 0 – 4 Malawi W | "Draw" ("X") · 45% · Pending |
| 7 | Tue, Oct 13 | Postponed | PAN · "Liga Panameña de Fútbol" | Sporting San Miguelito VS Tauro FC | — · "Not predicted" |
| 8 | Wed, Oct 14 · 01:30 EAT | Upcoming | BRA · "Serie B" | Athletic Club VS Londrina | — · "Not predicted" |

- **Live tab (F3):** h1 "Live Matches", count "3 matches", cards 3, 5, 6 (kickoff order: 3, 5, 6).
- **Results tab (F4):** h1 "Results", date "Mon, Oct 12", state "Fixture data unavailable" / "Fixture coverage is
  incomplete or unavailable. Try again later." (the state observed locally). No cards.
- **Empty Live (F5):** h1 "Live Matches", count "0 matches", no filters applied → do not show "No matches for these
  filters"; show the empty block with the count and a secondary button "Today" (goes to the Matches tab).

**Filters – draft (S1):** search "united"; Date range From 13/10/2026 To 15/10/2026 ("Tue, Oct 13 – Thu, Oct 15");
Time range From 12:00 To 20:00, zone printed "Africa/Kampala"; Markets "2 selected" (Match result ✓, Total goals (2.5) ✓,
Double chance ☐, Both teams to score ☐); Leagues "All leagues"; Countries "2 selected" (England ✓, Scotland ✓);
Probability Min 50 Max 100 "%"; Order "Highest chance"; "Odds unavailable". Badge/count "5" ("Filters, 5 active").
**Invalid (S2):** From date 15/10/2026, To date 13/10/2026 → "Choose a range of up to 31 days, with the end on or after
the start." Apply blocked; the reason is repeated next to Apply. **Applied (S3):** applied chips "Markets: 2 selected",
"Countries: 2 selected", "12:00–20:00", "50% - 100%", "Search: united"; date "Tue, Oct 13 – Thu, Oct 15"; count
"0 matches"; empty state "No matches for these filters" / "Nothing matches these filters in the available data." with
an inline "Clear" button.

**Picker:** Leagues (P1) – trigger "Leagues: 2 selected"; selected: "Olympics Women - Qualification CAF" (World, 13),
"Ligue 2" (Algeria, 12); list in order: "Challenge Cup" (Scotland, 20), "World Cup - Women - Qualification Europe"
(World, 16), "Friendlies Women" (World, 14), "Olympics Women - Qualification CAF" ✓ (World, 13), "Ligue 2" ✓ (Algeria,
12), "National League Cup" (England, 12), "Non League Premier - Northern" (England, 11). Countries list (if needed):
World 75 (globe), England 64, Scotland 21, Algeria 15, Germany 14, Brazil 11, Portugal 8, Argentina 7. Markets (P2):
"Match result" ✓ only; after trying to untick it: "Keep at least one market selected."

**Match: RB Bragantino v Cruzeiro** (all detail-family screens use this fixture).
- Banner: competition "Serie A" (trophy glyph), "Regular Season - 30 · Brazil"; kickoff "Tue, Oct 13" "03:00 EAT";
  RB Bragantino (crest "RB", form oldest first W L W D W) **4 – 2** Cruzeiro (crest "CR", form W L D D W); status
  badge "Ended" · "FT". Context fact Status = "Finished". Prediction source "AI prediction".
- Top pick: "Double chance – RB Bragantino or draw", **79%**, "Estimated probability", "Odds: — · AI prediction",
  outcome "Correct". Accessible name "Open top pick: Double chance, RB Bragantino or draw, estimated probability 79%".
- Markets "4 of 4 published":

  | Market (`details.market.*`) | Code | Our prediction | Prob. | Odds | Outcome | All outcomes |
  | --- | --- | --- | --- | --- | --- | --- |
  | Match result (1X2) | 1X2 | RB Bragantino win | 56% | — | Correct | RB Bragantino win 56% · Draw 23% · Cruzeiro win 21% |
  | Double chance (Top pick) | DC | RB Bragantino or draw | 79% | — | Correct | RB Bragantino or draw 79% · Cruzeiro or draw 44% · RB Bragantino or Cruzeiro 77% |
  | Over/Under 2.5 goals | O/U 2.5 | Under 2.5 | 52% | — | Incorrect | Under 2.5 52% · Over 2.5 48% |
  | Both teams to score | BTTS | Yes | 63% | — | Correct | Yes 63% · No 37% |

  Source and timing (all four): Prediction source "AI prediction"; Published "Oct 12, 2026, 09:12 EAT"; Evidence
  cutoff "Oct 12, 2026, 08:55 EAT"; Source retrieved "Oct 12, 2026, 08:41 EAT"; Source last updated "Unknown";
  Bookmaker quote source "Not available". Explanation: note "Generated explanation for this revision, with its
  permitted sources linked." then 1. "RB Bragantino have lost one of their last ten stored home league results." [ge]
  2. "Cruzeiro scored in each of their last five stored away results." [ESPN Brasil] · **Key uncertainty:** "Team news
  after the evidence cutoff could change the starting line-ups." [Lance!] (publisher links with the external icon).
- **Team Comparison** (Last 5 · All venues): Win probability 56% | 21%. Points per game 2.0 | 1.6 · Goals scored per
  game 1.8 | 1.4 · Goals conceded per game 0.8 | 1.0 · Win rate 60% | 40% · Clean sheets 40% | 20% · Both teams scored
  60% | 60% · Over 2.5 goals 40% | 20% · Failed to score 0% | 20%. Note "Home: 5 results. Away: 5 results. Averages per
  match and rates over each team's own stored, verified regulation-time results." Overview preview uses "Last 10" and
  "Home: 10 results. Away: 10 results." Evidence: "corners (count)" → "RB Bragantino: 5.8 (5 matches) · Cruzeiro: 4.6 (5
  matches)"; "possession (percent)" → "RB Bragantino: 54.2 (5 matches) · Cruzeiro: 51.8 (5 matches)"; "shots-on-goal
  (count)" → "RB Bragantino: 5.4 (5 matches) · Cruzeiro: 4.4 (4 matches)". Metric item "Points per game": RB
  Bragantino · 2.0 → "Thu, Oct 8" "RB Bragantino 2–0 Fortaleza" 3 · "Sun, Oct 4" "Grêmio 1–1 RB Bragantino" 1 · "Sun,
  Sep 27" "RB Bragantino 3–1 Vitória" 3 · "Sun, Sep 20" "Palmeiras 2–1 RB Bragantino" 0 · "Sun, Sep 13" "RB Bragantino
  2–0 Juventude" 3. Cruzeiro · 1.6 → "Wed, Oct 7" "Cruzeiro 2–0 Internacional" 3 · "Sat, Oct 3" "Bahia 1–1 Cruzeiro" 1
  · "Sat, Sep 26" "Cruzeiro 1–1 Botafogo" 1 · "Sat, Sep 19" "Flamengo 2–0 Cruzeiro" 0 · "Sat, Sep 12" "Cruzeiro 3–1
  Santos" 3. Help note "Average per match over the listed results; each row shows that match's value."
- **Head to Head** (meta "7 meetings"): Meetings 7 · RB Bragantino wins 3 · Draws 2 · Cruzeiro wins 2 · Average goals
  2.3 · Both teams scored 57% · Over 2.5 goals 43%. Venue chips "All venues", "At RB Bragantino", "At Cruzeiro"
  (Competition filter hidden: one competition). Meetings (newest first; letter from RB Bragantino's view):
  "May 17, 2026" Cruzeiro 1–2 RB Bragantino W · "Oct 26, 2025" RB Bragantino 2–2 Cruzeiro D · "Jun 1, 2025" Cruzeiro
  2–0 RB Bragantino L · "Nov 10, 2024" RB Bragantino 1–0 Cruzeiro W · "Jul 7, 2024" Cruzeiro 1–1 RB Bragantino D · "Sep
  17, 2023" RB Bragantino 2–1 Cruzeiro W · "May 6, 2023" Cruzeiro 1–0 RB Bragantino L. No pager (one page). Preview
  "Last 5 meetings" letters oldest first D W L D W. Record panel: "Cruzeiro v RB Bragantino" · Date "May 17, 2026,
  22:00 EAT" · Competition "Serie A" · Score "Cruzeiro 1 – 2 RB Bragantino" · Status "Finished" · regulation note ·
  "Open this match's page".
- **Team Form** (Both teams · Last 5 · All venues): RB Bragantino "3W 1D 1L · Goals 9:4 · 5 results": Thu, Oct 8 · H ·
  Fortaleza · 2–0 · W | Sun, Oct 4 · A · Grêmio · 1–1 · D | Sun, Sep 27 · H · Vitória · 3–1 · W | Sun, Sep 20 · A ·
  Palmeiras · 2–1 · L | Sun, Sep 13 · H · Juventude · 2–0 · W. Cruzeiro "2W 2D 1L · Goals 7:5 · 5 results": Wed, Oct 7
  · H · Internacional · 2–0 · W | Sat, Oct 3 · A · Bahia · 1–1 · D | Sat, Sep 26 · H · Botafogo · 1–1 · D | Sat, Sep 19
  · A · Flamengo · 2–0 · L | Sat, Sep 12 · H · Santos · 3–1 · W. Preview lines "Goals 9 · Conceded 4", "Goals 7 ·
  Conceded 5". Legend "H Played at home · A Played away".
- **Lineups** (meta "Confirmed"), note "Confirmed lineup · updated Oct 13, 2026, 02:02 EAT".
  RB Bragantino · 4-3-3 — pitch rows top→bottom: 11 Vinicinho · 9 Pitta · 77 Laquintana / 8 Evangelista · 5 Gabriel ·
  10 Jhon / 29 Capixaba · 13 Santos · 3 Henrique · 34 Hurtado / 1 Cleiton. Starting XI: 1 Cleiton G · 34 A. Hurtado D ·
  3 Pedro Henrique D · 13 Eduardo Santos D · 29 Juninho Capixaba D · 5 Gabriel M · 8 L. Evangelista M · 10 Jhon Jhon M
  · 77 Laquintana F · 9 I. Pitta F · 11 Vinicinho F. Substitutes: 40 Lucão G · 2 Nathan Mendes D · 35 M. Fernandes M ·
  7 E. Ramires M · 20 Gustavinho M · 19 Eduardo Sasha F · 99 T. Borbas F.
  Cruzeiro · 4-2-3-1 — Starting XI: 1 Cássio G · 12 William D · 15 Fabrício Bruno D · 25 Jonathan Jesus D · 6 Kaiki D ·
  29 L. Romero M · 88 Christian M · 11 Wanderson F · 10 M. Pereira M · 7 Dudu F · 19 Kaio Jorge F. Substitutes: 31 Léo
  Aragão G · 23 Fagner D · 16 Lucas Silva M · 5 Walace M · 20 Eduardo M · 9 Gabigol F.
  Note "Managers are not included in the stored lineup data." (once per team).
- **Players** (meta "38 players", 15 per page → "‹ 1 2 3 ›"): order = RB starters, RB subs, Cruzeiro starters,
  Cruzeiro subs, then injury-only players. Row meta "{Team} · {position} · #{number}", e.g. "RB Bragantino · G · #1";
  pill "Starter" / "Substitute", injury pill wins ("Walace" shows "Doubtful"). Injury-only rows: "H. Mosquera" "RB
  Bragantino" Out · "Fernando" "RB Bragantino" Status unclear · "L. Villalba" "Cruzeiro" Out. Page 1 = Cleiton, A.
  Hurtado, Pedro Henrique, Eduardo Santos, Juninho Capixaba, Gabriel, L. Evangelista, Jhon Jhon, Laquintana, I. Pitta,
  Vinicinho, Lucão (Substitute), Nathan Mendes (Substitute), M. Fernandes (Substitute), E. Ramires (Substitute).
  Overview preview = first three rows.
- **Injuries & Suspensions** (meta "4 absences"): "H. Mosquera" · "RB Bragantino · Missing Fixture · Ankle Injury" ·
  Out | "Fernando" · "RB Bragantino · Suspended" · Status unclear | "L. Villalba" · "Cruzeiro · Missing Fixture · Knee
  Injury" · Out | "Walace" · "Cruzeiro · Questionable · Muscle Injury" · Doubtful. Every row reported "API-Football ·
  Oct 12, 2026, 09:30 EAT". Basis note `details.injuryBasis`.
- **Player panel (Q1) = Walace:** Team "Cruzeiro" · Shirt number "5" · Position "M" · Lineup role "Substitute" ·
  Availability [Doubtful] "Questionable · Muscle Injury" · Reported "API-Football · Oct 12, 2026, 09:30 EAT" · Expected
  return "Not provided by the source" · note `details.playerStatsMissing`. Neighbours in the Players list: previous
  "Lucas Silva", next "Eduardo".
- **News & Insights** (meta "6 items"): 1 Report "Bragantino expect Pitta to lead the line against Cruzeiro" · "ge ·
  Oct 12, 2026, 07:30 EAT" | 2 Report "Cruzeiro travel without Villalba after knee injury" · "Lance! · Oct 11, 2026,
  22:40 EAT" | 3 Report "Cruzeiro name full squad for Bragantino trip" · "ESPN Brasil · Oct 11, 2026, 15:10 EAT" | 4
  Analysis "RB Bragantino have lost one of their last ten stored home league results." · "Goal Hint analysis · Oct 12,
  2026, 09:12 EAT" | 5 Analysis "Cruzeiro scored in each of their last five stored away results." · same | 6 Analysis
  "Team news after the evidence cutoff could change the starting line-ups." · same. Item N2 = report 2: Publisher
  "Lance!", Source published "Oct 11, 2026, 22:40 EAT", Source retrieved "Oct 12, 2026, 08:41 EAT", bullets "Lucas
  Villalba is reported out with a knee injury." / "Walace is listed as doubtful with a muscle injury.", note
  `details.reportNote`, action "Read the original report". Notes `details.newsBasis` (no "Limited news coverage").
- **Match Context:** Competition (trophy) "Serie A" · Country "Brazil" · Round "Regular Season - 30" · Kickoff "Oct 13,
  2026, 03:00 EAT" · Status "Finished" · "Rest before kickoff (RB Bragantino)" "5.1 days" · "Rest before kickoff
  (Cruzeiro)" "5.9 days" · restBasis note · Surrounding fixtures: RB Bragantino — Last "RB Bragantino 2–0 Fortaleza"
  "Thu, Oct 8"; Next "RB Bragantino – São Paulo" "Sun, Oct 18". Cruzeiro — Last "Cruzeiro 2–0 Internacional" "Wed,
  Oct 7"; Next "Cruzeiro – Corinthians" "Sat, Oct 17". Venue / Weather / Standings "Not available" + contextMissing.
- **Referee:** Referee "Not available" · Officiating statistics "Not available" · `details.refereeMissing`.
- **Prediction History** (meta "3 revisions", preview "Latest revision published Oct 12, 2026, 09:12 EAT"):
  Publication 3 · "Locked prediction" · "Daily run date (EAT): Monday, October 12, 2026" · "Cycle 1 · Revision 3 within
  this cycle" · "AI prediction" · "Published: Oct 12, 2026, 09:12 EAT" | Publication 2 · "Superseded publication" ·
  "Sunday, October 11, 2026" · "Cycle 1 · Revision 2 within this cycle" · "AI prediction · API-Football fallback" ·
  "Published: Oct 11, 2026, 09:05 EAT" | Publication 1 · "Superseded publication" · "Saturday, October 10, 2026" ·
  "Cycle 1 · Revision 1 within this cycle" · "API-Football fallback" · "Published: Oct 10, 2026, 09:20 EAT". Schedule
  cycles: "Cycle 1 · Closed" → "Kickoff: Oct 13, 2026, 03:00 EAT", "Publication cutoff: Oct 13, 2026, 02:55 EAT",
  "Cycle opened: Oct 6, 2026, 03:00 EAT", "Cycle closed: Oct 13, 2026, 02:55 EAT", "Prediction locked: Oct 13, 2026,
  02:55 EAT", link "Inspect this cycle’s retained prediction". Notes: `history.readOnly`, `history.order`,
  `history.readClock`, "Stored data observed: Oct 13, 2026, 18:45 EAT". No older pages (no "Older publications").
- **Snapshot (selected Publication 2, historical):** "Historical prediction snapshot"; "Publication 2"; status
  "Historical publication"; "Revision 2 within this cycle"; "Published: Oct 11, 2026, 09:05 EAT"; snapshotDisclosure
  note; cycle summary "Cycle 1 · Closed". Markets (live names and team-named picks, for uniformity):
  Match result (1X2) — RB Bragantino win · 52% · noSettlement note · "AI prediction" · Published Oct 11, 2026, 09:05 EAT
  · Alternative selections: Draw 25%, Cruzeiro win 23% · Source attribution and timing: Source generated "Oct 11, 2026,
  08:58 EAT", Source retrieved "Oct 11, 2026, 08:40 EAT", Source last updated "Unknown", publisher "ge".
  Double chance — RB Bragantino or draw · 77% · alternatives Cruzeiro or draw 48%, RB Bragantino or Cruzeiro 75% +
  overlap note. Over/Under 2.5 goals — Under 2.5 · 55% · "API-Football fallback" · "Provisional estimate" · "API-Football
  statistical fallback was used after the AI request timed out." · alternative Over 2.5 45%. Both teams to score —
  "Unavailable for this market" · "This revision has insufficient validated data for this market."
  Prediction analysis — `detail.analysisBasis`; the two reasons above with [ge] and [ESPN Brasil]; Key uncertainty with
  [Lance!]; "Evidence cutoff: Oct 11, 2026, 08:30 EAT", "Prediction generation completed: Oct 11, 2026, 09:01 EAT",
  "Published: Oct 11, 2026, 09:05 EAT"; probabilityDisclosure. Disclosure "Sources and evidence times" (closed).
- **Unavailable (D4):** h1 "Match temporarily unavailable"; "The stored match could not be loaded."; "Try again
  shortly. This page reads stored data; opening it does not generate a prediction."; button "Try again".

---

## 3. Shared behaviour rules (all directions)

- Applying filters, clearing or changing order resets to page 1 and returns to the list top.
- The draft only exists inside the open filter surface; closing that surface (✕ "Close filters", Escape, drag-down,
  Back) cancels the draft. Directions A, B, C, E put **"Order"** inside the draft (one commit model). Direction D keeps
  "Sort by" as an immediate select, which is safe because D's draft lives only inside its modal panel.
- Removable applied chips are links (`<a>`, name "Remove {label}") that work without JavaScript (desktop
  `FilterChip`). Default values ("Match result", "All leagues", "Any country") never appear as chips.
- "Back to matches" returns to the stored feed URL (`history.back()` when it is the previous entry). Header search on
  details builds its GET from the stored feed URL, so dates and filters survive.
- Section/item/market opening keeps the URL contract (push to open/close, replace for filters/pages); history links
  always carry `section=history`; focus returns to the control that opened a panel or layer.

---

## 4. Direction A · Refined Accordion

**Concept.** Keep today's structure and URLs exactly: the feed is one list with an in-place filter panel, and Match
details is one scrolling page whose cards open in place. The refinement removes the frictions without a new
navigation model: a sticky search + Filters toolbar, a date stepper, removable chips, the Slip builder's criteria
accordion for filters, one column of full-width cards (no two-up grid, so nothing reflows), one labelled toggle per
card, and a sticky open-card header that always shows where you are and how to close. Lowest build risk.

**Grafted from:** flow A (sticky toolbar, removable chips, single column, sticky open header, pinned back rows,
origin tab), a11y D (CriteriaAccordion filters, full-width "View …" button, label-above-value facts), system C (in-flow
native-details pickers, "Other prediction markets" switching). The snapshot uses A's standard item panel (reviewer
change: an inline "under its row" snapshot was a second item pattern).

**Navigation model.**
- Feed: top bar + toolbar (search, "Filters") are sticky. "Filters" (`aria-expanded`, name "Filters, 5 active")
  expands the filter panel in place directly under the toolbar. The panel is a criteria accordion: 52 px summary rows
  "Date range", "Time range", "Markets", "Leagues", "Countries", "Probability", "Order" with the draft value; one
  criterion open at a time; pickers expand inline. While the panel is open its footer "Clear | Apply" sticks to the
  bottom of the viewport above the tab bar. Apply/Clear collapse the panel and return to the list top. Day change = 1
  tap on the date stepper under the page title. Applied filters show as removable chips under the stepper.
- Details: sticky top bar ("Back to matches", "Match details", search, theme). Cards stack in one column in today's
  order. A card's header (or its "View …" foot button) opens it in place (`?section=`, push). While open, the card
  header sticks under the top bar with a 44 px "Collapse {section}" button. An item replaces the list in place
  (`&item=`, push) and the sticky header becomes a back row "‹ Back to list" + item title + Collapse. The market panel
  opens inside the All Markets & Odds card with a sticky "‹ Back to all markets" row; "Other prediction markets" at its
  end switches family in one tap. Browser Back steps through the same entries.

**Component specs (A).**

| Component | Spec |
| --- | --- |
| Top bar `.gh-topbar` | 52 px, `--gh-header`, 2 px `--gh-brand` bottom edge, 4 px side padding. Feed: `.gh-logo` link ("Goal Hint home", 22 px mark + 20/800 wordmark) left, theme `.gh-icon-btn` right. Details: back · centred title 17/700 "Match details" · search · theme. Icon buttons 44 × 44, icon 22. Sticky. |
| Toolbar `.gh-toolbar` | 60 px sticky row under the top bar, `--gh-page`, 1 px `--gh-border` bottom, 8 px padding 16 px sides: `.gh-search` (flex 1, 44 px) + 8 px + Filters `.gh-btn--secondary` (filter icon + "Filters" + 20 px `.gh-count` badge when active; filled `--gh-brand` when expanded). |
| Page title | `.gh-h1` 20/800 + `.gh-count` 14 muted "294 matches · Highest chance", padding 16 16 8. |
| Date stepper `.gh-stepper` | 44 px row, 16 px gutters, 8 px gaps: prev `.gh-icon-btn--boxed` ("Previous day"), centre `.gh-btn--secondary` flex 1 (calendar icon + "Tue, Oct 13" 15/700; opens the panel at Date range), next ("Next day"). |
| Chips `.gh-chip` | 44 px, padding 0 14, 14/600. Removable chip `.gh-chip--remove`: `--gh-brand-soft` fill, 1 px `--gh-brand`, text `--gh-brand`, trailing close icon 16. Choice chip `.gh-chip` + `aria-pressed="true"` → brand-soft + check icon 16. Groups `.gh-chips` wrap with 8 px gaps under a visible `.gh-group-label` 13/600 muted. |
| Feed card `.gh-match` (A) | `.gh-card`, padding 12, 8 px between cards, 4 rows: (1) "Tue, Oct 13" 13 muted + "03:00" 13/700 + "EAT" 13 muted · status badge right; (2) flag + code 13 muted · league 13 + trophy 16 right; (3) home name 14/700 right-aligned + crest 24 · score 17/800 (or "VS" 13/700 muted) · crest 24 + away name; (4) pick strip, 1 px top rule, 10 px padding-top: `.gh-code` hue chip + pick 14/600 (ellipsis) · probability 17/800 right · outcome badge. No-pick: "—" + reason 14 muted ("Not predicted"), probability "—". ~140 px tall. |
| Filter panel `.gh-criteria` | Bordered block (1 px `--gh-control`), rows 52 px: title 15/700 left, draft value 13 muted right + chevron-down; changed value gets an 8 px `.gh-dot`; invalid → `.gh-dot--error` + red text. Open row: chevron-up, body on `--gh-surface-2`, 16 px padding. Odds row non-interactive muted with the explanation printed. Footer `.gh-footbar` 72 px: "Clear" secondary (flex 1) + "Apply" primary (flex 2, `aria-label="Apply filters"`); a blocking error is printed above the buttons (13, `--gh-incorrect`, role=alert). |
| Checklist `.gh-check-row` | 48 px: 22 px square check (checked = `--gh-brand` fill, dark check), optional flag/trophy 20, name 15 + country 13 muted on a second line, count 13 muted right. Inline list max 6 rows tall with a visible scrollbar. |
| Section card `.gh-card` + `.gh-section-head` | Header button 56 px: `.gh-ibadge` 28 (accent soft fill, accent icon 18) · title 16/700 · meta 13 muted (always visible) · chevron-down 20. Preview ≤ 3 rows, 12 px padding. Foot: "View …" `.gh-btn--ghost` full width 44 px, 14/700 `--gh-brand` + arrow-right. Open card: 4 px accent left edge, header becomes `.gh-section-head--sticky` (pinned under the top bar, `--gh-surface`, bottom rule) with a 44 px Collapse icon button (chev-up, "Collapse {section}"); "Collapse {section}" also as a ghost button at the card end. |
| Market row `.gh-mrow` | 64 px button, used by every direction: `.gh-ibadge` 28 in the family hue · row 1 full name 15/600 (featured family: hue star after the name, accessible text "Top pick") with the outcome badge at the right · row 2 (full width) pick `.gh-pill` · probability 15/800 · "Odds —" 13 muted · chevron. Name "Open {market} details: {pick}, estimated probability {probability}". |
| Back row `.gh-backrow` | One template for every item **and** for the market panel: ≥ 52 px sticky row replacing the open header: back `.gh-btn--ghost` (chev-left + "Back to list"; market panel "Back to all markets") · the item title as the item's `<h4 class="gh-backrow__title">` 15/700, **wraps, never truncated** (a long news title takes 2–3 lines) · 44 px Collapse icon button ("Collapse {section}"; market panel "Collapse All Markets & Odds"). The body never repeats the title; it starts with the item's pill / identity line or its facts. At both levels the card ends with the ghost "Collapse {section}". |
| Rows `.gh-row` | min 52 px (64 when two-line), padding 8 16, title 15/600, sub 13 muted, trailing value/badge + chevron 20; 1 px `--gh-border` dividers. |
| Facts `.gh-kv.gh-kv--stack` | label 13/600 muted above value 15; 12 px between pairs; groups of 2 may sit in a 2-column grid. |
| Stat bar `.gh-stat-bar` | 56 px button row: values 17/800 at both edges, label 13 centred, mirrored 6 px bars (home `--acc` orange, away blue) + chevron; name "Open match-by-match breakdown: Points per game, RB Bragantino 2.0, Cruzeiro 1.6". |
| Pager `.gh-pager` | 44 × 44 slots, current `--gh-brand` fill with `--gh-on-brand` text, arrows "Previous page"/"Next page", gap "…". |
| Notes `.gh-note` | 13/1.5 muted; alerts `.gh-note--alert`. |

**Per-screen layout (A).**

- **feed** — F1: 0–52 top bar (logo, theme) · 52–112 toolbar (search "Search teams or leagues", "Filters" without
  badge) · scroll: title "Today's Matches" + "294 matches · Highest chance" · date stepper "Tue, Oct 13" · cards 1–4 of
  §2.7 (card 4 clipped by the tab bar) · tab bar (Matches current). Below the fold (not drawn): pager
  "‹ 1 2 3 4 … 10 ›" with no "Showing…" line, then footer. F2: F1 + More popover open ("Help", "Privacy", "Terms",
  "Contact"), More slot current. F3: title "Live Matches" + "3 matches · Highest chance"; **no stepper** (Live is
  today only); live cards 3, 5, 6 with red badges and red scores; Live slot current. F4: title "Results"; stepper
  "Mon, Oct 12"; `.gh-empty` "Fixture data unavailable" / "Fixture coverage is incomplete or unavailable. Try again
  later."; Results slot current. F5: title "Live Matches"; `.gh-empty` with live icon, "0 matches" (20/700) and
  secondary button "Today".
- **filters** — S1: F1 with the panel open under the toolbar ("Filters" filled teal, badge "5"): rows "Date range ·
  Tue, Oct 13 – Thu, Oct 15", "Time range · 12:00–20:00", "Markets · 2 selected", "Leagues · All leagues", "Countries ·
  2 selected", "Probability · 50% - 100%", "Order · Highest chance" (each with a teal dot), "Odds unavailable" + the
  explanation. Expand **Time range**: "From time" 12:00 / "To time" 20:00 side by side (44 px fields, labels above) +
  caption "Africa/Kampala". Footer sticky above the tab bar: Clear | Apply. S2: panel with **Date range** expanded:
  "Quick date ranges" chips (Today, Tomorrow, Next 3 days, Next 7 days, Next 30 days; none pressed), "From date"
  15/10/2026 and "To date" 13/10/2026 stacked (red borders), alert text under them, Date range summary with red dot;
  footer shows the same sentence above Clear | Apply, Apply `aria-disabled="true"`. S3: panel closed; under the
  stepper (now "Tue, Oct 13 – Thu, Oct 15") the removable chips of §2.7 wrap on two rows; title count "0 matches ·
  Highest chance"; "Filters" badge "5"; `.gh-empty` "No matches for these filters" + text + "Clear" button.
- **picker** — P1: S1 layout scrolled so the panel fills the screen; **Leagues** criterion expanded (summary
  "Leagues · 2 selected"): "Find Leagues" field (no keyboard), group label "2 selected" with the two ticked rows, then
  the full list (§2.7) in a 6-row scroll box; footer Clear | Apply. P2: **Markets** expanded: four check rows with hue
  swatches (`.gh-code`), only "Match result" ticked, `.gh-note--alert` "Keep at least one market selected." under it.
- **detail** — D1: 0–52 sticky top bar · banner card (`.gh-banner`, 16 px padding): competition line, kickoff right,
  crests 44, names 15/700, form letters, centre "4 – 2" 28/800 + status badge; Top pick block at the banner foot
  (`.gh-toppick.mkt-dc`, 4 px violet left edge): "★ Top pick", "Double chance – RB Bragantino or draw" 16/700, "Odds: —
  · AI prediction" 13, right "79%" 28/800 violet + "Estimated probability" 12 + badge "Correct" · All Markets & Odds
  card (header "All Markets & Odds" + "4 of 4 published", chevron-up) with 4 `.gh-mrow` rows (64 px: family badge,
  full name 15/600 + outcome badge right, line 2 = pick pill · "56%" 15/800 · "Odds —" 13 muted, chevron; DC row
  shows the hue star) — the 2 × 2 tiles are removed. D2: scrolled; markets card foot (ghost button "Search markets" +
  footer notes oddsFooter/probabilityNotOdds), then section cards in order with ≤3-row previews: Team Comparison
  (teams row, "56% · Win probability · 21%", "Last 10" caption, 2 stat bars, "View full comparison"), Head to Head
  (meta "7 meetings"; "Last 5 meetings" + letters D W L D W; 3 meeting rows with dates incl. year; "View full head to
  head history"), Team Form (two teams: crest, letters, "Goals 9 · Conceded 4"). Continuing order: Lineups (meta
  "Confirmed", "4-3-3 · 4-2-3-1", mini pitch 64 px decorative), Players (meta "38 players", 3 rows), News & Insights
  (meta "6 items", 3 rows), Injuries & Suspensions (meta "4 absences", 3 rows), Match Context (rest rows + one muted
  line "Venue Not available · Weather Not available"), Referee (header only, meta "Not available"), Prediction History
  (meta "3 revisions", "Latest revision published Oct 12, 2026, 09:12 EAT"), then `details.disclaimer`, footer.
  D3: D1 with `.gh-searchrow` open. D4: top bar (back + "Match details"), `.gh-empty` with h1 "Match temporarily
  unavailable", text, description, primary "Try again".
- **markets** — M1: page scrolled so the All Markets & Odds card starts under the top bar; its header is sticky
  while open; "Search markets" revealed: `.gh-search` 44 px "Search markets", group label "Market categories" +
  13 wrapping chips ("Popular" pressed, then Results, Goals, Both teams, Double chance, Draw no bet, Handicaps,
  Corners, Cards, Halves, Correct score, Clean sheets, Players & specials), then the 4 rows, then the two footer notes.
  M2: same with "Cards" pressed: rows replaced by `.gh-note` "No Cards markets are published for this match." +
  `details.supportedMarkets` (no column header).
- **market** — K1: markets card open; sticky `.gh-backrow` under the top bar ("Back to all markets" · "Match result
  (1X2)" · Collapse "Collapse All Markets & Odds"; no second heading row); facts (stack, 2-col grid, wrapper
  `.mkt-1x2` so the pill and bars take the family hue): "Our prediction" pill "RB Bragantino win", "Estimated
  probability" "56%", "Prediction outcome" badge "Correct", "Odds" "—" + "Bookmaker odds are not imported yet.";
  "All outcomes" (14/700) with 3 `.gh-outcome` rows (label, 8 px hue bar, %; "RB Bragantino win · predicted" bold);
  exclusive note. K2: scrolled (back row still pinned): "Source and timing" facts (§2.7), "Explanation" note +
  numbered reasons with 44 px publisher link rows (external icon), Key uncertainty, `detail.probabilityDisclosure`,
  group "Other prediction markets" with the three other `.gh-mrow` rows, ghost "Collapse All Markets & Odds" at the
  card end.
- **stats** — T1: sticky open header (Team Comparison, orange, Collapse) · chip groups "Results window" (Last 5
  pressed, Last 10, All stored) and "Venue" (All venues pressed, Home games, Away games) · teams row (crests + names) ·
  "Win probability" 56% | 21% · 8 stat bars · comparison note. Below fold: "Provider statistics in the prediction
  evidence" facts, statsNotCollected note, "Collapse Team Comparison". T2: back row ("Back to list" · "Points per
  game" · Collapse) · context line "Last 5 · All venues" 13/600 muted · help note · "RB Bragantino · 2.0" (15/700)
  + 5 rows (date 13 muted · match 14 · value 15/800 right) · "Cruzeiro · 1.6" + rows.
- **h2h** — H1: sticky header "Head to Head" + meta "7 meetings" + Collapse · facts 2-col grid (7 totals) · chip group
  "Venue" · 7 meeting rows 56 px (date with year 13 muted, "Cruzeiro 1–2 RB Bragantino" 14 with crests 20, letter
  badge, chevron) · h2hBasis note · "Collapse Head to Head". H2: back row ("Back to list" · "Cruzeiro v RB Bragantino"
  · Collapse; the title is not repeated below) · facts stack (Date, Competition, Score, Status) · regulation note ·
  secondary button "Open this match's page" (arrow-right) · ghost "Collapse Head to Head". This record panel is reused
  unchanged by form and context.
- **form** — R1: sticky header "Team Form" + Collapse · chip groups "Team" (Both teams pressed, RB Bragantino,
  Cruzeiro), "Results window", "Venue" · legend "H Played at home · A Played away" 13 muted · "RB Bragantino" 15/700 +
  summary 13 · 5 rows 52 px (date · `.gh-ha` H/A tag 24 px · crest + opponent · score 15/800 · letter) · "Cruzeiro" +
  rows.
- **lineups** — L1: sticky header "Lineups" + "Confirmed" + Collapse · chip group "Team" · "RB Bragantino · 4-3-3"
  15/700 with crest · note "Confirmed lineup · updated Oct 13, 2026, 02:02 EAT" · pitch (4 rows, 300 px tall). L2:
  scrolled: "Starting XI" (h4 15/700) + 11 rows 48 px (number 15/800 muted · name 15 · position 13 muted · chevron),
  "Substitutes" + 7 rows, manager note, then "Cruzeiro · 4-2-3-1" begins.
- **players** — Y1: sticky header "Players" + "38 players" + Collapse · chip groups "Team" and "Position" (All
  positions pressed; wraps to 2 rows) · 15 `.gh-row` player rows 64 px (initials avatar 32, name 15/700, meta 13,
  pill, chevron) — viewport shows ~8 · below fold pager "‹ 1 2 3 ›" + statsMissing note.
- **news** — N1: sticky header "News & Insights" + "6 items" + Collapse · chip group "News type" (All pressed, Report,
  Analysis) · 6 rows 80 px (pill "Report" blue / "Analysis" violet, 2-line title 15/600, meta 13 muted, chevron) ·
  newsBasis note. N2: back row ("Back to list" · "Cruzeiro travel without Villalba after knee injury" wrapping to 2
  lines · Collapse) · pill "Report" · facts stack · 2 bullets 15 · reportNote · secondary button "Read the original
  report" (external icon).
- **injuries** — I1: sticky header "Injuries & Suspensions" + "4 absences" + Collapse · chip groups "Team", "Status"
  (All statuses pressed, Out, Doubtful, Status unclear) · 4 rows 72 px (avatar, name, meta wraps to 2 lines incl.
  "Reported API-Football · Oct 12, 2026, 09:30 EAT", status pill; no red plus icon) · injuryBasis note.
- **player** — Q1: Players card open; back row ("Back to list" · "Walace" · Collapse) · identity line (avatar 48 "W" +
  row meta "Cruzeiro · M · #5" 13 muted; the name is not repeated) · facts stack (Team, Shirt number, Position, Lineup
  role, Availability = Doubtful pill + "Questionable · Muscle Injury", Reported, Expected return) · statsMissing note.
- **context** — C1: sticky header "Match Context" + Collapse · facts stack: Competition (trophy + "Serie A"), Country,
  Round, Kickoff, Status "Finished", the two rest rows (label above value) · restBasis note. C2: scrolled: "Surrounding
  fixtures" 15/700 · per team 13/700 name · "Last" row 56 px button (teal pill "Last", score text, date, chevron →
  record panel in place) · "Next" row 56 px link (violet pill "Next", crest, "RB Bragantino – São Paulo", date,
  arrow-right icon: it opens that match's details page in the same tab) · Cruzeiro block · facts "Venue/Weather/Standings · Not available" in one muted group ·
  contextMissing note.
- **referee** — Z1: page scrolled to the Referee card open: sticky header "Referee" + meta "Not available" +
  Collapse · facts "Referee — Not available", "Officiating statistics — Not available" · refereeMissing note ·
  "Collapse Referee"; below it the closed Prediction History card.
- **history** — HI1: sticky header "Prediction History" + "3 revisions" + Collapse · "Publications" (15/700) + order
  note · 3 publication rows 88 px (line 1 "Publication 3" 15/700 + status badge "Locked prediction" teal; line 2
  "Published: Oct 12, 2026, 09:12 EAT · AI prediction" 13; line 3 run date + "Cycle 1 · Revision 3 within this cycle"
  13 muted; chevron), Superseded badges neutral. HI2: scrolled: "Schedule cycles" · disclosure row "Cycle 1 · Closed"
  expanded with the five time lines + ghost link "Inspect this cycle’s retained prediction" · readOnly, readClock,
  "Stored data observed: …" in one muted block · "Collapse Prediction History".
- **snapshot** — SN1: History card at item level (A's standard item panel, like H2/N2/Q1): sticky back row ("Back to
  list" · "Publication 2" · Collapse "Collapse Prediction History"); body: label "Historical prediction snapshot"
  13/700 muted, badge "Historical publication", "Revision 2 within this cycle · Published: Oct 11, 2026, 09:05 EAT",
  snapshot note,
  "Cycle 1 · Closed" row, first market block (same `.gh-mrow` anatomy: hue badge + "Match result (1X2)", pill "RB
  Bragantino win", "Estimated probability 52%", noSettlement note, "AI prediction · Published: …", disclosure rows
  "Alternative selections" and "Source attribution and timing" 48 px). SN2: remaining blocks (DC with overlap note,
  O/U with "API-Football fallback · Provisional estimate" + fallback reason, BTTS "Unavailable for this market" +
  reason), "Prediction analysis" block, "Sources and evidence times" disclosure, ghost "Collapse Prediction History"
  at the card end. "Back to list" returns to the Publications list with focus on the "Publication 2" row.

---

## 5. Direction B · Sheet Stack

**Concept.** The list and the match overview are the only two pages, and they never move. Every secondary view rises
in **one bottom-sheet component** in the thumb zone: match dates, filters and order, pickers, All Markets & Odds, a
market, each section, each item and the history snapshot. Nested levels push inside the same sheet with a ‹ back.
Closing returns to exactly the same scroll position and focuses the control that opened it. The overview becomes a
calm launcher: banner, top pick, four market rows and equal-height section tiles. Feed cards adopt the template's
right-hand probability block in the market hue.

**Grafted from:** a11y A (one sheet primitive, labelled-select sub-header, return focus), system A (sheet steps,
Order joins the draft, one footer action on items), flow D (one-tap "Match dates" sheet, equal-height launcher tiles,
template hue block, family code switcher in the market sheet).

**Navigation model.**
- Feed: sticky top bar + sticky query row (search + "Filters"). Under the title a date button "Tue, Oct 13" opens the
  half-height **"Match dates"** sheet: "Quick date ranges" link rows (one tap applies and closes), "Previous day" /
  "Next day" rows, then "From date"/"To date" + Apply. "Filters" opens the **"Filters and order"** sheet (92 %):
  time, markets, leagues, countries, probability, odds note, Order. Markets/Leagues/Countries push a checklist step
  ("‹" back to Filters and order) with the same footer. Apply applies the whole draft and closes. Dates are kept by
  Clear (as today), so they live in their own sheet.
- Details: sticky top bar. Header row "All Markets & Odds" → the markets sheet at its list (search + categories);
  its rows push the market step. Top pick / an overview market row → the same markets sheet opened directly at that
  market's step (`?market=`), so a market always has the same header: ‹ "Back to all markets" (pops to the list) and
  ✕ "Collapse All Markets & Odds" (closes to the overview, focus back on the opener). A tile → section sheet (`?section=`, 92 %);
  list rows push the item step (`&item=`); a publication pushes the snapshot step. Sheet ✕ closes to the overview;
  ‹ pops one step; Back pops one entry. Referee opens at half height. "Open this match's page" and Context "Next" rows
  leave for another match.

**Component specs (B).**

| Component | Spec |
| --- | --- |
| Top bar | As A (52 px, sticky, feed logo/theme; details back · "Match details" · search · theme). |
| Query row `.gh-toolbar` | Same as A's toolbar (60 px, sticky): search + "Filters" button with count. |
| Title block | `.gh-h1` 20/800, then a row: date `.gh-btn--secondary` (calendar icon + "Tue, Oct 13" + chev-down, name "Match dates: Tue, Oct 13") and `.gh-count` "294 matches · Highest chance". Removable chips wrap below. |
| Feed card `.gh-match` (B) | `.gh-card` padding 12, 10 px gaps: row 1 flag + code + league 13 (ellipsis) · right "03:00 EAT" 13/700 + status badge; row 2 crest 24 + name 14/700 · score 17/800 / "VS" · name + crest 24; row 3 pick bar 52 px: left part on `--hue-bg` (code chip + pick 14/600 ellipsis + outcome badge) and a right 76 px block filled `--hue` with `--gh-on-brand` "56%" 20/800. No pick: left "Not predicted" muted on `--gh-surface-2`, block `--gh-surface-2` with "—". ~140 px. |
| Sheet `.gh-sheet` | Inside `.gh-phone`: `.gh-scrim` (covers all incl. tab bar) + sheet. Full detent top 64 px (height 780), half detent height 420. Square corners, 2 px `--gh-brand` top edge, decorative grab 36 × 4 `--gh-control` 8 px from top. Header 60 px: optional ‹ `.gh-icon-btn` ("Back to list" / "Back to all markets" / "Filters and order"), `.gh-ibadge` 28, title 17/700 (2 lines max), sub 13 muted (meta or parent section), ✕ `.gh-icon-btn` (name "Close filters" on the "Filters and order" and "Match dates" sheets; "Collapse {section}" on section sheets; "Collapse All Markets & Odds" on the markets sheet and every market step). Optional sticky sub-header (`.gh-sheet__sub`, `--gh-surface-2`, 12 px padding) for filters/switchers. Body scrolls, 16 px padding. Optional footer `.gh-footbar` 72 px. |
| Section filters | Labelled native selects `.gh-select` (label 12/600 muted above a 44 px field), two per row (three for Team Form), in the sheet sub-header. |
| Market switcher | `.gh-seg` 44 px with 4 segments "1X2", "DC", "O/U 2.5", "BTTS" (segment name = full market name) in the market sheet sub-header. |
| Launcher tiles `.gh-tile` | 2-up grid, 8 px gap, each 171 × 128 px button: head row (`.gh-tile__head`: `.gh-ibadge` 28 + title 15/700, ≤ 2 lines) · meta 13 muted · preview 13 (≤ 2 lines) or form letters. Equal height; never reorder. |
| Market rows | `.gh-mrow` as A (64 px) inside a card; header row `.gh-row` "All Markets & Odds" + "4 of 4 published" + chevron. |
| Rows / facts / stat bars / pager / notes | As A (`.gh-row`, `.gh-kv--stack`, `.gh-stat-bar`, `.gh-pager`, `.gh-note`). |
| Item step | Sheet header: ‹ + item title + sub = section title + ✕. Body: facts, notes. One action (e.g. "Open this match's page", "Read the original report") in a `.gh-footbar` with a full-width secondary button. |

**Per-screen layout (B).**

- **feed** — F1: top bar · query row · title "Today's Matches" · row: date button "Tue, Oct 13" + "294 matches ·
  Highest chance" · cards 1–4 (template cards) · tab bar. F2: More popover (shared). F3: "Live Matches", no date
  button, count "3 matches · Highest chance", live cards. F4: "Results", date button "Mon, Oct 12", empty block.
  F5: "Live Matches", empty block with "0 matches" + "Today".
- **filters** — S1: feed dimmed by the scrim; "Filters and order" sheet (full): header title + sub "Today's Matches" +
  ✕ "Close filters". Body: "Time range" (two 44 px fields side by side + caption "Africa/Kampala"); drill rows 56 px
  "Markets · 2 selected ›", "Leagues · All leagues ›", "Countries · 2 selected ›" (teal dots on changed rows);
  "Probability" Min 50 – Max 100 % (44 px fields) + printed help; "Odds unavailable" + explanation (muted); "Order"
  with four check rows ("Highest chance" checked). Footer Clear | Apply. S2: the half-height "Match dates" sheet
  (title "Match dates", ✕ "Close filters"): "Quick date ranges" link rows (Today, Tomorrow, Next 3 days, Next 7 days, Next 30 days;
  48 px), "Previous day"/"Next day" row pair, "From date" 15/10/2026 / "To date" 13/10/2026 side by side with red
  borders + alert, footer "Apply" `aria-disabled` with the sentence above it. S3: feed: date button "Tue, Oct 13 –
  Thu, Oct 15", chips row, count "0 matches", empty block with "Clear".
- **picker** — P1: Filters sheet pushed to the Leagues step: header ‹ ("Filters and order") · "Leagues" · sub
  "2 selected" · ✕; sticky "Find Leagues"; group label "2 selected" + 2 rows; then the list; footer Clear | Apply.
  P2: Markets step: 4 check rows with hue code chips; alert note under "Match result".
- **detail** — D1: top bar · banner card · Top pick (as A, violet) · market card: header row "All Markets & Odds ·
  4 of 4 published ›" + 4 `.gh-mrow` · tiles start. D2: scrolled to the tile grid (10 tiles, order of §2.5): Team
  Comparison (meta "Last 10", preview "Win probability 56% · 21%"), Head to Head ("7 meetings", letters D W L D W),
  Team Form (two letter rows), Lineups ("Confirmed", "4-3-3 · 4-2-3-1"), Players ("38 players", "Cleiton · A.
  Hurtado"), News & Insights ("6 items", first title 2 lines), Injuries & Suspensions ("4 absences", "H. Mosquera ·
  Out"), Match Context ("Regular Season - 30", "5.1 days · 5.9 days"), Referee ("Not available"), Prediction History
  ("3 revisions", latest revision line) · disclaimer. D3: search row open. D4: unavailable.
- **markets** — M1: overview dimmed; full sheet "All Markets & Odds" (orange badge, sub "4 of 4 published", ✕
  "Collapse All Markets & Odds"); sub-header: search "Search markets" + select "Market categories" ("Popular") side
  by side; 4 rows 72 px (two lines, full names, outcome badges); footer notes in the body end. M2: select = "Cards";
  empty + supported notes.
- **market** — K1: the All Markets & Odds sheet at the 1X2 step, over the overview (opened from the 1X2 row): header
  ‹ ("Back to all markets") · `.gh-ibadge.mkt-1x2` · "Match result (1X2)" + sub "All Markets & Odds" · ✕ ("Collapse
  All Markets & Odds"); sub-header `.gh-seg` (1X2 pressed; each segment's name is the full market name); body: hero facts (pill, "56%"
  28/800 hue, "Estimated probability", outcome badge, "Odds — Bookmaker odds are not imported yet."), "All outcomes" +
  bars + exclusive note. K2: sheet body scrolled: Source and timing, Explanation with link rows,
  probabilityDisclosure.
- **stats** — T1: full sheet "Team Comparison" (orange) ✕ "Collapse Team Comparison"; sub-header selects "Results
  window" (Last 5) and "Venue" (All venues); teams row; Win probability; stat bars; note. T2: step: ‹ ("Back to list")
  + "Points per game" + sub "Team Comparison" + ✕; context line "Last 5 · All venues"; help note; per-team lists.
- **h2h** — H1: sheet "Head to Head", sub "7 meetings"; sub-header select "Venue"; totals 2-col facts; meeting rows;
  basis note. H2: step "Cruzeiro v RB Bragantino" (sub "Head to Head"); facts; regulation note; footer button "Open
  this match's page".
- **form** — R1: sheet "Team Form"; sub-header three selects (Team · Results window · Venue, 114 px each); legend;
  team blocks with rows.
- **lineups** — L1: sheet "Lineups", sub "Confirmed"; sub-header select "Team"; RB block: line, note, pitch.
  L2: body scrolled to Starting XI / Substitutes rows + manager note.
- **players** — Y1: sheet "Players", sub "38 players"; sub-header selects "Team", "Position"; player rows; pager at
  the body end.
- **news** — N1: sheet "News & Insights", sub "6 items"; sub-header select "News type" (All); 6 rows; basis note.
  N2: step: title = item title (2 lines), sub "News & Insights"; pill, facts, bullets, note; footer "Read the original
  report".
- **injuries** — I1: sheet "Injuries & Suspensions", sub "4 absences"; selects "Team", "Status"; 4 rows; basis note.
- **player** — Q1: Players sheet step: ‹ + "Walace" + sub "Players" + ✕; identity block; facts; note.
- **context** — C1: sheet "Match Context": facts stack, rest rows, restBasis. C2: body scrolled: surrounding fixtures
  rows (Last → record step, Next → leaves), not-available group, note.
- **referee** — Z1: overview tiles visible behind the scrim; **half** sheet "Referee" (violet), ✕ "Collapse Referee";
  two facts + note; no footer.
- **history** — HI1: full sheet "Prediction History", sub "3 revisions"; "Publications" + order note; 3 rows (88 px)
  with status badges and chevrons. HI2: body scrolled: "Schedule cycles" disclosure open, notes block.
- **snapshot** — SN1: History sheet step: ‹ ("Back to list") + "Publication 2" + sub "Prediction History" + ✕; badge
  "Historical publication", revision/published line, snapshot note, cycle row, first market block. SN2: remaining
  blocks, analysis, sources disclosure.

---

## 6. Direction C · Page Stack

**Concept.** Treat the prediction family as a tree. Every level is a full page with one standard app bar: on the
left a back button followed by the parent's name ("‹ Match details") stacked above the page title (with the existing
meta beside it), and at most two actions on the right. Overviews become indexes of grouped rows; detail lives one level
down; nothing overlays content. Edge-to-edge grouped lists (settings style) and a dense scoreboard feed give the
most predictable model for screen readers and switch users, and almost every screen is built from one row
component.

**Grafted from:** a11y B (app-bar back names the parent, grouped rows, option pages, scoreboard row), flow B (hub
index with one-line summaries, filter subtitle on the metric page, history.back semantics), system B (item-page
template, section filter bar, "Applied" removal as rows).

**Navigation model.**
- Feed (root): app bar (logo + theme), sticky date stepper, large title, search, a "Filters and order" summary row,
  and — when filters are applied — an "Applied" group whose rows each carry a 44 px remove link ("Remove {label}").
  The summary row opens the **Filters and order** page (app bar "‹ Matches", trailing "Clear"; sticky footer
  "Apply"). Its "Date range", "Markets", "Leagues", "Countries" rows open option pages ("‹ Filters and order");
  time, probability and order are edited inline on the Filters page. "Apply" on any filter page applies the whole
  draft and returns to the feed top.
- Details: the hub (overview) is an index. Rows open the market page (`?market=`), the All Markets & Odds page, or a
  section page (`?section=`). Section pages have filter rows (native selects, replace) and item rows that open item
  pages (`&item=`). The app-bar back always goes exactly one level up and is labelled with that level's title; the
  phone Back follows the same entries. Market pages end with an "Other prediction markets" group (sibling switch).

**Component specs (C).**

| Component | Spec |
| --- | --- |
| App bar `.gh-topbar` (C) | 56 px, sticky on every page, `--gh-header`, 2 px `--gh-brand` edge. Left: 44 px back `.gh-icon-btn` (chev-left 22; `aria-label` = where it goes: "Back to matches", "Match details", "Back to all markets", "Back to list", "Filters and order"). Then a left-aligned title block `.gh-topbar__titles`: line 1 = parent label 12/600 muted (the visible "‹ parent" — e.g. "Match details", "Head to Head"), line 2 = page title 17/700 (one line, ellipsis) with the existing meta appended in 13/600 muted ("Head to Head  7 meetings"). Right: up to two 44 px actions (details hub: search + theme; Filters page: ghost "Clear"). Feed root: logo + theme, no back. Wherever this section writes "app bar '‹ X' · 'Title' · sub 'meta'", draw parent X on line 1, Title + meta on line 2. One rule for every page (per-screen lines below that omit line 1 follow it): All Markets & Odds and the ten section pages → line 1 "Match details", back name "Match details"; market pages → line 1 "Markets", back name "Back to all markets"; item pages → line 1 = their section title, back name "Back to list"; filter option pages → "Filters and order"; the Filters page and Match details → "Matches", back name "Back to matches". |
| Date stepper | `.gh-stepper` 52 px sticky under the app bar on the feed (prev · date button · next), `--gh-page` with bottom rule. |
| Large title | `.gh-h1` 22/800 + `.gh-count` 14 muted, padding 20 16 12. |
| Grouped list `.gh-group` | Optional `.gh-group__title` 13/700 muted (padding 20 16 8); rows edge-to-edge on `--gh-surface`, inset 1 px dividers (left 16); `.gh-group__foot` notes 13 muted (padding 8 16 0). Groups separated by 24 px of page. |
| Rows `.gh-row` | 56 px single line / 72 px two-line: label 15 left, value 15 muted right, chevron 20; disabled rows muted with an explanation line. Select rows: `.gh-row.gh-row--select` = label left, native `<select>` value right + chev-down (the whole row is the 44 px control). Check rows: trailing check icon `--gh-brand`. |
| Scoreboard row `.gh-match` (C) | Edge-to-edge row in one group, 96 px: left column 64 px (time 15/700 + status badge under); centre: league line (flag + code + league 12 muted), home line and away line (crest 20 + name 15/600 + goals 15/800 right; live goals `--gh-live`); right column 120 px: code chip + "56%" 17/800, pick 13 (ellipsis), outcome badge. No pick: "—" + "Not predicted". |
| Hub rows | `.gh-row` two-line 64 px: `.gh-ibadge` 28 + title 15/700 + one-line summary 13 muted; meta right 13 muted; chevron. |
| Facts | `.gh-kv--split` rows inside groups: label 15 left (max 45 %), value 15 right; long labels wrap on the left, never 3 lines (rest rows become two-line rows: label line 1, value line 2). |
| Stat bars | `.gh-stat-bar` as A, as group rows (64 px). |
| Pager | `.gh-pager--compact`: "Previous page" · "Page 1 of 3" · "Next page" as a 48 px row (`feed.pagination.page`). Feed keeps numbered 44 px slots. |
| Item page | App bar ‹ section title · item title; hero (optional) → facts group → foot notes → one 56 px action row (link row with arrow/external icon). |

**Per-screen layout (C).**

- **feed** — F1: 0–56 app bar (logo, theme) · 56–108 sticky stepper "Tue, Oct 13" · large title "Today's Matches" +
  "294 matches" · search 44 (16 px gutters) · group: "Filters and order" row (filter icon, 15/700, value line "Match
  result · All leagues · Any country · Highest chance" 13 muted, chevron) · group: scoreboard rows 1–5 edge to edge ·
  tab bar. F2: More popover. F3: "Live Matches", no stepper, Filters row, live rows. F4: "Results", stepper "Mon, Oct
  12", empty block on page bg. F5: "Live Matches", empty block "0 matches" + "Today".
- **filters** — S1: Filters page: app bar "‹ Matches" · "Filters and order" · ghost "Clear". Groups: row "Date range ·
  Tue, Oct 13 – Thu, Oct 15 ›"; group "Time range": inline row with "From time" / "To time" 44 px fields + foot
  "Africa/Kampala"; group: "Markets · 2 selected ›", "Leagues · All leagues ›", "Countries · 2 selected ›" (teal dot
  before changed values); group "Probability": Min/Max fields + foot `feed.filters.probabilityHelp`; disabled row
  "Odds unavailable" with line 2 `feed.filters.oddsPending`; group "Order": four check rows. Sticky footer "Apply"
  (full width, "Apply filters"). S2: "Date range" option page: app bar "‹ Filters and order" · "Date range"; group
  "Quick date ranges" check rows; group with "From date" / "To date" rows (native date inputs, red); alert foot;
  footer Apply `aria-disabled` with the sentence above. S3: feed root: Filters row value "5 active"
  (`feed.filters.activeCount`; the five values are not repeated here because the group below lists them) + count
  badge "5"; group "Applied" with five 48 px rows ("Markets: 2 selected", "Countries: 2 selected", "12:00–20:00",
  "50% - 100%", "Search: united"), each ending in a 44 px remove link (`<a>`, "Remove {label}"); stepper "Tue, Oct 13 – Thu, Oct 15"; count "0 matches"; empty block +
  "Clear".
- **picker** — P1: option page "Leagues" (app bar "‹ Filters and order", sub "2 selected"); sticky "Find Leagues";
  group "2 selected" (2 check rows, two-line with country); group of all rows (64 px two-line: name / country, count
  right, check at the end); footer Apply. P2: option page "Markets": 4 check rows with code chips; alert foot "Keep
  at least one market selected.".
- **detail** — D1: app bar "‹ Matches" ("Back to matches") · "Match details" · search + theme · banner block
  (full-bleed `--gh-surface`, 16 px padding) · Top pick row (group row 80 px, `--hue-bg` with 4 px hue edge, "★ Top
  pick", "Double chance – RB Bragantino or draw", "79%" right, badge "Correct", chevron) · group "Markets": four 64 px
  rows (code chip + full name / pick · "Odds —"; % and outcome right) + row "All Markets & Odds · 4 of 4 published ›".
  D2: scrolled: the untitled section group of 10 hub rows with summaries: Team Comparison "Win probability 56% ·
  21%"; Head to Head "Last 5 meetings" + mini letters, meta "7 meetings"; Team Form two letter groups; Lineups
  "Confirmed · 4-3-3 · 4-2-3-1"; Players "38 players"; News & Insights "6 items"; Injuries & Suspensions "4 absences";
  Match Context "Serie A · Regular Season - 30"; Referee "Not available"; Prediction History "3 revisions" ·
  disclaimer · footer. D3: search row open. D4: app bar + empty block.
- **markets** — M1: page app bar "‹ Match details" · "All Markets & Odds" · sub "4 of 4 published"; search 44; select
  row "Market categories · Popular"; group of 4 two-line rows (72 px); group foot notes. M2: categories "Cards" →
  group foot notes only (empty + supported).
- **market** — K1: app bar "‹ Markets" (aria "Back to all markets") · "Match result (1X2)"; hero block (hue badge 32,
  pill "RB Bragantino win", "56%" 28/800, "Estimated probability", outcome badge); group facts "Odds · —" + foot
  "Bookmaker odds are not imported yet."; group "All outcomes" (3 rows with bars) + exclusive foot. K2: group "Source
  and timing" (split facts), group "Explanation" (numbered reasons as rows; publisher link rows with external icon),
  foot probabilityDisclosure; group "Other prediction markets" (3 rows).
- **stats** — T1: app bar "‹ Match details" · "Team Comparison"; group select rows "Results window · Last 5", "Venue ·
  All venues"; teams row; group: Win probability row + 8 stat-bar rows; foot comparison note. T2: app bar "‹ Team
  Comparison" · "Points per game" · sub "Last 5 · All venues"; help note; group "RB Bragantino · 2.0" rows; group
  "Cruzeiro · 1.6" rows.
- **h2h** — H1: app bar "Head to Head" · sub "7 meetings"; group totals (split rows); group select row "Venue · All
  venues"; group meetings (scoreboard-style rows: date left column, stacked teams with goals, letter badge, chevron);
  foot h2hBasis. H2: app bar "‹ Head to Head" · "Cruzeiro v RB Bragantino"; group facts; foot regulation note; action
  row "Open this match's page" (arrow-right).
- **form** — R1: app bar "Team Form"; group select rows Team / Results window / Venue; legend row; group titled "RB
  Bragantino" with the summary as group subtitle; 5 rows (date · H/A · opponent · score · letter · chevron); group
  "Cruzeiro".
- **lineups** — L1: app bar "Lineups" · sub "Confirmed"; select row "Team · Both teams"; group title "RB Bragantino ·
  4-3-3" + update note; pitch inset 16 px. L2: group "Starting XI" (52 px rows: number · name · position · chevron),
  group "Substitutes", foot manager note.
- **players** — Y1: app bar "Players" · sub "38 players"; select rows "Team", "Position"; group of player rows (64 px);
  compact pager row "Previous page · Page 1 of 3 · Next page"; foot statsMissing.
- **news** — N1: app bar "News & Insights" · sub "6 items"; select row "News type · All"; group of 6 rows (88 px);
  foot newsBasis. N2: app bar "‹ News & Insights" · "Report"; content h1 17/800 full title; group facts; group bullets;
  foot reportNote; action row "Read the original report" (external icon).
- **injuries** — I1: app bar "Injuries & Suspensions" · sub "4 absences"; select rows "Team", "Status"; group of 4
  rows (two-line meta); foot injuryBasis.
- **player** — Q1: app bar "‹ Players" · "Walace"; hero (avatar 48, name 22/800, "Cruzeiro"); group facts (split);
  foot statsMissing.
- **context** — C1: app bar "Match Context"; group facts (Competition, Country, Round, Kickoff, Status); group rest
  rows (two-line); foot restBasis. C2: group "Surrounding fixtures" with sub-titles per team: Last row (chevron) and
  Next row (arrow-right: opens that match's details page in the same tab); group "Venue / Weather / Standings · Not
  available"; foot contextMissing.
- **referee** — Z1: app bar "‹ Match details" · "Referee"; group with two split rows; foot refereeMissing.
- **history** — HI1: app bar "Prediction History" · sub "3 revisions"; group "Publications" (foot order note under the
  title) with three 88 px rows. HI2: group "Schedule cycles" (disclosure row expanded with time lines + link row
  "Inspect this cycle’s retained prediction ›"); final group of notes (readOnly, readClock, observed).
- **snapshot** — SN1: app bar "‹ Prediction History" · "Publication 2" · sub "Historical prediction snapshot"; group
  rows: status badge "Historical publication", "Revision 2 within this cycle", "Published: …"; foot snapshot note;
  group "Cycle 1 · Closed"; group "Match result (1X2)" (rows: Prediction pill, Estimated probability 52%, Source,
  Published, disclosure rows; foot noSettlement). SN2: groups for the other three markets; group "Prediction
  analysis"; disclosure row "Sources and evidence times".

---

## 7. Direction D · Tabbed Hub

**Concept.** Flat peers instead of depth. Exactly one view fills the screen and every sibling is one tap away in a
sticky tab strip. The feed's quick date ranges become date tabs; filters open as one full-screen panel with a tab per
filter group; Match details becomes a match centre: a sticky condensed bar plus a section tab strip ("Markets" + the
10 sections) with a pinned views button (chevron icon, `aria-label="Location in match details"`) that lists every view
with its meta (the same popover component as the bottom tab bar's More menu, but never labelled "More", so the
screen never shows two different "More" controls). Each tab shows its section's full content straight away. Content is tabular and column-aligned for
fast numeric scanning.

**Grafted from:** flow C (date tabs, tabbed filter panel, sticky column header, family switcher), a11y C (link tabs
with `aria-current`, "All | 1X2 | DC | O/U 2.5 | BTTS" sub-tabs, views list reusing the More popover component, snapshot
sub-tabs), system D (condensed sticky match bar, list of all views with meta).

**Navigation model.**
- Feed: sticky top bar + sticky date tab strip: ‹ ("Previous day") · tabs "Today", "Tomorrow", "Next 3 days", "Next 7
  days", "Next 30 days" (links; a custom day/range shows as an extra current tab first) · › ("Next day"). In flow: title
  + count; a control row (search, "Filters" with count, "Sort by" select — immediate); the list under one column header.
  "Filters" opens a full-screen panel "Filters and order" (✕ "Close filters") with tabs "Date range", "Time range",
  "Markets", "Leagues", "Countries", "Probability"; tabs carry a teal dot when changed, a red dot when invalid; footer
  Clear | Apply. Pickers are the content of their tab.
- Details: sticky top bar (title "Match details" at the top of Markets; condensed to "RB Bragantino 4 – 2 Cruzeiro"
  once the banner has scrolled away and on every section tab) + sticky section tab strip (48 px, scrolls sideways,
  current tab auto-scrolled into view, right fade) with the pinned views button (48 × 48) opening the views list. Tabs are
  links (`aria-current="page"`, push `?section=`). The Markets tab has sub-tabs "All | 1X2 | DC | O/U 2.5 | BTTS"
  (`market`, push). Items replace the tab content under a pinned back row "‹ Back to list" + item title (the item's
  `<h4>`, wraps, never repeated in the body).

**Component specs (D).**

| Component | Spec |
| --- | --- |
| Top bar | 52 px sticky, as A. Details condensed title: crest 20 + "RB Bragantino 4 – 2 Cruzeiro" 15/700 (ellipsis). |
| Tab strip `.gh-tabs` | 48 px, `--gh-header`-tinted page band (`--gh-surface-2`), bottom 1 px `--gh-border`; tabs `<a>` 48 px tall, padding 0 14, 15/600 muted; current = `--gh-text` 700 + 3 px `--gh-brand` underline (section tabs use the section accent). Feed variant has 44 px ‹ › buttons at both ends; details variant (nav `aria-label="Match details"`) has the pinned views button `.gh-tabs__more` at the right with a fade before it: icon-only chev-down 22 (chev-up while open), 48 × 48, `aria-label="Location in match details"`, `aria-expanded`. |
| Control row | `.gh-hstack` 44 px, 16 px gutters: search flex · "Filters" `.gh-btn--secondary` (icon + count) · "Sort by" `.gh-selchip` (value "Highest chance", no visible label → `aria-label="Sort by"`). |
| List header `.gh-listhead` | 32 px row 12/700 muted aligned to card columns: "Market", "Pick", "Prob.", "Result" (`aria-hidden`); sits directly above the first card. |
| Feed card `.gh-match` (D) | `.gh-card` padding 10 12, 6 px gaps: row 1 "03:00 EAT" 13/700 + flag + code + league 13 muted (ellipsis) · status badge; row 2 grid: teams column 140 px (two lines: crest 16 + name 14/600 + goals 14/800 right) · Market (code chip) 44 · Pick ("1" 15/800) 36 · Prob ("56%" 15/800) 48 · Result (badge) 60. No pick: cells "—" and a 12 px muted "Not predicted" under the teams. ~96 px. |
| Filter panel | `.gh-layer` full screen (covers the tab bar): header 56 px (✕ "Close filters" · title 17/700 + sub page title), tab strip with dots, content area (16 px padding), footer `.gh-footbar` Clear | Apply. |
| Sub-tabs `.gh-seg` | 44 px segments; Markets: "All", "1X2", "DC", "O/U 2.5", "BTTS" (segment names = full names); snapshot uses the same control for its four markets. |
| Select chip `.gh-selchip` | 44 px compact dropdown button: value 14/600 + chev-down, 1 px `--gh-control`; its group label 12/600 muted above it ("Results window", "Venue", "Team", "Position", "Status", "News type"). Several sit in one row. |
| Tables | `.gh-kv--table`: 44 px rows, label 14 muted left / value 14 right, 1 px dividers; data tables are `.gh-row` lines with fixed columns (date 92 px · match flex · value 40 px). |
| Back row `.gh-backrow` | ≥ 48 px pinned under the tab strip, one template for every item: "Back to list" ghost (chev-left) · item title as the item's `<h4 class="gh-backrow__title">` 15/700, wraps (never truncated); the body never repeats it. |
| Views list | `.gh-popover` 300 px under the views button: 11 rows 48 px (section icon badge 24, title 15, meta 13 muted right), current row `aria-current` brand-soft. |
| Market table `.gh-mtable` | Column header `.gh-mtable__head` 32 px ("Market", "Our prediction", "Probability", "Odds"; columns 1fr · 104 · 72 · 28 px) + `.gh-mtable__row` 64 px buttons with a 4 px family-hue left edge: full name 14/600 (2 lines max) · pick pill with the outcome badge under it · % 15/800 · "—". |

**Per-screen layout (D).**

- **feed** — F1: top bar · date tab strip (‹ · Today current · Tomorrow · Next 3 days · Next 7 days · Next 30 days ·
  ›) · title "Today's Matches" + "294 matches" · control row (search, Filters, "Highest chance") · list header · table
  cards 1–6 · tab bar. F2: More popover. F3: "Live Matches", **no date strip** (today only), control row, list header,
  live cards. F4: date strip with current custom tab "Mon, Oct 12" first; "Results"; empty block. F5: "Live Matches",
  empty block "0 matches" + "Today".
- **filters** — S1: panel open (header ✕ · "Filters and order" · sub "Today's Matches"); tabs with dots (Date range •,
  Time range •, **Markets** current •, Leagues, Countries •, Probability •); Markets tab content: four check rows with
  code chips (Match result ✓, Total goals (2.5) ✓); footer Clear | Apply. S2: Date range tab current with red dot:
  "Quick date ranges" chips (wrap), "From date"/"To date" fields with red borders, alert; error sentence above the
  footer; Apply `aria-disabled`. S3: feed: date strip current custom tab "Tue, Oct 13 – Thu, Oct 15"; control row
  ("Filters" badge 5); removable chips (wrap); count "0 matches"; empty block + "Clear".
- **picker** — P1: panel, **Leagues** tab current: "Find Leagues", the two selections as removable chips, check rows
  (48 px, name + country line, count); footer. P2: Markets tab: alert "Keep at least one market selected." under the
  rows. Probability tab (not drawn) also holds "Odds unavailable" + explanation and the printed help.
- **detail** — D1: top bar "Match details" · banner (as A, compact 200 px) · sticky section strip (Markets current,
  Team Comparison, Head to Head, Team F… fade · views button) · Markets tab: Top pick strip (72 px, violet, "79%", Correct) ·
  sub-tabs (All pressed) · search "Search markets" + select "Popular" in one row · market table header + 4 rows.
  D2: same page with the **views list** open (all 11 views with meta: Markets "4 of 4 published" current, Team
  Comparison, Head to Head "7 meetings", Team Form, Lineups "Confirmed", Players "38 players", News & Insights "6
  items", Injuries & Suspensions "4 absences", Match Context, Referee "Not available", Prediction History "3
  revisions"). D3: search row open. D4: top bar + empty block (no tabs).
- **markets** — M1: Markets tab scrolled: condensed top bar, strip, sub-tabs (All), search + select, table, footer
  notes. M2: select "Cards": empty + supported notes in place of the table (no header).
- **market** — K1: condensed bar, strip (Markets current), sub-tabs "1X2" pressed; hero facts (pill, "56%" 28/800,
  outcome badge, odds note); "All outcomes" bars + note. K2: scrolled: "Source and timing" table, "Explanation"
  (reasons, publisher link rows), probabilityDisclosure. No bottom back link ("All" is the way back).
- **stats** — T1: condensed bar · strip (Team Comparison current, orange underline) · select chips "Results window"
  (Last 5) and "Venue" (All venues) · table header row (crests + names) · Win probability row · 8 stat rows (48 px) ·
  note. T2: back row ("Back to list" · "Points per game") · context "Last 5 · All venues" · help note · two tables
  (date · match · value).
- **h2h** — H1: strip (Head to Head current) · line "7 meetings" 13 muted · totals table (7 rows) · select chip
  "Venue" · meetings table (date with year · match · score · letter, 48 px rows, chevron) · basis note. H2: back row
  ("Back to list" · "Cruzeiro v RB Bragantino") · facts table · regulation note · secondary "Open this match's page".
- **form** — R1: strip (Team Form current) · three select chips in one row (Team, Results window, Venue) · legend · per
  team: name 15/700 + summary 13, table rows (date · H/A · opponent · score · letter).
- **lineups** — L1: strip (Lineups current) · select chip "Team" · "RB Bragantino · 4-3-3" + note · pitch. L2:
  tables "Starting XI" and "Substitutes" with a column header row "Shirt number · Position" (12/700 muted), 44 px rows.
- **players** — Y1: strip (Players current) · select chips "Team", "Position" · table rows (avatar · name/meta · pill
  · chevron) · pager · note.
- **news** — N1: strip (News & Insights current) · line "6 items" · select chip "News type" · rows · note. N2: back
  row ("Back to list" · item title wrapping to 2 lines) · pill · facts table · bullets · note · secondary "Read the
  original report" (external icon).
- **injuries** — I1: strip (Injuries & Suspensions current) · select chips "Team", "Status" · rows · note.
- **player** — Q1: strip (Players current) · back row ("Back to list" · "Walace") · facts table · statsMissing
  note.
- **context** — C1: strip (Match Context current) · facts table (all rows incl. the two rest rows) · restBasis. C2:
  "Surrounding fixtures" table rows (Last button with chevron, Next link with arrow-right) · not-available table ·
  note.
- **referee** — Z1: strip (Referee current) · facts table (2 rows) · refereeMissing.
- **history** — HI1: strip (Prediction History current) · line "3 revisions" · "Publications" + order note ·
  publication rows. HI2: "Schedule cycles" disclosure open · notes.
- **snapshot** — SN1: strip (Prediction History current) · back row ("Back to list" · "Publication 2") · header line
  (badge "Historical publication", revision, published) · snapshot note · cycle row · sub-tabs "1X2 | DC | O/U 2.5 |
  BTTS" (1X2 pressed) with the 1X2 block below. SN2: sub-tab "O/U 2.5" pressed (fallback + provisional block) then
  "Prediction analysis" and "Sources and evidence times".

---

## 8. Direction E · Thumb Dock

**Concept.** Bring navigation to the thumb. A contextual **dock sits directly above the tab bar on every screen**: on
the feed it holds Filters and the day stepper; on Match details it holds the way up plus the previous and next
sibling (the four markets in order, the ten sections in order, the items of the current list). Each section and item
is its own page with a big title block; the top bar scrolls away to give content room. Cards are prediction-first:
the shown pick and its probability lead, then the teams, so "what is the pick and did it win?" is answered first.

**Grafted from:** flow E (contextual dock, dock turning into Clear · Apply, pick-first card, item stepping), a11y E
(section pages with position ticks, one full-screen filter form, dock up/prev/next semantics, "Load more matches"),
system E (thumb-zone back, removable no-JS chip links).

**Navigation model.**
- Feed: top bar, title, search and chips scroll; dock = [Filters (count)] [‹ "Previous day"] [date "Tue, Oct 13"]
  [› "Next day"]. The date or Filters opens the **Filters and order** form: one full-screen vertical form (no nested
  layers) with every criterion expanded; Leagues/Countries show the first rows plus "Show all {label}". While the
  form is open the dock becomes [Clear] [Apply]. The list ends with "Showing 30 of 294 matches" + "Load more matches"
  (a dormant, existing capability — owner opt-in; numbered page links stay in the HTML for no-JS).
- Details, one dock rule everywhere: the up slot goes to the parent; ‹ › go to the previous / next **sibling at the
  same level** (ends `aria-disabled`); a page without siblings shows the up slot only and the rest of the dock stays
  empty `--gh-surface-2` (as on Live). So: the start page (banner, top pick, markets list, a 2-column jump grid of the
  10 sections) has [Matches (up, "Back to matches")] only; the All Markets & Odds page has [Match details (up)] only;
  each section page (`?section=`) has [Match details (up)] [‹ previous section] [next section ›] in DOM order; market
  pages step across "Match result (1X2)" → "Double chance" → "Over/Under 2.5 goals" → "Both teams to score" with up =
  "Markets" ("Back to all markets"); item pages have [Back to list (up)] [‹ previous item] [next item ›] within the
  current filtered page. Prev/next `aria-label` = the full target title, plus the date where titles repeat
  (meetings, results: "RB Bragantino v Cruzeiro · Oct 26, 2025"). Browser Back = previous history entry.

**Component specs (E).**

| Component | Spec |
| --- | --- |
| Top bar | 52 px, **not sticky**, otherwise as A. |
| Dock `.gh-dock` | Rule in the navigation model above. 56 px, `--gh-surface-2`, 1 px `--gh-control` top rule, nav landmark ("Location in match details" on details, "Match dates" on the feed). Grid: up slot 80 px (chev-left 20 above a 12/600 label, max 2 lines) · prev (flex) · next (flex); prev/next = chevron + 14/600 target title, one line, ellipsis, full title in `aria-label`; disabled ends muted with `aria-disabled`. Feed grid: Filters 104 px (filter icon + "Filters" + count) · prev 52 · date flex (calendar + date 14/700) · next 52. Action variant `.gh-dock--actions`: "Clear" secondary (flex 1) + "Apply" primary (flex 2). |
| Page title block `.gh-titleblock` | padding 20 16 12: `.gh-ibadge` 32 · title 22/800 · meta 13 muted; decorative `.gh-ticks` row (10 segments 24 × 4 px, current = accent, others `--gh-border`; markets pages 4 segments). |
| Feed card `.gh-match` (E) | `.gh-card` no padding: headline strip 52 px on `--hue-bg` with a 4 px `--hue` left edge: code chip + pick 15/700 (ellipsis) · probability 22/800 `--hue` · outcome badge; body padding 12: teams row (crest 24, names 14/600, score 17/800 / "VS"); meta row 13 muted: flag + "BRA · Serie A · 03:00 EAT" · status badge right. No pick: strip on `--gh-surface-2`, code chip + "Not predicted" muted, no figure. ~132 px. |
| Section filters | Labelled `.gh-seg` (label 13/600 muted above; 44 px segments; wraps to a second line instead of scrolling). Market categories use one labelled `.gh-select` (13 options). |
| Jump grid `.gh-jump` | 2 columns, 8 px gaps, buttons 72 px: `.gh-ibadge` 24 · title 14/700 (≤ 2 lines) · meta 12 muted. |
| Filter form `.gh-layer` | Full screen above the dock (y 0–732): header 56 px (title "Filters and order" 17/700 + sub page title + ✕ "Close filters"); fieldsets with 17/700 legends, 24 px apart; chips, fields, check rows as A. |
| Rows / facts / bars | `.gh-row` 64 px two-line; `.gh-kv--stack`; `.gh-stat-bar` 64 px; outcome bars 10 px. Airy density: 16 px between blocks. |
| Item page | Title block (item title 20/800 + context line "Head to Head" 13 muted) → facts → notes → one 48 px action button. |

**Per-screen layout (E).**

- **feed** — F1: top bar (logo, theme) · title "Today's Matches" 22/800 + "294 matches · Highest chance" · search 44 ·
  pick-first cards 1–4 (12 px gaps) · dock (Filters, ‹, "Tue, Oct 13", ›) · tab bar. F2: More popover above the dock.
  F3: "Live Matches", count "3 matches · Highest chance", live cards; the Live tab has no day choice, so the dock
  holds only [Filters] (104 px) and the rest of the dock stays empty `--gh-surface-2`. F4: "Results", empty block;
  dock date "Mon, Oct 12". F5: "Live Matches", empty block "0 matches" + "Today"; dock [Filters] only. (Below the
  fold, not drawn: "Showing 30 of 294 matches" + "Load more matches", then the footer.)
- **filters** — S1: form layer scrolled to "Time range" (From/To + "Africa/Kampala"), "Markets" (4 check rows, two
  ticked), "Leagues" (Find Leagues + first rows + "Show all Leagues"); dock = Clear | Apply. S2: form at the top:
  "Date range" fieldset with "Quick date ranges" chips and the invalid From/To + alert; a 44 px `.gh-note--alert`
  strip above the dock repeats the sentence; Apply `aria-disabled`. S3: feed: removable chips under the search,
  "0 matches", empty block + "Clear"; dock (Filters "5", date "Tue, Oct 13 – Thu, Oct 15").
- **picker** — P1: form scrolled to "Leagues · 2 selected" after "Show all Leagues": Find field, selected first,
  full list; dock Clear | Apply. P2: form scrolled to "Markets" with the alert note under "Match result".
- **detail** — D1: top bar · banner · Top pick hero 120 px (`.gh-toppick--hero`: "★ Top pick", "Double chance",
  "RB Bragantino or draw" 20/800, "79%" 34/800 violet, "Estimated probability", badge "Correct", "Odds: — · AI
  prediction") · markets card: header row "All Markets & Odds · 4 of 4 published ›" + 4 rows · dock [Matches] only
  (the start page has no siblings). D2: scrolled: jump grid of the 10 sections with meta, then disclaimer; dock
  unchanged.
  D3: search row open. D4: top bar + empty block; dock [Matches] only.
- **markets** — M1: page title block "All Markets & Odds" (orange) + "4 of 4 published" (no ticks); search; select
  "Market categories" (Popular); 4 rows (72 px, hue edge, outcome badges); footer notes; dock [Match details] only
  (no siblings; markets are its children). M2: select "Cards" → notes.
- **market** — K1: title block (hue badge, "Match result (1X2)", ticks 1/4 in the hue) · hero (pill, "56%" 34/800,
  outcome badge, odds note) · "All outcomes" bars + note · dock [Markets] [—] [Double chance ›]. K2: scrolled: Source
  and timing, Explanation, probabilityDisclosure; same dock.
- **stats** — T1: title block "Team Comparison" (ticks 1/10) · segmented "Results window", "Venue" · teams row · Win
  probability · stat bars · dock [Match details] [—] [Head to Head ›]. T2: item page "Points per game" (context "Team
  Comparison · Last 5 · All venues") · help note · two lists · dock [Back to list] [—] [Goals scored per game ›].
- **h2h** — H1: title block "Head to Head" + "7 meetings" (ticks 2/10) · totals as a three-part bar (RB Bragantino
  wins 3 · Draws 2 · Cruzeiro wins 2, labelled) + trio "Average goals 2.3 · Both teams scored 57% · Over 2.5 goals 43%"
  · segmented "Venue" (wraps) · meeting rows 64 px · note · dock [Match details] [‹ Team Comparison] [Team Form ›].
  H2: item page "Cruzeiro v RB Bragantino" (context "Head to Head") · facts · note · button "Open this match's page" ·
  dock [Back to list] [—] [RB Bragantino v Cruzeiro ›] (next `aria-label` "RB Bragantino v Cruzeiro · Oct 26, 2025").
- **form** — R1: title block "Team Form" (3/10) · segmented Team, Results window, Venue · legend · team blocks · dock
  [Match details] [‹ Head to Head] [Lineups ›].
- **lineups** — L1: title block "Lineups" + "Confirmed" (4/10) · segmented Team · RB line + note + pitch · dock [Match
  details] [‹ Team Form] [Players ›]. L2: lists; same dock.
- **players** — Y1: title block "Players" + "38 players" (5/10) · segmented Team; segmented Position (wraps to 2
  lines) · rows · pager · dock [Match details] [‹ Lineups] [News & Insights ›].
- **news** — N1: title block (6/10) · segmented News type · rows · note · dock [Match details] [‹ Players] [Injuries &
  Suspensions ›] (label ellipsis). N2: item page (title 20/800, context "News & Insights") · pill · facts · bullets ·
  note · button "Read the original report" · dock [Back to list] [‹ Bragantino expect Pitta…] [Cruzeiro name full
  squad… ›].
- **injuries** — I1: title block (7/10) · segmented Team, Status (wraps) · rows · note · dock [Match details] [‹ News &
  Insights] [Match Context ›].
- **player** — Q1: item page "Walace" (context "Players") · identity · facts · note · dock [Back to list] [‹ Lucas
  Silva] [Eduardo ›].
- **context** — C1: title block (8/10) · facts · rest rows · note · dock [Match details] [‹ Injuries & Suspensions]
  [Referee ›]. C2: fixtures, not-available group, note; same dock.
- **referee** — Z1: title block "Referee" + meta "Not available" (9/10) · facts · note (a deliberately short page) ·
  dock [Match details] [‹ Match Context] [Prediction History ›].
- **history** — HI1: title block "Prediction History" + "3 revisions" (10/10) · publications · dock [Match details]
  [‹ Referee] [next disabled]. HI2: cycles + notes.
- **snapshot** — SN1: item page "Publication 2" (context "Prediction History · Historical publication") · revision /
  published · note · cycle row · first market block · dock [Back to list] [‹ Publication 3] [Publication 1 ›]. SN2:
  other blocks + analysis + sources.

---

## 9. Rejected or limited ideas (and why)

- Moving Live and Results out of the bottom tab bar into a segmented control (system D): an IA change that makes
  Live two taps from details; the tab bar stays identical in all five directions.
- One half-sheet per filter chip (system E): several commit surfaces for one draft; replaced by one filter surface per
  direction.
- Back control only at the bottom (system E Context Bar): breaks the top-left convention; E keeps a top-bar back on
  every page start and adds the dock as a second, thumb-zone exit.
- Measure-to-fit section tabs with eight sections behind "More" (a11y C): too little discoverability; D scrolls the
  strip and pins a views list of all views instead (an icon button, so it never reads as a second "More").
- Tapping preview content to open a card (today) and three affordances per card: one header button (+ one "View …"
  button in A only).
- Default-value chips, idle Clear/Apply, the repeated "Market Pick Prob. Result" caption row, the duplicate "Showing …"
  pagination line, the 2 × 2 market tiles: removed in all directions.
- Subtitle "AI picks • Updated daily" (dormant): not used — adds noise without a task.
- 13 px dense rows and 11 px captions (system C/E density): rejected; 12 px floor, 44 px targets everywhere.
- Previous/next stepping across items (flow E): kept only in E, limited to the current filtered page, because it is a
  new affordance (no new content).
- "Load more matches" (dormant capability): used only in E and marked owner opt-in.
- Swipe gestures between sections: not drawn (static samples); E's dock buttons give full parity.
