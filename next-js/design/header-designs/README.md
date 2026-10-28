# Compact header design review

Open `/en/header/designs` on the running application. This separate review
gallery presents ten proposed headers before the user selects a design.
Approval is pending; the production header is unchanged.

Each option shows desktop and mobile views of the existing single-row header.
The emblem and Goal Hint name have the same visual height. Layouts retain the
current brand colors and square edges, with consistent padding and less desktop
vertical space.

| Option | Treatment | Desktop | Mobile |
| --- | --- | --- | --- |
| 01 | Balanced — recommended | 48px | 48px |
| 02 | Slim | 44px | 48px |
| 03 | Comfortable | 52px | 52px |
| 04 | Quiet controls | 48px | 48px |
| 05 | Divided groups | 50px | 48px |
| 06 | Joined toolbar | 48px | 48px |
| 07 | Matching outlines | 48px | 48px |
| 08 | Action emphasis | 48px | 48px |
| 09 | Centered navigation | 50px | 48px |
| 10 | Underlined actions | 48px | 48px |

Use the gallery controls to compare light and dark appearance, mobile widths
and three illustrative account states:

- Guest: Login, Register and theme toggle.
- Member: theme toggle and account avatar.
- Administrator: Payments with a sample pending count, theme toggle and avatar.

Payment review belongs to the administrator state. Subscription status and
Subscribe/Extend remain separate from the header. Samples use illustrative data
and do not require private account sessions or payment APIs.

Desktop previews retain adaptive navigation and More when destinations do not
fit. Mobile navigation stays at the bottom; no second top navigation row is
introduced. Mobile controls keep at least 44px effective targets. At narrow
widths, authentication and payment labels may become accessible named icons
while the full Goal Hint brand name stays visible.

Option metadata is shared by the gallery through
`src/components/navigation/header-review/designs.ts`. Changing a preview or
selecting a sample does not apply it to the production app.

## Isolated preview

From `next-js/`, run:

```powershell
python scripts/verify-header-design-rendering.py --serve
```

The command builds the real gallery in an ignored fixture with the shared
styles and Manrope font, validates the server-rendered output, and prints a
local review URL. It does not load application accounts, analytics or payments.
Keep the process running while reviewing. A successful build can be reopened
with `--fixture .tmp/<printed-directory> --serve`.

Verification passed for targeted lint, full application type checks, the
optimized review build, and browser layout/interaction checks across all ten
options in light/dark, guest/member/admin and the available canvas widths.
