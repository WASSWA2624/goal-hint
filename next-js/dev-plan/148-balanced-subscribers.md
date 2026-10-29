# Balanced compact Subscribers

Apply the approved 01 layout to the live Subscribers workspace with shared record,
field, action, phone, network and dialog components.

## Implementation

- Share the directory filters, identity rows and Balanced presentation between
  production and the ten review studies; mark 01 as applied.
- Keep the Subscribers heading left and the grant/add action right. Reduce the
  account summary, action controls and tabs to the approved compact arrangement.
- Search automatically after a short debounce. Cancel superseded requests, keep
  filters usable while loading, and show retry and empty states.
- Filter account status, current access, package and recent sign-in before the
  100-account result cap. Match normalized phone fragments, account IDs, code and
  payment references, package names and private notes without returning notes.
- Open existing grant, number-change, restriction and device actions in the shared
  modal. Keep Reset password out of this interface.
- Preserve real server navigation and action transports, mobile directory/back
  navigation and independent directory/detail scrolling.

## Data constraints

Unknown carriers use the neutral network icon; artwork requires a configured
carrier mapping. Recent sign-in is available, but reliable live presence is not.
Current package/access summaries exclude expired and revoked periods.

## Verification

- Targeted directory/API regression tests, including a match beyond the initial
  100-account cap and validation of malformed filters.
- TypeScript and targeted ESLint.
- Production fixture rendering plus browser checks of debounced queries, filters,
  recovery, dialog actions, keyboard behavior and narrow-screen layout.
