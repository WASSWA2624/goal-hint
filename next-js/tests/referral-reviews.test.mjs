import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { referralAppealSchema, referralReviewCursor, referralReviewMutationSchema, referralReviewRules } from "../src/domain/referral-reviews.ts";
import { createReferralReviews, purgeReferralReviewEvidence, safeReferralReviewText, scrubReferralReviewEvidence } from "../src/server/members/referral-reviews.ts";
import { createAccessPeriod } from "../src/server/members/access-codes.ts";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";

const DAY = 86_400_000, HOUR = 3_600_000, adminPhone = "256700009990", password = "correct horse 47";
async function fixture() {
  const f = createMemberAuthFixture({ admins: [adminPhone], adminHash: `plain:${password}`, trialDays: 0 });
  const signed = await f.authenticate();
  const administrator = await f.service.login(adminPhone, password, "198.51.100.2");
  const admin = await f.sessionService.verify(administrator.token);
  const reviews = createReferralReviews({ database: f.database, config: f.config, now: f.now,
    adminPhone: phone => phone === adminPhone, adminCredential: () => `plain:${password}` });
  async function grant(source = "referral", milliseconds = DAY) {
    const created = await f.database.transaction(tx => createAccessPeriod(tx, f.accounts.get(signed.member.accountId),
      { source, planName: source === "referral" ? "Earned access" : "Paid access", durationDays: 1, priceUgx: 0, amountReceivedUgx: 0 },
      "synthetic-owner", new Date(f.now()), { maximum: 1 }, source === "referral" ? milliseconds : undefined));
    if (source === "referral") {
      const id = randomUUID(); f.referrals.set(id, { id, inviterId: signed.member.accountId, accountId: randomUUID(), accessCodeId: created.id,
        registeredAt: new Date(f.now()), rewardedAt: new Date(f.now()), status: "rewarded" });
    }
    return f.accessCodes.get(created.id);
  }
  async function open(grantId, fields = {}) {
    const reply = await reviews.mutate(admin, { action: "create", requestId: randomUUID(), grantId, reason: "duplicate-award",
      summary: "Confirmed duplicate award in immutable records", evidenceRef: "support/TICKET-ABC", evidenceConfirmed: true, ...fields });
    assert.equal(reply.status, "saved"); return reply.case;
  }
  const decide = (row, decision = "confirm") => reviews.mutate(admin, { action: "decide", id: row.id, revision: row.revision, decision, evidenceConfirmed: true });
  return { ...f, ...signed, admin, reviews, grant, open, decide };
}

