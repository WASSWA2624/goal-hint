# 134 · Mobile subscription banner samples

## Scope

Prepare ten mobile concepts for selection, each showing signed-out visitors,
signed-in members without a subscription, and active subscribers. Keep the
approved desktop banner and current live mobile banner unchanged.

## Implementation

- Add a non-indexed `/en/banner/designs/mobile` review route with thirty previews.
- Reuse shared gallery UI, branding, themes, authentication labels, review offer
  and state descriptions. Keep all preview actions local and harmless.
- Use a consistent mobile header, a thin divider, no header/banner gap and square
  controls. Vary banner structure meaningfully across the ten options.
- Compare phone widths 320/360/390/430px, both themes and all account states;
  support design/state filtering and a review-only shortlist.
- Verify production rendering, state-appropriate actions, responsive fit,
  accessible controls and unchanged production components.

## Verification

- Application type checking and targeted ESLint passed. Python verifier syntax
  and whitespace checks passed.
- The isolated production build and rendering verification passed: ten designs,
  thirty account-state previews, correct actions, no active-subscriber sales
  pricing, header adjacency, unique identifiers, shared branding, indexing
  protection and no account-session cookie.
- Browser checks passed all 240 combinations of thirty samples, four phone
  widths and two themes. All headers are 48px, banners have no header gap or
  horizontal overflow, and action targets meet the 24px minimum. Banner heights
  range from 44–83px at 320px and 44–71px at the larger reviewed widths.
- Design/state filters, review-only action feedback, shortlisting and both
  header/toolbar theme controls passed. The gallery also fits a 390px browser.
  Light/dark screenshots were visually inspected.
- Access steps use an accessible named group. Both production banner files and
  the existing desktop review are unchanged.
- This adds review-only UI; no database integration or full application build
  was needed. The production fixture covers the added route.
