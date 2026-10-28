# Improve mobile slip header readability

## Scope

- Address feedback that the 28px mobile headers and 10–11px text are too tiny.
- Keep all five fields in one horizontal header band with fixed separators and
  equal-width status cells. Preserve original values and accessible meanings.
- Keep match rows, desktop headers and historical design samples unchanged.

## Implementation

- Scope production-only CSS to the shared mobile slip header.
- Use a minimum 44px target, 14px figures/title/status and 12px labels. Place
  labels above figures within each column, and wrap Slip 100 instead of reducing
  its font size. Retain all odds digits at 14px.
- Fit the supported maximum values into the normal 302px mobile card interior;
  retain local scrolling for narrower or enlarged-text containers.

## Verification

- Focused ESLint, the isolated production build, TypeScript and all unchanged
  slip SSR assertions passed.
- Browser checks passed 48 combinations across 320/375/430/768px, both themes and
  six production slip contexts. Verified 44px targets, 14px figures/title/status,
  12px labels, visible text bounds without overlap, aligned cells and no document
  overflow. Slip 100, 999999.99 odds, 100.0% probability and eight matches all fit
  at 320px without reducing text size.
- Native Enter/Space disclosure and unchanged desktop headers at 1024/1440px
  passed. At 200% text, headers scale and scroll locally without widening the
  page. Reviewed final light/dark screenshots; no JavaScript page errors occurred.
- Match-row source/styles and desktop renderer files have no task changes.
- Preserve concurrent mobile filter work, stashes and linked worktrees; commit
  only this task's changes and push main.
