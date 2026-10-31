# 214 · Proportional lineup presentation

## Goal

Represent football lineups with balanced, realistic pitch geometry and accurate
labels while retaining the compact desktop page and existing access rules.

## Implementation

- Use one shared 105 × 68 reference field and IFAB Law 1 marking dimensions.
  Uniform SVG scaling preserves equal halves, circular arcs and proportional
  goals/penalty areas. These are reference proportions, not venue measurements.
- Place both teams on the supplied formation grids. Reject incomplete,
  duplicated or inconsistent coordinates instead of drawing a misleading
  formation. Preserve complete starter lists when a diagram is unavailable.
- Bound the pitch width and place substitutes alongside it on wider desktops;
  narrower screens keep readable labels and move substitutes below.
- Expand provider position codes into readable roles without guessing specific
  tactical roles. Show confirmed status from the supplied lineup and identify
  the diagram as schematic starting positions. Keep retrieval timestamps
  distinct from provider update timestamps.
- Make sample-data provenance visible in the isolated review preview. Keep
  synthetic players and fixtures out of production imports.

## Verification · 31 October 2026

- Forty-one focused URL, detail, access, observation and pitch geometry tests:
  passed. Geometry covers 4-3-3, 4-2-3-1, 5-4-1 and 3-5-2, plus missing,
  duplicate and contradictory formation coordinates.
- Main application type checking, including the final timestamp changes:
  passed. Scoped ESLint and whitespace checks: passed.
- Isolated native Next.js production component builds: passed. The final
  browser acceptance also verifies retrieval/update wording using a lineup
  with no provider update timestamp.
- Native desktop browser checks at 1024px, 1280px and 1440px: passed. Field
  proportions, circular markings, fixed shirt centres, own-half placement,
  unbroken role labels, marker separation and responsive substitute placement
  are verified. No browser errors or horizontal overflow were observed.
- Keyboard tabs, filter refresh, player profiles, Back navigation and the
  existing 390px phone presentation: passed. Visually checked the pitch,
  substitute lists and shared venue diagram. Existing authorization is unchanged.
- Updated the existing review endpoint on port 3118 with the verified build;
  synthetic fixture/player provenance is visible in its preview controls.
