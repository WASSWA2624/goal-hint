# Inventory: Advanced filters panel (mobile, 375 px)

Screen id: `filters`
Group: filters
Source of truth: code under `src/` (read-only), checked against a live run at 375x812 on `http://localhost:3000/en` (dark and light) on 2026-10-13. All UI strings below are quoted from `src/i18n/messages/en.ts` unless marked otherwise.

> Note on screenshots: the round "N" bubble in the top-left of the reference screenshots is the Next.js dev indicator. It is not part of the product UI.

---

## 1. Identity

| Item | Value |
| --- | --- |
| id | `filters` |
| Title | Advanced filters (visible button label `feed.filters.advanced` = "Advanced filters") |
| Form accessible name | `feed.filters.form` = "Search and filter matches" (`<form aria-label>`, `src/components/match/feed-filters.tsx:528`) |
| Components | `FeedFilters` / `FilterFields` (`src/components/match/feed-filters.tsx:399-581`), `DateRangePicker` (`feed-dates.tsx:15-41`), `FeedTimeFilter` (`feed-time.tsx:9-27`), `OptionPicker` (`filter-parts.tsx:260-289`), `FeedFilterToolbar` + `CompactSelect` sort (`feed-header.tsx:188-217`, `filter-parts.tsx:116-160`), `FeedFilterActions` (`feed-filters.tsx:366-376`), `FeedActiveFilterSummary` (`feed-controls.tsx:40-72`) |
| Mounted by | `FeedSurfaceContent` (`src/app/_components/feed-surface.tsx:123-128`) inside `MatchFeedPage` → `PublicShell` (`match-feed-page.tsx`) |
| State | Applied query = URL (`FeedQuery`, `src/domain/feed-query.ts`). Draft = Redux `state.feed.draft` (markets, leagues, countries, search) plus local React state for date, time and probability text (`feed-filters.tsx:404-411`). Open/closed = local `filtersOpen` in `feed-surface.tsx:91` (not in the URL). |

## 2. How the user reaches it

1. Any feed route: `/en` (Today, relative), `/en?tz=<IANA>` (after the device-zone replace), `/en/predictions/YYYY-MM-DD`, `/en/predictions/YYYY-MM-DD?to=YYYY-MM-DD`, plus the Live (`?status=live`) and Results (`/en/predictions/<yesterday>?status=finished`) tabs. All render the same form.
2. On the phone the filter fields start collapsed. The user taps the **Advanced filters** button at the right of the search bar (`feed-filters.tsx:531-536`). Its accessible name is "Show advanced filters" (closed) or "Hide advanced filters" (open), plus ", {count} active" when applied panel filters exist (for example "Show advanced filters, 5 active").
3. The open state is not URL-addressable. It survives Apply, Clear and Sort navigations, because the same `FeedSurfaceContent` stays mounted. It resets to closed on a full reload or when the browsing zone changes. The provider key includes the zone (`feed-surface.tsx:154`). Observed live: if the user opens the panel during first load, it snaps shut when `/en` is replaced by `/en?tz=Africa%2FKampala` (`feed-surface.tsx:84-88`).
4. Ways to close it: tap the same button again, or press Escape inside the form (`feed-filters.tsx:509-512`; Escape focuses the toggle again). Tapping outside does not close the section (docs/search-filter-controls.md:29). Closing keeps the draft and does not apply it.

There is no separate route, sheet or modal. The panel expands in place between the search row and the Sort/Clear/Apply row.

## 3. Purpose / user task

This panel narrows and orders the predictions feed for the selected dates. The user's task is to pick dates (single day or up to 31 days), an optional kickoff-time window, one or more markets, any number of leagues and countries (each up to 50), and a probability band for the shown pick. They then apply all of it in one step, or clear it back to the defaults. Sorting sits beside Clear and Apply and takes effect immediately.

What the filters mean (keep this wording in any helper text; do not invent new rules):
- **Markets** pick which market families compete for each card's "shown pick". This is the most likely available pick among the selected markets. Probability filtering and probability sorting use that shown pick (`docs/search-filter-controls.md:67-78`).
- **Leagues** and **Countries** combine with AND: `league IN (...) AND country IN (...)` (`src/server/matches/feed-read.ts:56-57`). If the user picks a league from France and the country England, they get zero matches.
- **Probability** bounds are inclusive, unrounded percentages from 0 to 100. Decimals are allowed (`feed-query.ts:121-131`).
- **Odds** stays disabled while `publicPolicy.features.providerOdds` is `false` (`src/domain/public-policy.ts:26`).
- **Status** cannot be edited here. The tab bar sets it (Matches = all, Live = `live`, Results = `finished`), and Clear keeps it (`src/domain/feed-controls.ts:12-16`).

## 4. Ordered content blocks (phone, panel open, top to bottom)

The page chrome around the panel is listed too, so designers can see what it sits between.

