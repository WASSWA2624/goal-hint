# Shared admin record workspace

Payments, Codes, Subscribers, Referral review, Plans, Audit and Settings use
the components in `src/components/admin/record-workspace.tsx`. Edit that module
to change their shared layout, scrolling, toolbar spacing, headers, row surfaces,
or action-footer presentation. Screen files supply their own record fields,
selection state, forms, permissions, and operations.

The menu keeps Overview first, followed by the six record workflows beginning
with Payments. Settings follows that group. Analytics stays
last in its own separated section. `admin-navigation.ts` declares which pages
use the fixed record viewport. The desktop sidebar keeps collapse and resize
preferences and uses the resize rail as the divider. The list pane has a
separate rail. Drag it or use the arrow keys to change the list width while
keeping room for the detail pane.

## Composition

- `RecordWorkspace`: the frame below the existing header. The compact layout
  keeps list and detail footers outside their scrolling content on phones.
- `RecordToolbar` / `RecordFeedback`: full-width toolbar on the parent surface
  and operation results. `RecordPrimaryAction` displays a label on desktop and
  an icon on phones.
- `RecordList`, `RecordListTools`, `RecordListScroll`, `RecordListFooter`: the
  searchable list with its own scroll surface and bounded status area.
- `RecordDetails`, `RecordCard`, `RecordScroll`: selected record content with an
  independent scroll surface. Empty states use the same pane. `RecordBack`
  returns phone users to the list and restores the opening row and scroll.
- `RecordDetailHead` / `RecordBody`: compact selected-record heading and content.
- `RecordFooter`: optional actions outside the details scroll surface. External
  submit buttons use the existing form's ID; forms are never duplicated.
- `RecordItem` / `RecordRowContent`: shared selectable rows with an optional leading
  icon or logo, up to three primary fields, and muted supporting metadata.

Use `data-record-actions` for a nested action group, `data-record-icon` for an
icon-only action, and `data-record-summary` for optional footer context. The
summary hides on narrow desktop windows. Avoid copying the workspace grid,
scroll, or footer styles into screen-specific files.

Payments reloads the pending queue after its live count changes when review is
idle. The payment detail uses payment-specific review zones. Codes retains real manual-grant, extend, and
revoke operations. Plans retains saved-name/price/duration snapshots and reorder
behavior. Subscribers retains account tabs, access/credit tools, restrictions,
and guarded removal. Members manage their passwords through the account's own
recovery and change-password flows. Audit is read-only and uses existing related-record links;
CSV export still covers the full filtered loaded window.

## Responsive and state behavior

The fixed two-pane layout starts at 64rem. Primary forms for Codes, Subscribers,
Referral review and Plans use the shared modal with the same controls on both
viewports. Selecting a row on mobile opens one detail view. Referral search
queries all matching cases through the owner-only endpoint, and updates retain
the list query so the reviewer can return to it.

Settings uses the same list and detail components for section navigation and
has one draft and save footer. Overview and Analytics use the scrolling
workspace layout. Storage-unavailable responses remain readable within the
shared frame. Layout components leave authorization, private attachments, and
persistence to the existing services and API handlers.

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
