# 068 Payment-approval verification (no one-time codes)

**Feature:** Replace WhatsApp/SMS one-time codes and typed access codes with one flow: pay to the listed mobile money
number, upload the screenshot, confirm, wait for the owner's manual approval (with a Call admin button), and get access
automatically on the account's signed-in devices.

**Depends on:** [063](063-get-access-payments.md), [064](064-admin-payments-codes.md), the Single Rail account update
(`docs/member-authentication.md`).

**Why:** on 2026-10-21 the owner's Meta business portfolio was restricted (appeals refused), so WhatsApp Cloud API
delivery is impossible. The owner chose manual payment approval as the verification step. The owner's approval is now the
only proof that the person controls the account number: the owner compares the payer in their own wallet SMS with the
account number before approving.

## Decisions

### D1 Accounts and sign-in (no codes anywhere)

- **Register:** phone + password (8–128). No code. Refuse allow-listed admin numbers (`isMemberAdminPhone`) with
  `refused` ("This number is reserved."). Add throttles inside `register()`: `register-address` 10/hour and
  `register-phone` 5/hour via the existing `takeMemberLimit`. Keep the signed-in refusal, conflict check and constraint
  catch. An existing **password-less** row for the number (legacy, or created by an owner manual grant) is claimed by
  registration: set its password instead of returning `conflict`, so owner-granted access reaches the real person once
  they register. A row that already has a password returns `conflict`.
- **Login:** phone + password for everyone, **including admin numbers** (remove the "Use verification-code login" guards).
  Admin accounts get a password only through the owner reset in D1-reset, never through self-registration.
- **Change password (signed in):** requires the **current password** (`verifyPassword`). Same rotation as today (other
  devices revoked, current cookie rotated, unlock carried).
- **Change phone (signed in):** requires the current password. Keep the admin-number guard and conflict check. The new
  number is not verified; the owner verifies payers at approval.
- **Forgot password (signed out):** no self-service. The view shows "Call admin to reset your password" with a
  `tel:` link to `settings.contactPhone` (and WhatsApp chat link to `whatsappPhone` if set).
- **D1-reset (owner action):** Subscribers → account → **Set temporary password**. Generates a random 10-character
  temporary password (unambiguous alphabet), stores its scrypt hash, signs out all the account's sessions, audits
  `password_reset` (no secret in details) and returns the temporary password **once** in the response for the owner to
  read out on the phone call. The owner can also look up an allow-listed admin number that has no account; the action
  creates the account for that number. The member logs in with it and changes it under Account (current password =
  the temporary one).
- **Remove entirely:** `requestCode`, `confirmCode`, `loginWithCode`, `/api/account/verification`,
  `/api/account/verification/confirm`, the `view=code` Administrator login, `member-whatsapp.ts`, `member-sms.ts`,
  `member-verification-delivery.ts`, the delivery radio, the `__Host-goal-hint-verification` binding cookie, and the
  `GOAL_HINT_SMS_*` / `GOAL_HINT_WHATSAPP_*` env names (runtime policy, `.env.example`, `.env.development.local` keys may
  stay harmlessly but are no longer read). **Keep** the `MemberVerification` table, its purge and erase deletes (no
  migration to drop it now); document it as retired and empty.
- Owner sign-in at `/admin` (username + password hash) is unchanged.

### D2 Get access form

- Step 1 plan, step 2 network + pay-to number/name (unchanged), step 3 **Confirm payment**:
  - Read-only **Amount paid: UGX {price} · {plan}** row (from the selected plan, `subscribe.amount`).
  - **Payment screenshot** (required, the main evidence; existing JPEG prep and limits).
  - Collapsed **More details (optional)**: transaction ID and "Paid from" number (defaults to the account number).
  - Terms assent (unchanged rule).
  - Button **Confirm payment**.
  - Remove the member-side "paste SMS" box (the owner-side SMS paste stays).
