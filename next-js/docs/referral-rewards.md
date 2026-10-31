# Referral rewards

Account → Referrals uses the shared Account panels, facts, controls and navigation.
It shows verified referrals, days earned, exact remaining reward time, a personal
invitation link with Copy link, and the latest ten registrations. Overview and
Subscription show a compact summary; Activity includes one entry per award. No
invitee phone, account identifier or registration digest is returned to the UI.

Each verified member receives a persistent random invitation code on first use.
`/r/[code]` redirects to registration and records the first valid code in a signed,
HttpOnly, SameSite=Lax cookie for 30 days (Secure/__Host- in production). Reopening
links cannot replace or extend valid attribution. Embedded/prefetched links do not
set attribution. Invalid/expired links permit ordinary registration without a reward.
Successful registration consumes the cookie and stores attribution once. Existing
accounts cannot attach an inviter later. Verification/payment fields accept no
client-provided inviter or reward amount.

Successful first phone verification commits one 24-hour referral access period
and its award record together, regardless of payment. Existing account/phone
uniqueness, phone verification and durable registration/OTP throttles still apply.
Self-referrals and blocked, erased, unverified or administrator inviters are
ineligible. Repeated verification, retries, phone changes, logins and payments
cannot award again. Valid awards have no configured lifetime cap or unused-time
expiry. Scheduled earned access runs continuously once it starts, as paid access
does; remaining time is not a daily login bonus or money credit.

Paid/queued/trial periods finish first, followed by earned access, followed by
optional credit auto-renewal. A new purchase during earned access preserves its
exact unused milliseconds after the new paid period. Revocation/extension
reschedules rewards without restoring spent time. Referral periods cannot be
extended as paid grants. Owner number transfers move their exact remaining time,
while award attribution remains with the original inviter for historical totals.
Ordinary member phone changes keep the same account and reward balance.

Registration identities hold keyed phone digests, not phone numbers. Unreferred
registrations and subsequently verified replacement numbers also reserve their
identities. Erasure/permanent deletion preserve these digests; account and access
links can be cleared without re-enabling rewards. Data erased before this feature
cannot be retrospectively matched. The existing private key must remain stable;
key rotation needs an explicit identity migration strategy. Shared IP addresses
are not treated as proof of a duplicate person. Broader fraud investigation is
not a guarantee supplied by OTP verification alone.

## Rollout

Apply `20261031120000_referral_rewards` and review
[referral-grants.sql](deployment/referral-grants.sql). Use the checked MariaDB
overlay for the existing MariaDB deployment workflow; do not apply both paths.
The migration adds MemberAccount.referralCode, MemberReferral with unique phone,
registration and award links, immutable identity/completed-award protection, and
the referral access source constraint. Coordinate schema, grants and application
deployment. The owner separately authorized updating the configured local MySQL
database on 31 October 2026. A private backup passed checksum/isolated restore
checks before all eight pending migrations applied. Required application grants,
55 completed migrations with none pending, drift-free schema and ready database
health were verified. This does not establish a remote production deployment.

Focused unit tests, genuine isolated MySQL referral/concurrency cases and
production fixture HTML/browser checks passed. A rollback-only application-role
local smoke test also passed without retaining synthetic accounts or sending
messages. Synthetic fixtures alone do not establish database races, delivery or
remote schema/grants. The reviewed MariaDB overlay was not executed in this task.
WhatsApp/Telegram/native invitation sharing and the general in-app notification
feed remain separate audit work.
