# Compact header design samples

## Scope

- Prepare ten faithful header concepts for approval at `/en/header/designs`.
- Show both desktop and mobile previews for every option.
- Preserve the current header identity, colors, navigation structure and square
  component edges.
- Align the visible height of the emblem and Goal Hint name.
- Reduce desktop header height and standardize control padding and spacing.
- Keep the production header unchanged until a design is approved.

## Acceptance

- Shared metadata describes ten distinct treatments: Balanced, Slim,
  Comfortable, Quiet controls, Divided groups, Joined toolbar, Matching
  outlines, Action emphasis, Centered navigation and Underlined actions.
- Balanced is the initial recommendation: 48px desktop/mobile header, 32px
  visible desktop controls, 24px brand height and 6px action gaps.
- Compare guest, member and administrator states in light and dark themes.
- Preserve Login/Register, theme switching, account access and administrator
  payment-count affordances in the relevant state.
- Preview mobile widths down to 320px without clipping or a second header row.
- Mobile header height is at least 48px and effective control targets are at
  least 44px; compact visible controls do not reduce their touch area.
- Keep adaptive desktop navigation and bottom mobile navigation recognizable.
- Use illustrative review data without private account or payment requests.
- Keep preview components reusable and isolated from production components.

## Verification

- Targeted ESLint and the application's full `npm run typecheck` passed.
- The isolated optimized production build and SSR checks passed: ten options,
  twenty samples, unique IDs, available branding, no session cookie, and
  `noindex, nofollow` metadata.
- Browser verification passed across 48 combinations of light/dark appearance,
  guest/member/admin state, 1024/1280px desktop canvases and
  320/360/390/430px mobile canvases (960 rendered sample checks).
- No overlapping controls, rail overflow, undersized mobile targets or browser
  runtime exceptions were found. The review page also fits 320/390/768/1440px
  browser widths; intentionally full-size canvases scroll within their frames.
- More retains Performance at 1024px and its popup fits without clipping.
  Account menus, Escape dismissal, illustrative authentication actions, option
  filtering and both theme controls work.
- Visual review confirmed the light admin and dark guest views. Raster checks
  of the original vector recomposition confirmed identical visible top/bottom
  bounds for the logo symbol and name in both themes.
- The preview uses the real Manrope font and shared styles in a minimal fixture
  shell, without application offline, analytics, account or payment runtimes.
- Reproduce with `python scripts/verify-header-design-rendering.py --serve`.
- Preserve unrelated slip changes, existing stashes and detached worktrees.
- Commit only this task's verified preview changes and push `main`.

## Approval

- Pending the user's selection; no production header option is applied.
