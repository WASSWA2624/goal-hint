# GoalHint — Matches & Slips UI Standardization and Functional Fixes

## Task
Review the **existing codebase**, then implement the targeted changes below on the **Matches** (`/en/matches`) and **Slips** (`/en/best-slips`) pages, including their locale equivalents. This specification is self-contained; **do not require screenshots**. Reuse existing components, styles, APIs, and business logic. Make canonical, minimal changes—not a redesign or unnecessary rewrite.

## 1. Shared date-navigation row (mobile and desktop)
Place the following controls **together on one row, directly below the page navigation/header**, in this exact order on **both** pages:

**Date navigation → Calendar button → Filters button**

- Reuse the date-selector already on Slips; add the equivalent to desktop Matches, where it is currently missing. Preserve its selected-date tiles and previous/next navigation.
- The **calendar button must visibly show the currently selected day-of-month number** (e.g., `26`), without the month. Update the number whenever the selected date changes; retain calendar-picker functionality.
- Label the filter control **“Advanced Filters” on desktop** and **“Filters” on mobile**. Both labels must open the existing filtering interface; preserve its behavior.
- Keep all three controls on **one row at every supported width**. Reduce visible date tiles when needed (e.g., from five to three on narrow phones) rather than wrapping the calendar or filter button onto a second row. Maintain usable touch targets, navigation, and alignment. No overlap, clipping, or horizontal page overflow.
- Ensure the selected date drives the appropriate page data and remains consistent between the date tiles and calendar.

## 2. Performance cards and search placement
Immediately **below the shared date-navigation row**, retain the existing performance summary cards in their current responsive layout: **six across on desktop; three columns by two rows on mobile**. Preserve the categories **All, Won, Lost, Pending, Void, Cancelled**, their values, percentages, color coding, and interactions.

- Slightly increase text legibility without making the cards taller unnecessarily.
- Each card must retain **exactly two text lines**: **line 1: status label**; **line 2: count and, where applicable, percentage**. Allow counts of up to at least **five digits**, such as `15,000`, without producing a third line, overlapping text, or truncating critical values. Adjust responsive font sizes, spacing, and padding as required.
- **Matches only:** move the existing search bar **below the performance cards**, spanning the available content width on both desktop and mobile. Keep its search action and behavior unchanged; it should no longer precede the date navigation.
- **Slips:** do not introduce a search bar. Remove the separate mobile filters row by moving its filter control into the shared top row. Keep the page content below these controls otherwise unchanged.

## 3. Clarify market labels
Where match market types are abbreviated, display:

- `A O/U` → **`Away O/U`**
- `H O/U` → **`Home O/U`**

Apply consistently wherever these specific market types appear on mobile and desktop. Keep `O/U` and the underlying market definitions, picks, calculations, and prediction logic unchanged. Prefer updating the shared display-label mapping instead of duplicating conditions.

## 4. Desktop Slips: readable live-match timer
In **each live fixture row on desktop Slips**, the elapsed match time currently appears as tiny text near the score, while the fixture status badge says **“Live.”** **Move the existing elapsed-time display into that fixture’s status badge**, replacing “Live.” Follow the existing **Matches-page time/status format and styling convention**, including relevant match phases and added-time handling. The time must be easy to read and continue updating normally. Do not duplicate the timer or alter the score. Preserve other fixture and slip statuses (Won, Lost, Pending, etc.) and their styling. Do not mistakenly modify the overall slip-status badge.

## 5. Diagnose and repair broken slip actions
Two failures have been reported; **reproduce them and identify their actual root causes before changing code**:

1. **Slips sharing:** On both mobile and desktop, opening **Share slip** displays **“Could not prepare this slip. Please try again.”** Inspect the existing share preparation, slip rendering/image creation, frontend state, relevant endpoints, permissions, browser compatibility, and client/server errors. Restore reliable **Share**, **Download image**, and **Try again** behavior. Provide a sensible fallback where native sharing is unsupported; do not simply suppress the error.
2. **Slip building:** The action to **build/create a slip** is reported as failing. Locate the existing relevant build workflow (including the Builder page if applicable), reproduce the failure, trace the request/validation/backend response and logs, fix the root cause, and verify that a valid slip can be built. Preserve existing filters, constraints, and creation logic; do not rebuild the slip-generation engine.

## Implementation boundaries and verification
- Inspect the codebase first; use existing reusable components and established patterns. Change only what is necessary. **Do not break working features, redesign cards/tables, change business rules, or introduce unrelated refactors.** Preserve access controls, subscriptions, localized routes, time-zone handling, odds/probability calculations, filtering, and existing mobile/desktop interactions.
- Check narrow mobile, standard mobile, tablet, and desktop widths. Verify **single-row date/calendar/filter layout**, selected-day numeral, adaptive date count, legible five-digit statistics in two lines, correct search location/functionality, market labels, and desktop live-timer badge.
- Test the **slip build**, **share**, **image download**, and **retry** paths on mobile and desktop. Add or update focused regression tests where appropriate; run relevant lint, type checks, and tests.
- At completion, summarize **files/components changed**, **confirmed root causes and fixes** for the broken actions, **tests performed and results**, and any unresolved limitations. Do not claim success for tests or environments not actually verified.
