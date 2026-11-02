# 244 · App-wide layout bounds and uniform control rows

- Audit public, member and owner screens with real components and synthetic
  records at phone, tablet and desktop widths, in both themes and pointer modes.
- Check control bounds, content overflow and alignment of visible controls on
  each row, including validation messages, nested actions and open overlays.
- Fix reusable layout rules at their source; preserve shared control metrics
  and give embedded controls enough room inside their parent frames.
- Add browser regressions for confirmed failures, verify production rendering,
  then commit and push the intended changes on `main`.

Resolved:
- Right-edge select menus could extend 80px beyond a 320px viewport. Shared
  picker positioning now clamps against the layout/visual viewport and opens
  above the trigger when necessary, including after touch-device resizing.
- Narrow dialog footers squeezed labels into taller buttons. Actions now wrap
  as whole controls using the shared row height and floating-label alignment.
- Multiple-choice summaries now truncate within their fixed frame while the
  full selection remains available to assistive technology and in the picker.
- Mobile Help/Privacy/Terms contents links and the desktop match Back link now
  use the same inherited height as ordinary navigation controls.

Verified:
- 420 screen cases passed across public, member, payment and owner screens,
  both appearances, fine/coarse pointers and 320/1024/1440px widths. The audit
  inspected 12,285 visible controls and 7,871 overlapping control pairs.
  Interrupted navigations were remeasured in fresh contexts after loading.
- 480 viewport-bounds cases passed at 320/390/768/1024/1440/1920px, with short
  and tall viewports, both appearances and both pointer modes. These include
  long selections, validation, keyboard selection, resizing and dialog footers.
- 480 mixed-row cases, 144 public filter-row cases and 216 slip-header bounds
  cases passed. Embedded app-header controls retain their documented metric.
- Production compilation and TypeScript passed in an isolated checkout with
  the integrated shared styling. Phone/desktop screenshots were inspected.
- All 76 focused regressions passed; one subprocess timeout passed on an
  isolated retry. Targeted ESLint, Python syntax and the theme contract passed.
