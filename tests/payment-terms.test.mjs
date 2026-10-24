import assert from "node:assert/strict";
import test from "node:test";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { termsNotice } from "../src/domain/terms-notice.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { jpeg } from "./helpers/payment-fixtures.mjs";

const instant = Date.parse("2026-10-24T12:00:00Z"), at = new Date(instant);
const settings = { ...defaultSubscriptionSettings, paywallMode: "test", mtnNumber: "256700000901" };
const fields = { planId: "plan", network: "mtn", payerPhone: "256700000101", transactionId: "NEW1234", screenshotAmount: 5000, accepted: false };

// A small in-memory query adapter exercises the service's account, relation and consent filters without a database.
function matches(value, filter) {
  if (filter === null || typeof filter !== "object" || filter instanceof Date) return value === filter;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "OR") return expected.some(branch => matches(value, branch));
    if (key === "some") return Array.isArray(value) && value.some(row => matches(row, expected));
    if (key === "not") return value !== expected;
    if (key === "gt") return value > expected;
    if (key === "in") return expected.includes(value);
    return matches(value?.[key], expected);
  });
}

function fixture({ reports = [], codes = [], accountChange = {}, sessionChange = {} } = {}) {
  const member = { accountId: "account", tokenHash: "session", phone: "256700000101", codeEnteredAt: null };
  const session = { tokenHash: member.tokenHash, accountId: member.accountId, authenticatedAt: at, passwordResetAt: null,
    expiresAt: new Date(instant + 86_400_000), codeEnteredAt: null, ...sessionChange };
  const submissions = reports.map((row, index) => ({ id: `report-${index}`, accountId: member.accountId, source: "report", reference: "TEST",
    termsVersion: termsNotice.reviewedOn, acceptedAt: at, status: "reversed", submittedAt: at,
    rejectText: null, rejectReason: null, planName: "Weekly", priceUgx: 5000, code: null, ...row }));
  const periods = codes.map(row => ({ accountId: member.accountId, source: "manual", termsVersion: null,
    endsAt: new Date(instant - 1), revokedAt: at, ...row }));
  const account = { id: member.accountId, phone: member.phone, blockedAt: null, erasedAt: null, trialRequestedAt: null, trialDismissedAt: null,
    get sessions() { return session.accountId === member.accountId ? [session] : []; },
    get submissions() { return submissions.filter(row => row.accountId === member.accountId); },
    get codes() { return periods.filter(row => row.accountId === member.accountId); }, ...accountChange };
  const created = [], tx = {
    async $queryRaw() { return []; }, async $executeRaw() { return 1; },
    memberAccount: { async findUnique() { return account; }, async findFirst({ where }) { return matches(account, where) ? { id: account.id } : null; } },
    memberSession: { async findUnique() { return session; } },
    accessCode: { async count({ where }) { return periods.filter(row => matches(row, where)).length; } },
    subscriptionSettings: { async findUniqueOrThrow() { return settings; } },
    subscriptionPlan: { async findUnique() { return { id: "plan", name: "Weekly", durationDays: 7, priceUgx: 5000, active: true }; } },
    paymentSubmission: {
      async findFirst({ where }) { return submissions.find(row => matches({ ...row, account }, where)) ?? null; },
      async updateMany() { return { count: 0 }; },
      async create({ data }) { created.push(data); submissions.push(data); return data; },
    },
    rateLimitBucket: { async findUniqueOrThrow({ where }) { return { key: where.key, count: 0, bytes: 0 }; }, async update() {} },
    ownerAuditEvent: { async create() {} },
    walletEntry: { async findMany() { return []; } },
  };
  const database = { query: run => run(tx), transaction: run => run(tx) };
  const service = createPayments({ database, config: { key: (purpose, value) => `${purpose}:${value}` }, now: () => instant, environment: null });
  return { member, created, service, view: () => service.view(member, settings), submit: accepted => service.submit(member, { ...fields, accepted }, jpeg()) };
}

test("current member-report consent survives every payment status and a locked or new device", async () => {
  for (const status of ["pending", "superseded", "approved", "rejected", "reversed"]) {
    const f = fixture({ reports: [{ status }] });
    assert.equal((await f.view()).acceptedTerms, true, status);
    assert.equal((await f.submit(false)).status, "saved", status);
    assert.equal(f.created[0].termsVersion, termsNotice.reviewedOn);
  }
});

test("recorded access consent survives expiry and reversal; grants without consent do not waive acceptance", async () => {
  const prior = fixture({ codes: [{ termsVersion: termsNotice.reviewedOn }] });
  assert.equal((await prior.view()).acceptedTerms, true);
  assert.equal((await prior.submit(false)).status, "saved");
  for (const source of ["manual", "trial", "number-change", "payment"]) {
    for (const termsVersion of [null, "", "old-version"]) {
      const f = fixture({ codes: [{ source, termsVersion }] });
      assert.equal((await f.view()).acceptedTerms, false);
      assert.equal((await f.submit(false)).status, "invalid");
      assert.equal(f.created.length, 0);
    }
  }
});

test("new terms, unaccepted or owner reports and another account's consent require explicit acceptance", async () => {
  for (const options of [{}, { reports: [{ termsVersion: "old-version" }] }, { reports: [{ acceptedAt: null }] },
    { reports: [{ source: "owner" }] }, { reports: [{ source: "owner", acceptedAt: null, termsVersion: null }] },
    { reports: [{ accountId: "another-account" }] }, { codes: [{ accountId: "another-account", termsVersion: termsNotice.reviewedOn }] }]) {
    const f = fixture(options);
    assert.equal((await f.view()).acceptedTerms, false);
    assert.equal((await f.submit(false)).status, "invalid");
    assert.equal(f.created.length, 0, "Prior consent cannot accept a newer version.");
    assert.equal((await f.submit(true)).status, "saved");
    assert.equal(f.created[0].termsVersion, termsNotice.reviewedOn);
    assert.equal(+f.created[0].acceptedAt, instant);
  }
});

test("prior consent never bypasses account or current-session protection", async () => {
  for (const change of [{ accountChange: { blockedAt: at } }, { accountChange: { erasedAt: at } }, { accountChange: { phone: null } },
    { sessionChange: { authenticatedAt: null } }, { sessionChange: { passwordResetAt: at } },
    { sessionChange: { expiresAt: at } }, { sessionChange: { accountId: "another-account" } }]) {
    const f = fixture({ reports: [{}], ...change });
    assert.equal((await f.view()).acceptedTerms, false);
    for (const accepted of [false, true]) assert.equal((await f.submit(accepted)).status, "refused");
    assert.equal(f.created.length, 0);
  }
});