- Server: drop `amount` from `PaymentFields`; `claimedAmountUgx = plan.priceUgx`. `transactionId` and `payerPhone` are
  optional; a missing payer becomes the account phone. Migration
  `20261021090000_payment_screenshot_approval` makes `PaymentSubmission.claimedTxnRef` and `claimedTxnKey` nullable
  (schema, snapshot, `prisma/migrations`, and a MariaDB overlay if that folder's convention requires one). The
  approved-duplicate check runs only when a key was given. Owner-side lookups that match on `claimedTxnKey`
  ("Also in P-…", "Already approved") ignore null keys.

### D3 Pending, approved, rejected states (member)

One **status card** used on `/subscribe` (replacing step 3 while pending) and on `/account`:

- **Pending / superseded:** title "Waiting for approval", reference `P-XXXX`, plan, amount, submitted time, the
  `reviewTime` setting, primary **Call admin** button (`tel:` contactPhone; hidden if unset) and secondary **WhatsApp
  admin** chat link (`waHref(whatsappPhone, helpPaid)`; hidden if unset). A small "Send a different screenshot" toggle
  reveals the form again (a new submission supersedes the pending one, as today).
- **Approved with an active period:** "Access active until {end}" + "See predictions" link (`returnTo` or `/en`). The
  form stays available underneath for renewals ("Paying now adds {days} days").
- **Rejected / reversed:** readable reason (map `unreadable`, `amount-mismatch`, `not-received`, `duplicate`,
  `wrong-number`, `other` to plain sentences; prefer `rejectText`), the Call admin button, and the form.
- Status is account-level: any authenticated session of the account sees the latest submission (drop the
  submitted-session/unlocked restriction).
- Refresh: while pending, `router.refresh()` every 20 s and on `visibilitychange`→visible; when the status becomes
  approved, refresh the page so gated content and the tier update.
- **Free trial:** request → card "Free trial requested — waiting for approval" with the same Call admin button; the
  owner's **Grant free trial** unlocks automatically.
- Remove `AccountCodeForm`, `#code=` handling (`AccountCodeRoot`), `/api/account/code`, `signInWithCode`, every
  "Have a code?" link and every string promising a code by WhatsApp/SMS.

### D4 Access without codes (server)

Keep `AccessCode` rows as **access-period records** (chaining, revenue, reversal and FKs depend on them). Keep generating
a random code hash so the NOT NULL columns hold, but never return or display the plain code.

New `src/server/members/device-grants.ts`:

```ts
/** Unlocks authenticated, unexpired, locked sessions of the account with codeId, preferring `prefer` hashes, then
 * most recent lastSeenAt. Never exceeds `maximum` unlocked sessions: a preferred session always gets a slot by
 * evicting the oldest unlocked (by codeEnteredAt), others only fill free slots. Updates in place (no token rotation),
 * audits device_unlocked / device_evicted with `actor`. Caller holds the account lock. Returns the number unlocked. */
export async function grantDevices(tx, input: { accountId: string; codeId: string; at: Date; maximum: number;
  prefer?: readonly string[]; actor: string }): Promise<number>;

/** The latest unrevoked code of the account whose period has not ended (endsAt > at), or null. */
export async function liveAccessCode(tx, accountId: string, at: Date): Promise<{ id: string } | null>;

/** For a just-authenticated session: if the account has a live code, unlock this session (preferred) under the cap. */
export async function grantSessionAccess(tx, input: { accountId: string; tokenHash: string; at: Date; actor: string }): Promise<boolean>;
```

`grantSessionAccess` reads `maxUnlockedDevices` from the settings row (default 2 when the row is missing) without taking
the settings lock.

- **Approval** (`approval()`), **Grant free trial** (`sendTrial`), **manual grant** (`manual`) and **change number**
  (destination account): after creating the code, call `grantDevices` with `prefer = [submittedSessionHash]` when there
  is one and `maximum = settings.maxUnlockedDevices`.
- **Login, register, password change, phone change:** after the authenticated session is issued, call
  `grantSessionAccess`. A session already carrying an unlock (rotate on profile change) keeps it.
- **Revoke helper:** before clearing a session's unlock for a revoked code, re-point it to another live code of the same
  account (`liveAccessCode` excluding the revoked one); clear only if none.
- Remove `reissue` (owner action, route branch, UI) and the redeem/`match` path. Keep revoke and extend.
- Owner HTTP answers that returned `{delivery}` return `{status: "approved" | "granted", reference?, endsAt,
  devicesUnlocked}` (201). `codeDelivery` and `CodeReady` are deleted; the admin client gate "Send the code in the open
  panel…" and its sessionStorage are removed. `paymentChecks` keeps the payer and image checks; the amount check
  compares the owner's **amount received** with the price.
- Audit: add `password_reset` and `access_granted` to the closed action union if needed (ids and counts only).

### D5 Owner pages

- Payments card: "Access goes to account {phone}" (was "Code goes to"), approve stays (network, transaction ID from
  the owner's own wallet SMS, amount received, plan). On success show a short notice "Approved · access until {end} ·
  {n} device(s) unlocked" and remove the card from the pending list on refresh. Reject keeps reasons; remove the
  "Tell them · WhatsApp/SMS" links (the member sees the reason in the app) — keep a `tel:` link to the account number.
- "Send free trial" → "Grant free trial". "Generate a manual code" → "Grant access manually". Subscribers: heading
  "Access", remove Generate code/Reissue wording, add **Set temporary password**.
- The admin page title already carries the pending count; make the 60 s poll update `document.title` so a background
  tab shows `(n) Payments`.

### D6 Copy, docs and tests

- `en.ts`: remove/replace every OTP and code-delivery string listed in the 068 map; add the new card strings.
- Docs: rewrite `docs/member-authentication.md` (password + owner reset, no codes); update `docs/subscriptions.md`
  member/owner flow and checklist; delete `docs/message-gateway-setup.md` and its links; add OP-41 to
  `docs/implementation-decisions.md`; append a `docs/development-progress.md` entry; add the 068 row to
  `dev-tracker.md`; update `.env.example`.
- Tests: update every suite listed in the 068 map; add tests for: register without code + admin-number refusal +
  register throttles + claiming a password-less row; password/phone change need the current password; admin number
  password login; owner temporary password; amount fixed by the server; optional transaction ID/payer; approval unlocks
  the submitting session and respects `maxUnlockedDevices`; login with a live code unlocks; revoking one of two live
  codes keeps devices unlocked; account-level status visibility; renewal form visible after approval.

## Acceptance checks

- `npm run lint`, `npm run typecheck`, `npm test -- --test-concurrency=1` and `npm run build` pass.
- `npm run test:members` and `npm run test:payments` pass when `MYSQL_TEST_SERVER_BINARY` points at a local mysqld
  (not the dev server on 3307).
- Rendering verifiers for members, payments and owner payments pass.
- No string, route or env name for WhatsApp/SMS one-time codes remains in `src/` (except the retired table model).

## Handoff

Mark this row in [dev-tracker.md](../dev-tracker.md) ◐ Partial while work or checks remain, ☑ Completed when done.
Not deployed: production deploy only when the owner asks.
