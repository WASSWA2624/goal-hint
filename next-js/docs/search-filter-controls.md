# Reusable search and performance components

`src/components/ui/search-bar.tsx` owns the floating-label input, inset search
submit button and optional adjacent filter action. The enclosing form owns
submission. Omit `submitLabel` for immediate in-list/option filtering. Submitted
searches use the inset action; `onSearch` handles local searches inside another
form without submitting that parent, including Enter with IME composition
protection. `filters` supplies the dialog ID, open state, opener and optional
applied count. `trailingAction` places the optional primary button after the filter, and `filterButtonRef` supports focus restoration. Matches shows the filter icon and label at every width. All controls use the shared control
metrics, floating-label primitives, focus styles and theme tokens. The search
action and input use the field’s inner grid track, overriding the standalone
control minimum so their bounds stay inside the field on every screen size.

Matches, admin payments/codes/subscribers/audit/plans/referral lookup, market
search and league/country/phone-country option search use this component.
Matches, payment, subscriber and audit advanced filters reuse
`AdvancedFilterDialog`, with a sliders icon and compact header and footer.
Reset Filters sits on the left and Apply Filters on the right. Close and Escape
cancel the draft. Backdrop clicks leave the modal open.
Button fills, hover/press states, visible keyboard focus, disabled states and
reduced motion use shared tokens. The search action keeps its accessible name
and uses an icon in narrow desktop fields, leaving more space to type. No
search-specific resize listener is needed.

Matches uses one search row, one dialog field tree and one draft at every
viewport size. The transparent search wrapper uses shared spacing instead of a
separate gray surface. Existing admin field trees remain in their dialogs.

`src/components/ui/section-header.tsx` supplies the Performance and Predictions
headers' shared responsive title size, medium weight, line height and inset
padding. Their date metadata uses the same secondary text styling. Both retain
inline dates where space allows and wrap on narrower containers.

`src/components/performance/performance-summary.tsx` is shared by Matches,
Best Slips and performance reports. The compact heading places the title on the
left and the actual reporting day or range on the right
(for example `MON 02-Nov-2026` or `FRI 30-Oct-2026 – TUE 03-Nov-2026` on Matches).
Matches defaults to “Today’s performance” and uses a status-specific title for
Live, Upcoming and Completed. The date describes the applied reporting period.
There is one date label, with no second date row. Callers own the outer gutter;
the heading and outer status cards share the same left/right rails. All, Won,
Lost, Pending, Void and Cancelled use theme colours in three mobile columns
and up to six desktop columns.
Container queries retain three columns inside narrow report panels; large
counts wrap within their cards. Outcome definitions are shared once at module
level and streamed match counts are normalized only when those counts change.
Mobile cards have no icons. Result actions retain each screen's date/filter navigation;
unknown counts show dashes and cannot be selected. Desktop percentages and
optional prediction-coverage details remain available. Reporting dates come
from the actual cohort; unbounded collections use their
“All dates” label. Desktop icons sit beside labels, and selection uses a thin,
muted inset rule while keyboard focus keeps its stronger outline.

## Match search and filters

`FeedFilters` owns one validated draft shared by mobile and desktop. Status or
result, From/To date-times, sorting, Predictions only, league and country,
probability and eligible odds live in Filters. Match status and Sort by share a
row. Leagues and Countries each have a full row. Markets opens a child dialog
with families, published outcomes, and a shared search. Filtering the choices
keeps checked values in the draft.
Period and editable time-zone controls are removed. From/To use the detected
device zone and define one continuous interval, including the final minute.
Min/Max probability and odds fields have their own labels. Inactive odds
fields show the availability explanation on tap, click or keyboard focus.
Shared selects search from the first character, ignoring case and accents;
direct partial matches precede football aliases and spelling suggestions.
Selection takes one activation and persists when searching. Missing applied
choices remain selectable, and countries use bundled flags.

Search and its adjacent Filters button sit above the results. Typing schedules a
short-debounced request through the same feed endpoint as pagination. Enter and
the inset Search button run the current text immediately. The current list stays
visible during the request. The latest response updates the list, count and
pagination. Clearing the search restores results for the applied filters. The
field and performance cards stay in place while searching.

Apply Filters commits the dialog draft and closes the dialog. Reset Filters
restores the configured defaults in the draft, including fifty matches per page.
Closing discards changes and restores focus to the opener. Invalid ranges and
probabilities disable Apply; validation appears beneath the affected input.
Incomplete date text is retained while typing, with format guidance on blur.
Every open prefills the applied criteria in the device zone. Live synchronizes Today and disables date/time
controls. The shared dialog body scrolls while its header and footer stay
visible. Both themes and fine/coarse pointer heights use the existing tokens.
The native GET fallback retains successful fields before hydration.

`DateTimeField` is the shared date, date-time and time-only editor for public,
analytics and admin forms. Editable segments enforce calendar and clock values.
Fixed separators display dates as `04-JAN-2026` and optional time as `HH:mm`.
Numeric months become three-letter abbreviations on blur. Full dates can be
pasted into any segment. Form values remain ISO civil dates/local minutes. The compact
picker places Day, Month, Year, Hour and Minute in one row on every viewport.
Date-only and time-only fields show their relevant columns. Day and Month cycle
through their allowed values with touch, wheel, keyboard and arrow input. The
remaining columns stop at their bounds. Changing months clamps invalid days,
and caller min/max bounds narrow each column.
Cancel discards the picker draft; Use selection commits it. Inline validation
rejects impossible dates, clock values, bounds and nonexistent DST minutes.
Native inputs remain available without JavaScript.

`FeedSurface` keeps the previous successful result during navigation and labels
retained results after failures. [Pagination and restoration](pagination-navigation.md)
and [live refresh](live-client-refresh.md) retain their existing behavior.
Filter UI adds no provider calls, preview counts or polling.

The compact results header shows the title, latest stored publication among
visible predictions, and loaded range. A tooltip explains that timestamp scope;
no timestamp is fabricated for a list without published predictions. Mobile
omits Showing/matches from its count. See [Matches presentation](match-feed-page.md).

Build `python scripts/verify-app-loading-rendering.py --serve`, open its local
`/en/matches` URL and run `playwright-cli run-code --filename
scripts/verify-unified-match-filters.js`. The shared check covers light/dark
at 320, 390, 1024 and 1440px: formatted entry, inline validation, compact wheel
layout, day/month wrapping, draft reset/cancel, live country search, single-click
selection, Markets disclosure, applied criteria, fifty-record pages and mobile
typography. The fixture also verifies date-only/time-only and uncontrolled form
values. Run `scripts/verify-match-filter-touch.js` through the same CLI for touch
swipes, one-tap selection and cross-zone prefill. Screenshots go to ignored
`output/playwright/`. Use
`scripts/verify-search-performance.mjs` for the shared search/performance checks.
