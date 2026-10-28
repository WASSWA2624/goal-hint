# Compact mobile slip review

Open `/en/slips/designs` on the running Next.js application. For a local review:

```powershell
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3120
```

Then visit <http://127.0.0.1:3120/en/slips/designs>. The route is excluded from
indexing and uses illustrative records without reading live or subscriber slips.

| Option | Layout |
| --- | --- |
| 01 | Inline ledger |
| 02 | Split rail |
| 03 | Odds anchor |
| 04 | Ticket strip |
| 05 | Compact grid |
| 06 | Pick first |
| 07 | Fixture ledger |
| 08 | Probability rail |
| 09 | Kickoff timeline |
| 10 | Paired lines |

Each option initially shows one collapsed and one expanded slip. Headers are
native disclosures that work with mouse, touch, Enter and Space. Use **Inspect**
to focus on one option, or compare all ten with identical records. Controls switch
between Best slips and slip-builder contexts, light/dark appearance, maximum
preview widths of 320/375/430px, long names, eight selections and saved results.
Previews shrink further to fit narrow browser windows; they never scale text down.
Sample rows have no analysis navigation because these fixtures do not exist.

`CompactSlip` shares one semantic component tree, original selection snapshots,
prediction formatting and theme tokens across ten scoped layouts. It accepts a
`BuiltSlip`, locale, zero-based index, variant, optional initial open state and
saved results. Actual match-analysis links are enabled by default; the gallery
passes `analysisLinks={false}` for synthetic rows.

Design 01, Inline ledger, is now used by the home and slip-builder displays
through their shared `SlipTable`, including saved and published history. Locked
Best slips reuse its aggregate header and native disclosure. The public summary
explicitly allows average match probability; individual matches remain subject
to entitlement. Whole-slip estimates remain available to ranking and existing
API consumers but are omitted from the displayed slip summary.
