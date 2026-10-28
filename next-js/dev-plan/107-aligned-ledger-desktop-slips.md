# Implement desktop Aligned ledger

## Scope

- Apply selected desktop concept 01 to Best slips and the slip builder.
- Keep the existing mobile Clean ledger presentation and its spacing unchanged.
- Reuse the approved collapsed native header and desktop-only 3px slip gaps.
- Share production row formatting and geometry with the desktop design review.

## Implementation

- Use hyphenated dates, tightly grouped date/time, country before league, and
  fixed country, league and status columns with ellipsis/full-name tooltips.
- Anchor all scores/VS and text-height home/away crests on common vertical lines.
- Show supplied live scores, provider minutes/HT, verified regulation finals,
  and separately adjudicated original-selection outcomes.
- Keep current match observations outside immutable slip snapshots. Match every
  observation to its original fixture, family, selection and forecast reference.
- Reuse the existing batched sealed-result read for published slips and the
  builder's validated scheduled cohort; add no provider, API or database reads.
- Keep unknown and saved-result fallbacks honest, preserve replacement-cycle
  isolation, and gate observations with the released entitled slip.
- Preserve canonical analysis links and keyboard controls without nesting links
  around tooltip buttons or shifting score positions.

## Verification

- Full optimized application build, TypeScript, offline manifest and ESLint pass.
- 65 domain/server regressions and 38 additional snapshot, saved-slip, paywall
  and prediction-label cases pass. Coherent live clocks survive missing scores;
  original-cycle identity and verified-regulation settlement remain enforced.
- Ten isolated production SSR cases pass, covering actual BestSlips and builder
  components, locked HTML/Flight privacy, saved/void outcomes and unknown states.
- Initial 48 desktop browser cases pass across 1024/1280/1600px in both themes.
  After uniformly widening the numeric tracks, 18 final desktop cases pass along
  with three phone/resize cases, exact anchors, keyboard controls and tooltips.
- Large 9999.99 odds and >99.9% probability labels/values stay inside their cells
  without moving the score track. Coarse-pointer targets stay 44px inside rows.
- Both live application pages return HTTP 200. Screenshots receive visual review;
  no duplicate responsive match tree or phone spacing changes are present.
- Preserve unrelated header/offline work, existing stashes and detached worktrees.
