# Slip Builder filter design samples

Ten interactive concepts for reviewing the upper settings section of the
**Slip Builder** page. Each concept shows its desktop and mobile layouts
side by side so the user can select a design before production implementation.

The samples follow the existing Matches filters and slip cards: compact
typography, quiet dividers, flat selections, shared controls, and square edges.
Only the isolated review gallery and its documentation are included in this
change.

## Concepts

| No. | Concept | Arrangement |
| --- | --- | --- |
| 01 | Compact toolbar | Essential slip settings followed by compact refinement controls. |
| 02 | Visible field grid | All settings remain visible in aligned groups. |
| 03 | Range ledger | Settings use aligned minimum and maximum columns. |
| 04 | Editable summary cells | Current values appear in cells that open their editors. |
| 05 | Essentials plus expand | Common settings remain visible; additional criteria expand inline. |
| 06 | Grouped tabs | Related settings share one editing area behind group tabs. |
| 07 | Summary accordions | Section summaries expand to reveal their settings. |
| 08 | Inline builder sentence | Slip count, match count, and total odds form a readable setup sentence. |
| 09 | Side-tab editor | Section navigation sits beside a shared editor. |
| 10 | Quiet settings header | A compact criteria summary opens a unified settings editor. |

## Shared preview defaults

| Setting | Default |
| --- | --- |
| Number of slips | 5 |
| Total odds per slip | Minimum 0.01; maximum blank |
| Matches per slip | Minimum 1; maximum blank |
| Individual odds | Minimum 0.01; maximum blank |
| Probability | Minimum blank; maximum 100% |
| From and to dates | Both today in Africa/Kampala |
| From and to times | 00:00–23:59 EAT |
| Markets | Auto; all four market families selected |
| Result selection | Automatic |
| Reuse matches across slips | Off |

A blank maximum means Any. A blank minimum uses the lowest valid value:
0.01 for odds, 1 for matches, and 0% for probability. Reset restores the shared
defaults. Preview validation checks valid numbers and ordered ranges while
preserving these blank-bound meanings.

The viewer's account-state control is for comparing button labels only:
**Sign in** when signed out, **Subscribe** when signed in without the required
subscription, and **Build slips** when eligible. It does not change account
access or navigate to authentication or payment flows.

Controls edit local preview state. The gallery does not generate real slips,
query matches, call the backend, or modify the production Slip Builder.
The requested 0.01 odds floor and unrestricted optional maxima differ from
existing production constraints; those contracts require reconciliation when
the selected design is implemented.

The preview represents the default estimator-disabled configuration. It does
not include the optional combined-probability mode.

## Local preview

Open `slip-builder-filter-designs.html` directly in Chrome, or refresh the
existing tab. Its top toolbar provides **Previous**, **Next**, a numbered sample
picker, and **Show all 10**. Account state, mobile width, and appearance controls
are available in the same toolbar. Switching samples preserves local edits.

To serve the exact file over local HTTP instead, run:

~~~powershell
python -m http.server 8356 --bind 127.0.0.1 --directory "D:/coding/apps/nextjs/goal-hint/next-js/design/slip-builder-filter-designs"
~~~

Then open `http://127.0.0.1:8356/slip-builder-filter-designs.html`.

The in-conversation preview retains the host's carousel and optional design
controls. For comparison with that rendering, the chat preview wrapper can
also serve the fragment:

```powershell
python "C:\Users\WASSWA WILSON\.codex\plugins\cache\openai-bundled\visualize\1.0.57\skills\visualize\scripts\render.py" "D:\coding\apps\nextjs\goal-hint\next-js\design\slip-builder-filter-designs\slip-builder-filter-designs.html" --serve
```

Open the local URL printed by that command. The wrapper location is specific
to this workstation and may change when the installed skill version changes.

## Original preview verification

These checks were completed before the standalone navigation follow-up.

- JavaScript syntax passed for the single inline script, approximately 45KB.
- All 300 layout cases passed: ten concepts, light/dark appearance, 320/340/390px
  phone widths, and 320/390/768/1056/1440px host widths. No page or control
  overflow or visibly cramped default 0.01 numeric fields remained.
- All ten concepts passed requested defaults, paired desktop/mobile input
  synchronization, Reset, blank-minimum floor acceptance, zero-match rejection,
  reversed probability/date rejection, multi-result market selection,
  Automatic restoration, and rejection when no markets are selected.
- All 20 primary buttons passed Sign in, Subscribe, and Build slips label
  checks through the Tweak binding test shim.
- No runtime exceptions occurred during interaction checks.
- All 100 expanded/editor/tab layout states passed at 320px and 1056px host
  widths without controls overflowing their product frames.
- Screenshots of Compact toolbar and Side-tab editor were visually reviewed.
  Cramped Side-tab editor fields were corrected and the revised layout checks
  passed.

Inline editors passed focus entry, trigger association, Escape dismissal, and
focus restoration checks. Exhaustive keyboard accessibility has not been audited.
Whitespace checks passed.

## Standalone navigation follow-up

The original fragment relied on host-supplied navigation, which left only the
first sample accessible when opened directly in Chrome. A top-level browser
fallback now supplies its own gallery toolbar and local preview controls.
The in-conversation view continues to use host navigation.

- Passed: all ten numbered selections, Previous/Next endpoint behavior,
  Show all 10/Show one, and preservation of edited inputs during navigation.
- Passed: all three account states update all 20 action labels; 390px mobile
  width applies; light/dark selection and the UTF-8 page title display correctly.
- Passed: 100 standalone layout cases across all ten concepts, both themes,
  and 320/390/768/1024/1440px host widths, with no horizontal overflow.
- No runtime exceptions occurred. JavaScript syntax and whitespace checks passed.
- The exact file was tested as a top-level HTTP page with both Tweak and
  `window.openai` undefined.
- Embedded-host verification passed: the standalone toolbar was absent inside
  the frame, and native carousel Next switched from Compact toolbar to Visible
  field grid without duplicate navigation.

Browser automation blocks `file:` URLs, so direct file opening has not been
automated. The HTTP checks exercised the exact file without an iframe or host helper.

These samples are a design review stage. No production build, backend
verification, or production redesign is claimed; implementation awaits the
user's concept selection.
