# Reusable search and performance components

`src/components/ui/search-bar.tsx` owns the floating-label input, inset search
submit button and optional adjacent filter action. The enclosing form owns
submission. Omit `submitLabel` for immediate in-list/option filtering. Submitted
searches use the inset action; `onSearch` handles local searches inside another
form without submitting that parent, including Enter with IME composition
protection. `filters` supplies the dialog ID, open state, opener and optional
applied count; `filterButtonRef` supports focus restoration. Mobile shows only
the filter icon; desktop shows its icon and label. All controls use the shared control
metrics, floating-label primitives, focus styles and theme tokens. The search
action and input use the field’s inner grid track, overriding the standalone
control minimum so their bounds stay inside the field on every screen size.

Matches, admin payments/codes/subscribers/audit/plans/referral lookup, market
search and league/country/phone-country option search use this component.
Matches, payment, subscriber and audit advanced filters reuse the branded
`AdvancedFilterDialog`, with Reset Filters on the footer left and Apply Filters
on the right. Close, Escape and backdrop dismissal cancel the draft.
Button fills, hover/press states, visible keyboard focus, disabled states and
reduced motion use shared tokens. The search action keeps its accessible name
and uses an icon in narrow desktop fields, leaving more space to type. No
search-specific resize listener is needed.

Matches uses one search row, one dialog field tree and one draft at every
viewport size. The transparent search wrapper uses shared spacing instead of a
separate gray surface. Existing admin field trees remain in their dialogs.

`src/components/performance/performance-summary.tsx` is shared by Matches,
Best Slips and performance reports. The compact heading places “Performance” on the left and the actual reporting day/range on the right
(for example `02-Nov-2026 · EAT` or
`30-Oct – 03-Nov-2026 · EAT`). A refresh timestamp is not a reporting period.
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
result, period, custom dates, time bounds, display zone, sorting, Predictions
only, markets, league/country checklists and probability all live in its one
Advanced Filters dialog. Existing access restrictions and the unavailable-odds
explanation remain. Fields are not cloned for different layouts or dialog
sections. The common searchable checklist preserves missing selected choices
and uses bundled country flags.

Only search and its adjacent filter button remain outside. Search submits on
Enter or the inset action; typing and dialog edits make no match requests.
Apply Filters commits the complete draft and closes the dialog. Reset Filters
restores the configured defaults in the draft, retaining zone and page size.
Closing discards changes and restores focus to the opener. Invalid ranges and
probabilities disable Apply. Live synchronizes Today and disables date/time
controls. The shared dialog body scrolls while its header and footer stay
visible. Both themes and fine/coarse pointer heights use the existing tokens.
The native GET fallback retains the same inline field tree before hydration.

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
at 320, 390, 768, 1024 and 1440px: unique fields, footer alignment, draft reset,
invalid ranges, dismissal/focus, URL application/search and compact counts.
The script's screenshots go to ignored `output/playwright/`. Use
`scripts/verify-search-performance.mjs` for the shared search/performance checks.
