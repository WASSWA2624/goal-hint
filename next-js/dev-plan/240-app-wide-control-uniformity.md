# 240 · App-wide control uniformity

## Contract

- Use one inherited control height: 40px for fine pointers and 44px for coarse
  pointers, independent of viewport width, theme, screen or toolbar density.
- Inputs, native/custom selects, date pickers, buttons, button links, navigation,
  tabs and pagination reuse that metric. Emphasized actions keep the same height.
- Align visible control bodies from the top. The shared row reserves floating
  label space for adjacent actions; hints and validation messages stay below it.
- Embedded password toggles, search actions and number steppers fit their parent
  control. Multiline textareas, record cards and image previews retain their
  content geometry. They are not single-line controls.
- Keep historical design samples separate from production geometry.

## Verification

Exercise mixed rows, account validation, payment/checkout actions, owner tabs
and header actions at 320/390/768/1024/1440/1920px in both themes with fine and
coarse pointers. Audit public and owner screens, including dialogs and wrapped
rows. Run lint, type checking, relevant regressions and production compilation.

## Completed checks

- 480 exact mixed-row cases passed at 320/390/768/1024/1440/1920px,
  including light/dark themes, fine/coarse pointers and validation messages.
- 120 real screen row cases passed for Best Slips, Matches, Slip Builder,
  analytics, referrals and performance filters.
- 192 owner screen cases passed, auditing 3,504 visible controls across eight
  screens, both themes, both pointer modes and all six viewport widths.
- 24 match-detail tab cases passed at phone and desktop widths.
- 1,528 existing floating-label assertions and 10 faint-outline mixed-row cases
  passed. Visual inspection confirmed equal control bodies with error text below.
- The isolated change passed lint and all 95 focused regression tests, preserving
  the latest shared button-padding change.

- The isolated optimized production build, TypeScript compilation and offline
  manifest generation passed.

The working checkout also contains a separate theme-token refactor. Its edits
are preserved; the intended uniformity change is verified in a detached checkout.
