import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { referralReviewRules } from "../src/domain/referral-reviews.ts";
import { createAccountNotifications } from "../src/server/members/account-notifications.ts";
import { createAccessPeriod } from "../src/server/members/access-codes.ts";
import { transferReferralReviewClaims } from "../src/server/members/referral-review-transfer.ts";
import { createReferralReviews } from "../src/server/members/referral-reviews.ts";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";

const DAY = 86_400_000, adminPhone = "256700009990", password = "correct horse 47";
const summary = "Confirmed duplicate in immutable award records", evidenceRef = "support/PRIVATE-TICKET";
const appealStatement = "Please review the original award evidence";
const reviewNotices = page => page.items.filter(item => item.kind === "referral-reviewed" || item.kind === "referral-reversed" || item.kind === "referral-restored");
const reviewRows = f => [...f.notifications.values()].filter(item => item.eventKey.startsWith("referral-review:"));

async function fixture() {
  const f = createMemberAuthFixture({ admins: [adminPhone], adminHash: `plain:${password}`, trialDays: 0 });
  const signed = await f.authenticate();
  const administrator = await f.service.login(adminPhone, password, "198.51.100.2");
  const admin = await f.sessionService.verify(administrator.token);
  const reviews = createReferralReviews({ database: f.database, config: f.config, now: f.now,
    adminPhone: phone => phone === adminPhone, adminCredential: () => `plain:${password}` });
  const feed = () => createAccountNotifications({ database: f.database, now: f.now });

  // The shared in-memory store implements scalar filters, not Prisma relation projections.
  // Supply only the explicitly requested reversal join; retain production ownership logic.
  const findCases = f.tx.referralReviewCase.findMany;
  f.tx.referralReviewCase.findMany = async query => {
    const rows = await findCases(query);
    if (!query?.select?.reversal) return rows;
    return rows.map(row => {
      const reversal = [...f.reversals.values()].find(item => item.caseId === row.id);
      return { ...row, reversal: reversal ? { holderAccountId: reversal.holderAccountId } : null };
    });
  };

  async function grant() {
    const created = await f.database.transaction(tx => createAccessPeriod(tx, f.accounts.get(signed.member.accountId),
      { source: "referral", planName: "Earned access", durationDays: 1, priceUgx: 0, amountReceivedUgx: 0 },
      "synthetic-owner", new Date(f.now()), { maximum: 1 }));
    const id = randomUUID();
    f.referrals.set(id, { id, inviterId: signed.member.accountId, accountId: randomUUID(), accessCodeId: created.id,
      registeredAt: new Date(f.now()), rewardedAt: new Date(f.now()), status: "rewarded" });
    return f.accessCodes.get(created.id);
  }
  async function open(grantId) {
    const action = { action: "create", requestId: randomUUID(), grantId, reason: "duplicate-award", summary, evidenceRef, evidenceConfirmed: true };
    const reply = await reviews.mutate(admin, action);
    assert.equal(reply.status, "saved");
    return { action, row: reply.case };
  }
  async function anotherMember() {
    const phone = "256700000002", account = await f.account({ phone });
    const login = await f.service.login(phone, password, "198.51.100.3");
    assert.equal(login.status, "authenticated");
    const member = await f.sessionService.verify(login.token);
    assert.equal(member.accountId, account.id);
    return member;
  }
  const decide = row => reviews.mutate(admin, { action: "decide", id: row.id, revision: row.revision, decision: "confirm", evidenceConfirmed: true });
  const appeal = row => reviews.appeal(signed.member, { id: row.id, revision: row.revision, statement: appealStatement });
  return { ...f, ...signed, admin, reviews, feed, grant, open, anotherMember, decide, appeal };
}

function assertPrivate(page, f, extra = []) {
  const serialized = JSON.stringify(page);
  for (const secret of [summary, evidenceRef, appealStatement, f.member.phone, f.member.accountId, f.admin.accountId, ...extra])
    assert.ok(!serialized.includes(secret), `Private source value leaked: ${secret}`);
  assert.doesNotMatch(serialized, /"(?:accountId|grantId|referralId|eventKey|actor|evidenceRef|summary|appealStatement|phone|holderAccountId)":/u);
  for (const item of page.items) assert.deepEqual(Object.keys(item).sort(),
    ["expiresAt", "id", "kind", "occurredAt", "read", ...(item.relatedCaseId ? ["relatedCaseId", "reason"] : [])].sort());
}

