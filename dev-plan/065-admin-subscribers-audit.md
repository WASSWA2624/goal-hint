# 065 Overview, subscribers, audit and purge

**Feature:** The owner Overview, Subscribers and Audit pages with their routes, the Change number and erase actions, and the members purge that applies every retention rule.

**Depends on:** [064-admin-payments-codes.md](064-admin-payments-codes.md).

**Source:** [App specification](../app-write-up.md), sections 1 and 13 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 2 (owner journey steps 6–8), 5.3 (Change number), 5.4 (retention and purge), 5.6 (Overview, Subscribers, Audit, erase), 5.8 and 8 (065).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Every page and route uses the 057 guard, every action is a same-origin JSON POST and every action is audited.

- **Overview** (`/admin`, replacing the 057 empty shell): pending count; active subscribers; revenue this EAT week and month, summing `amountReceivedUgx` of approved, non-reversed submissions of both sources plus manual-code amounts, never reissue or number-change codes; Busy alerts (`uploads_busy`); "Payment numbers last changed …" from `paymentNumbersChangedAt`.
- **Subscribers** (`src/app/admin/subscribers/`, `POST /api/admin/subscribers`, `POST /api/admin/subscribers/[id]`): search by phone (the number travels in the POST body; links use `accountId` only). Per account: status, codes, submissions, unlocked devices, unlocks in the last 30 days (from `device_unlocked` audit rows, index (`accountId`,`action`,`at`)) and the owner note. Actions:
  - **Sign out all devices**; **Block/Unblock** with a reason (a block deletes every session); edit note (≤ 500 characters); **Generate code** (the 064 manual code panel);
  - **Change number** through the 060 service: first confirm the request from the old number or by the payment details, then record `verifiedBy`; it opens the code ready panel for the new number;
  - **Erase personal data:** delete sessions and screenshots; clear notes, `rejectText` and `payerPhone`; set `phone = NULL` and `erasedAt`; keep amounts, plan snapshots and transaction IDs; audit.
- **Audit** (`src/app/admin/audit/`): owner actions and sign-ins, newest first, filtered by action. Rows never show a subscriber phone, a full code or an image.
- **Members purge** (`src/server/members/purge.ts`, `src/workers/members.ts`), one module applying every rule of the plan 5.4 table, each with a test:
  - screenshot bytes of approved or reversed submissions: deleted `screenshotRetentionDays` (default 90) after the decision; of rejected or superseded submissions: 7 days after `decidedAt`; of pending submissions: never; set `imagePurgedAt`;
  - `MemberSession` rows once `expiresAt` has passed; `RateLimitBucket` rows a day after both the window and any lock ended;
  - never-paid accounts (no submission, no code) 30 days after their last sign-in;
  - payment metadata (including `payerPhone`), codes and audit rows are kept until OP-26 sets periods; that purge and its DELETE grant come then.
  - It runs inside the worker's maintenance loop (`src/server/live/live-runner.ts`, cron `scripts/cpanel-worker.sh`), claimed hourly through `lastMembersPurgeAt` with a conditional UPDATE, in batches of 100. Admin page loads and `npm run members:purge` are backup triggers. The worker's database account needs DELETE on the purged tables (`docs/local-database.md`).
- Extend `tests/admin-routes.test.mjs` for every new route and page, and add the structural check that no code path updates `accountId` on `AccessCode`, `PaymentSubmission` or `MemberSession` after insert.

**Files.** New: `src/app/admin/subscribers/`, `src/app/admin/audit/`, `src/app/api/admin/subscribers/route.ts`, `src/app/api/admin/subscribers/[id]/route.ts`, `src/server/members/purge.ts`, `src/workers/members.ts`. Changed: `src/app/admin/page.tsx`, `src/server/live/live-runner.ts`, `tests/admin-routes.test.mjs`, `tests/members.test.mjs`, `tests/members.integration.mjs`, `package.json` (`members:purge`).

## Acceptance checks

Run `npm run test:admin` and `npm run test:members`.

- Revenue sums approved, non-reversed amounts of both sources plus manual amounts by EAT week and month, never reissue or number-change codes.
- Unlock counts match `device_unlocked` rows; block signs out every device.
- Change number requires `verifiedBy`, writes one audit row per revoke plus one for the new code, and opens the panel for the new number.
- A structural test in `tests/admin-routes.test.mjs` finds no code path that updates `accountId` on `AccessCode`, `PaymentSubmission` or `MemberSession` after insert.
- Erase clears phone, payer numbers, sessions and images but keeps amounts and IDs.
- Each purge rule has an injected-clock test; pending images are never purged; superseded images purge 7 days after supersede.
- The purge is idempotent, and two concurrent runs purge once.
- The guard test covers every new route and page.
- Manual: Overview, Subscribers and Audit work at 375 px in the Browser pane.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
