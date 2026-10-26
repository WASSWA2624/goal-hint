# 072 — Automatic registration trial

## Objective

Replace the manual free-trial request and administrator approval workflow with
an automatic trial for each newly registered account. Retain the duration control
in Admin Settings and remove trial requests from payment, account and admin UI.

## Behavior

- Allocate one trial access period atomically with registration, using the
  configured `trialDays`. Zero disables new trials.
- Start the configured period at registration. Existing phone verification,
  authentication, device and blocked-account checks continue to protect access.
- Inform the new member that their account/trial has been created and guide them
  to verify the number. After verification, show an active-trial notice with its
  expiry and a Browse app action when the period is still active.
- Do not repeat or extend trials on login, verification retries or duplicate
  registration attempts.
- Remove request endpoints, pending trial notices, admin queues and grant/dismiss
  actions. Preserve ordinary manual access grants and historical access records.
- Retain legacy nullable database history for compatibility; no live migration
  or retrospective grant operation is part of this implementation.

## Acceptance

Test configured durations, disabled trials, registration rollback/idempotency,
verification and expiry, session access, and absence of manual trial UI/actions.
Confirm that the compact four-stage payment flow still validates and submits
normally. Record actual checks and limits in development progress.
