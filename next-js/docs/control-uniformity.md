# Control uniformity

Every production single-line control uses `--form-control-height`: **40px**
for fine pointers and **44px** for coarse pointers. `controlMetrics` in
`src/components/ui/control-layout.ts` defines it once on the document through
`GlobalStyle`. The values come from `theme.control.height`, `touchHeight` and
`labelSpace`; appearance presets share them. They do not depend on viewport width.

Use `controlHeight` for actions that may wrap and `controlBodyHeight` for
single-line fields and fixed control bodies. A local style can reference the
inherited variable directly; the root provider always defines it. Do not replace
it with compact, mobile, desktop, payment or account dimensions. The `large`
action variant changes emphasis without introducing another height.

Use `controlRow` (also exported as `inlineControlRow`) for mixed fields and
actions. `Inline` already includes it. The row aligns from the top and reserves
the floating label's 6px space for adjacent actions and action groups when
fields are present. Helper text and errors stay below the control body.
Use `data-control-field` on a new field wrapper so the row can recognize it.

Password toggles, search submit icons, number steppers and slip-header actions are embedded controls:
they fit inside their enclosing field or header. Checkbox/radio glyphs, decorative icons,
multiline textareas, record cards and image previews keep their own dimensions.
Their surrounding actionable labels and ordinary buttons use the shared height.

Slip-header Share and disclosure frames share a smaller height derived from the
control metric, with equal vertical inset. Keep their full bounds inside the
header; the disclosure's end gutter must include its frame and side clearance.

`tests/helpers/rendering/floating-labels` renders real mixed controls, account
validation, checkout/payment actions, owner tabs and header actions. Build it
with `python scripts/verify-floating-labels-rendering.py --serve`. The browser
helpers in `scripts/verify-control-rows.mjs` check exact heights, row edges,
validation changes and overflow. Exercise both themes and fine/coarse pointers
at 320, 390, 768, 1024, 1440 and 1920px. `inspectControlHeights` also audits
visible controls in a production screen or an isolated screen fixture.
