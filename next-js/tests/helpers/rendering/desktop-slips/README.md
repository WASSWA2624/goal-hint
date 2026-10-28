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
