# 127 — Floating ranges and compact mobile navigation

## Scope

Refine Slip Builder range fields on desktop and mobile; compact Matches filters
and bottom navigation on mobile. Preserve guards, exact numeric formatting,
criteria defaults, blank Any bounds and fixed-size account-aware actions.

## Implementation

- Reuse the guarded numeric component for border-floating associated Min/Max
  labels, including blank fields, without changing event or validation logic.
- Center numeric entries, reduce mobile Slips numeric text to 14px, spell out
  Matches per slip, and let Reset grow into the available action-row space.
- Retain desktop mouse steppers with symmetric input padding; mobile controls
  keep keyboard stepping and compact symmetric padding.
- Use compact 36px mobile Matches search/date/status/Advanced faces and tighter
  private sheet padding, preserving desktop filters and all filter behavior.
- Reduce mobile navigation targets to 48px with 20px icons and 11px labels.
  Share the height with footer/More/dashboard clearance and retain safe areas.

## Verification

- Passed full TypeScript checking, full ESLint, 108 focused Slips/guard/card/
  paywall tests and 55 navigation/feed/query/client-state tests.
- Passed the updated Slip Builder production build and SSR checks, including
  associated floating labels, canonical fields, native GET and blank Any bounds.
- Passed Matches production rendering: 11 status/date redirects, five invalid
  query guards and 46 feed scenarios. Its stale redirect expectations were
  updated only after an exact HEAD snapshot and the working source returned
  identical canonical queries; application routing/query logic was unchanged.
- Root independently checked centered 14px mobile values with symmetric padding,
  desktop center alignment, floating-label click-to-focus and dynamically sized
  Reset with the account action still fixed at 208px.
- Passed 40 responsive page/width/theme/pointer checks without overflow or
  JavaScript exceptions. Sixteen hydrated desktop Matches comparisons against
  the exact HEAD snapshot matched filter controls, text, colors, header, footer
  and main layout.
- Passed floating-label notch/association/click-to-focus checks, centered values
  with equal side padding, 14px mobile main/popup numeric text, flexible Reset
  and 12 account-state checks with fixed 208px actions, including loading.
- Passed input letter/101%/precision guards, exact 0.01 steps, comma formatting,
  Apply/Cancel/Reset, blank Any bounds and JavaScript-disabled native GET.
- Passed compact Matches top/date/Advanced controls, centered numeric filters,
  date Apply URLs, More/Escape behavior and unobscured footer content. The
  navigation bar measures about 48.7px including its border, down from 56.7px.
- Root visually inspected final desktop/mobile Slips and mobile Matches images.
  The data-present Matches fixture displays 30 cards. Its synthetic Tomorrow/
  probability query lacks a recorded SQL capture and shows the same unavailable
  state on HEAD and current code; application logic was not changed to mask it.
- All owned servers/browser sessions were closed. Generated snapshots and logs
  remain ignored under `.tmp/` and `output/playwright/`.
