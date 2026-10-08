# 015 Brand styling

**Feature:** Shared Goal Hint design system with reliable server-rendered styles.

**Depends on:** [001-project-foundation.md](001-project-foundation.md)

**Source:** [app-write-up.md](../app-write-up.md) §§3, 6, 9, 13, 15; [brand guide](../assets/brand/README.md).

## Prompt

Read `dev-plan/000-index.md`, the source sections, brand guide, applicable repository instructions and existing code. Implement this styling feature only, preserving the existing framework baseline and using the named first-party assets in `public/brand/`.

Create typed, reusable light-theme tokens for the existing navy/teal palette, typography, spacing, breakpoints, surfaces, borders, focus and outcome states. Respect the brand asset proportions, clear space and accessible naming. Use square component corners. Keep brand accents separate from outcome colors; all outcome treatments must support text and icons. Prepare token structure for a later dark theme without adding a switch or another theme now.

Enable the styled-components compiler setting and the documented App Router registry using `ServerStyleSheet`, `StyleSheetManager` and `useServerInsertedHTML`. Keep styled definitions, `ThemeProvider` and `createGlobalStyle` in Client Component modules while retaining server-rendered content. Reuse a single registry/provider arrangement; do not create styled components inside render functions. Use transient styling props.

Build the shared layout and control primitives needed by subsequent prompts: accessible buttons/links, labeled inputs, focus treatment, status text and empty-state presentation. Start at 16 px body text and approximately 44 px touch targets. Support long text and logical spacing. Do not implement the feed or match card yet. A small development-only demonstration may exercise primitives; no sample football data belongs in production routes. Bundled brand imagery is allowed; third-party football images must remain direct remote URLs.

## Acceptance checks

- Run the relevant production build and inspect initial HTML/CSS and streamed navigation for missing/duplicated styles, flashes and hydration warnings.
- Check primitives at 320 px and 200% text zoom, with keyboard focus, long text, reduced motion and readable color contrast.
- Confirm client output contains no server secrets and styling props do not leak to DOM attributes.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, validation results and blockers in `docs/development-progress.md`; record substantive implementation decisions in `docs/implementation-decisions.md`. Identify the reusable exports for later prompts.
