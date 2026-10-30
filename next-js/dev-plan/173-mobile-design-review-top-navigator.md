# 173 — Mobile design review link and top navigator

## Scope

Provide a browser link for all ten Best slips mobile concepts and keep the
design navigator at the top. Preserve the reviewed concepts and app behaviour.

## Implementation

- Add a standalone review shell with sticky Previous/Next buttons, a named
  ten-design picker, theme selection and subscriber/member/guest previews.
- Reuse the existing concept fragment without copying its data or layouts.
  The browser shell supplies navigation; the chat retains its native carousel.
- Preserve local controls while switching designs. Store the active design,
  appearance and viewer in the URL so reloads and direct links retain them.
- Add a Python launcher using the standard library. Generated HTML remains
  ignored in `output/best-slips-mobile-review`; the default local port is 4390.
- Keep production application files untouched.

## Verification

- 127 browser assertions passed across all ten designs at 320, 390 and 1024px:
  visible design selection, accurate counters, no horizontal overflow, 44px
  controls and a navigator that remains at the top when scrolling.
- Previous/Next wrap correctly. Direct URLs and reloads preserve design,
  appearance and viewer. Guest access previews and retained local filters pass.
- No JavaScript runtime errors occurred. The initial favicon 404 was resolved
  by copying the existing brand favicon into the ignored review output.
- Python compilation passed; visually reviewed the full browser page with the
  sticky navigator. Application production code remains untouched.
