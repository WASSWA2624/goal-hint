# 248 · Consistent authentication forms

- Give credentials, verification, password recovery/reset and onboarding notices
  one centered form width through `theme.layout.formMaxWidth`. Bound nested
  account security forms with the same token.
- Share a restrained header, clear form spacing, filled primary actions and
  secondary link actions, with a separate support area for call/WhatsApp links.
- Group alternate destinations, existing-code and resend actions immediately
  below the primary form action. Keep support channels together within each
  contact row; wrap complete actions only when screen space requires it.
- Reuse the floating-field outline and label geometry for the phone country-code
  trigger, with a localized “Code” label and the shared control height.
- Preserve authentication, validation, code delivery, consent and navigation
  behavior. Verify real/synthetic flows in both themes at mobile/desktop widths.
- Keep the existing generic response and no-message behavior for unregistered
  password-reset numbers, as confirmed by the user after reviewing that flow.

## Verification

- All 104 focused theme, phone, verification-code, vocabulary, member-auth and
  development-worker checks passed. Registered/unknown-number recovery behavior
  remains covered by the unchanged authentication test.
- Changed-file ESLint and root TypeScript validation passed. The isolated member
  production build passed, followed by the complete member HTML/synthetic API
  acceptance checks, including account sections and private session guards.
- Chrome passed 180 layout combinations: nine credential/recovery/verification/
  security screens, light/dark themes, fine/coarse pointers and widths of 320,
  390, 768, 1024 and 1440px. Forms stayed bounded, primary actions filled,
  secondary actions transparent and grouped, and phone field bodies aligned with
  a single thin country-code outline. The layout audit found no clipping or
  horizontal overflow. Both theme versions were visually inspected.
- Each pointer/theme context also passed eight synthetic interaction checks:
  channel choice, delivery, refused/accepted codes, password mismatch, country
  search, canonical phone values and keyboard dismissal. No real messages or
  account writes were used. Results and screenshots are ignored output under
  `output/playwright/authentication-forms/`.
- Updated HTML expectations for the shared header help and grouped secondary
  navigation, and corrected an outdated “Sign-in details” expectation to the
  existing “Login details” locale copy. The generated development-worker source
  uses a raw template so the locale audit does not mistake embedded JavaScript
  for UI copy; its emitted script is unchanged and its regression checks pass.
- The full application build/business-rule suite was not rerun; validation used
  the focused checks and the production member fixture described above.
