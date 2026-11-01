# Remove header subscription banners and use white light-theme dialogs

- Remove banner mounts from the public shell, compact app header and match details.
- Delete the desktop/mobile banner components, state/link helper and exclusive
  translation messages, including the unused Best Slips header flag.
- Remove banner review routes, sample components, documentation and obsolete
  banner-specific tests and rendering fixtures/scripts.
- Preserve account navigation, subscriptions, payments and access checks.
- Share the light theme's white field fill across dialog bodies, sheets,
  subscriber reviews, sharing drawers and phone country pickers. Preserve
  current dark dialog fills and distinct dialog header/footer areas.
- Verify headers/content on phone and desktop, run relevant checks, and push main.

Verification passed:

- Lint on all changed source and rendering audits; 43 account, navigation,
  member-session, locale vocabulary and match-detail tests.
- Isolated optimized production preview build and TypeScript checking. The
  coordinated full application build/type check also passed with these changes.
- 144 responsive header cases across both themes and five viewport widths,
  exercising guests, members, active/pending/expired access and match details.
  Banner DOM/copy and leftover header rows are absent; no horizontal overflow.
- 76 dialog cases across both themes and five widths: shared criteria/review
  dialogs, sharing drawers, country pickers, real Best Slips/builder filters and
  desktop/mobile match filter editors. Light bodies are white; dark fills and
  dialog behavior remain intact. No browser exceptions.
