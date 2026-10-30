# 177 — Compact mobile match-card options

## Request

Review the existing match cards and create ten compact mobile options for
comparison before selecting a reusable card for Matches, Cards and Slips.
Preserve the approved slip layouts and desktop presentation.

## Implementation

- Reviewed the shared feed/slip card components, typography, status placement,
  responsive behavior and semantic radius scale. Inspected the current mobile
  acceptance rendering.
- Added ten distinct arrangements in
  `design/mobile-match-card-designs/mobile-match-cards.html`. A shared renderer
  supplies the same fixtures, market, pick, odds, estimated chance, schedule
  and supplied score/outcome to every arrangement.
- Included long names, live/half-time scores, completed results, locked/missing
  picks, unknown kickoff, missing odds, double chance and postponement.
- Added Matches/Cards/Slips contexts, full-card disclosure with keyboard
  support, phone widths and theme support. The inline comparison uses the
  host's native variant carousel and shared design controls.
- Added an offline-capable browser review with a named picker, previous/next,
  compare-all mode, settings, URL restoration and actual card measurements.
  `scripts/preview-mobile-match-card-designs.py --serve` serves it locally.
- Kept production routes, shared mobile/desktop components, approved slip
  headers, APIs and Flutter unchanged. The selected option will be integrated
  separately into the shared mobile card.

## Verification

- Browser checks passed for 900 layout/settings combinations, totaling 2,700
  rendered cards, at 320/375/430px in both themes and all three contexts.
- No text clipping, overlapping facts, horizontal overflow, hidden supplied
  scores, duplicate IDs or runtime errors in those checks.
- Disclosure, Enter activation, state preservation across designs and URL
  restoration passed. Inspected light, dark, long-name and slip captures.
- Inline navigation visited all ten options and returned to the first;
  context/width updates and inherited dark appearance passed. Python and
  JavaScript syntax, inline structure and staged whitespace checks passed.
- Synthetic examples validate presentation only; production access control,
  live updates and prediction services remain outside this review.

## Decision

Await the user's choice among the ten options. No production variant selected.
