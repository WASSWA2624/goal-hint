# Desktop slip layout review

Open `/en/slips/designs/desktop` on the running application, for example
<http://127.0.0.1:3000/en/slips/designs/desktop>. The route uses illustrative
records and local generic crests and is marked `noindex, nofollow`.

| Option | Layout |
| --- | --- |
| 01 | Balanced ledger |
| 02 | Metric columns |
| 03 | Odds dock |
| 04 | Prediction focus |
| 05 | Probability focus |
| 06 | Ticket gutter |
| 07 | Banded register |
| 08 | Club centre |
| 09 | Rail divider |
| 10 | Minimal line |

Every option has one initially collapsed native disclosure and one expanded
example. Headers contain slip number, optional top-rank label, total odds,
selection count and average match probability on one line. Each match has a
league/country/date/kickoff line followed by teams, market/outcome, individual
odds and probability. Saved outcomes/scores stay on the metadata line. Team and
league crests have text-height footprints.

Use **Inspect** or the design selector to compare one option, choose a canvas
width of 960/1120/1360px, switch between Best slips and slip-builder contexts,
toggle rank visibility and light/dark appearance, and test long names, eight
selections or saved results. Review canvases retain actual desktop widths and
scroll locally on smaller windows; enlarged text scales their minimum width.

The variants scope their styles to `DesktopSlipSample` wrappers and reuse
`CompactSlip` for original snapshots, formatted probabilities and native
expansion. Optional `showLogos` and `showRank` props default to the existing
production behavior. The mobile and live desktop layouts remain unchanged until
the owner selects a desktop design for integration. No providers or private
slip APIs are called by these samples.

To start the application directly from `next-js/`:

```powershell
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

Use an existing running server when available. Layout screenshots and browser
check scripts are generated in ignored `output/playwright/desktop-slips/` and
`.tmp/` directories rather than committed.
