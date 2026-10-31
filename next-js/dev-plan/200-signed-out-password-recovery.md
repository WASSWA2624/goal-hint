# 200 — Password recovery only while signed out

The user's follow-up keeps signed-in password changes in Account, using the
authenticated session, a new password/confirmation, and no current password or OTP.
Keep a fresh current-device cookie after saving and revoke all previous sessions.
Redirect signed-in Forgot password deep links to
Change password, retain blocked/admin guards, and reject signed-in recovery-code
requests/confirmation at the HTTP boundary. Signed-out recovery and restricted
reset sessions keep their existing verification flow.

Remove Forgot password links from signed-in security forms. Phone changes still
check the current password. Keep the existing successful-change cooldown, reserve
bounded account-locked hash attempts and recheck the session before committing.
Verify concurrent changes, both HTTP guards and Account routing alongside 199.

## Verification

The final 78-test auth/referral/deletion suite passed without skips. It covers
no-current-password changes, cooldown/hash throttling, concurrent change winner,
retained new cookie, revoked old/other-device sessions, signed-in recovery API
rejection and existing signed-out recovery. Genuine MySQL authentication cases
and an application-role rollback-only local smoke test also passed. The latter
verified a fresh current-device session and rejection of both old sessions.

Strict TypeScript, changed-file ESLint and the production Account fixture checks
passed. Playwright confirmed no current-password field or signed-in Forgot link,
mismatched confirmation, successful change without OTP, signed-in recovery
redirect and phone navigation/layout. No real messages or user password changes
were performed. See plan 199 for the authorized migrations and broader checks.
