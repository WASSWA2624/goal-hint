# 135 · Desktop admin payment layout studies

## Scope

Selection: **02 · Compact queue**, implemented in plan 136 with the queue
heading block omitted at the user's request.

Prepare ten interactive desktop-only Payments layouts for selection before
changing the live review workflow. Keep the current admin menu and four status
tabs, remove the page title, and introduce a left payment queue beside a
persistent review with independent scrolling and a fixed surrounding shell.

## Implementation

- Add a buildless, non-indexed `public/admin-payment-layouts/index.html` preview
  following the existing static payment sample pattern.
- Reuse local Goal Hint, MTN, and Airtel artwork; keep edges square and reuse
  the same shell, payment rows, receipt, facts, checks, decision, and history.
- Provide ten named concepts with different queue widths/densities, section
  orders, evidence emphasis, reconciliation geometry, and provider grouping.
- Include all required list fields in every concept, with fictional reports
  across pending, approved, rejected, and replaced states.
- Support selection, search, provider filtering, sorting, shareable concept
  hashes, gallery, local shortlist, themes, and sample decision feedback.
- Keep the review actions fixed below the independently scrollable detail pane.
  No account changes, private data, or payment API calls occur in the preview.

## Verification

- Both JavaScript modules pass `node --check`.
- Browser checks pass for all ten concepts at 1024, 1280, and 1440px in both
  themes (60 combinations), with no document/inner horizontal overflow,
  side-by-side panes, independent scrolling, square edges, and pinned actions.
- All four status tabs pass across all ten concepts (40 state checks).
- Twenty additional layout checks pass at 1366×768 and 1920×1080 on the
  running application, including all menu items, artwork loading, unique IDs,
  pinned controls, and absence of clipped content.
- Selection, normalized phone search, provider filtering, amount sorting,
  empty states, reset, editable sample forms, demo approval/rejection feedback,
  shortlist persistence, gallery selection, and shareable hashes pass.
- No browser errors, live API requests, or account cookies were observed.
- Screenshots were inspected. Both the standalone preview and the running
  application's preview HTML/JavaScript return HTTP 200.

The change is limited to static preview files and documentation; application
builds and business logic integration tests are outside this review scope.