### 4.0 Sticky brand bar (outside the form)
- `AppBrandBar` (`src/components/navigation/app-brand-bar.tsx:40-47`): Goal Hint logo link (accessible name `navigation.home` = "Goal Hint home") on the left, theme toggle on the right ("Switch to dark theme" / "Switch to light theme", `src/components/ui/theme-toggle.tsx:32`). The bar is 48 px tall, has a navy header background and a 2 px teal bottom border. On phones it is the only sticky element (`feed-header.tsx:16-25`, `position: sticky; inset-block-start: 8px; z-index: 30`).
- A visually hidden h1: `feedHeading()` = "Today's Matches" / "Tomorrow's Matches" / "Live Matches" / "Results" / "Football Predictions" (`feed-header.tsx:54-61`).
- On phones the quick date presets are **not shown**. `DesktopActions` is `display: none` below 64rem (`feed-header.tsx:49-52, 72-74`).

### 4.1 Search row (always visible, `data-feed-search`)
| Element | Exact label / content | Data / behaviour |
| --- | --- | --- |
| Search field | Placeholder "Search teams or leagues" (`feed.search.placeholder`). Accessible name "Search matches" (`feed.filters.search`) | `type=search`, `name=q`, maxLength 120, font 16 px (no iOS zoom), 44 px tall, leading magnifier icon. Typing edits the draft only. **Enter submits the whole draft** (search plus every filter edit), the same as Apply (`feed-filters.tsx:519-529`). No visible search button. |
| Advanced filters toggle | Visible text "Advanced filters" wraps onto 2 lines ("Advanced / filters") because `max-inline-size: 4rem` (`feed-filters.tsx:94`). Chevron icon. | `aria-expanded`, `aria-controls` = panel id. `title` = "Show advanced filters" / "Hide advanced filters". **Badge**: a small number (10 px, teal, top-right corner) = `panelFilterCount(appliedQuery)` (`feed-query.ts:326-330`): one per selected league, one per selected country, +1 if markets differ from the default "Match result", +1 if probability is not 0–100, +1 if a time window is set (+1 odds, which is always off). Search, dates and sort are not counted. The count reflects the **applied** query, not the draft. Open state: brand fill (`#007F7A` light / `#53D5C6` dark) with `onBrand` text, chevron rotated 180°. Measured 101x44 px at 375 px. |

### 4.2 Filter fields group (`FilterFieldsGroup`, `id=panelId`; hidden with `display:none` when closed, `feed-filters.tsx:129-140, 538-578`)
The group is a bordered surface box with 2px 4px padding and 2 px gaps between rows. Measured at 375 px: top 104 px, height 213 px (with no errors).

1. **Date range** (fieldset, accessible name "Date range" `feed.date.range`). Two equal columns:
   - "From date" (`feed.date.from`) → native `<input type="date">`. On the phone the value shows in the device's date format, for example "13/10/2026".
   - "To date" (`feed.date.to`) → native date input with `min` = From and `max` = From + 30 days.
   - Each label sits inside the bordered box. At 375 px the label is a 2-line 13 px caption ("From / date") to the left of the value (`feed-range-fields.tsx:58-66`). Below a 19.5rem container width it stacks above the value.
   - Error (role="alert", shown under the pair): "Choose a range of up to 31 days, with the end on or after the start." (`feed.date.tooLong`). Both inputs get `aria-invalid` and a red border (`outcome.incorrect.border`).
   - Initial values: the applied resolved range. Defaults: today–today (Matches/Live tabs), yesterday–yesterday (Results tab).
2. **Time range** (fieldset, accessible name "Time range" `feed.time.range`). Two columns:
   - "From time" (`feed.time.from`) and "To time" (`feed.time.to`): native `<input type="time" step=60>`. Empty shows "--:--". To has `min` = From. The `title` of each input is the IANA zone (for example "Africa/Kampala"). The zone is not visible anywhere else.
   - Error (role="alert"): "Enter both times, with To time at or after From time." (`feed.time.invalid`).
   - Both empty = no time filter. Equal values = one kickoff minute.
3. **Markets** picker trigger. Full-width row, label "Markets" on the left, value on the right, then a chevron. The value is "Match result" for one selection, otherwise "{count} selected" (`feed.filters.selectedCount`). Accessible name and title: "Markets: Match result". Opens a **non-searchable** checklist (see 4.5).
4. **Leagues** picker trigger: "Leagues" … "All leagues" (`feed.filters.allLeagues`) when empty, the league name when one is selected, "{count} selected" when several are. Accessible name "Leagues: All leagues". Opens a searchable checklist.
5. **Countries** picker trigger: "Countries" … "Any" (`feed.filters.any`) when empty. With one selection: flag icon plus country name (for example a flag and "England"). Otherwise "{count} selected". Accessible name "Countries: Any". Opens a searchable checklist.
   - Each trigger is a `PickerSummary` button, 30 px tall (`min-block-size: 1.875rem`, `feed-filters.tsx:152`), 14 px text, label in 600 weight, value in muted text.
