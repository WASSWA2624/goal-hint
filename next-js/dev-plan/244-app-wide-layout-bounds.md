# 244 · App-wide layout bounds and uniform control rows

- Audit public, member and owner screens with real components and synthetic
  records at phone, tablet and desktop widths, in both themes and pointer modes.
- Check control bounds, content overflow and alignment of visible controls on
  each row, including validation messages, nested actions and open overlays.
- Fix reusable layout rules at their source; preserve shared control metrics
  and give embedded controls enough room inside their parent frames.
- Add browser regressions for confirmed failures, verify production rendering,
  then commit and push the intended changes on `main`.
