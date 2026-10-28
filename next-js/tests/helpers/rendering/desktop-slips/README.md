# Selected desktop slip acceptance

Run from `next-js/`:

```powershell
python scripts/verify-desktop-slip-rendering.py --serve
```

The script creates an isolated production application in an ignored `.tmp/`
folder, copies local generic crests, and verifies raw rendered HTML. It never
reads application accounts, providers, database records or private configuration.

Routes:

- `/desktop`: the actual selected desktop component with a short Ajax/PSV pair,
  longer names, local league/team crests and country flags.
- `/saved`: original selected odds/probabilities and supplied regulation scores
  with correct/lost/void outcomes.
- `/locked` and `/locked-member`: aggregate-only native disclosures with the
  appropriate login or subscription action and no original selections.
- `/responsive`: the actual shared `SlipTable`, retaining one mobile selection
  set in SSR and selecting the desktop design after browser hydration at 64rem.
- `/best-locked` and `/best-locked-member`: the actual `BestSlips` component with
  a valid aggregate-only result, exercising its responsive locked-summary branch.

Desktop disclosures start closed. Open the first slip with mouse, Enter or Space
to inspect the single-line fields and the canonical match-analysis VS link.
At desktop widths the short pair is centred within its team column; longer names
use ellipsis with full-text hover/focus tooltips. The midnight fixture displays
30 Oct at 00:00 EAT while retaining its original 29 Oct UTC instant.

After a successful build, use `--fixture .tmp/<printed-directory>` to rerun the
HTML checks against that exact build without rebuilding it. Add `--serve` to keep
the local fixture available for browser checks. Rebuild after source changes.