6. **Probability** row (`role=group`, accessible name "Probability" `feed.filters.probabilityLabel`):
   - Bold visible prefix "Prob." (`match.columns.probabilityShort`).
   - Box "Min" (`feed.filters.min`) + text input (default "0"). Accessible name "Minimum Probability" (`feed.filters.minimum`).
   - "–" separator.
   - Box "Max" (`feed.filters.max`) + text input (default "100"). Accessible name "Maximum Probability".
   - Suffix "%".
   - Inputs: `type=text inputMode=decimal`. Keystrokes are limited to digits and one dot (`feed-filters.tsx:389`). Inputs are 28 px tall.
   - Validation error (plain `<p>`, **not** role=alert, `feed-filters.tsx:577`): "Enter values from 0 to 100. Min must be less than or equal to Max." (`feed.filters.probabilityInvalid`). Inputs get `aria-invalid` and a red border (`accent.red.text`).
   - Desktop-only help text that **phones do not show**: "Applies to each match's shown pick: the most likely pick among the selected markets." (`feed.filters.probabilityHelp`; title and visually hidden text on the desktop field only, `feed-filters.tsx:570-573`).
7. **Odds note** (muted 13 px text): "Odds unavailable" (`feed.filters.oddsUnavailable`). The explanation "Odds filtering starts once bookmaker odds are imported." (`feed.filters.oddsPending`) appears only in `title` and visually hidden text (`feed-filters.tsx:553`). There is no odds control on the phone. On desktop the odds field is disabled and shows "1.01 – 20.00".

### 4.3 Sort and action row (`FeedFilterToolbar` + `FeedFilterActions`; always visible, below the fields and inside the form, `feed-filters.tsx:579`)
| Element | Exact label | Behaviour |
| --- | --- | --- |
| Sort select (`PhoneSort` / `CompactSelect`) | Accessible name "Sort by" (`feed.sort.label`). The face shows the current option. Options, in this order: "Highest chance" (`probability-desc`), "Lowest chance" (`probability-asc`), "Earliest first" (`kickoff-asc`, default), "Latest first" (`kickoff-desc`) (`feed.sort.compact.*`) | Native select (the iOS/Android picker). **Applies immediately** on change, with navigation and page reset to 1 (`feed-header.tsx:193`). It does not wait for Apply. 208x40 px. |
| Clear | Reset icon + "Clear" (`feed.filters.clearAll`) | `type=reset`. **Applies immediately**: it navigates to `resetFeedFilters(query)` (`feed-filters.tsx:513-518`, `feed-controls.ts:12-16`). That clears search, leagues, countries, time, probability (0–100), odds and picks, sets markets to "Match result" and sort to "Earliest first", and goes to page 1. It **keeps** dates, status (tab), browsing zone and page size. There is no confirmation. 69x40 px. |
| Apply | Filter icon + "Apply" (`feed.filters.apply`). Accessible name "Apply filters" (`feed.filters.applyPlain`) | `type=submit`. Disabled (opacity 0.5) while any date, time or probability draft is invalid or incomplete. Applies the complete draft (search, dates, time, markets, leagues, countries, probability), resets page to 1 and navigates with `router.push(href, {scroll:false})` (`feed-surface.tsx:108-116`). The panel **stays open** afterwards. Brand fill. 74x40 px. |
| (< 350 px wide) | Icons in Clear and Apply are hidden (`feed-filters.tsx:361`). | |

### 4.4 Applied-filter summary (`FeedActiveFilterSummary`, a list with accessible name "Applied filters" `feed.filters.activeSummary`, below the action row)
These are non-interactive chips (`<li>` items with a `title`), 13 px muted text on `brandSoft`. They describe the **applied** query, never the draft. Order:
1. Date: one day "Tue, Oct 13"; a range "Tue, Oct 13 – Thu, Oct 15" (title gives full dates, for example "Tuesday, October 13, 2026 – Thursday, October 15, 2026").
2. Markets: one → its name ("Match result"); several → "Markets: 2 selected" (title "Match result, Total goals (2.5)").
3. Leagues: "All leagues" / the league name / "Leagues: 3 selected".
4. Countries: "Any country" (`feed.filters.anyCountry`) / the country name / "Countries: 2 selected".
5. Only when set: time "12:00–20:00" (title = zone).
6. Only when not 0–100: "50% - 100%" (`feed.filters.percentRange`).
7. Only when odds are set (never while odds are off): "Odds: …".
8. Only when searching: "Search: united" (`feed.search.submit` + query).

Then comes the result count, right-aligned, 11 px muted: "294 matches" / "1 match" / "0 matches" (`feed.results.count`, `feed-header.tsx:220-232`). It is hidden when no successful projection exists. The h2 "Predicted Matches" (`feed.results.title`) is visually hidden on phones.

Then, only when the selected range ends after the 7-day prediction window, this note appears: "Predictions become available within seven days of the match." (`feed.sevenDayAvailability`, `feed-surface.tsx:130`).

### 4.5 Nested pickers (checklist popovers, `OptionPicker`, `filter-parts.tsx:260-289`)
They open from the Markets, Leagues and Countries triggers. Only one is usually open, because tapping elsewhere closes it (`useOutsideDismiss`, click-capture, `src/components/ui/use-outside-dismiss.ts`). Escape closes it and returns focus to its trigger. Closing a checklist does not collapse the panel and does not apply anything.

