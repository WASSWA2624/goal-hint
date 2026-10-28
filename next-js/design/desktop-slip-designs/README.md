# Single-line desktop slip layout review

Open `/en/slips/designs/desktop` on the running application, for example
<http://127.0.0.1:3000/en/slips/designs/desktop>. The route uses illustrative
records and local generic crests and is marked `noindex, nofollow`.

| Option | Layout |
| --- | --- |
| 01 | Balanced ledger |
| 02 | Inline columns |
| 03 | Fixture priority |
| 04 | Market panel |
| 05 | Odds anchor |
| 06 | Probability anchor |
| 07 | Country rail |
| 08 | Alternating lines |
| 09 | Subtle dividers |
| 10 | Minimal line |

Every option has one initially collapsed native disclosure and one expanded
example. All ten reuse the approved Balanced ledger header, with its height
reduced from 44px to 36px (44px for coarse pointers). Its color, typography,
horizontal spacing, field order and alignment stay the same.

Each match is one horizontal line: short date such as **28 Oct**, 24-hour time
and EAT, league/logo, country/flag, teams, market/prediction, individual odds and
probability. The home crest follows its name immediately before **vs**; the away
crest precedes its name. Long league/country/team labels use ellipsis. Hover or
keyboard focus reveals full text; Escape dismisses the tooltip. Local sample
crests and bundled country flags have text-height footprints.

Use **Inspect** or the design selector to compare one option. The only other
controls switch Best slips/Slip builder and Light/Dark. Sample records include
short and long names so truncation is visible without extra controls. Canvases
fit the review surface down to a 960px minimum and scroll locally in smaller
windows; enlarged text scales that minimum width.

The variants scope their styles to `DesktopSlipSample` wrappers and reuse the
aggregate `CompactSlipDisclosure`, original-snapshot adapter, prediction labels
and shared probability formatter. A dedicated desktop row handles this preview's
order and truncation; live `CompactSlip` rows retain their current markup and
layout. The mobile and live desktop layouts remain unchanged until the owner
selects a desktop design for integration. No providers or private slip APIs are
called by these samples.

To start the application directly from `next-js/`:

```powershell
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

Use an existing running server when available. Layout screenshots and browser
check scripts are generated in ignored `output/playwright/desktop-slips/` and
`.tmp/` directories rather than committed.
