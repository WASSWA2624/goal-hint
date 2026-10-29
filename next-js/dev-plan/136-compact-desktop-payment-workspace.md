# 136 · Compact desktop payment workspace

## Scope

Apply selected layout **02 · Compact queue** to the real desktop Payments page.
Omit the separate queue heading block, including the review-queue caption and
status/count heading, as requested after selection. Keep the admin menu, status
tabs, private data handling, existing payment operations, and mobile navigation.

## Implementation

- Bound only the desktop Payments workspace to the available viewport below the
  existing app header. Keep the shared admin navigation positioned in that frame.
- Hide the desktop Payments title while retaining its accessible heading.
- Place search and provider/order controls directly above a dense left list.
  Each row starts with provider artwork and contains the reference, payer phone,
  date/time in EAT, reported/received amount, and package duration.
- Keep queue and review scroll surfaces independent. Selection, status changes,
  empty results, refresh, warnings, payment stepping, and busy guards continue to
  use the existing editor and services.
- Reuse the real review fields, private evidence, warnings, checks, and recovery
  forms. Add a concise check summary and amount strip; prioritize the decision
  beside evidence, with payment facts below it.
- Move the single decision bar below the review's scroll surface on desktop.
  Its form associations, approval validation, rejection confirmation, and mobile
  sticky behavior remain active.
- Restrict desktop presentation to square edges and retain both themes. Update
  preview 02 to omit the queue heading, matching the selected implementation.
- Extend the isolated acceptance fixture with an opt-in thirty-payment queue;
  preserve its existing baseline, history, auth, mutation, and attachment checks.

## Verification

- TypeScript and targeted ESLint passed. The 28 relevant admin-route,
  pending-payment, and payment-review tests passed.
- A clean production build of the owner acceptance fixture passed its full
  harness: all nine owner routes and private gates, navigation, subscriber,
  settings, audit, payment history/decisions, attachments, confirmation guards,
  and the new thirty-report queue checks.
- Browser checks passed at 1024×768, 1280×800, 1440×900, and 1920×1080 in both
  themes. The document remains fixed, the panes scroll independently, the
  sidebar aligns below the header, headings are visually absent, square edges
  remain, and decision controls stay within the viewport without overflow.
- Reference search, empty results/reset, provider filtering, sorting, all four
  status tabs, preserved drafts after refresh, and successful synthetic approval
  and rejection passed. The existing phone queue/back navigation and reject
  confirmation passed at 390px without horizontal overflow.
- Screenshots were inspected. Browser runtime errors were absent. The isolated
  fixture reports expected 404 console messages for unimplemented public-route
  prefetches and its optional offline worker; those are fixture limitations.
- Full application type checking covers the integrated source; a full production
  application build and business-database mutation tests were not run. All
  decision and attachment checks used synthetic in-memory data.
