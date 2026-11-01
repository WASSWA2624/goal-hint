# 225 · Card separation design review

## Intended result

- Prepare ten distinct, numbered, scrollable design treatments for slip and
  match cards on Best slips, Matches, and Slip Builder, for user approval.
- Keep the existing compact information layout. Compare modest mobile gaps,
  subtle corners from the brand radius scale, and better separation of the
  light page, parent surface, and card. Include a consistent dark counterpart.
- Provide an external-browser preview, independent option URLs, mobile sizes,
  desktop density review, theme switching, and a current-treatment comparison.
- Keep production screens unchanged until the user approves a treatment.

## Implementation

- A standalone gallery in `design/card-separation` uses shared sample data and
  reusable slip, match, and screen renderers for all ten options.
- `scripts/preview-card-separation.py` generates a self-contained, loopback-only
  preview using the existing brand tokens and bundled font. Output is ignored.
- The desktop preview retains continuous match rows and 4.5px outer slip gaps.
  Mobile options compare 8–10px standalone match gaps, 6–8px nested match gaps,
  and 14–16px between slips.

## Verification

- All 943 focused browser assertions passed, covering the ten options and 30
  screen previews, light/dark, proposed/current, mobile sizes, expected corners
  and gaps, distinct surfaces, desktop density, screen filtering, keyboard
  disclosure, independent links, invalid option fallback, and anchor navigation.
- No page, preview-frame, or card overflow at 320, 375, 430, 768, 1024, or 1440px.
  Additional checks confirmed odds/percentage values remain on one line and the
  desktop preview stays contained at those widths. No browser errors occurred.
- Reviewed light, dark, mobile, and desktop screenshots. Corrected narrow-screen
  numeric wrapping and the independent-link placement during visual review.
- JavaScript syntax and Python compilation passed. The loopback server returns
  HTTP 200 and the gallery was opened in an external browser. Production app
  tests/build were not run because this change only adds a standalone review.
