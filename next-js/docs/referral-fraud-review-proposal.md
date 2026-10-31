# Referral fraud review — approved policy

Status: **Approved by the owner on 31 October 2026 and implemented in the application. Production deployment and unattended worker qualification remain separate release checks.**

1. Keep granting one free day for each eligible verified new registration,
   independently of payment. Existing duplicate/self-referral protections apply.
   Temporary abuse throttles protect service availability; they do not classify
   an account as fraudulent. Shared IPs, households, devices or low/no payments
   alone are insufficient evidence for withholding, reversal or account blocking.
2. Open a manual case only for corroborated evidence of deliberate rule
   circumvention, such as proven repeated ownership of disallowed duplicate
   registrations, or a confirmed technical duplicate award. Record a reason
   category (`duplicate-award`, `proven-self-referral`, `verified-abuse`) and a
   short factual explanation. Uncertain cases retain the existing reward.
3. An authorized administrator reviews the evidence and records approve/reject
   or no-action with their identity and UTC timestamp. Every case links the
   relevant account, referral and exact earned-access grant. Record minimal
   evidence references, not OTPs, passwords, raw IP histories or unnecessary
   invitee data. An account may request review through existing support; an
   appeal and outcome form separate immutable events on the same case.
4. For confirmed abuse/duplicates, reverse only the **unused remainder of the
   specific earned grant**, including queued time. Preserve already consumed
   time, paid/trial access, money, credits and unrelated legitimate rewards.
   Rechain remaining earned periods using the existing scheduling rules. Never
   create a negative reward balance, charge money or retroactively end paid
   access. Account suspension would require a separate evidenced decision.
5. Make any approved reversal atomic and idempotent by case/grant ID. Store
   append-only requested/decided/applied events with actor, reason, evidence
   reference, original grant and before/after unused milliseconds. Keep the
   original rewarded referral and grant history; do not erase or rewrite facts.
   A successful appeal creates one compensating earned grant for the reversed
   time, linked to the case, rather than editing prior audit events. Notify the
   affected member privately with a concise reason and support route.
6. Retention: keep case decisions and access-accounting events under
   the existing account/audit retention and erasure rules; keep supplementary
   evidence for 90 days after final closure, then remove it. The initial decision
   closes the review for retention; an appeal reopens it without an invented
   submission deadline. Its final decision restarts the 90-day period. A late
   appeal stores only fresh supplementary information and cannot recreate purged
   original material. Maintenance locks and rechecks case state before removal.

The workflow now provides administrator case management, private member appeals,
exact unused-time accounting, append-only events and in-app notifications.
Existing audited number transfers carry appeal claims to the current holder
without rewriting original referral attribution or touching unrelated access.
Blocked/erased accounts do not receive restored access or an automatic unblock;
an unresolved restoration retains its claim. See the [operator runbook](referral-reviews.md)
for routes, permissions, maintenance and the distinction between local tests and
release qualification. No reward is reversed merely because this workflow exists:
an authorized administrator must explicitly confirm corroborated findings.

The 24-hour OTP currently covers registration/changed-phone ownership checks and
signed-out password recovery. That approved lifetime remains unchanged. A
separate decision is whether to shorten either purpose independently, including
SMS/WhatsApp wording and delivery-delay handling; changing the provider's OTP
product alone must not silently change the application's expiry contract.