test("review contracts require corroboration, bounded private prose, exact identities and valid cursors", () => {
  const input = { action: "create", requestId: randomUUID(), grantId: randomUUID(), reason: "verified-abuse", summary: "Confirmed records", evidenceRef: "ticket/ABCD", evidenceConfirmed: true };
  assert.equal(referralReviewMutationSchema.safeParse(input).success, true);
  for (const change of [{ evidenceConfirmed: false }, { reason: "shared-ip" }, { summary: "a".repeat(301) }, { unknown: "field" }])
    assert.equal(referralReviewMutationSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(referralAppealSchema.safeParse({ id: input.requestId, revision: 1, statement: "Please review this award" }).success, true);
  for (const value of ["OTP 123456", "password abcdef", "my IP 198.51.100.1", "+256700000001", "api_key secret", "[2001:db8::1]"])
    assert.equal(safeReferralReviewText(value), false, value);
  const cursor = `2026-10-31T12:00:00.000Z_${input.requestId}`;
  assert.equal(referralReviewCursor(cursor).id, input.requestId); assert.equal(referralReviewCursor(cursor + "extra"), null);
});

test("active reversal removes only exact unconsumed time and a successful repeated appeal restores it once", async () => {
  const f = await fixture(), grant = await f.grant(); f.advance(5 * HOUR + 17);
  const original = structuredClone(grant), row = await f.open(grant.id);
  const result = await f.decide(row); assert.equal(result.status, "saved"); assert.equal(result.case.status, "reversed");
  const expected = DAY - 5 * HOUR - 17;
  assert.equal(result.case.reversedMs, expected); assert.equal(+f.accessCodes.get(grant.id).startsAt, +original.startsAt);
  assert.equal(+f.accessCodes.get(grant.id).endsAt, +original.endsAt); assert.ok(f.accessCodes.get(grant.id).revokedAt);
  const duplicate = await f.decide(row); assert.equal(duplicate.status, "saved"); assert.equal(f.reversals.size, 1);
  const appealed = await f.reviews.appeal(f.member, { id: row.id, revision: result.case.revision, statement: "Please check the original support evidence" });
  assert.equal(appealed.status, "saved");
  const action = { action: "appeal-decision", id: row.id, revision: appealed.case.revision, decision: "restore", evidenceConfirmed: false };
  const replies = await Promise.all([f.reviews.mutate(f.admin, action), f.reviews.mutate(f.admin, action)]);
  assert.ok(replies.every(reply => reply.status === "saved")); assert.equal(f.accessCodes.size, 2);
  const ledger = f.reversals.get(grant.id), restored = f.accessCodes.get(ledger.restoredGrantId);
  assert.equal(+restored.endsAt - +restored.startsAt, expected);
  assert.equal(replies[0].case.restoredMs, expected);
  assert.equal([...f.notifications.values()].filter(notice => notice.kind === "referral-restored").length, 1);
  assert.ok([...f.reviewEvents.values()].every(event => !JSON.stringify(event).includes("support evidence")));
});

test("distinct concurrent cases share one grant ledger; mixed paid/earned access, credits and unrelated rewards are preserved", async () => {
  const f = await fixture(), paid = await f.grant("manual"), first = await f.grant(), other = await f.grant();
  f.accounts.get(f.member.accountId).creditUgx = 9200;
  const paidBefore = structuredClone(paid), otherMs = +other.endsAt - +other.startsAt;
  const cases = await Promise.all([f.open(first.id), f.open(first.id)]);
  const results = await Promise.all(cases.map(row => f.decide(row)));
  assert.deepEqual(results.map(result => result.case.status).sort(), ["no-action", "reversed"]);
  assert.equal(f.reversals.size, 1); assert.equal(f.accounts.get(f.member.accountId).creditUgx, 9200);
  assert.deepEqual(structuredClone(f.accessCodes.get(paid.id)), paidBefore);
  assert.equal(+f.accessCodes.get(other.id).endsAt - +f.accessCodes.get(other.id).startsAt, otherMs);
  assert.equal(+f.accessCodes.get(other.id).startsAt, +paidBefore.endsAt);
  assert.equal([...f.notifications.values()].filter(notice => notice.kind === "referral-reversed").length, 1);
});

test("consumed grants and uncertain reviews retain history without minting reversal or restoration time", async () => {
  const f = await fixture(), expired = await f.grant(); f.advance(DAY);
  const first = await f.open(expired.id), result = await f.decide(first);
  assert.equal(result.case.status, "no-action"); assert.equal(result.case.reversedMs, 0); assert.equal(f.reversals.size, 0);
  const current = await f.grant(), second = await f.open(current.id), before = structuredClone(current);
  const uncertain = await f.reviews.mutate(f.admin, { action: "decide", id: second.id, revision: second.revision, decision: "no-action", evidenceConfirmed: false });
  assert.equal(uncertain.case.status, "no-action"); assert.deepEqual(structuredClone(f.accessCodes.get(current.id)), before);
  assert.equal((await f.reviews.appeal(f.member, { id: first.id, revision: result.case.revision, statement: "Restore already consumed time" })).status, "conflict");
  const removed = await f.grant(), deletedCase = await f.open(removed.id); f.accessCodes.delete(removed.id);
  const closed = await f.reviews.mutate(f.admin, { action: "decide", id: deletedCase.id, revision: 1, decision: "no-action", evidenceConfirmed: false });
  assert.equal(closed.case.status, "no-action", "A deleted original grant does not leave a nonfinancial case stuck open");
});

test("ordinary, stale, reset and foreign sessions cannot administer cases or read another member's private case", async () => {
  const f = await fixture(), grant = await f.grant(), row = await f.open(grant.id);
  assert.deepEqual(await f.reviews.list(f.admin, "all"), await f.reviews.list(f.admin), "The page/API All cases selection includes the actual existing cases");
  assert.equal(await f.reviews.list(f.member), null);
  assert.equal((await f.reviews.mutate(f.member, { action: "decide", id: row.id, revision: 1, decision: "confirm", evidenceConfirmed: true })).status, "forbidden");
  const bad = { ...f.member, accountId: randomUUID() }; assert.equal(await f.reviews.member(bad), null);
  f.sessions.get(f.admin.tokenHash).passwordResetAt = new Date(f.now());
  assert.equal(await f.reviews.detail(f.admin, row.id), null);
  f.sessions.get(f.admin.tokenHash).passwordResetAt = null;
  f.sessions.delete(f.admin.tokenHash); assert.equal(await f.reviews.list(f.admin), null);
  const own = await f.reviews.member(f.member); assert.equal(own.length, 1);
  assert.ok(!JSON.stringify(own).includes("TICKET-ABC")); assert.ok(!JSON.stringify(own).includes(f.member.phone));
});

test("notification failure rolls back revocation, ledger, decision and events", async () => {
  const f = await fixture(), grant = await f.grant(), row = await f.open(grant.id), before = structuredClone(grant);
  const create = f.tx.memberNotification.createMany;
  f.tx.memberNotification.createMany = async () => { throw new Error("Synthetic transaction failure"); };
  await assert.rejects(f.decide(row));
  assert.deepEqual(f.accessCodes.get(grant.id), before); assert.equal(f.reversals.size, 0); assert.equal(f.reviewCases.get(row.id).status, "open");
  assert.equal(f.reviewEvents.size, 1);
  f.tx.memberNotification.createMany = create; assert.equal((await f.decide(row)).case.status, "reversed");
});

test("supplementary evidence expires at 90 days, late appeals reopen without restoring purged prose, and erasure scrubs it", async () => {
  const f = await fixture(), grant = await f.grant(), row = await f.open(grant.id), reversed = await f.decide(row);
  f.advance(referralReviewRules.evidenceRetentionMs - 1);
  assert.equal((await purgeReferralReviewEvidence(f.database, f.now)).purged, 0);
  f.advance(1); assert.equal((await f.reviews.purgeEvidence()).purged, 1);
  const evidence = f.reviewEvidence.get(row.id); assert.equal(evidence.summary, null); assert.equal(evidence.evidenceRef, null);
  // Renew the test session lifetime; a late appeal has no invented submission deadline.
  f.sessions.get(f.member.tokenHash).expiresAt = new Date(f.now() + DAY);
  const appealed = await f.reviews.appeal(f.member, { id: row.id, revision: reversed.case.revision, statement: "Please reopen the review through support" });
  assert.equal(appealed.status, "saved"); assert.equal(f.reviewCases.get(row.id).closedAt, null); assert.equal(evidence.summary, null);
  assert.equal(evidence.appealStatement, "Please reopen the review through support");
  await f.database.transaction(tx => scrubReferralReviewEvidence(tx, f.member.accountId));
  assert.equal(evidence.appealStatement, null); assert.ok(evidence.purgedAt); assert.ok(f.reviewEvents.size > 0);
});