test("review transitions reach the real Account feed with safe case links and repeat-safe reconciliation", async () => {
  const f = await fixture(), grant = await f.grant(), opened = await f.open(grant.id);
  assert.equal(reviewRows(f).length, 0, "An undecided private administrator case sends no member notice.");
  assert.equal((await f.reviews.mutate(f.admin, opened.action)).status, "saved");
  const reversed = await f.decide(opened.row);
  assert.equal(reversed.case.status, "reversed");
  assert.equal((await f.decide(opened.row)).status, "saved");
  const appealed = await f.appeal(reversed.case);
  assert.equal(appealed.status, "saved");
  assert.equal((await f.appeal(reversed.case)).status, "saved");
  const restore = { action: "appeal-decision", id: opened.row.id, revision: appealed.case.revision, decision: "restore", evidenceConfirmed: false };
  const results = await Promise.all([f.reviews.mutate(f.admin, restore), f.reviews.mutate(f.admin, restore)]);
  assert.ok(results.every(result => result.status === "saved"));
  assert.equal(reviewRows(f).length, 3);
  const pages = await Promise.all([f.feed().read(f.member), f.feed().read(f.member), f.feed().read(f.member)]);
  for (const page of pages) {
    const notices = reviewNotices(page);
    assert.deepEqual(new Set(notices.map(item => item.kind)), new Set(["referral-reviewed", "referral-reversed", "referral-restored"]));
    assert.ok(notices.every(item => item.relatedCaseId === opened.row.id && item.reason === "duplicate-award"));
    assert.ok(page.items.filter(item => !reviewNotices(page).includes(item)).every(item => !item.relatedCaseId && !item.reason));
    assertPrivate(page, f, [grant.id, [...f.referrals.values()][0].accountId]);
  }
  const before = f.notifications.size;
  assert.equal((await f.feed().run()).failed, 0);
  assert.equal((await f.feed().run()).failed, 0);
  assert.equal(f.notifications.size, before);
  assert.equal(reviewRows(f).length, 3);
  assert.equal(f.messages.length, 0, "Case notices and reconciliation stay in-app.");
});

test("review notice read/dismiss state persists across feed instances without crossing account ownership", async () => {
  const f = await fixture(), grant = await f.grant(), { row } = await f.open(grant.id);
  await f.decide(row);
  const page = await f.feed().read(f.member), notice = reviewNotices(page)[0], other = await f.anotherMember();
  assert.equal(reviewNotices(await f.feed().read(other)).length, 0);
  assert.equal(await f.feed().update(other, "read", notice.id), false);
  assert.equal(await f.feed().update(other, "dismiss", notice.id), false);
  assert.equal(f.notifications.get(notice.id).readAt, null);
  assert.equal(await f.feed().update(f.member, "read", notice.id), true);
  const readAt = +f.notifications.get(notice.id).readAt;
  f.advance(1);
  assert.equal(await f.feed().update(f.member, "read", notice.id), true);
  assert.equal(+f.notifications.get(notice.id).readAt, readAt);
  const readPage = await f.feed().read(f.member);
  assert.equal(readPage.items.find(item => item.id === notice.id).read, true);
  assert.equal(readPage.unread, page.unread - 1);
  assert.equal(await f.feed().update(f.member, "dismiss", notice.id), true);
  const dismissedAt = +f.notifications.get(notice.id).dismissedAt;
  f.advance(1);
  assert.equal(await f.feed().update(f.member, "dismiss", notice.id), true);
  await f.feed().run();
  assert.equal(+f.notifications.get(notice.id).dismissedAt, dismissedAt);
  assert.equal((await f.feed().read(f.member)).items.some(item => item.id === notice.id), false);
  assert.equal(reviewRows(f).length, 1, "Dismissal retains the deduplication tombstone.");
  assert.equal(await f.feed().read(f.admin), null);
  assert.equal(await f.feed().update(f.admin, "dismiss", notice.id), false);
});

