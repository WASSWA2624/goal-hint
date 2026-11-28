# Slip sharing rendering fixture

This isolated acceptance application uses the production `SlipCard` and sharing
drawer with synthetic, schema-valid public snapshots. It never reads a database,
creates real public links, or contacts a WhatsApp recipient.

Create with `create_fixture("slip-sharing")` from `scripts/lib/rendering.py`.
The normal fixture helper supplies the root layout, theme, brand assets, and flags.
The session endpoint defaults to a synthetic active user. Set the
`fixture-sharing-viewer` cookie to `guest` or `member` to check visible disabled
Share controls without a valid subscription; `eligible` enables them. Builder
and Best Slips include every slip status and an aggregate-only preview to check
mobile label alignment and gaps.

- `/` or `/builder`: custom-builder source and three selections.
- `/best`: editorial source and the same three selections.
- `/shared` or `/s/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`: existing public record;
  opening Share does not call POST.
- `/unauthorized`, `/changed`, `/failure`: preparation API returns 403, 409, or
  503 respectively. Each still uses the production drawer error UI.
- `/long`: all 800 selections, exercising image pagination and ZIP generation.
- `/badges`: synthetic match selections with real public team/league badge URLs. This opt-in case reads the provider's public image CDN through the production first-party badge route; other successful scenarios use bundled flags for offline checks.
- `/scores`: the same opt-in badges with synthetic settled scores, checking centered score/name/logo alignment and result colours.
- `/demo-badges`: the six synthetic teams from the reported image, resolving provider/FlagCDN flags to the shared bundled assets.
- `/missing-logos`: catalog absence permits initials for the home teams; the supplied away/league logos remain required.
- `/remote-badges`: controlled external-image URLs for CORS/decode checks; browser acceptance supplies the response without external dependencies.

`POST /api/slips/share` checks the real strict source schema and the exact fixture
identity. Unknown/extra fields and unknown slip identities fail. It returns a
real `sharedSlipSchema`-validated synthetic response for successful scenarios.
`GET /api/slips/share/<id>` exposes only a known fixture token. There are no live
member, publication, or stored-football reads.

For the link recovery check, run `python scripts/verify-sharing-rendering.py --serve` and open the isolated `/best` page in Chromium. Fulfill the fixture share response with the canonical publication URL `https://goalhint.com/en/best-slips/2026-10-29/1` and block `/brand/goal-hint-logo-inverse.png`. The drawer should keep the image actions disabled and offer **Copy link** with the exact canonical URL. Unblock the logo and select **Try again** to verify the preview and numbered PNG download. Disable `navigator.share` to check that the copy action stays usable when the image sheet is unsupported. Repeat at mobile and desktop widths in both themes.