| Part | Content |
| --- | --- |
| Container | Absolute popover under the trigger (`top: 100% + 6px`, right-aligned, width `min(20rem, 100vw - 32px)` capped at 100% of the field, `z-index: 15`). `role=group`, accessible name = trigger name (for example "Leagues: 2 selected"). Square corners and no shadow on phones. It **overlaps** the rows below it (Countries, Prob., action row, summary, first card). |
| Search box (Leagues, Countries only) | Placeholder and accessible name "Find Leagues" / "Find Countries" (`feed.filters.findOption`). `autoFocus`, so the phone keyboard opens at once. 16 px text. Filters by label plus the hidden detail (league country). |
| List | Up to 16rem (256 px) tall with internal scroll. Each row is a `<label>` with a checkbox, an optional logo or flag (18 px), the name, and a right-aligned muted fixture count (`aria-hidden`). Rows are 32 px tall (2rem), 14 px text. Checked rows get a `brandSoft` background and teal text. Selected rows **stay in place**; they do not move to the top. |
| Markets options (4, fixed, policy order) | "Match result", "Double chance", "Total goals (2.5)", "Both teams to score" (`market.family.*`). No counts, no logos. Default checked: Match result. Unticking the **last** checked market does nothing and gives no message on the phone (`feed-filters.tsx:41-44, 482-485`). The desktop hint "Keep at least one market selected." (`feed.filters.oneMarket`) appears only as a desktop chip title. |
| Leagues options | Every league in the selected date cohort, up to 1,000. Sorted by fixture count, then name. Label = league name (fallback "Competition unavailable", `match.competitionUnknown`). Detail = country, **visually hidden** (screen readers hear ", England"), so same-named leagues look the same except for the logo (`filter-parts.tsx:283`). Remote logo. Count = fixtures. Maximum 50 selected; a 51st tap does nothing silently (`feed-filters.tsx:37-38`). |
| Countries options | The distinct countries of those leagues, with summed counts and the same sort. A bundled flag SVG is shown when one is mapped; "World" has no flag. Maximum 50, silent no-op beyond that. The list is **not** narrowed by the selected leagues. |
| Selections missing from a refreshed list | Shown as extra rows using the raw value as the label (country rows keep their flag), so they can still be removed (`feed-filters.tsx:451-453`). |
| Empty | "No options for these dates" (`feed.filters.noOptions`). Shown when the cohort has no leagues or the Find text matches nothing. |

## 5. Every control and where it leads

| Control | Result / destination |
| --- | --- |
| Advanced filters (toggle) | Shows or hides the filter fields group in place. No navigation, no URL change. Escape inside the form does the same as hide. |
| Search field + Enter | Submits the form, which applies the whole draft (same as Apply). Nothing happens if the draft is invalid. With JavaScript off it is a GET to `/en` with `q` plus hidden inputs for every applied parameter (`feed-filters.tsx:523`). |
| From date / To date | Edit local draft text only. An invalid pair shows the alert and disables Apply. |
| From time / To time | Edit local draft only. Invalid → alert, Apply disabled. |
| Markets / Leagues / Countries trigger | Opens or closes its checklist popover (4.5). |
| Checklist checkbox | Toggles the value in the Redux draft. The trigger summary updates at once; the summary chips and badge do not change until Apply. |
| Find Leagues / Find Countries | Filters the visible rows (client-side). |
| Min / Max probability | Edit local draft. Invalid → error text, Apply disabled. |
| Sort select | Navigates at once to the same URL with `sort`/`dir` changed and page 1 (for example `/en?sort=probability` for "Highest chance"). **Unsent filter edits are discarded**: the `FilterFields` key changes, so local inputs remount, and `queryApplied` overwrites the draft (`feed-filters.tsx:401, 405`; `src/state/feed.ts:42-47`). Verified live: a Countries draft of "England" went back to the applied "2 selected" after a sort change. |
| Clear | Navigates at once to the reset URL (see 4.3). Panel stays open. |
| Apply | Navigates to `feedQueryHref(draft)`. The list dims (opacity 0.6, `aria-busy`) and the polite status announces "Updating matches…" (`feed.filters.loading`). The panel stays open and controls stay usable. Example result URL: `/en?when=next-3-days&timeFrom=12:00&timeTo=20:00&tz=Africa%2FKampala&q=united&country=England,Scotland&market=match-result,total-goals&prob=50-100&sort=probability`. A dated range becomes `/en/predictions/2026-10-13?to=2026-10-15&…`. |
| Browser Back | Goes back to the previous applied URL (each Apply, Clear or Sort is a history entry). The panel open state is not restored from history. |
| Tab bar (Matches / Live / Results / Slip builder / Help / More) | Leaves to that section. Matches, Live and Results reload the feed with default filters for that tab. |
| Theme toggle, logo | Switches theme / goes to `/en` home. |

## 6. States

