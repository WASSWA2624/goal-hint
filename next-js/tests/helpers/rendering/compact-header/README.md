# Approved Quiet controls acceptance

From `next-js/`, run:

```powershell
python scripts/verify-compact-header-rendering.py --serve
```

The script builds an ignored isolated Next application using the actual
`PublicShell`, `AppBrandBar`, `AdminShell`, account actions and responsive
navigation. It retains the shared style provider and real Manrope font, and
omits the application offline, analytics and account runtimes.

Visit `/public`, `/app`, `/admin` and `/detail` to inspect the real header contexts.
Append `?textScale=200` to any of these paths for a reproducible 200% root font
size with the same viewport dimensions. The fixture's surface links preserve
this setting. This text scale is confined to the acceptance fixture.
Use `/api/fixture-state?state=guest`, `state=member` or `state=admin`, then reload
the page to set a synthetic session. Append `&pending=103` for the capped `99+`
payment badge. These fixture APIs exist only in this acceptance application.
No account, database or payment provider is used.

The script checks server rendering at 100% and 200% text, anonymous page
behavior, both responsive navigation menus, synthetic guest/member/admin
session responses and branding availability. Its SSR result does not assert
browser geometry.

Browser acceptance should cover `/public`, `/app`, `/admin` and `/detail` at
320, 360, 390, 768, 1024 and 1440px, both text scales and both themes. Use the
guest, member and admin synthetic sessions; include the `99+` payment badge.
Wait for fonts and the account session to hydrate before measuring.

- The document and header must fit the viewport without horizontal scrolling.
- Header controls, branding and navigation must remain distinct and readable.
- Open the visible desktop or phone More menu. Its destinations must remain
  inside the viewport and reachable, with scrolling when height is limited.
- Every destination must remain reachable through a primary link or More.
- Open member/admin account menus and confirm no overlap or clipping prevents
  their actions. Escape should close a menu and return focus to its trigger.
- Resize while a navigation destination has focus; the corresponding link or
  More trigger should retain focus if the destination moves into overflow.

At the default text size, also check the existing 48px rails, 44px phone targets,
32px desktop controls, equal-height adaptive branding, quiet resting utilities
and visible keyboard focus. At 200%, allow the header to grow when needed.

Use `--fixture .tmp/<printed-directory> --serve` to reopen a successful build.
Rebuild after editing production header source. The `/detail` page renders the
actual `MatchDetails` with a minimal validated no-forecast projection and its
normal Redux provider. Use it for phone header/back-link acceptance; section
data beyond this header-focused fixture is intentionally unavailable.
