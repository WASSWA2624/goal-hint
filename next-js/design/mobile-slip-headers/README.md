# Single-row mobile slip header review

Open `/en/slips/designs/headers`. These are ten header candidates for selection;
the production header and the approved Clean ledger match rows stay unchanged.

| Option | Header |
| --- | --- |
| 01 | Plain ledger |
| 02 | Vertical rules |
| 03 | Icon labels |
| 04 | Outlined facts |
| 05 | Number tab |
| 06 | Outcome endcap |
| 07 | Aligned tracks |
| 08 | Probability line |
| 09 | Ticket dividers |
| 10 | Minimal notation |

Every candidate has one horizontal row in this order: slip number, total odds,
average match probability, selection count and status. Native disclosures have
44px touch targets. Compact labels/symbols retain full accessible explanations;
numbers are never ellipsized. Average probability retains its current meaning,
the mean of individual match probabilities, and is not a whole-slip estimate.
Enlarged text can scroll within the header while preserving its single row.

Use **Inspect** or the Design selector, 320/375/430px width presets and light/dark
appearance. Scenarios show coherent Pending/Won/Lost/Void records, eight picks,
Slip 100 with larger odds and long team names. Extra status-only headers compare
the other outcomes without attaching incorrect results to expanded match rows.
All expanded examples call the unmodified production `CleanLedgerSelection`.

To serve a stable local review independently of application rebuilds:

```powershell
python scripts/preview-slip-designs.py --view mobile-headers --serve --port 3123
```

Then open <http://127.0.0.1:3123/en/slips/designs/headers>. Use `--reuse` to serve
that previously built review. The dedicated `.tmp/mobile-slip-header-review`
directory, browser scripts and `output/playwright/mobile-slip-headers/` images
are ignored. The preview uses illustrative data and generic local crests.