test("a moved reward claim gives case and appeal ownership to its current holder while old notices disclose no case fields", async () => {
  const f = await fixture(), grant = await f.grant(), { row } = await f.open(grant.id);
  const reversed = await f.decide(row), holder = await f.anotherMember();
  const oldNotice = reviewNotices(await f.feed().read(f.member))[0];
  assert.equal(oldNotice.relatedCaseId, row.id);
  // Exercise the production claims-transfer helper. Its caller's audited AccountMove,
  // money and session migration are covered by the dedicated transfer integration tests.
  await f.database.transaction(tx => transferReferralReviewClaims(tx, f.member.accountId, holder.accountId));
  assert.equal(f.reversals.get(grant.id).holderAccountId, holder.accountId);
  const oldPage = await f.feed().read(f.member), historicalNotice = oldPage.items.find(item => item.id === oldNotice.id);
  assert.equal(historicalNotice.kind, "referral-reversed");
  assert.equal(historicalNotice.relatedCaseId, undefined);
  assert.equal(historicalNotice.reason, undefined);
  assert.deepEqual(await f.reviews.member(f.member), []);
  assert.equal((await f.appeal(reversed.case)).status, "forbidden");
  const owned = await f.reviews.member(holder);
  assert.equal(owned.length, 1); assert.equal(owned[0].id, row.id); assert.equal(owned[0].canAppeal, true);
  const appealed = await f.reviews.appeal(holder, { id: row.id, revision: reversed.case.revision, statement: appealStatement });
  assert.equal(appealed.status, "saved");
  const restored = await f.reviews.mutate(f.admin, { action: "appeal-decision", id: row.id, revision: appealed.case.revision, decision: "restore", evidenceConfirmed: false });
  assert.equal(restored.status, "saved");
  const current = await f.feed().read(holder), currentNotices = reviewNotices(current);
  assert.deepEqual(new Set(currentNotices.map(item => item.kind)), new Set(["referral-reviewed", "referral-restored"]));
  assert.ok(currentNotices.every(item => item.relatedCaseId === row.id && item.reason === "duplicate-award"));
  assert.equal(await f.feed().update(f.member, "dismiss", currentNotices[0].id), false);
  assert.equal(reviewNotices(await f.feed().read(f.member)).length, 1);
  assertPrivate(oldPage, f, [holder.accountId, holder.phone]);
  assertPrivate(current, f, [holder.accountId, holder.phone]);
  assert.ok(!JSON.stringify(owned).includes(evidenceRef));
});

test("Account maintenance purges evidence at final-closure plus 90 days and preserves reopened appeals and immutable history", async () => {
  const f = await fixture(), grant = await f.grant(), { row } = await f.open(grant.id);
  const reversed = await f.decide(row), closedAt = +f.reviewCases.get(row.id).closedAt;
  const events = structuredClone([...f.reviewEvents.values()]), originalGrant = structuredClone(f.accessCodes.get(grant.id));
  const ledger = structuredClone(f.reversals.get(grant.id));
  f.advance(referralReviewRules.evidenceRetentionMs - 1);
  assert.equal((await f.feed().run()).failed, 0);
  assert.equal(f.reviewEvidence.get(row.id).summary, summary);
  f.advance(1);
  assert.equal(f.now(), closedAt + referralReviewRules.evidenceRetentionMs);
  assert.equal((await f.feed().run()).failed, 0);
  let evidence = f.reviewEvidence.get(row.id);
  assert.equal(evidence.summary, null); assert.equal(evidence.evidenceRef, null); assert.equal(evidence.appealStatement, null);
  assert.equal(+evidence.purgedAt, f.now());
  assert.deepEqual([...f.reviewEvents.values()], events);
  assert.deepEqual(structuredClone(f.accessCodes.get(grant.id)), originalGrant);
  assert.deepEqual(f.reversals.get(grant.id), ledger);
  f.sessions.get(f.member.tokenHash).expiresAt = new Date(f.now() + 200 * DAY);
  const appealed = await f.appeal(reversed.case);
  assert.equal(appealed.status, "saved");
  assert.equal(f.reviewCases.get(row.id).closedAt, null);
  f.advance(referralReviewRules.evidenceRetentionMs + 1);
  await f.feed().run();
  evidence = f.reviewEvidence.get(row.id);
  assert.equal(evidence.appealStatement, appealStatement, "An open appeal has no final closure to start retention.");
  assert.equal(evidence.purgedAt, null);
  f.sessions.get(f.admin.tokenHash).expiresAt = new Date(f.now() + 200 * DAY);
  const upheld = await f.reviews.mutate(f.admin, { action: "appeal-decision", id: row.id, revision: appealed.case.revision, decision: "uphold", evidenceConfirmed: true });
  assert.equal(upheld.status, "saved");
  f.advance(referralReviewRules.evidenceRetentionMs - 1);
  await f.feed().run();
  assert.equal(f.reviewEvidence.get(row.id).appealStatement, appealStatement);
  f.advance(1);
  await f.feed().run();
  assert.equal(f.reviewEvidence.get(row.id).appealStatement, null);
  assert.equal(+f.reviewEvidence.get(row.id).purgedAt, f.now());
  assert.equal(f.reviewCases.get(row.id).status, "upheld");
  assert.equal([...f.reviewEvents.values()].some(event => event.action === "appeal-upheld"), true);
  assert.equal(f.messages.length, 0);
});
