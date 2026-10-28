# Aligned ledger desktop acceptance

Run from `next-js/`:

```powershell
python scripts/verify-desktop-slip-rendering.py --serve
```

The script builds an isolated production application in ignored `.tmp/`, copies
local generic crests, and checks rendered HTML. It does not read real accounts,
provider services, database records or private environment files.

Routes:

- `/desktop`: immutable original selections without current observations. They
  display Unknown/Pending and VS rather than inferring a phase from kickoff.
- `/saved`: supplied snapshot results and regulation scores, including Won,
  Lost and Void. A saved result alone never invents FT or elapsed minutes.
- `/states`: five explicit supplied states: upcoming/VS, live/1-0/30′,
  halftime/1-1/HT, finished/2-1/Won and finished/0-1/Lost.
- `/responsive`: actual shared `SlipTable`; SSR retains one mobile selection
  set and desktop hydration switches to Aligned ledger at 64rem.
- `/best-full` and `/builder`: actual BestSlips and SlipBuilder components,
  each with two slips and the same explicit observations for gap/alignment checks.
- `/best-auto` and `/builder-auto`: actual screens with two unchanged slips
  sharing three UUID/forecast-bound selections, initially scheduled. These routes
  exercise the real desktop polling provider and handler against controlled facts.
- `/locked` and `/locked-member`: aggregate-only native disclosures with the
  correct login or subscription action and no original selection identities.
- `/best-locked` and `/best-locked-member`: the actual BestSlips locked-summary
  branch with an aggregate-only result.

Desktop slips start collapsed. Open with mouse, Enter or Space. Verify the
28-Oct / 24-hour EAT date/time grouping, country-before-league order, fixed
country/league/status tracks, and score/VS and crest alignment across long and
short team names. Long names show full-text hover/focus tooltips; Escape closes
those tooltips. The score/VS analysis link never surrounds tooltip buttons.

The actual Best slips and builder result stacks have a 3px desktop slip gap.
In both themes, rows remain one compact line; match state and selection result
occupy the final equal-width cell. Mobile retains its existing Clean ledger
markup. The midnight original displays 30-Oct at 00:00 EAT while retaining its
29 Oct UTC instant. Original selected odds, probability and market are unchanged.

After a successful build, rerun against that exact build with
`--fixture .tmp/<printed-directory>`. Add `--serve` to keep it available for
browser checks. Rebuild after source changes.

## Automatic-update fixture controls

This isolated app supplies `POST /api/slips/match-states` through the real
production handler with injected entitlement and observation reads. It never
calls an account service, provider or database. `GET /api/slips/fixture-control`
returns request/read counts, deduplicated batch sizes and maximum concurrency.

Send JSON to `POST /api/slips/fixture-control` to set the illustrative source:

```json
{"reset":true,"phase":"scheduled","mode":"ok"}
```

Available phases are `scheduled`, `live` (1-0, 30′), `halftime` (1-1, HT), and
`finished` (2-1, FT/Won). Modes are `ok`, `unavailable` (503) and `forbidden`
(403/expired entitlement). Optional `delayMs` (0–2000) makes request cancellation
and overlap checks observable. The controls exist only in this acceptance app.
Both auto pages gate their refreshed server result after forbidden mode is set.

Use Playwright's browser clock to advance the normal 20-second cadence. Check
that the actual match rows change without a form submission or a rebuilt slip;
header, selection, odds, probability, open disclosure and edited builder controls
remain intact. Two slips produce one request with three unique watches. At phone
width, hide/offline, or pending navigation, no polling requests should continue;
visibility/online restoration resumes promptly. Temporary failures keep the last
coherent state. Forbidden replies withdraw private desktop rows and recheck access.
