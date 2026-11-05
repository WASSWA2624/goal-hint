# Admin plan deletion and demo subscription cleanup

## Scope

- Add permanent deletion to Admin → Plans using shared controls and confirmation dialogs in both themes.
- Show linked payment, access-code and auto-renewal counts; require confirmation and reject referenced plans or removal of the last active plan while sales are on/test.
- Recheck references in a locked transaction, retain history and audit successful deletion.
- Add the restricted application's DELETE grant without changing the schema.
- Stop automatic demo financial seeding. Remove only confirmed demo offers and related test records from the owned local development database, retaining accounts, unrelated trials and the six existing standard packages.
- Preserve immutable wallet records and remove confirmed synthetic spendable credit with idempotent compensating adjustments.

## Verification

- Focused service and HTTP tests cover confirmation, authorization, usage, history protection, last-active guards and permanent removal.
- Disposable MySQL tests cover foreign keys, rollback and concurrent operations.
- Cleanup tests cover dry runs, idempotency, exact demo scope and unrelated record preservation.
- Browser checks exercise the confirmation, cancellation, success and failure paths on desktop and mobile in light and dark themes.
- Run lint and TypeScript checks; integrate and verify on main while preserving other active worktrees and existing stashes.

## Deployment

Verified on 5 November 2026: TypeScript and changed-file ESLint passed; 51 backend/audit unit tests, 88 demo unit tests, four MySQL plan-deletion tests and the MySQL reset integration passed. Browser checks passed in both themes at 1440, 390 and 320px, including 40px fine-pointer and 44px coarse-pointer controls, cancellation/focus, foreground progress, refusal, failure/retry and successful deletion. QA servers and browsers were stopped after verification.

Local demo cleanup is a separate operator action with a verified target and backup. Production data is not reset by deploying this source. Restricted application targets need the documented plan DELETE grant before using permanent deletion.
