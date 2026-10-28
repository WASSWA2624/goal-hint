# Open match details from the complete match card

## Accepted scope

- Make each match card open its respective match details from the complete
  visible card on desktop, tablet and mobile.
- Reuse the shared match presentation and existing canonical match destinations.
- Preserve the current square surfaces, content and responsive layouts.

## Implementation

- Make the desktop row's primary analysis link span the complete row. Keep its
  accessible match identity and supplied analysis description.
- Keep the visible score/VS as presentation within the shared team composition.
- Allow `TruncatedText` to render a native link alias when a match destination is
  available. The alias retains full-name hover/focus tooltips and standard link
  behavior; only clipped names introduce an additional keyboard stop.
- Keep metadata links and tooltip controls above the row link. Preserve the
  existing full-card analysis link on phones and tablets.
- Restore feed focus to the primary match analysis link after returning from
  details, independently of metadata aliases.

## Behavior boundaries

- Preserve canonical fixture IDs/slugs, native keyboard navigation, modified
  clicks, middle clicks and new-tab/context-menu behavior.
- Preserve current forecasts, odds, scores, progress, authorization and existing
  regulation-only score notes.
- Keep saved/offline cards and callers with analysis links disabled free of
  analysis links, metadata aliases or programmatic navigation.
- Preserve unrelated header/filter work and existing Git state.

## Verification

- The isolated production match-card fixture passed all existing assertions for
  its 13 single-copy server-rendered examples, including exact prices, all
  outcomes/sources and the supplied live minute. The mobile server fallback
  contract remains unchanged.
- Thirty-seven browser checks passed at 390/768/1024/1280px, covering complete
  card hit targets, Enter activation, Ctrl-click aliases, middle-click, clipped
  name tooltips and row bounds.
- The Matches feed opened each tested canonical detail destination and restored
  the primary analysis-link focus and scroll position after Back at
  390/768/1280px.
- A fresh independent feed fixture passed 46 server-rendered scenarios, 11
  status/date redirects and five invalid-query guards using the existing
  captures without repeating database preparation. A second fresh production
  fixture passed the same checks after the final title-preservation refinement.
- Forty-two focused Node tests, scoped ESLint on the four changed source files,
  full type checks and the production application build passed. Scoped ESLint
  and full type checks also passed after the final title-preservation
  refinement.
