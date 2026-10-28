# Compact mobile slip review

Open `/en/slips/designs` on the running application, for example
<http://127.0.0.1:3000/en/slips/designs>. Reuse the existing development server
when available. Otherwise, start one from `next-js/`:

```powershell
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

The route is excluded from indexing and uses illustrative records without
reading live or subscriber slips.

| Option | Layout |
| --- | --- |
| 01 | Clean ledger |
| 02 | Fixture rule |
| 03 | Accent edge |
| 04 | Market band |
| 05 | Four cells |
| 06 | Odds focus |
| 07 | Probability focus |
| 08 | Ticket lines |
| 09 | Alternating rows |
| 10 | Minimal type |

All ten candidates preserve the same three-row order:

1. **Top:** date such as `28-Oct`, followed by 12-hour time and AM/PM at the
   left; league crest and short league name, then country flag and country code
   at the right. Times use Africa/Kampala (EAT).
2. **Match:** home team name, home crest, `VS`, away crest, away team name.
   Common short team names keep the row compact. Logos match adjacent text
   height; full names remain available in the accessible labels.
3. **Prediction:** `Mkt`, `Pick`, `Odds` and `Prob.` with compact market and
   prediction labels and the individual selection probability.

Each option initially shows one collapsed and one expanded slip. The shared
header retains its aggregate summary and native disclosure, with reduced
vertical padding and a 44px touch target. Use **Inspect** to focus on one option,
or compare all ten with identical records. Controls switch between Best slips
and slip-builder contexts, light/dark appearance, maximum preview widths of
320/375/430px for phones and 768px for tablets, long names, eight selections and
saved results. Previews shrink further to fit narrow browser windows; they never
scale text down. Sample rows have no analysis navigation because these fixtures
do not exist.

`MobileSlipSample` reuses the production `CompactSlipDisclosure` for the
aggregate header. `MobileSlipRow` shares one semantic component tree, original
selection snapshots, compact prediction labels, probability formatting and
theme tokens across the ten candidates. `MobileSlipLayout` scopes presentation
changes to the review. The samples use generic local crests and bundled country
flags, without contacting providers for images.

Clean ledger (01) is the selected production layout. Best slips, generated
slips, published slips and saved history use its shared row; mobile/tablet match
feeds reuse its geometry and compact labels while retaining scores and access
states. The remaining options stay available for comparison. Average match
probability in the summary is the mean of the individual selection probabilities.

Layout screenshots are generated in ignored `output/playwright/mobile-slips/`,
with browser check scripts in `.tmp/`, rather than committed.
