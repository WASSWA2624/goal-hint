# 129 — Collapsible mobile slips

## Scope

Start every production mobile slip collapsed with only its existing header
visible. Tapping the header toggles that slip without changing the design.

## Implementation

- Remove the non-collapsible option from the shared production `SlipTable` so
  generated, history and performance slips use the existing native disclosure.
- Keep Best slips and access-limited summaries on the same closed-by-default
  disclosure; remove the redundant Best slips option.
- Preserve all header and match-row markup, styling, data and desktop rendering.
- Require closed native disclosures in generated-slip rendering assertions.

## Verification

- TypeScript and scoped ESLint passed; all 136 related slip tests passed.
- A fresh production-built fixture passed the complete slip rendering suite,
  including generated slips, 100 Best slips, access-limited summaries, saved
  selections and native GET generation.
- All 24 Chromium mobile cases passed at 320px and 430px in light/dark themes:
  generated/long-name slips, full and access-limited Best slips, and saved results.
  Every slip starts closed; header taps, Enter and Space toggle it independently.
- Baseline comparisons preserve header text, dimensions and computed styles,
  and expanded match rows. All six desktop presentation comparisons passed.
- No page runtime errors or horizontal page overflow occurred. Reviewed collapsed
  and expanded screenshots. Browser checks used touch emulation, not physical
  devices or the Flutter host.
