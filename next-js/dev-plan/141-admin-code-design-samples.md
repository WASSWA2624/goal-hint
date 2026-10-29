# 141 · Admin Codes interface samples

## Scope

Create ten interactive Codes interface samples after approval of the proposed
refinements. Preserve the shared admin layout and existing component system,
with square controls, validated phone entry, and clear form requirements.

## Implementation

- Use one real Codes workspace for ten scoped compositions, with numbered
  navigation, direct fragment links, overview cards, theme switching, record
  details, manual grants, and sample reset.
- Keep only code, phone, and status in the list. Place additional information
  in the selected desktop details or a mobile record disclosure.
- Add a shared accessible floating field for search/status, capitalize status
  labels, and make the Codes workspace title visible.
- Reuse the existing phone normalization and validation. Preserve custom-day
  enablement and required server-validated notes, with clearer reason wording.
- Add a reusable native provider radio group with the existing MTN/Airtel logos
  inside optional payment details.
- Route preview actions exclusively to an in-memory adapter. Suppress live
  refresh actions and keep native form fallbacks away from mutation endpoints.
- Add a small isolated production fixture and rendering verification script.

## Verification

- Full application TypeScript and ESLint checks passed.
- 22 phone, country, access-code, and admin-record navigation tests passed.
- The isolated production gallery build and SSR checks passed for ten unique
  samples, shared controls, provider assets, required notes, unique identifiers,
  indexing metadata, and safe form fallbacks.
- Browser checks across all ten samples at 320, 390, 768, 1024, 1280, and 1440px
  found no document overflow or out-of-viewport form fields. Both themes were
  checked, including desktop payment details and unique field identifiers.
- Browser interactions verified invalid-phone feedback, normalization of local
  and full-country formats, custom days, provider submission, grants, normalized
  search, extension, and revocation, with zero admin API requests.
- Review fixes were checked in the running application: the mobile Record
  details control opens the selected record, and extending an expired sample
  into the future updates its status and inclusion in the Active filter.
- A fresh production owner fixture and its complete acceptance suite passed:
  all owner routes and six record workspaces, manual grants and leading-zero
  phone normalization, subscriber operations, Plans, Settings, Audit, and
  payment decisions and private attachments.
