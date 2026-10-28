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
Use `/api/fixture-state?state=guest`, `state=member` or `state=admin`, then reload
the page to set a synthetic session. Append `&pending=103` for the capped `99+`
payment badge. These fixture APIs exist only in this acceptance application.
No account, database or payment provider is used.

The script checks server rendering, anonymous page/session behavior, responsive
navigation and branding availability. Browser acceptance should check 48px
rails, 44px phone targets, 32px desktop controls, equal-height adaptive branding,
quiet resting utility controls, visible focus and unobstructed account/More
menus in both themes at 320px through desktop widths.

Use `--fixture .tmp/<printed-directory> --serve` to reopen a successful build.
Rebuild after editing production header source. The `/detail` page renders the
actual `MatchDetails` with a minimal validated no-forecast projection and its
normal Redux provider. Use it for phone header/back-link acceptance; section
data beyond this header-focused fixture is intentionally unavailable.
