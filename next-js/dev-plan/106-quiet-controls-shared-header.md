# Apply Quiet controls to the shared header

## Accepted design

- Apply approved option 04, Quiet controls, to desktop and mobile.
- Preserve the current header identity and single-row layout with square edges.
- Use the original vector artwork with the logo symbol and Goal Hint name at
  equal visible heights; standard branding is 20px on phones and 24px on desktop.
- Keep the header at 48px total height, with compact desktop controls and at
  least 44px effective mobile targets.
- Keep theme, account, login and payment controls visually quiet; retain the
  primary registration action and pending payment count.

## Integration

- Share the selected treatment across the public shell, app phone brand bar,
  match-detail phone header, admin shell, loading shell and offline view.
- Preserve adaptive desktop navigation, existing mobile bottom tabs, account
  menus, theme persistence, authentication destinations, payment navigation and
  subscription status behavior.
- Preserve the match-detail Back link and the full brand name. Adapt the
  equal-height branding on narrow detail headers to fit all available targets.
- Update shared header geometry so desktop table headings and admin sidebars
  continue to sit directly below the compressed header.
- Keep primary/inverse compact header artwork available offline while retaining
  the original logo and footer mark assets for existing cached presentations.
- Keep unrelated slip changes, detached worktrees and existing stashes intact.

## Verification

- Full-project `npm run lint`, `npm run typecheck` and `npm run build` passed.
  The production build generated its offline bundle with 25 pinned assets,
  including the new header artwork.
- The optimized isolated fixture and SSR checks passed for actual public, app,
  administrator and match-detail headers without application databases or
  payment services.
- Browser acceptance passed 192 combinations: all four header contexts,
  guest/member/admin sessions, both themes and widths of
  320/360/390/430/768/1024/1280/1440px. Checks cover the actual theme colors,
  48px geometry, intact aspect ratio, available branding, quiet resting
  controls, 44px mobile targets, no overlap/overflow, and account/More menus
  with Escape dismissal. No browser runtime exceptions occurred.
- Verified `99+` pending counts and the reserved scrollbar gutter on 320px
  admin screens. Narrow admin and match-detail headers scale the full brand
  proportionally so the account tools and Back link remain accessible.
- Administrator sessions on public/app headers now take the authenticated
  account branch, retaining the admin sign-out action without extra guest
  controls. Registration remains the sole filled primary header action.
- Focused theme, navigation and offline suites passed: 58 Node tests.
- Focused offline checks passed: 31 Node manifest/worker tests and six Python
  synthetic proxy tests, covering both new header theme assets, cold restarts,
  manifest integrity and retention of existing logo/mark assets.
- Commit only the intended verified changes, push `main`, and leave the primary
  checkout on `main`.