| State | What is shown |
| --- | --- |
| Collapsed (default) | Search row, then the Sort/Clear/Apply row, summary chips, count and cards. Badge only when panel filters are applied. Measured at 375x812: search 56–100 px, action row 104–144, chips 152–176, count 184, first card at 205 px. |
| Expanded, clean | As in section 4. Action row moves to 321–361 px, chips to 369 px, first card to 422 px (the fields add +217 px). |
| Expanded, picker open | Popover covers the rows below the trigger (see screenshots). The Leagues popover reaches about the 2nd card. On a real phone the auto-focused Find box also brings up the on-screen keyboard. |
| Draft differs from applied | Trigger values and inputs show the draft. Summary chips, badge and results still show the applied values. Nothing marks the draft as unsaved. |
| Invalid date | Red borders on both date boxes, alert line under them, Apply disabled. |
| Invalid time (one end only, or To before From) | Red borders on both, alert line, Apply disabled. |
| Invalid probability (for example Min 80, Max 50, or an empty field) | Red borders, error paragraph under the Odds note, Apply disabled. |
| All three invalid | Three red messages in the panel. The panel grows by about 50 px (see the live capture). |
| Panel collapsed while the draft is invalid | Apply stays disabled, but the error messages are **hidden** inside the collapsed group. Enter in search silently does nothing. |
| Max selections reached (50 leagues or 50 countries) | Further ticks are ignored silently. |
| Last market | The checkbox cannot be unticked. Silent. |
| Applying / loading | Results at opacity 0.6, `aria-busy=true`. Status "Updating matches…". Also shown while the first-load device-zone replace runs. |
| Applied with filters | Badge shows N; chips list the filters (for example "Tue, Oct 13 – Thu, Oct 15 · Markets: 2 selected · All leagues · Countries: 2 selected · 12:00–20:00 · 50% - 100% · Search: united"). |
| No results | Count "0 matches", then EmptyState "No matches for these filters" with "Nothing matches these filters in the available data." (`feed.state.no-filter-matches`, `feed.noFilterMatches`). |
| Other server states (below the action row) | "No fixtures confirmed" / "No fixtures are recorded for these dates.", "Fixture data unavailable" / "Fixture coverage is incomplete or unavailable. Try again later.", "Match page unavailable" / "This page is beyond the available matches. Use the previous page link." "Prediction data unavailable" shows cards with no EmptyState. |
| Read failure | EmptyState "Matches temporarily unavailable" / "Matches are temporarily unavailable. Try again shortly." with a "Try again" button. Rate-limited: "Search temporarily busy" / "Search is busy. Try again shortly." If an earlier result exists: "Showing the previous successful result for the dates and filters below." plus the line "Applied: Match result · All match statuses · Kickoff (Earliest) · …" (`FeedAppliedSummary`, `feed-controls.tsx:75-88`), then the retained cards. |
| Range beyond the 7-day window | Note "Predictions become available within seven days of the match." |
| Live tab | Same panel. Status `live` (not editable). The heading (hidden) reads "Live Matches". Default date: today. |
| Results tab | Same panel. Status `finished`. Default date: yesterday. Clear keeps `finished` and the dates. |
| Dated route | `/en/predictions/YYYY-MM-DD[?to=…]`: dates are explicit, not relative. |
| Invalid URL parameters (for example `odds=` while odds are off, more than 31 days, unknown key) | 404 page (`feed-route.tsx:32`). |
| No JavaScript | The phone fields group is `display:none` and the toggle needs JS. Date, time, probability and picker inputs have no `name`. Only search plus hidden applied parameters submit, by GET. Sort, Clear and Apply rely on JS (Apply is a submit button, so it submits the search form). |
| Light / dark theme | All colours come from theme tokens (section 9). |
| Narrow (< 350 px) | Clear and Apply drop their icons. Range labels stack when the container is under 19.5rem. |

## 7. Current phone layout (375x812, panel open)

```
┌───────────────────────────────────────────┐ 0
│ [logo Goal Hint]                  [☀/☾]   │ sticky brand bar (48px, navy, teal underline)
├───────────────────────────────────────────┤
│ [🔍 Search teams or leagues   ] [Advanced▲]│ 56–100  search 252w + toggle 101w (filled when open, badge top-right)
├───────────────────────────────────────────┤
│┌From ─13/10/2026 📅┐┌To ── 13/10/2026 📅┐│ 107  date pair (30px boxes, 2-line labels)
││date               ││date              ││
│└───────────────────┘└──────────────────┘│
│┌From ─ --:--    🕒┐┌To ──  --:--    🕒┐│ 139  time pair
│ Markets                  Match result  ⌄ │ 171  picker trigger (30px)
│ Leagues                   All leagues  ⌄ │ 203
│ Countries                         Any  ⌄ │ 235
│ Prob. [Min 0        ] – [Max 100      ] %│ 267
│ Odds unavailable                          │
├───────────────────────────────────────────┤ 317
│ [Earliest first        ⌄] [⟲ Clear][⏷ Apply]│ 321–361 action row (Apply brand-filled)
│ (Tue, Oct 13)(Match result)(All leagues)(Any country) │ 369 applied chips (wrap)
│                               294 matches │ count
│ ┌ match card … ┐                          │ 422 first card
│ …                                         │
╞═══════════════════════════════════════════╡ 769
│ Matches  Live  Results  Slip builder  Help  More │ fixed tab bar (43px)
└───────────────────────────────────────────┘ 812
```

