# 086 Retain existing administrator authentication in the demo

Keep the administrator's existing authentication details when `npm run dev`
selects the isolated football demo.

1. Resolve only the administrator allowlist and password/hash through Next's
   existing environment loader, preserving normal development precedence.
2. Retain those three settings in the sanitized demo environment; continue to
   isolate database targets and disable paid provider integrations.
3. Remove the public synthetic administrator credential. Use explicit test-only
   administrator fixtures in integration tests.
4. Verify dotenv/process precedence, hash precedence, isolation and normal admin
   login. Restart the development app, test the existing login privately, and
   commit/push main without including any credentials.

Completed and verified:

- The launcher now retains only the three configured administrator values from
  Next's existing development environment loader. Explicit process values and
  blank overrides retain their normal precedence. Provider/database isolation
  stays intact, and missing admin configuration installs no public fallback.
- Removed the synthetic administrator password from workspace seed code and
  switched its integration test to the reusable, scoped administrator fixture.
- All 130 Python tests and 70 relevant authentication/demo tests passed. Targeted
  ESLint and TypeScript checks passed.
- Restarted the real development app. A private HTTP check using the existing
  configured credential succeeded, verified administrator session status and
  opened `/admin/payments` with HTTP 200. The synthetic administrator credential
  returned 401. The test session was signed out afterward.
- The isolated API-Football demo still returned 560 fixtures for the Kampala
  reporting date 30 November 2026. No private configuration was changed or added
  to tracked files.
