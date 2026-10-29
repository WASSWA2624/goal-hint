# Shared admin record workspace

Desktop Payments, Codes, Subscribers, Plans, and Audit use
the components in `src/components/admin/record-workspace.tsx`. Edit that module
to change their shared layout, scrolling, toolbar spacing, headers, row surfaces,
or action-footer presentation. Screen files supply their own record fields,
selection state, forms, permissions, and operations.

The menu keeps Overview first, followed by the five record workflows beginning
with Payments. Settings and Forecast sources follow that group. Analytics stays
last in its own separated section. `admin-navigation.ts` declares which pages
use the fixed record viewport; their shared shell preserves sidebar resizing
and collapse preferences.

## Composition

- `RecordWorkspace`: the full-width desktop frame below the existing header.
- `RecordHead` / `RecordFeedback`: page controls and operation results.
- `RecordList`, `RecordListTools`, `RecordListScroll`, `RecordListFooter`: the
  searchable list with its own scroll surface and bounded status area.
- `RecordDetails`, `RecordCard`, `RecordScroll`: selected record content with an
  independent scroll surface. Empty states use the same pane.
- `RecordDetailHead` / `RecordBody`: compact selected-record heading and content.
- `RecordFooter`: optional actions outside the details scroll surface. External
  submit buttons use the existing form's ID; forms are never duplicated.
- `RecordItem`, `RecordItemTitle`, `RecordItemMeta`: common selectable-row parts.

Use `data-record-actions` for a nested action group, `data-record-icon` for an
icon-only action, and `data-record-summary` for optional footer context. The
summary hides on narrow desktop windows. Avoid copying the workspace grid,
scroll, or footer styles into screen-specific files.

Payments extends these common components for its provider/reference rows and
payment-specific review zones. Codes retains real manual-grant, extend, and
revoke operations. Plans retains saved-name/price/duration snapshots and reorder
behavior. Subscribers retains account tabs, access/credit tools, restrictions,
and guarded removal. Members manage their passwords through the account's own
recovery and change-password flows. Audit is read-only and uses existing related-record links;
CSV export still covers the full filtered loaded window.

## Responsive and state behavior

The fixed two-pane layout starts at 64rem. Mobile keeps the existing inline
Codes/Plans forms, subscriber directory/back navigation, and Audit disclosures.
Responsive branches mount one set of forms and preserve parent-owned drafts.

Overview, Settings, Forecast sources, and Analytics keep their existing layout
categories. Storage-unavailable responses remain readable within the shared
frame. Authorization, private attachments, API handlers, business services,
and persistence are not delegated to layout components.

Run `python scripts/verify-owner-payments-rendering.py --serve` from `next-js/`
for the production acceptance fixture. Its printed synthetic entry establishes
only the fixture session. Test mutations there rather than against business
storage. The fixture includes a long payment queue, subscriber account workflows,
stateful plans, Audit filtering/export, and all approved menu destinations.

## Balanced compact Subscribers

The live Subscribers workspace and its ten design studies share
`SubscriberDirectoryFilters` and `SubscriberAccountRow` from
`subscriber-directory-parts.tsx`. Keep the floating search, four filters, account
identity, status, and carrier treatment in those shared parts. Carrier artwork
requires a configured phone-prefix match; unknown carriers use the globe icon.
The `subscriberPresentation` mixin in `subscriber-presentation-styles.ts` applies
the approved compact summary, statistics, actions, and tabs to both surfaces.
Account actions reuse the existing forms inside `SubscriberReviewDialog`.

Run `python scripts/verify-subscriber-directory-rendering.py` from `next-js/`
for focused production rendering and API acceptance. Use `--origin` to check an
already running isolated owner fixture, or `--fixture` to reuse a built fixture
under `.tmp`. The owner acceptance suite delegates its Subscribers checks to
this verifier. Browser checks cover independent scrolling and dialog behavior.
