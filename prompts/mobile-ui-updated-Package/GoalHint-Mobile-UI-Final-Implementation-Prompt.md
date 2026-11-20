# GoalHint — Mobile Matches UI: Final Revision Prompt

## Purpose
Implement the attached *approved* GoalHint mobile UI references in the existing application. Use **GoalHint-Matches-Mobile-Updated.png** as the final Matches screen reference, **GoalHint-Filters-Mobile-Unchanged.png** as the approved Filters dialog, and **GoalHint-Markets-Mobile-Unchanged.png** as the approved Markets dialog.

This is a **targeted visual/interaction revision**, not a redesign or a rewrite. Keep existing backend logic, data fetching, routing, pricing/access checks, SEO, analytics, responsive desktop behavior, filters, accessibility, and public APIs unchanged unless a fix is needed to meet the explicit requirements below. Do not hardcode the example match data or statistics shown in the screenshot.

## Non-negotiable scope
- **Filters dialog: approved; do not redesign, restyle, reorder fields, simplify further, or change its behavior**. Keep it exactly as the attached reference and existing working implementation.
- **Markets dialog: approved; do not redesign, restyle, reorder markets, truncate goal ranges, or change its behavior**. Keep it exactly as the attached reference and existing working implementation. Market selection must still come from the supported/applicable bookmaker or data provider markets rather than fabricated outcomes.
- **Matches page:** keep **everything** as shown in the approved screenshot except the explicitly requested changes to the grouping of the matches list, presentation of status labels, and date navigation behavior.

## Matches page: exact visual adjustments
### 1. Make the list header and match rows one continuous list
- The header containing **Matches**, the selected date or date range (example `19–20–11–2026`), and the match count/range (example `1–50 of 121`) must be part of the same continuous match-list container as the rows beneath it.
- No floating header card detached by a visible gap; avoid stacked individual rounded cards for each match.
- Put successive match rows immediately below one another with **thin horizontal dividers** between them. A subtle outer border on the entire list is acceptable; no outlines or rounded corners around each row.
- Keep the header’s existing pale-blue treatment, wording, content hierarchy, and information order. Use the application's existing theme tokens and existing typography.

### 2. Preserve match content and row layout exactly
- **Do not change** the order, arrangement, positions, internal spacing, content, or logic of the existing match information: league title and league icon/flag; date and local kickoff time; home and away team names/logos; scores; match status; odds; market; prediction; probability; API/provider label.
- Preserve column alignment. Keep the league row left-aligned, the date/time block beside the teams, the score block separated from odds, and predictions/probabilities to the right as in the attached Matches screenshot.
- Do not reflow scores into the odds column or change visible information to make room for new decoration.
- Preserve responsive behavior and support long team/league names without overlapping or horizontal overflow; gracefully truncate or wrap only when needed by actual device width.
- Respect real data: do not invent odds, markets, predictions, scores, dates, win probabilities, or match status.

### 3. Text-only status labels, no badge backgrounds
- Show **Won FT**, **HT**, **Live 60:00**, **Upcoming**, **Lost FT**, and all other applicable states as **colored status text only**.
- Remove the colored pill/rectangle backgrounds, border strokes, shadows, and badge fill. No status chip background; status should sit naturally on the row background.
- Keep the status text in the same top-right location and retain the existing semantic colors: won = green, half-time = amber/orange, live = red, upcoming = blue, lost = red. Match the existing UI color palette; do not make everything blue.
- Use real, consistent statuses from the data. `Live 60:00` is only a screenshot example; show the actual elapsed time returned by the application.

### 4. Date strip controls: scroll does not select
- The left and right chevron controls **only scroll the row of visible dates** backward or forward. They must **not** silently select a new date, change the active date/date range, trigger data filters, or re-query matches as if a date were selected.
- **Only clicking or tapping a specific date chip selects that date.** After selection, update the active selection, accessible state, query/filter state, and results using the existing app logic.
- The calendar icon opens the date picker and permits explicit date/range selection through the existing interface. Applying a date/range in the picker updates selection intentionally.
- Visually distinguish **Today** as a label from **selected** as a state. Existing multi-date range selection must remain accurate in the summary; do not show a false single-date filter when the selected range spans multiple dates.
- The moderate spacing between the right chevron and the calendar icon may remain. Do not add unrelated controls merely to fill the gap.
- Make scrolling and selecting keyboard-accessible, with correct aria labels and visible focus styles.

## Preserve the approved design system
- Retain the exact visual hierarchy of the header/logo, action icons, search field, Filters button and active count, horizontal date strip, Performance section, statistic tiles, match list text, and bottom navigation.
- Match the screenshot’s **balanced light theme**, blue as a controlled brand accent, neutral light surfaces, and color-coded performance/status indicators. Avoid excessive blue, unnecessary borders, dense stacks of tiny panels, or monotonous accents.
- Support existing light/dark theme tokens (if present); avoid hard-coded one-off colors that break the established palette.
- No visual/content/behavior changes to the approved Filters and Markets dialogs. Preserve the restored Probability and Odds section headings, floating Min/Max labels, date and time inputs, and complete market choices in the existing implementation.

## Engineering requirements
- Locate and **reuse** the project's existing match-list, date-strip, match status, filter, and market components; modify them minimally.
- Use the project's existing Next.js conventions, styles, state management, accessibility patterns, and actual sports data provider mappings. Do not introduce an unrelated component framework or unnecessary dependencies.
- Keep list item keys stable and support all match states (upcoming, live, half-time, finished, won, lost, void, cancelled, postponed where supported), with semantic text and accessible status descriptions.
- Ensure there are no accidental layout shifts when predictions, odds, scores, or logos are unavailable; preserve intentional fallback symbols such as `–`.
- Preserve all existing actions and routes, including search, filter application/reset, markets, pagination, navigation, and performance summaries.
- On desktop/tablet, retain the existing layout; changes should target the mobile Matches presentation without regressions.

## Acceptance checks
1. **Matches list:** one integrated header/list surface, with each row adjacent to the next and separated by a thin horizontal line; no detached individual rounded card backgrounds.
2. **Statuses:** the labels remain clearly colored but have absolutely **no pill/background**.
3. **Data alignment:** team names, scores, odds, probability, predictions and league/date positioning match the provided reference without shifts.
4. **Date arrows:** change only which date chips are in view; the selected date, search results and statistics remain unchanged until a chip or date-picker selection is applied.
5. **Filters and Markets:** pixel-level/visual and functional behavior are unchanged from the approved screens.
6. **Other UI:** header, Performance tiles, search controls, bottom navigation, theme, typography, and routes are unchanged.
7. Check mobile viewports with narrow widths and long names; verify keyboard access, accessible labels, no overlap, and no hidden controls.

## Expected coding-agent response
- Implement directly in the existing codebase, without rewriting unrelated files.
- State precisely which files/components changed and why.
- Report verification of the seven acceptance checks, including any that could not be tested.
- Do **not** claim the actual live UI or data has been changed unless the code was in fact updated and tested.
