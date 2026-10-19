# 067 Paid access launch readiness

**Feature:** The host-check runbook and switch-on checklist for paid access, and read-only production checks that prove the gate holds.

**Depends on:** [057-owner-admin-foundation.md](057-owner-admin-foundation.md) through [066-paywall-legal-copy.md](066-paywall-legal-copy.md).

**Source:** [App specification](../app-write-up.md), section 15 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 8 (067), 9, 10 (rollout and host checks), 11 and 12 (owner inputs); OP-40 in [implementation decisions](../docs/implementation-decisions.md).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. **Do not deploy to production unless the owner explicitly asks**, and never switch paid access `on` without OP-40. The production scripts are read-only: cookie-less GETs only, no sign-in, upload or owner action.

- **Runbook and checklist** in `docs/subscriptions.md`, following plan section 10:
  1. Build and verify everything locally with the mode `off`.
  2. When the owner asks for a deploy: take a private MariaDB backup, record its checksum and verify a restore to a separate target (`deploy/how-to-deploy.md`, step 2).
  3. Run the overlay's engine pre-check by hand; apply the reviewed overlay **before** the release that reads the new tables; confirm InnoDB and the FKs. A missing settings table fails closed and hides picks for everyone.
  4. Host checks, read-only first: `curl -I` on `/en` and a match page (expect `private, no-store` and no `x-litespeed-cache` or CDN cache headers); `SHOW VARIABLES LIKE 'max_allowed_packet'` (≥ 8 MB) and `'innodb_log_file_size'` (> 10× 3 MB); after deploy, the Settings diagnostics show which header carries the client address and whether a forged `X-Forwarded-For` passes (record the trusted entry); a 3 MB upload passes the LiteSpeed/Passenger body limit (if not, lower the cap) and a slow upload survives 90 s; owner login from the owner's phone.
  5. Deploy the app and the worker (`scripts/deploy-worker-cpanel.py`; the worker's database account needs DELETE on the purged tables) with the mode `off`.
  6. The owner enters plans, numbers, names, menu shortcuts and the copy format and switches to `test`, then checks gated → unlocked on a phone, including the code link, a renewal and the phone-only checks of 063.
  7. Switch-on gate: OP-40 approved; privacy and terms release-ready and effective; plan section 12 legal items confirmed. Then switch to `on`, run `scripts/verify-production-paywall.py`, switch back to `off` if it fails, and watch the queue, Busy alerts and errors for the first week.
  8. Rollback: switch to `off` (effective within 30 s). A code rollback to a release before 061 removes the gate while periods run and restores the old copy, so prefer a forward fix and extend affected codes. No env keys were added, so older releases still start.
- **`scripts/verify-production-paywall.py`** (new): cookie-less GETs to `/en`, an upcoming match, `/api/matches` and insights news must show no pick, probability or analysis for unfinished fixtures, no `Set-Cookie`, and `private, no-store`.
- **`scripts/verify-production-seo.py`**: update lines 46–47, and add noindex and no-store checks for `/admin`, `/en/account` and `/en/subscribe`, plus the robots `/admin` rule.
- Exercise both production scripts against a local production build; run them against goalhint.com only after an owner-requested deploy.
- Reconcile plan section 12: record which owner inputs are present and which still block switch-on (marked †), without inventing any.

**Files.** New: `scripts/verify-production-paywall.py`. Changed: `scripts/verify-production-seo.py` (lines 46–47 and the new checks), `docs/subscriptions.md`.

## Acceptance checks

- `npm run check` and every `test:*` command named in prompts 057–066 pass.
- Real anonymized SMS fixtures for both networks are in `tests/fixtures/payment-sms/`.
- The copy format, menu shortcuts and prefix table match the owner's own tests (OP-38).
- The checklist in `docs/subscriptions.md` is complete apart from owner items, each named with its OP row.
- Both production scripts make no state-changing request.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results, and the owner items that still block switch-on. Record justified implementation choices in `docs/implementation-decisions.md`.
