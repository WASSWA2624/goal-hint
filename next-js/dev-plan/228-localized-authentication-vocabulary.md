# Localized authentication vocabulary

Use **Login**, **Register** and **Log out** consistently throughout desktop and
mobile screens. Use grammatical forms such as **log in**, **logged in** and
**logging out** in explanatory messages.

- Keep canonical action labels, verbs and complete shared authentication messages
  in `src/i18n/messages/auth.ts`.
- Update account, subscription, slip-sharing, help, privacy and terms locale copy.
- Localize authentication wording in admin controls, checkout and session errors,
  audit events, offline messaging, notification defaults and design previews.
- Preserve authentication routes, API error codes and persisted event identifiers.
- Verify lint, types, automated tests and production compilation. Add a source
  regression check for authentication copy outside locale files.

Existing unrelated design edits and Git stashes belong to their original work
and must remain intact when committing this change.
