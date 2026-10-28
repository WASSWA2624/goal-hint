# Revised Vertical rules mobile slip headers

Open `/en/slips/designs/headers`. These ten revised candidates build on the
selected Vertical rules direction. **09 Minimal rules is the production mobile
header**. Production now uses a minimum 44px target, 14px figures/status and
12px labels above the figures to address readability feedback. These historical
samples retain their original sizing. The approved Clean ledger match rows stay
unchanged.

| Option | Header | Height |
| --- | --- | --- |
| 01 | Fine rules | 32px |
| 02 | Continuous rules | 30px |
| 03 | Inset rules | 32px |
| 04 | Strong rules | 32px |
| 05 | Status cell | 32px |
| 06 | Metric cells | 32px |
| 07 | Centered columns | 32px |
| 08 | Right-aligned figures | 30px |
| 09 | Minimal rules | 28px |
| 10 | Bold slip number | 34px |

Every candidate has one horizontal row: slip number, total odds, Probability,
Matches and status. All ten share the same column grid and one-pixel vertical
rules. At the default text size, slip/odds/matches/status/chevron tracks occupy
44/64/58/50/8px; Probability receives the remaining width, with a 74px minimum.
The entire status cell stays 50px wide for Pending, Won, Lost and Void. Separators do not move when
numbers or statuses change. Vertical padding is zero. Metric/status cells use
3px horizontal padding and the slip identity uses 2px.

Narrow frames use Prob. for Probability. Matches and full status words remain
visible. Larger odds keep their complete figures with the label available in
the accessible name and title; numbers are never ellipsized. Probability keeps
the existing calculation: the mean of individual match probabilities, rather
than a whole-slip win estimate. Enlarged text can scroll within the header.

Use **Inspect** or the Design selector, 320/375/430px width presets and light/dark
appearance. Scenarios show coherent Pending/Won/Lost/Void records, eight matches,
Slip 100 with larger odds and long team names. Extra status-only headers compare
the other outcomes without attaching incorrect results to expanded match rows.
All expanded examples call the unmodified production `CleanLedgerSelection`.
The review and production mobile slips share `MobileSlipHeader`; only the
comparison's variant styles differ. Desktop headers retain their selected layout.

To serve a stable local review independently of application rebuilds:

```powershell
python scripts/preview-slip-designs.py --view mobile-headers --serve --port 3123
```

Then open <http://127.0.0.1:3123/en/slips/designs/headers>. Use `--reuse` to serve
that previously built review. The dedicated `.tmp/mobile-slip-header-review`
directory, browser scripts and `output/playwright/mobile-slip-headers/` images
are ignored. The preview uses illustrative data and generic local crests.
