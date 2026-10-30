# 183 — Sticky desktop filter sections

Keep the complete filter sections on Best Slips, Matches and Slip Builder
visible beneath the app header while results scroll. Below the desktop
breakpoint, retain the existing mobile flow and header behavior.

Reuse `desktopStickyFilters` in the shared filter chrome. The desktop-only rule
uses the shell's existing `--app-header-height`, with a layer above result cards
and below the app header. Each panel retains its controls, spacing and dialogs;
Best Slips uses an opaque page-colored fill so cards cannot show through it.
No scroll listener, fixed-height result pane or native host change is needed.

Verify the three pages at 1440px and 1024px in Light/Dark after scrolling,
including the wrapped Best Slips controls at the smaller desktop width.
Check dialog visibility and focus return, opaque surfaces, horizontal overflow,
and normal mobile filter scrolling at 375px. A short Builder result area can
use temporary browser-only space to exercise the same scrolling container.
Record actual results in the development tracker and progress log.

Completed: changed-file lint, strict type checking, twelve desktop layout/theme
cases, three dialog/focus checks, the date dropdown and 375px mobile checks
passed. See the tracker and progress log for the browser fixture limits.
