# 233 · App-wide floating labels

## Objective

Use one compact floating-label treatment across public, account, checkout,
slip, match, analytics, and owner screens, including their review galleries.

## Contract

- Empty, unfocused fields show the label inside the field. Focus or a value
  moves it left into the top border margin.
- Labels stay transparent. A decorative fieldset/legend cuts an actual gap in
  the outline; no background or badge is painted behind the label.
- Reuse shared geometry for text, number, phone, search, date/time, selects,
  textareas, and composite controls. Keep checkbox/radio option labels.
- Preserve IDs, accessible names, hints, errors, refs, native form submission,
  reset behavior, numeric guards, formatting, and keyboard interactions.
- Use the theme radius scale, matching 40px controls (44px on touch devices),
  aligned row bottoms, and reduced-motion preferences.
- Floating fields have no visible placeholders or extra focus rings.
- “Total slips” remains a section legend above its count control, with the same
  height and baseline as the neighbouring numeric fields.

## Verification

Run lint, typechecking, relevant form/domain tests, production compilation,
and the floating-label browser fixture at phone, tablet, and desktop widths
in both themes. Check empty/focused/filled/cleared/reset states, native date/time
segments, restored values, transparent labels, border gaps, and overflow.

## Completed verification

- Production app build and TypeScript compilation passed.
- 55 focused tests passed for filtering, numeric guards, phone fields, and themes.
- Browser checks passed: 1,528 assertions at 320/390/768/1440px in both themes,
  plus 380 assertions in a touch-device context.
- The integrated 48-screen matrix passed at phone/desktop widths in both themes.
- The real slip builder passed 10 theme/width cases (320–1440px), including the
  Total-slips section legend, equal numeric heights/bottoms, and arrow behavior.
- Existing stashes, detached worktrees, and the concurrent theme work were preserved.
