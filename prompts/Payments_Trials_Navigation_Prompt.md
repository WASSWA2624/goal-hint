# Goal Hint — Targeted Implementation Prompt
**Scope:** Local development and testing only | **Date:** 4 November 2026

## Objective
Audit and correct the existing manual-payment workflow; implement opt-in free trials; clarify daily-plan duration; and provide context-aware Back navigation across the app. Reuse the current Next.js, Prisma and database architecture. **Do not deploy to production.**

## Non-negotiable safeguards
1. Inspect existing routes, components, services, schema, configuration, and tests before editing. Work on a separate Git branch with a clean baseline.
2. Preserve existing layouts, styling, menus, business logic, subscription plans, and working features. Only minimal, necessary navigation controls or trial activation controls are authorised. If placement requires substantial UI changes, stop and request approval.
3. Fix defects within this scope only. Do not rewrite unrelated code to make tests pass. Report unrelated defects.
4. Use demo data and local services; do not charge real customers, alter production records, or expose credentials. Provide migration and rollback plans before any schema changes.
5. Never infer that a screenshot identifies the root cause. Trace errors through UI, API, validation, database and logs.

## 1. Manual MTN and Airtel payment errors
**Observed:** Both MTN Mobile Money and Airtel Money show: “This provider is unavailable. Choose another method.” Admin settings show demo receiving numbers and recipient names configured.

- Trace provider availability and settings retrieval end-to-end. Determine whether flags, configuration, API dependency, validation, stale cache, or hard-coded assumptions cause the failure.
- Manual payment must not require automated provider API credentials. A provider is selectable only when enabled and valid receiving details are configured; genuinely disabled or incomplete providers must remain unavailable with a clear reason.
- Keep receiving number, registered recipient name, and enabled status editable by authorised admins in the existing dashboard and persisted through Prisma/database. Do not hard-code them or move them to environment variables. Reserve secrets/API keys for server-side secret storage.
- On Pay, show the selected provider's current receiving number, recipient name, exact selected-plan amount, and clear transfer instructions. Continue through Details and Review using the existing four-step flow. Payment evidence submission must create a pending-review record, **never** auto-activate a manual payment.
- Verify amount, transaction reference uniqueness, duplicate submission handling, ownership, evidence access controls, rejection reasons, approval idempotency, and correct subscription activation after administrator approval. Do not falsely assert that screenshot data proves payment.
- Record administrative changes and payment decisions in auditable logs. Avoid exposing secrets or unnecessary personal data.

## 2. Package-step clarity
- Display the Daily plan as **“24 hours”** instead of **“1 day”** without changing its actual duration or redesigning the package cards.
- Preserve the six configured plans and read their prices/durations from existing configuration rather than hard-coding: Daily 24h UGX 1,000; Weekly 7d UGX 5,000; Monthly 30d UGX 20,000; Quarterly 90d UGX 50,000; 6 Months 180d UGX 90,000; Annual 365d UGX 150,000.
- Check displayed price and duration against the server-authoritative checkout values. Do not change pricing as part of this task.

## 3. Opt-in new-account free trial
**Current state:** Admin Access setting supports 1–7 days and is saved as 3 days. Existing behaviour starts automatically at registration; replace this with explicit activation.

- Registration creates an eligible, **not started** trial entitlement. Do not start or consume it on registration or login.
- Provide a minimal “Activate free trial” control in the existing subscription/access experience for eligible users. Explain duration and that it is a one-time entitlement. Only an explicit authenticated request starts the trial.
- Read duration from the existing admin setting (currently 3 days), never hard-code 72 hours. At activation, atomically record UTC start and expiry timestamps (3 days = 72 hours) and prevent repeat or concurrent activation.
- Enforce trial eligibility and expiry server-side; represent states such as available, active, expired, and forfeited. Re-login, reinstall, or repeated requests must not reset a trial.
- An unused trial is forfeited **only when the first paid subscription is approved and activated**, not when payment evidence is submitted. If a paid subscription is approved during an active trial, queue its full purchased duration to start when the trial ends; avoid lost paid time and duplicate grants.
- When a trial ends, paid features require an active subscription. Keep the existing access-control and notification patterns; avoid automatic charges. Log activation and conversion events.
- Do not change the already-working trial-duration dropdown or the resolved optional Support-contact validation issue unless a reproducible in-scope defect is found.

## 4. Application-wide context-aware Back navigation
- Audit every navigable screen and existing Back controls on desktop, mobile web, and supported Flutter shells. Implement a shared navigation policy, not independent ad hoc buttons.
- Returning from Referrals or any other eligible screen must restore the actual origin route, relevant workflow step, selected package/provider, non-sensitive form progress, filters, tabs, pagination, and scroll position where feasible.
- Prefer the existing router/history and in-memory state; use short-lived session persistence only where necessary and safe. Never persist credentials, payment secrets or sensitive evidence in browser storage. Clear protected state on logout and session expiry.
- Support browser Back and Android/system Back consistently. Prevent navigation loops, cross-user restoration, duplicate payment submission, and restoration of invalid/expired checkout state. Provide a safe fallback for direct links or missing history.
- **Placement:** inspect each screen and choose a compact, accessible Back control in existing header space where needed. Do not automatically add one to every page or crowd the desktop menu. Reuse existing controls; no duplicate buttons. Preserve responsiveness and current UI. Escalate any substantial visual change for approval.

## 5. Local verification and delivery
- Add focused automated tests for provider enable/disable, configured numbers, manual payment review and idempotency; 24-hour label; trial registration versus activation, concurrency, expiry, payment-before-trial, payment-during-trial; navigation restoration and safe fallbacks.
- Run end-to-end demo journeys for both MTN and Airtel, all four checkout steps, admin approval/rejection, trial activation and expiry (using controlled time), referral return, browser/system Back, refresh, and logout.
- Test responsive layouts and compare before/after screenshots; investigate loading slowness separately and report it without unrelated refactors.
- Deliver: changed-file summary, diagnosed root causes, migration/rollback instructions if needed, tests run and outcomes, remaining risks, and a local manual QA checklist. Do not deploy or claim production readiness without evidence.

## Screenshot reference checklist
The conversation showed: (a) subscription Package step with six plans; (b) Pay step; (c) MTN unavailable error; (d) Airtel unavailable error; (e) admin Payments configuration; (f) admin Access trial duration; (g) Referrals page. The screenshots themselves are **not embedded in this prompt**. Review supplied images if available; otherwise use the checklist and inspect the running local app.