- Body gutters are 8 px (`compact` shell). Cards and form are 359 px wide.
- Only the brand bar is sticky. The search, filters and action row scroll away with the page, so the user must scroll back to the top to change filters.
- The bottom tab bar is fixed (`shell-styles.tsx:348-357`, z-index 20). It sits above picker popovers (z-index 15), so a picker opened low on the screen is clipped by it.
- Corners are square on phones throughout (`border-radius: 0`). Borders are 1 px `controlBorder`.
- Type sizes: search 16 px; toggle 13 px; range labels 13 px and values 14 px; picker triggers 14 px; Prob. 14 px; odds note 13 px; action buttons 14 px; summary chips 13 px; count 11 px; badge 10 px.
- Reference captures: `reference/02-feed-filters-open.jpg` (dark, open), `reference/01-feed-top.jpg` (collapsed). The template `reference/00-template-feed-mobile.webp` shows the original concept: always-visible chip rows "Mkt / Lg / Ctry" with +N overflow, Odds and Prob dropdowns, a Reset pill, and "4 Matches" with "Sort: Probability". Its chip-row idea lives on today only in the desktop layout (`multiField`, `feed-filters.tsx:469-499`).

## 8. Friction points against the 5 criteria (with evidence)

### Short flows
1. **Changing the day is a 5+ step flow on phones.** Steps: open Advanced filters → From date → To date → Apply (and From must not pass To, or the alert blocks Apply). The quick presets "Today", "Next 3 days", "Next 7 days", "Next 30 days" and the domain's "Tomorrow", plus the "Previous day"/"Next day" strings, exist only on desktop (`feed-header.tsx:49-52, 72-74`; `feed-dates.tsx:66-76`; `feed-date-navigation.ts`). They already exist, so surfacing them on the phone is within scope.
2. **The panel stays open after Apply or Clear.** Results then begin about 422 px down a 812 px screen, with the tab bar covering the bottom 43 px, so the user must scroll or collapse to see the outcome (`feed-surface.tsx:91`; open state is outside the remounted `FilterFields`).
3. **Every multi-select needs 3 taps or more**: open the panel, open the picker, tick, close the picker, Apply. Nothing on the phone is one tap away. The desktop layout shows selected chips that remove themselves with a link (`FilterChip`, `filter-parts.tsx:82-89`; desktop `multiField`). The phone summary chips are not interactive (`feed-controls.tsx:69-71`).
4. **Filters are not reachable once the list scrolls**, because only the brand bar is sticky (`feed-header.tsx:16-25`).

### Simplicity
5. **Three different commit models in one row.** Pickers, dates, time, probability and search wait for Apply. Sort applies immediately. Clear applies immediately and also resets sort and search (`feed-header.tsx:193`; `feed-filters.tsx:513-518`; `feed-controls.ts:12-16`). A sort change also **throws away unsent edits** (`feed-filters.tsx:401, 405`; `state/feed.ts:42-47`; verified live).
6. **Draft and applied values look the same.** Pickers show the draft and chips show the applied query. Nothing shows "unsaved changes", and the badge counts applied values only (`feed-filters.tsx:506`).
7. **The badge mixes units.** Leagues and countries count once per value; markets, probability and time count once per filter; search and dates are excluded (`feed-query.ts:326-330`). Two countries plus a probability band shows "3".
8. **"Clear" sounds narrower than it is.** It also resets sort to "Earliest first" and clears search, with no confirmation (`feed-controls.ts:12-16`).
9. **Dense, small text.** Eight inputs and a note fit in 213 px using 2 px gaps, 11–14 px text and 2-line field labels ("From / date") (`feed-range-fields.tsx:36-41, 58-66`; `feed-filters.tsx:129-140`).

### Accessibility
10. **Touch targets are below 44 px.** Picker triggers are 30 px (`feed-filters.tsx:152`), date/time boxes 30 px (`feed-range-fields.tsx:27`), probability inputs 28 px (`feed-filters.tsx:203, 215`), checklist rows 32 px (`feed-filters.tsx:162`). They meet the WCAG 2.2 AA 24 px minimum but not the 44 px guidance. The badge is 10 px text (`feed-filters.tsx:105`).
11. **Error announcements are inconsistent.** Date and time errors use `role="alert"` (`feed-dates.tsx:38`, `feed-time.tsx:24`). The probability error is a plain `<p>` (`feed-filters.tsx:577`). Error reds differ too: `outcome.incorrect.*` vs `accent.red.text` (`feed-range-fields.tsx:34, 76`; `feed-filters.tsx:212, 223`).
12. **Disabled Apply gives no reason.** A `disabled` button leaves the tab order (`feed-filters.tsx:372`). When the panel is collapsed, the errors that explain it are hidden (`feed-filters.tsx:132`).
13. **Important information lives only in `title` or screen-reader text.** On touch devices this is invisible: the kickoff time zone (`feed-time.tsx:18, 21` `title={zone}`), the odds explanation (`feed-filters.tsx:553`), the league's country (`filter-parts.tsx:283`), and the desktop-only probability help (`feed-filters.tsx:570-573`).
14. **Silent no-ops.** Unticking the last market (`feed-filters.tsx:41-44`) and ticking a 51st league or country (`feed-filters.tsx:37-38`) do nothing, and no message is shown on the phone.
15. **The picker search auto-focuses** (`filter-parts.tsx:278`). On phones this opens the keyboard at once and hides most of the list. The popover is absolute and opens downward only (`filter-parts.tsx:192-206`), so it overlaps other fields and can fall under the fixed tab bar (z-index 15 vs 20, `shell-styles.tsx:352`).
16. **Without JavaScript the phone filters cannot be used.** The group is `display:none` behind a JS toggle, and the inputs have no `name` (`feed-filters.tsx:132, 531`; `feed-dates.tsx:32-36`). Only search works through the GET fallback (`feed-filters.tsx:508, 523`).

