# 139 · Shared admin record workspaces

## Scope

Apply the approved desktop list/detail workspace to Payments, Codes,
Subscribers, Password requests, Plans, and Audit through reusable shared
components. Preserve Payments' approved presentation, real business actions,
mobile workflows, private access, and one-time password safeguards.

## Implementation

- Extract common frame, toolbar, list pane, independent scroll surfaces,
  details/card/body/header, selected rows, and optional fixed action footer into
  `record-workspace.tsx`; migrate Payments to these same components.
- Move access records and plan editing into selectable desktop list/detail
  workspaces, including create modes and real form-associated footer actions.
- Align the subscriber directory and account tabs with the same workspace;
  show only the current account action's relevant footer controls.
- Provide a selectable desktop password-request queue, retaining the original
  mobile panels and temporary passwords exclusively in parent component memory.
- Use the same workspace for read-only Audit details and related-record links;
  retain server filtering, privacy redaction, pagination, and CSV export.
- Group record screens after Payments; place Audit before Settings, retain
  Overview first, and keep Analytics last and visually separated.
- Keep shared business logic and typed action contracts intact. Preserve mobile
  forms with one mounted form per operation, unique IDs, and existing guards.
- Extend the synthetic owner fixture with stateful Plans operations and verify
  the shared structure, menu classification, private gates, and real services.

## Verification

- Full application TypeScript check and targeted ESLint passed.
- 62 targeted tests passed: record navigation/classification, admin routes and
  services, payment review/order/queues, sidebar preferences, Audit privacy, and
  subscriber deletion guards.
- A fresh production owner fixture build and the complete owner acceptance
  suite passed, including private routes, payment decisions, subscriber and
  password operations, Settings, Audit, and stateful Plans mutations/guards.
- Browser checks passed for all six desktop screens at 1024×768, 1280×800,
  1440×900 and 1920×1080, in both themes with expanded/collapsed sidebars
  (96 combinations). No document overflow, duplicate IDs, clipped footers or
  page errors were found.
- All six mobile screens passed checks at 390×844 with no horizontal overflow
  or duplicate IDs. Existing queue/back navigation, Codes grant drawer and inline
  actions, subscriber directory/back links, per-request password forms, inline
  plan editing, and native Audit disclosures remained usable.
- Browser interactions verified independent list/details scrolling and fixed
  actions, payment approval and filtering, Codes grant/extend/revoke, Plans
  create/edit/cancel/reorder/activation, subscriber tabs and note submission,
  password confirmation/reveal/Done across a viewport change, and Audit
  selection/search/CSV export. Mutations used synthetic fixture data only.
- Review fixes were verified against the final production fixture: subscriber
  account/removal/credit contexts are mutually exclusive, mobile add-cancel
  returns focus to a visible back link, and sidebar keyboard/pointer resizing
  and persisted collapse remain functional.
- The fixture omits public-page prefetch and offline-worker routes, which
  produce expected 404 console messages. No live business data was modified.
