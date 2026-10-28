# Emphasize mobile slip numbers

## Scope

- Make the mobile slip number slightly larger and bolder.
- Apply the follow-up request to rename Odds to Total odds in the header.
- Preserve the compact 44px header, fixed columns, match rows and desktop headers.

## Implementation

- Style the visible number at 16px/800. Keep three-digit numbers at 14px/800 so
  they fit the existing 32px identity column without reducing padding.
- Reuse the localized Total odds message for production mobile headers, keeping
  historical design variants unchanged.
- Update the existing rendering assertion for the requested label.

## Verification

- Targeted ESLint, production fixture build, TypeScript and all updated SSR
  checks passed.
- Twelve phone layout combinations passed at 320/375/430px across both themes
  and normal/100-slip examples. Confirmed the number typography, Total odds
  caption, unchanged 44px height/columns and complete visible text.
- Numbers 1/9/10/99/100 fit. At 200% text the number scales correctly and the page
  stays within the viewport. Keyboard expansion/collapse and unchanged desktop
  rendering at 1024px passed. Reviewed final screenshots; no JavaScript errors.
- Match rows and desktop source files have no task changes.
- Preserve existing stashes/worktrees; commit intended changes and push main.
