# 159 — Shared slip card and header actions

## Scope

Use one reusable slip component across Best Slips, Slip Builder, saved history,
performance results and shared links. Place desktop Share after the status,
with the expand arrow at the far right.

## Implementation

- Promote the existing responsive renderer to the public `SlipCard` component
  with exported props, preserving its desktop and mobile presentations.
- Route summary-only aggregate previews through `SlipCardSummary`, removing
  page-specific responsive disclosure selection. Keep protected selections gated.
- Use the same component in all production consumers and rendering fixtures;
  retain alternate design galleries as intentional review samples.
- Change the common desktop header order to Status, Share, expand arrow. Keep
  Share outside the native disclosure so sharing does not toggle the slip.
- Preserve source-specific publication information and sharing data, current
  header colors, match numbering and the smooth In progress halo.

## Verification

- Scoped ESLint passed for production consumers, shared components, rendering
  fixtures and the active light-theme design sample. Standalone TypeScript
  passed on Node 24.18.1; the targeted slip/cache/access run passed 37 tests.
- The final integrated production build passed on Node 24.18.1 / npm 11.16.0,
  including TypeScript, 21 static pages and the offline asset manifest.
- No old `SlipTable` imports remain in source, tests, scripts or design samples.
  Historical plans/reports retain their original references.
- Browser layouts and screenshots confirm Status, Share, arrow order at 1024px
  and 1440px in both themes. The existing responsive slip presentations remain
  intact; the source-specific publication data and access gates are preserved.
