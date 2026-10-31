# 206 — Registration and referral security

Inspect and reuse account locks, durable limits, OTP proofs and keyed referral
identity. Fix forwarding-header trust at the Node transport boundary, using the
actual socket peer and an explicitly configured proxy CIDR chain. Never trust
browser-supplied IP headers directly. Missing transport provenance must use a
bounded shared fallback, not an unlimited bucket. Test real HTTP and Next.js
integration; deployment proxy configuration remains unverified until observed.

Add identity-bound verification/reset limits so changing networks cannot reset
the budget. Preserve three sends per purpose in a rolling 24 hours, five guesses
per code and the approved 24-hour account/recovery code lifetime. Recheck referral
eligibility under the account lock and preserve atomic, one-day, payment-independent
awards and earned-after-paid scheduling. A shared address alone is not fraud.

Provide a concrete manual fraud-review/reversal proposal for approval; do not
silently introduce reward withholding, clawbacks or new payment conditions.
Run focused unit/HTTP and isolated MySQL regressions, record actual results,
update the remaining-work audit, commit/push main and preserve stashes/worktrees.

## Verification

### Findings and delivered changes

- Raw X-Forwarded-For/X-Real-IP previously selected throttle keys without socket
  provenance. Node instrumentation now signs the address resolved from the real
  peer and an explicit CIDR chain; route helpers reject unsigned headers. The
  resolver walks right-to-left only through trusted hops, canonicalizes IPv6 and
  IPv4-mapped addresses, rejects trust-all/malformed configuration and bounds
  unresolvable traffic. Origin fallback ignores untrusted X-Forwarded-Host.
  No proxy CIDRs, private configuration or deployment settings were invented.
- Existing registration address/phone limits remain. Password-recovery sends
  now have a durable phone budget (10/hour), checks have a phone budget
  (15/15 minutes), and valid challenge attempts have an account/purpose budget
  spanning codes and networks (15/15 minutes). Unknown addresses no longer skip
  the shared member limiter. No raw address/phone or code is stored in buckets.
- The 24-hour OTP serves account/changed-phone ownership and signed-out recovery.
  Existing three sends per rolling day/purpose, five guesses per challenge,
  purpose/phone/account binding, exact expiry, single use and replaced-code/reset
  authorization invalidation remain. No resend cooldown or lifetime change was
  silently introduced. Provider errors remain redacted; proofs/outboxes/audits
  contain no raw OTP.
- Referral award creation now rechecks the actual verified invitee under lock,
  even if called directly with stale/claimed identity. Existing signed attribution,
  phone deduplication, atomic award, one-day grant, no-payment eligibility and
  earned-after-paid scheduling remain. A shared address never marks fraud.
- Expanded regression checks exposed preview-only GET form fallbacks and a
  stale ownership assertion. Existing admin forms now use POST even in previews,
  preventing phone/note values entering URLs without JavaScript. Removed stale
  references to retired credential/directory forms. Ownership checks retain one
  narrowly identified existing, account-locked earned-grant number transfer;
  genuine MySQL verifies exact grant duration, unchanged paid ownership/original
  referral attribution and recorded AccountMove/owner audit. No payment/access
  transfer policy changed.
- The owner approved [the concrete manual review/reversal policy](../docs/referral-fraud-review-proposal.md)
  on 31 October 2026 **for subsequent implementation**. Case reasons, append-only
  decisions, unused-grant-only reversal, appeals/compensating grants and retention
  are specified. No reversal/withholding workflow or case UI is activated here.

### Actual results — 31 October 2026

- **191 focused tests passed, zero failures/skips**: 162 across auth, referral,
  notification, invitation, analytics, runtime and new transport/abuse cases;
  plus 29 admin-route, payment and client-session regressions. These exercise
  legitimate shared-address registrations, forged forwarding/proof/host headers,
  code expiry/reuse/replacement and purpose isolation, persistent resend/guess
  limits, concurrent verification and duplicate-reward prevention. The initial
  broader run exposed the preview/static-guard issues and the environment-key
  expectation; all affected tests passed after the fixes above.
- **Six unique genuine MySQL integration cases passed** for auth, sessions,
  configured trial and referrals on disposable servers. Initial autodiscovery
  skipped five top-level cases; supplying the documented local MySQL binary
  produced a clean zero-skip run. The final referral case passed again after
  adding direct unverified-award and audited earned-transfer checks. No configured
  local account data or credentials were changed; no messages were sent.
- Production Next fixture build/type checking and real HTTP probe **passed**:
  actual loopback peer survives forged XFF/X-Real-IP/CDN/internal-proof headers;
  forged forwarded host cannot authorize an Origin. Separate real HTTP tests
  prove 11 rotated-header registrations still reach the existing ten/hour cap.
  Trusted multi-hop IPv4/IPv6 chains are synthetic test configurations, not
  evidence about the deployed ingress. The owned fixture server was stopped.
- Strict TypeScript and changed-file ESLint passed. The later admin changes only
  change native form methods; the final types/static guards pass. The new
  repeatable commands are `npm run test:registration-security` and
  `npm run test:security:transport`.
- Configured local migration/schema verification passed; database health is
  **ready**. No schema/migration was introduced or applied in this batch.
- **Unverified:** live cPanel/Passenger/CDN socket behavior, actual ingress CIDRs
  and header sanitization, deployment/firewall changes, live worker/delivery and
  signed physical-device checks. The [deployment checklist](../docs/registration-referral-security.md)
  specifies the required evidence. The current 24-hour OTP contract is retained;
  shortening account/recovery lifetimes remains a separate policy decision.
