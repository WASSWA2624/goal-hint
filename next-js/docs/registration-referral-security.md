# Registration and referral security

Registration uses durable HMAC-keyed address and phone budgets (10 registrations
per hour per address; five per phone). Temporary throttling does not establish
fraud and does not revoke rewards. Verified members sharing a household/carrier
address remain independently eligible. No payment, device fingerprint, CAPTCHA
or lifetime reward cap is added by this batch.

## Client address provenance

`src/instrumentation.ts` installs a subscriber to Node's
[`http.server.request.start` channel](https://nodejs.org/download/release/v24.8.0/docs/api/diagnostics_channel.html),
which supplies the actual IncomingMessage/socket before normal request handling.
The transport resolves and stamps an internal, process-signed address. Route
helpers accept only that proof, never raw forwarded headers. The signature is
not a session credential and is never returned, persisted or logged. A missing,
invalid or older-than-five-minute proof uses a bounded shared unresolved bucket.
That also covers an initial request received before instrumentation is ready.

`GOAL_HINT_TRUSTED_PROXY_CIDRS` is blank by default: trust the socket peer only.
Set it only to verified connecting proxy IPs/CIDRs. Starting at that peer, walk
X-Forwarded-For right-to-left only while the current hop is explicitly trusted;
stop at the first untrusted hop. An attacker-controlled prefix cannot select
the address. Invalid chains share the connecting proxy's bucket. Normalize IPv6
spellings and IPv4-mapped addresses. Do not accept X-Real-IP, Forwarded, CDN
headers or fixed hop counts as independent proof. Trust-all CIDRs are rejected.

For cPanel/Passenger, **production configuration is Unverified**. The repository
packages Next standalone but cannot establish Passenger's socket adapter, proxy
CIDRs, CDN/firewall path or ingress sanitization. Before release:

1. Identify every permitted ingress path and actual socket peer; configure only
   the real proxy CIDRs, never all private ranges or a guessed loopback trust.
2. Require each trusted ingress to append its actual peer to X-Forwarded-For (or
   overwrite the complete chain from a verified source). Restrict direct origin
   access where applicable. A header-copying proxy cannot safely be trusted.
3. Preserve the public Host header. Origin fallback no longer trusts a supplied
   X-Forwarded-Host. Browsers' Fetch Metadata same-origin guard remains intact.
4. Compare normal/forged/prefixed/duplicate forwarding requests over every ingress,
   including direct-origin attempts. Owner Settings diagnostics show raw headers
   only as observations; the resolved address is transport-verified. Never print
   internal proof headers, cookies, OTPs or private configuration in diagnostics.
5. If Passenger exposes no usable peer, keep the shared bounded fallback and
   qualify an authenticated transport adapter before claiming per-client limits.
   Do not enable header trust to disguise the missing provenance. Verify Node's
   built-in diagnostic channel again when upgrading the pinned runtime.

No production proxy CIDRs or firewall changes are inferred or applied here.

## Verification codes

The existing 24-hour lifetime serves **account ownership** (registration/phone
changes) and **signed-out password recovery**, through the user's SMS/WhatsApp
choice. Logged-in password changes do not send an OTP. Keep the approved lifetime
and three sends per account/phone/purpose in a rolling 24 hours. Replacing a code
consumes all older challenges; replacing a reset code also revokes reset-only
authorization. Delivery failures invalidate their own challenge; late delivery
cannot revive a replaced code. Consumption is account-locked, purpose/phone-bound,
single-use, exact-expiry checked and limited to five guesses per challenge.
An additional durable account/purpose budget spans replacements and networks.
Recovery send/check budgets are also phone-bound before account lookup.

Codes are generated cryptographically and only purpose/account/phone-bound HMACs
are stored. Messaging failures and HTTP responses redact provider details; no
raw code is placed in an audit event, outbox record or application log.

## Referral eligibility and policy

Reward creation rechecks both real verified identities under account locks.
Signed attribution, unique keyed registration-phone identity and atomic reward
creation prevent repeats/self-referrals, including erase/re-register attempts.
Verification remains the trigger, independently of payment. Existing earned
period chaining and original immutable award/access accounting are preserved.

[Manual fraud review and reversal proposal](referral-fraud-review-proposal.md)
was approved by the owner on 31 October 2026 for subsequent implementation.
No new fraud label, withholding, reversal, block or appeal
workflow is activated. The remaining OTP policy decision is whether to shorten
account/recovery lifetimes independently; the current 24-hour contract is retained.
