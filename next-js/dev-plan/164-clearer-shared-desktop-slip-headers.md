# 164 — Clearer shared desktop slip headers

## Scope

Improve date/time clarity and subtly separate the shared desktop slip header's
sections everywhere the reusable card is used.

## Implementation

- Format the actual EAT weekday, ordinal day, full month and year, followed by
  supplied 24-hour time and EAT. Date-only metadata never invents a time.
- Cache locale-aware Intl date formatters; preserve valid original datetime
  attributes and the mobile compact presentation.
- Add thin decorative CSS separators between slip identity/date and summary
  fields. Keep Top ranked after the date, Status before Share and the arrow last.
- Preserve existing theme fills, fixed badge width and the continuous blue halo.

## Verification

- Fourteen date-format assertions passed, including ordinal exceptions, leap
  dates, weekday accuracy and EAT day boundaries. Scoped ESLint passed.
- TypeScript and the integrated production build passed. All 44 browser header
  checks passed, including desktop dates, original datetime, decorative thin
  separators, Share placement, 1024px layouts and compact mobile formatting.
