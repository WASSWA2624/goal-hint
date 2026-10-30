# Best Slips desktop page designs

Ten visual treatments of the existing page. The real `BestSlips`,
date/result filters, count summary, pagination, share action and shared `SlipCard`
remain mounted while switching designs. Blue Signal is now applied to the
production components; `/implemented` previews that page without gallery skins
or review controls, using the same isolated sample data.

From `next-js/`, run:

```powershell
python scripts/preview-best-slips-page-designs.py --serve
```

Open the local URL printed by the command. Use Design or the previous/next
buttons, the appearance toggle, and Preview styling to compare with the original.
The Viewer picker previews Subscriber, Guest and Free member states using local
personas. Guest/member views retain public completed slips. Desktop access
guidance now uses the existing account/subscription status bar, with no duplicate
Unlock new slips panel. Mobile keeps its original presentation.
Individual designs can be bookmarked using their fragment, e.g. `/#navy-focus`.
Review chrome is outside the app and hidden below the existing desktop breakpoint.

| Design | Treatment |
| --- | --- |
| Blue Signal | Neutral surfaces and blue identity rail |
| Emerald Ledger | Mint header wash |
| Indigo Rule | Violet bottom rule |
| Amber Paper | Warm paper and amber rail |
| Graphite | Neutral emphasis with semantic result colors |
| Teal Stripes | Alternating neutral and teal headers |
| Violet Outline | Violet border and identity highlight |
| Navy Focus | Dark navy collapsed headers |
| Copper Rule | Warm paper and copper rule |
| Midnight Teal | Deep teal collapsed headers |

`desktopSlipHeaderSkin` uses shared semantic header selectors and theme tokens,
and the selected Blue Signal styling now lives in the shared production slip
component used by Best Slips and Slip Builder.
It retains the existing grid and information order. A shared Manrope type
hierarchy balances 15px/700 titles and values, 13px/500 labels, 12px/500 metadata,
and 13px/600 status/actions. Collapsed rows grow from 36px to a comfortable 44px.
Result controls use 13px text, 36px height, 10px horizontal padding and 6px gaps.
Below 1280px they occupy a full row so all six results remain visible, with dates
and Reset directly beneath. All overrides
use the existing desktop media query. Blue Signal's square outer frame keeps its
rail across the full expanded height, with 4.5px list gaps. Expanded match/header
contents and mobile retain their original rendering. Existing status colors stay
unchanged, with visible labels. Result-button containers have no background fill.

The fixture clock is 30 October 2026, EAT. Illustrative records include 100 slips
today, 37 yesterday and 12 the day before. The existing 50-item page size is used;
Last 3 days has 149 slips and a final page of 49. Status counts describe the whole
date cohort; the range summary describes the filtered page. Future dates exercise
the original empty state. Sample records never enter live storage.
Guests/free members default to yesterday's completed cohort (24 sample slips),
with no upcoming/in-progress records. Original publication ranks remain intact
when filtering; displayed range counts describe the visible cohort positions.

The original Share drawer can generate its sample image locally. Its all-zero
reference and public URL are illustrative only; no share record or working public
link is created. Product navigation keeps its original destinations; this isolated
server serves only the review and its local fixture endpoints.

Generated Next apps, logs, screenshots and browser reports belong in ignored
`.tmp/` or `output/playwright/`, never in Git.

Original gallery verification: isolated production build/TypeScript, scoped ESLint and 808 browser
assertions passed. Desktop text contrast measured at least 5.3:1; 50-item paging,
public access cohorts, keyboard sharing/disclosure, unchanged expanded matches,
and unchanged mobile styles were verified in both themes.
Production implementation and its follow-up changes are tracked in
`dev-plan/168-blue-signal-desktop-implementation.md`.
