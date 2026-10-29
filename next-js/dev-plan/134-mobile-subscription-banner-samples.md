# 134 · Mobile subscription banner samples

## Scope

Prepare ten mobile concepts for selection, each showing signed-out visitors,
signed-in members without a subscription, and active subscribers. Keep the
approved desktop banner and current live mobile banner unchanged. All mobile
sample messages and actions must fit one physical row, including at 320px.

## Implementation

- Add a non-indexed `/en/banner/designs/mobile` review route with thirty previews.
- Reuse shared gallery UI, branding, themes, authentication labels, review offer
  and state descriptions. Keep all preview actions local and harmless.
- Use a consistent mobile header, a thin divider, no header/banner gap and square
  controls. Use brief state-specific copy and vary the single-row structure
  meaningfully across the ten options.
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
- Final browser checks on the app passed all 240 combinations of thirty samples,
  four phone widths and two themes. Actual text-range geometry confirms one
  physical line without wrapping or clipped text. Every banner is 44px high,
  every header is 48px, header gaps are zero and action targets meet the 24px
  minimum. No horizontal overflow was found.
- Design/state filters, review-only action feedback, shortlisting and both
  header/toolbar theme controls passed. The gallery also fits a 390px browser.
  Light/dark screenshots were visually inspected.
- Access steps use an accessible named step marker. Both production banner files and
  the existing desktop review are unchanged.
- This adds review-only UI; no database integration or full application build
  was needed. The production fixture covers the added route.
- The local preview was restored on port 3000. Normal demo preparation stopped
  after preparing existing fixture dates; the preview uses the existing owned
  demo database without repeating preparation. No production data or configuration
  was changed by this review.
