# 151 — Simple desktop slip sharing

## Request

Make all ten sharing designs easy to find in an ordinary browser, and revise
the samples for elegance, brevity, and simplicity. The previous gallery placed
concept navigation below a large stage, making the first design appear alone.

## Design changes

- Keep the review in `next-js/design/desktop-slip-sharing/` and preserve the
  production Best Slips and Slip Builder components.
- Revise the ten concepts as Compact menu, Centered preview, Slim drawer,
  Inline preview, Quick WhatsApp, Split preview, Bottom bar, Image first,
  Quick actions, and Minimal sheet.
- Keep the header action and WhatsApp preview to one or two interactions.
  Use one main WhatsApp action with secondary Save image and Copy caption
  actions. Keep feedback inside the preview.
- Remove the separate handoff screen, repeated explanatory copy, and technical
  route descriptions from the sample product UI.
- Retain the existing Goal Hint identity, square edges, reusable controls,
  compact typography, and shared illustrative three-selection slip.
- Include the branded image, short caption, app URL, and example slip URL.
  All actions remain local simulations awaiting concept selection.

## Browser review

Keep `desktop-slip-sharing.html` as an inline fragment with the host carousel.
Use `build-preview.py` and `browser-controls.html` for a standalone browser page
with top-level 01–10 buttons, Previous, Next, and Show all 10. Show all presents
the ten designs one below another. App navigation compares both page contexts.

From the repository root:

```powershell
python next-js/design/desktop-slip-sharing/build-preview.py
python -m http.server 8357 --bind 127.0.0.1 --directory "next-js/output"
```

The builder writes ignored `next-js/output/desktop-slip-sharing-preview.html`.
Open `http://127.0.0.1:8357/desktop-slip-sharing-preview.html` for browser review.

## Scope and verification

The existing `GH-26K-8F2` identifier and `/s/GH-26K-8F2` URL are illustrative.
Public slip storage, image export, real sharing, and installed-app linking
follow concept selection. Mobile design remains deferred.

Completed builder and JavaScript syntax checks, all navigation and Show all
controls, 20 sharing flows across both page contexts, and 30 layout checks across
three browser widths. All ten designs also passed containment in Show all mode.
Keyboard activation, menu toggling, Escape dismissal, and light/dark screenshot
review passed. The browser console reported no errors or warnings. Actual check
details are in the design README. Plan 149 remains the historical record of the
original gallery.
