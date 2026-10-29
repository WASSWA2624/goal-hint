# 132 · Desktop subscription banner samples

## Scope

Prepare ten reviewable desktop concepts before selecting a production design.
Show every concept signed out, signed in without a subscription, and subscribed.
Keep production banners, mobile, and app-wide terminology changes for the later
approved implementation.

## Implementation

- Add a non-indexed `/en/banner/designs` review route using the shared app brand,
  themes, square controls and existing design-gallery components.
- Put each banner immediately below the same desktop header with a thin divider
  and no gap; support 1024, 1280 and 1440px desktop canvases.
- Centralize sample action labels and illustrative pricing. Guests receive Sign
  in / Sign up actions, members receive Subscribe, and subscribers receive access
  confirmation and a relevant account or prediction action.
- Provide all thirty previews, design/state filters, light/dark previews, and a
  local shortlist that never applies a design or changes an account.

## Verification

- `npm run typecheck` passed for the application.
- Targeted ESLint passed for the new review components and route.
- The isolated production build and rendering verification passed: all ten
  options and thirty state previews, appropriate actions, adjacent headers,
  branding, unique IDs, no session cookie, and noindex/nofollow metadata.
- Browser checks passed for all thirty samples at 1024, 1280 and 1440px in both
  themes, with no banner overflow, no header gap and square corners. Design/state
  filters, shortlisting and review-only action feedback passed.
- Screenshots were inspected. The isolated fixture has no favicon; its only
  browser console error is that missing optional asset.
- The existing app returned HTTP 200 for `/en/banner/designs` on port 3000.
- No production banner, mobile component or app-wide authentication label was
  changed. Full application build/integration suites were outside this review
  scope; the isolated production build covers the added review route.