### Uniformity
17. **Two multi-select patterns in one app.** The feed uses `OptionPicker`: a JS button with an absolute popover, 30 px trigger, 16rem list (`filter-parts.tsx:260-289`). The Slip builder uses the native `<details>` `ChoicePicker` (works without JS, `max-height: min(20rem, 60dvh)`, "automatic" option) and `CriteriaAccordion` sections, with a 48 px summary showing a bold title and small summary text (`src/components/ui/choice-picker.tsx:10-72`, `src/components/ui/criteria-accordion.tsx:8-81`).
18. **Date formats differ.** Native date inputs show the device format ("13/10/2026"), while chips and cards use "Tue, Oct 13" (`feed-controls.tsx:52-55`).
19. **Labels differ.** The probability field reads "Prob." on the phone but "Probability" on desktop and in accessible names. Market names are long in filters ("Match result") but short codes on cards ("1X2", `market.code.*`).
20. **Corner styles differ.** Phone controls are square, while the desktop preset pills are rounded at 6 px (`feed-dates.tsx:55`) and the template is rounded.

### Easy navigation
21. **Panel state is not in the URL or history.** Back restores filters but not the open state, and a zone change (first load) collapses it (`feed-surface.tsx:84-91, 154`).
22. **Nothing in the panel shows the active tab.** Status (Live/Results) silently restricts the panel, and only the tab bar highlight shows it.

## 9. Must-keep constraints

- **URL is the single source of truth for applied state.** Every applied change navigates to `feedQueryHref(...)` with canonical parameters (`when`, `date`/route date, `to`, `from`, `timeFrom`, `timeTo`, `tz`, `q`, `league`, `country`, `status`, `market`, `prob`, `odds` (only when enabled), `picks`, `sort`, `dir`, `page`, `pageSize`). Defaults are omitted and lists are sorted. Applying resets page to 1. Shareable and Back/Forward-safe.
- **Explicit Apply for the draft.** No automatic application, no per-keystroke requests and **no live count preview** (`docs/search-filter-controls.md:8-12, 112-113`). Do not add a "Show N matches" preview; it would be a new feature.
- Enter in the search field submits the full draft, the same as Apply.
- **Clear semantics as implemented**: keeps dates, status and zone; resets everything else, including sort. A design may relabel it only with existing strings.
- **At least one market** always selected. Leagues and countries max 50 each. Date range max 31 days, end on or after start. Time: both ends or none, To ≥ From. Probability 0–100 with decimals, Min ≤ Max.
- **Odds stay disabled** and the "Odds unavailable" note must remain while `providerOdds` is false. The explanation "Odds filtering starts once bookmaker odds are imported." must stay available.
- Disclaimer and notes that must remain: "Predictions become available within seven days of the match." (when applicable); "Showing the previous successful result for the dates and filters below." plus the Applied summary on failure; the EmptyState texts above.
- **Accessible names and ARIA**: form "Search and filter matches"; toggle `aria-expanded` + `aria-controls`, name "Show advanced filters"/"Hide advanced filters" (+ ", N active"); fieldsets "Date range" and "Time range"; group "Probability"; inputs "Minimum Probability"/"Maximum Probability"; pickers "Markets: …", "Leagues: …", "Countries: …" with matching popover group names; "Find Leagues"/"Find Countries"; select "Sort by"; Apply "Apply filters"; list "Applied filters"; polite status region announcing "Updating matches…" / "{count} matches" / failures (`feed-surface.tsx:118-131`). Escape closes pickers (focus returns to the trigger) and the panel (focus returns to the toggle). Visible 3 px focus ring (`theme.color.focus`).
- **No-JS fallback**: keep the `<form method="get" action="/en…">` with hidden applied parameters and `name="q"`. On desktop, selected values are `<a href>` chip links (`FilterChip`) that work without JS; any phone chip that removes a value should reuse that link pattern.
- **Contrast 4.5:1** for all text. Tokens: light text `#102A3A`, muted `#486071`, surface `#FFFFFF`, surfaceMuted `#EAF0F2`, brandSoft `#E2F3F1`, brand/action `#007F7A` with white; dark text `#F2F7F8`, muted `#B1BEC8`, surface `#1E2932`, brand `#53D5C6` with `#102A3A`; controlBorder `#7C8A95` / `#69808F` (3:1 boundary); focus `#007F7A` / `#53D5C6`; errors `#9C2328` / `#FF9C9C`. Filter accents (desktop): leagues blue, countries orange, markets violet, odds amber, probability pink (`theme.color.accent.*`). Market hues on cards: match-result emerald, double-chance violet, total-goals blue, BTTS orange (`theme.color.market.*`).
- 16 px font on text inputs and selects (no iOS focus zoom). `inputMode=decimal` for probability.
- Country flags come only from bundled `/flags/*.svg`; league logos only from approved remote URLs. A failed image disappears and leaves the name.
- Search stays visible in both states; one body search bar on every device (no shell search on feed pages).
- Status is not a filter control; tabs own it.

