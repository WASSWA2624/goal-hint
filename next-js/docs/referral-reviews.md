# Referral review runbook

The [approved policy](referral-fraud-review-proposal.md) governs this workflow.
Every eligible verified new registration still earns one day without a payment
condition or lifetime cap. Shared IPs, households/devices and low/no payments
alone do not establish fraud. Uncertain findings leave rewards unchanged.

## Administrator and member entry points

- **Admin → Referral review**, `/admin/referrals`: find an exact earned grant by
  phone/reference, create a case with a controlled reason and corroborating
  evidence reference, inspect the affected/current holder and original account,
  then confirm or take no action. Cases retain their original identity; paged
  status lists and direct case selection reach older reviews.
- A confirmed review reverses only unused time from that grant. A consumed grant
  produces no reversal. A case targeting a grant already reversed by another
  case cannot remove time again. No case action blocks an account automatically.
- **Account → Referrals**, `/en/account?section=referrals`: the affected holder
  sees controlled reasons, amounts and outcome, and can submit a private appeal.
  Evidence references, administrator notes/IDs and invitee identity stay private.
  Admins resolve an appeal by restoring the actual reversed time or upholding
  the evidenced decision. Existing support remains an alternative appeal route.
- Account notifications link to Referrals. Review, reversal, appeal outcome and
  restoration notices are private in-app events; this workflow sends no external
  SMS/WhatsApp message and does not alter WhatsApp consent.

Do not enter OTPs, passwords, raw IP histories, phone numbers or unnecessary
invitee data into supplementary fields. Use a short factual statement and a
minimal internal reference. Obvious credentials/address-like content is refused.

## Transaction and permission guarantees

`GET /api/admin/referral-reviews` lists cases (`status`, `before`) or reads one
(`id`). Its `POST` accepts the strict `create`, `decide` and `appeal-decision`
contracts, or a bounded `grants` lookup. `GET /api/account/referral-reviews` reads
only the member's cases; its `POST` submits that member's appeal. JSON writes
require same-origin requests. APIs are private/no-store. Routes and backend
transactions both recheck current sessions; administrator operations also check
the current allowlisted phone and credential version. A claimed administrator
flag or another member's case ID never grants permission.

Case revisions protect stale edits. A create request uses a UUID request ID;
retries reuse it. A per-grant primary key and account/grant locks protect financial
actions across different cases and administrators. The original reward/history
is retained. Reversal records exact unused milliseconds; restoration links one
unique compensating earned grant for only that amount. Paid/trial access,
consumed time, money, credits and unrelated rewards remain unchanged. Remaining
earned periods are rechained by the existing scheduler. Events and notices are
written in the same transaction, so failure rolls them back together.

Audited number changes move appeal entitlement to the current holder while
retaining the original account/award. Blocked or erased holders cannot receive
restored access; their claim is not silently discarded or used to unblock them.
Deleted grant records can still have their nonfinancial case closed safely.

## Evidence retention and maintenance

Supplementary evidence is separate from immutable controlled-code decisions and
accounting events. Closing the initial review starts a 90-day retention period.
An appeal reopens the case, with no submission deadline; its final decision starts
a new period. At the boundary, evidence becomes eligible for removal on the next
successful maintenance run. A late appeal cannot recreate previously purged prose
and stores only its new statement. Erasing either referral participant or an
affected/transferred holder scrubs their associated supplementary evidence.

Run `npm run members:notifications` through the deployment's approved scheduler
**every 15 minutes**. Existing `members:renew` and opportunistic live maintenance
also call the same notification service, but request traffic is not a substitute
for an unattended job. Each run scrubs up to 250 overdue cases; repeat runs drain
a larger backlog. Purge locks and rechecks each case, so a concurrently reopened
appeal retains its fresh statement. Job output contains counts, not evidence.

After deployment, verify scheduling, failures and backlog explicitly. This
aggregate-only query identifies evidence whose cleanup is overdue without
printing supplementary data:

```sql
SELECT COUNT(*) AS overdue
FROM ReferralReviewEvidence e JOIN ReferralReviewCase c ON c.id=e.caseId
WHERE e.purgedAt IS NULL AND c.closedAt IS NOT NULL
  AND c.closedAt <= UTC_TIMESTAMP(3) - INTERVAL 90 DAY;
```

## Schema, grants and release checks

Apply `20261031135652_referral_review` after the normal private backup/restore and
target checks. Use the matching MariaDB 11.4 overlay only for an approved MariaDB
target; it records the exact MySQL source checksum and must stop on partial state.
The [grant template](deployment/referral-review-grants.sql) requires:

- SELECT/INSERT/UPDATE on `ReferralReviewCase`, `ReferralReviewEvidence` and
  `ReferralGrantReversal`;
- SELECT/INSERT only on append-only `ReferralReviewEvent`;
- the existing account/access/notification permissions, without application DDL
  or DELETE privileges on review accounting/history.

Substitute the verified database/application account before applying the template.
Migration checks, schema readiness, installed grants and actual worker scheduling
are separate checks. Local unit/MySQL/HTTP/UI evidence is recorded in
[plan 207](../dev-plan/207-approved-referral-reviews.md); it does not establish
production deployment, live ingress, external delivery or signed physical-device
behavior. Keep those release checks **Unverified** until actually performed.

The 24-hour registration/changed-phone and signed-out password-recovery OTP
lifetimes remain unchanged. Any purpose-specific shortening needs its own explicit
decision, delivery/copy changes and expiry-boundary verification.
