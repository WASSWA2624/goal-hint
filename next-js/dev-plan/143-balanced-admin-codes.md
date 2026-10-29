# 143 · Balanced admin Codes

## Scope

Apply the selected 01 · Balanced composition to the live admin Codes workspace
using the same reusable components and presentation as the approved sample.

## Implementation

- Extract common Codes presentation and the Balanced composition into a small
  production style module shared by the live workspace and gallery.
- Default the live workspace to Balanced, with paired desktop account/plan and
  duration/amount fields, centered form spacing, and square controls. Stack the
  account fields in a narrow form container so the sidebar cannot cramp phone
  entry.
- Retain mobile form flow, record details, validation, and existing admin actions.
- Keep other sample compositions in the gallery and mark 01 as selected/applied,
  with a link to the live Codes page.

## Verification

- Full application TypeScript, targeted ESLint, and the isolated Codes gallery
  production build passed.
- Gallery SSR checks passed for all ten samples, shared controls, phone and
  provider markup, unique identifiers, safe preview forms, and local artwork.
- A fresh production owner build and the complete existing owner acceptance
  suite passed, including manual access grants, extensions, revocations,
  subscriber operations, payment workflows, Plans, Settings, and Audit.
- Browser checks passed for the live Codes workspace at 1024, 1280, and 1440px,
  with default, maximum, and collapsed sidebars in both themes (18 combinations).
  Fields stayed within the form, footers stayed visible, and no duplicate IDs,
  document overflow, or page errors were found.
- Mobile grant and details views passed checks at 320, 390, and 768px. Native
  phone validation and leading-zero normalization, custom-day enablement,
  provider selection, grant/search/extend/revoke actions were verified against
  synthetic owner fixture data.
- The owner fixture omits public slip and offline-worker endpoints; their
  expected 404 requests do not affect Codes rendering or actions.