## 10. Realistic sample data for mockups (existing fields only)

**Collapsed, nothing applied (Matches tab, Tue Oct 13 2026):** search empty; toggle "Advanced filters" with no badge; sort "Earliest first"; chips "Tue, Oct 13", "Match result", "All leagues", "Any country"; count "294 matches".

**Expanded, populated draft (to show every field):**
- From date 13/10/2026 · To date 15/10/2026
- From time 12:00 · To time 20:00 (zone Africa/Kampala)
- Markets: "2 selected" (Match result ✓, Total goals (2.5) ✓, Double chance ☐, Both teams to score ☐)
- Leagues: "All leagues"
- Countries: "2 selected" (England ✓ with flag, Scotland ✓ with flag)
- Prob. Min 50 – Max 100 %
- Odds unavailable
- Sort: "Highest chance"; Clear; Apply
- Badge "5"; chips "Tue, Oct 13 – Thu, Oct 15", "Markets: 2 selected", "All leagues", "Countries: 2 selected", "12:00–20:00", "50% - 100%", "Search: united"; count "0 matches" → EmptyState "No matches for these filters". Without the search, use a plausible count such as "18 matches".

**Leagues checklist (observed live, Oct 13 cohort):** Find Leagues; Challenge Cup 20; World Cup - Women - Qualification Europe 16; Friendlies Women 14; Olympics Women - Qualification CAF 13 ✓; Ligue 2 12 ✓; National League Cup 12; Non League Premier - Northern 11; … (trigger "Leagues: 2 selected").

**Countries checklist (observed live):** Find Countries; World 75 (no flag); England 64; Scotland 21; Algeria 15; Germany 14; Brazil 11; Portugal 8; Argentina 7; … 48 countries in total.

**Markets checklist:** Match result ✓; Double chance; Total goals (2.5); Both teams to score.

**Invalid example:** From date 15/10/2026, To date 13/10/2026 → "Choose a range of up to 31 days, with the end on or after the start."; From time 18:00, To time empty → "Enter both times, with To time at or after From time."; Min 80, Max 50 → "Enter values from 0 to 100. Min must be less than or equal to Max."; Apply dimmed.

**Results tab example:** chips "Mon, Oct 12", "Match result", "All leagues", "Any country"; status finished (not shown in the panel).

## 11. Shared components seen (file references)

- `AppBrandBar`: phone brand bar with logo and `ThemeToggle` (`src/components/navigation/app-brand-bar.tsx`, `src/components/ui/theme-toggle.tsx`).
- `TabBar` / `ResponsiveNavigation`: fixed bottom tabs Matches, Live, Results, Slip builder, Help, More (`src/components/navigation/shell-styles.tsx:348-368`, `src/components/navigation/responsive-navigation.tsx`, labels `navigation.*`).
- `SearchField` + `FilterToggle` (`src/components/match/feed-filters.tsx:61-127`).
- `OptionPicker` / `PickerSummary` / `PickerPanel` / `PickerSearch` / `PickerList` (`src/components/match/filter-parts.tsx:162-289`), with phone overrides in `PhonePicker` (`feed-filters.tsx:150-164`).
- `CompactSelect`: native select under a styled face (`filter-parts.tsx:116-160`), used for `PhoneSort` (`feed-header.tsx:165-181`).
- `RangeFieldset` / `RangeFields` / `RangeHelp` (`src/components/match/feed-range-fields.tsx`), used by `DateRangePicker` (`feed-dates.tsx`) and `FeedTimeFilter` (`feed-time.tsx`).
- `FeedFilterActions`: Clear (`OutlineButton`) and Apply (`ApplyButton`) (`feed-filters.tsx:226-376`).
- `FeedActiveFilterSummary` (applied chips) and `FeedAppliedSummary` (failure line) (`src/components/match/feed-controls.tsx`).
- `FilterChip` / `ChipText`: link chips, desktop only (`filter-parts.tsx:38-89`).
- `DatePresets`: rounded preset links, desktop only (`feed-dates.tsx:43-76`).
- `ResultsToolbar`: count (`feed-header.tsx:220-232`). `EmptyState` (`src/components/ui/feedback.tsx:170`). `ButtonLink` "Try again" (`src/components/ui/controls.tsx`).
- Shared behaviour: `useOutsideDismiss` (`src/components/ui/use-outside-dismiss.ts`), `focusRing` / `controlFeedback` / `plainClick` (`filter-parts.tsx:16-35`), `VisuallyHidden`.
- Related patterns used elsewhere (for uniformity): `ChoicePicker` (`src/components/ui/choice-picker.tsx`) and `CriteriaAccordion` (`src/components/ui/criteria-accordion.tsx`) in the Slip builder; `Disclosure` (`src/components/ui/disclosure.tsx`) on match details.
