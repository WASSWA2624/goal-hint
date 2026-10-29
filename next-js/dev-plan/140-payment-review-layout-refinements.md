# 140 · Clear desktop payment review layouts

## Scope

Revise the ten desktop Payments layout samples around a clear information
hierarchy, visible editable fields, and a single authoritative display for each
payment value. Keep production review business logic and mobile navigation.

## Implementation

- Align provider artwork with the first-line payment reference in desktop rows.
- Place desktop previous/count/next navigation immediately before Refresh queue;
  retain mobile back and previous/next navigation in the selected review.
- Reuse the existing static gallery, sample records, local brand assets, theme,
  numbered deep links, filters, and shortlist rather than introduce a second
  preview system.
- Offer ten structurally distinct arrangements of reusable account, transfer,
  evidence, and verification sections with square edges and persistent actions.
- Present editable amounts and transaction IDs once. Avoid repeated monetary
  summaries, footer values, and duplicate receipt transcripts; show package
  price separately only when needed to explain a difference.
- Keep sample data and interactions separate from real payment APIs. A selected
  gallery concept remains a preview until a design is chosen.
- Preserve existing unfinished admin workspace changes and Git stashes; stage
  only this task's changes.

## Verification

- Type checking passed (`npm run typecheck`).
- All 37 focused payment review, ordering, SMS, and pending-count tests passed.
- The production-built owner fixture passed its route, authorization, payment
  decision, attachment, and confirmation checks.
- Live navigation and logo geometry passed browser checks at 1024, 1280, 1440,
  and 1920 pixels; keyboard stepping and the 390-pixel mobile back flow passed.
- All ten gallery concepts passed 80 desktop combinations (four widths and two
  themes), including viewport bounds, visible actions, navigation placement,
  logo alignment, unique section/field IDs, and loaded local artwork.
- Sample edits persist between concepts; SMS, approve/reject, status queues,
  provider filtering, sorting, empty search, gallery selection, shortlist
  persistence, and the desktop-only notice passed browser checks. No runtime
  errors or payment API requests were observed.
- Reviewed screenshots of all ten concepts. Generated captures and logs remain
  ignored. Only this task's files and incremental shared-style edits are staged.
