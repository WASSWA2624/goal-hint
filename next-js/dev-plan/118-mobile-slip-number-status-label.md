# Mobile slip number and Status label

## Scope

- Add Status above Pending, Won, Lost and Void in production mobile slip headers.
- Replace visible Slip N with its number, centered in the existing first column.
- Retain full accessible Slip N headings, readable sizes and current dimensions.
- Preserve match rows, desktop headers and historical design variants.

## Implementation

- Reuse the shared header, localized Status caption and existing label styles.
- Keep the visible number hidden from assistive technology and provide the full
  localized heading once through visually hidden text. Retain Top ranked context.
- Stack the status caption/value with the same padding and gap as other fields.
- Update the existing SSR contract checks for visible and accessible identities.

## Verification

- Targeted ESLint, production fixture build, TypeScript and all updated SSR
  assertions passed, including 100 slips and private/locked boundaries.
- Browser checks passed 48 combinations at 320/375/430/768px across six slip
  contexts and both themes. Verified numeric-only visible identities, full
  accessible heading names, Status captions above complete outcome words,
  44px height, unchanged column widths, legible text and no overlap/overflow.
- Number 100, maximum odds, 100.0% and eight matches fit at 320px. Native keyboard
  expansion, desktop isolation at 1024/1440px and 200% text behavior passed.
  Reviewed the final mobile screenshots; no JavaScript page errors occurred.
- Preserve existing worktrees and stashes; commit intended changes and push main.
