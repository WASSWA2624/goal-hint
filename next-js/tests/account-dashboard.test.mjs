import assert from "node:assert/strict";
import test from "node:test";
import { createAccountDashboard } from "../src/server/members/account-dashboard.ts";
import { accountActivityLimit } from "../src/domain/account-dashboard.ts";

const at = new Date("2026-10-31T09:00:00Z"), day = 86_400_000;
const ago = (days) => new Date(+at - days * day);
const later = (days) => new Date(+at + days * day);

/** A projection-aware adapter: assertions inspect the actual filters, bounds and selected columns. */
function fixture() {
  const member = { accountId: "one", tokenHash: "session-one", phone: "256700000101", blocked: false, codeEnteredAt: null };
  const account = { phone: member.phone, passwordHash: "private-password", phoneVerifiedAt: ago(1), blockedAt: null, erasedAt: null };
  const session = { accountId: member.accountId, authenticatedAt: ago(1), passwordResetAt: null, expiresAt: later(1), account };
  const payments = [], periods = [], rewards = [], queries = [], transactions = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
      if ("gt" in value) return row[key] != null && row[key] > value.gt;
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const project = (row, select) => Object.fromEntries(Object.entries(select).map(([key, value]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
  const table = (rows, name) => ({
    async findMany(query) {
      queries.push({ name, ...query });
      return rows.filter(row => matches(row, query.where)).sort((a, b) => {
        for (const order of query.orderBy) for (const [field, direction] of Object.entries(order)) {
          if (a[field] < b[field]) return direction === "desc" ? 1 : -1;
          if (a[field] > b[field]) return direction === "desc" ? -1 : 1;
        }
        return 0;
      }).slice(0, query.take ?? 1).map(row => project(row, query.select));
    },
    async findFirst(query) { return (await this.findMany(query))[0] ?? null; },
  });
  const tx = { memberSession: { async findUnique(query) {
    queries.push({ name: "session", ...query });
    return query.where.tokenHash === "session-one" ? project(session, query.select) : null;
  } }, accessCode: table(periods, "access"), paymentSubmission: table(payments, "payment"), memberReferral: table(rewards, "referral") };
  const database = { async transaction(run, options) { transactions.push(options); return run(tx); } };
  const service = createAccountDashboard({ database, now: () => +at });
  function payment(id, fields = {}) {
    const row = { id, accountId: "one", reference: "ABCD", status: "pending", purpose: "plan", planName: "Weekly",
      submittedAt: ago(2), decidedAt: null, reversedAt: null, payerPhone: "private-phone", transactionRef: "private-transaction",
      rejectText: "private-note", screenshot: "private-bytes", ...fields };
    payments.push(row); return row;
  }
  function period(id, fields = {}) {
    const row = { id, accountId: "one", planName: "Weekly snapshot", createdAt: ago(2), startsAt: ago(2), endsAt: later(5), revokedAt: null,
      codeHash: "private-code", codeSalt: "private-salt", note: "private-note", createdBy: "private-actor", ...fields };
    periods.push(row); return row;
  }
  return { member, account, session, service, period, payment, rewards, queries, transactions };
}

test("current package uses the active snapshot, excluding queued, ended, revoked and other accounts", async () => {
  const f = fixture();
  f.period("ended", { startsAt: ago(10), endsAt: at });
  f.period("queued", { startsAt: later(1), endsAt: later(8), planName: "Next package" });
  f.period("revoked", { startsAt: ago(1), revokedAt: ago(0.1), planName: "Revoked package" });
  f.period("other", { accountId: "two", startsAt: at, planName: "Private package" });
  assert.equal((await f.service.read(f.member)).activePlanName, null);
  f.period("active", { startsAt: at, planName: "Purchased name" });
  assert.equal((await f.service.read(f.member)).activePlanName, "Purchased name");
  f.period("older-overlap", { startsAt: ago(3), planName: "Earlier" });
  f.period("z-overlap", { startsAt: at, planName: "Tie winner" });
  assert.equal((await f.service.read(f.member)).activePlanName, "Tie winner");
  assert.deepEqual(f.transactions[0], { isolationLevel: "RepeatableRead", timeout: 10_000 });
});

test("accounts without paid-device unlock, including expired accounts, retain their own history", async () => {
  const f = fixture();
  f.period("ended", { startsAt: ago(8), endsAt: ago(1) });
  const view = await f.service.read(f.member);
  assert.equal(view.activePlanName, null);
  assert.equal(view.activity[0].status, "added"); // Natural expiry never invents a removal decision.
  assert.equal(view.activity[0].endsAt, ago(1).toISOString());
});

test("stale, restricted, mismatched, blocked and erased identities cannot read account history", async t => {
  const cases = {
    missing: f => { f.member.tokenHash = "missing"; },
    mismatch: f => { f.member.accountId = "two"; },
    unauthenticated: f => { f.session.authenticatedAt = null; },
    reset: f => { f.session.passwordResetAt = ago(1); },
    expired: f => { f.session.expiresAt = at; },
    blockedIdentity: f => { f.member.blocked = true; },
    blockedAccount: f => { f.account.blockedAt = at; },
    erased: f => { f.account.erasedAt = at; },
    noPhone: f => { f.account.phone = null; },
    changedPhone: f => { f.account.phone = "256700000102"; },
    noPassword: f => { f.account.passwordHash = null; },
    unverified: f => { f.account.phoneVerifiedAt = null; },
  };
  for (const [name, change] of Object.entries(cases)) await t.test(name, async () => {
    const f = fixture(); f.period("private"); change(f);
    assert.equal(await f.service.read(f.member), null);
    assert.ok(f.queries.every(query => query.name === "session"));
  });
});

test("recent decisions and reversals of old payments survive a large newer submission history", async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++) f.payment(`new-${i}`, { submittedAt: ago(2 + i / 100) });
  f.payment("reversal", { status: "reversed", submittedAt: ago(90), decidedAt: ago(89), reversedAt: ago(0.1) });
  f.payment("approval", { status: "approved", submittedAt: ago(80), decidedAt: ago(0.2) });
  f.payment("rejection", { status: "rejected", submittedAt: ago(70), decidedAt: ago(0.3) });
  f.payment("replaced", { status: "superseded", submittedAt: ago(60), decidedAt: ago(0.4) });
  f.payment("other", { accountId: "two", submittedAt: at, planName: "Private package" });
  const view = await f.service.read(f.member);
  assert.deepEqual(view.activity.slice(0, 4).map(row => [row.status, row.at]), [
    ["reversed", ago(0.1).toISOString()], ["approved", ago(0.2).toISOString()],
    ["rejected", ago(0.3).toISOString()], ["superseded", ago(0.4).toISOString()],
  ]);
  assert.equal(view.activity.length, accountActivityLimit);
  assert.equal(new Set(view.activity.map(row => row.id)).size, accountActivityLimit);
  assert.ok(view.activity.every(row => row.planName !== "Private package"));
});

test("old grants removed recently are included; future grants never become past activity", async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++) f.period(`new-${i}`, { createdAt: ago(2 + i / 100) });
  f.period("removed", { createdAt: ago(90), revokedAt: ago(0.1) });
  f.period("future", { createdAt: later(1), startsAt: later(1) });
  f.payment("future", { submittedAt: later(1) });
  const view = await f.service.read(f.member);
  assert.equal(view.activity[0].id, "access:removed");
  assert.equal(view.activity[0].status, "removed");
  assert.ok(view.activity.every(row => new Date(row.at) <= at));
});

test("safe projections are bounded, scoped and deterministic, with no private row spreading", async () => {
  const f = fixture();
  f.payment("a", { purpose: "topup" });
  f.period("b");
  f.period("other", { accountId: "two", createdAt: at, planName: "Private package" });
  const view = await f.service.read(f.member);
  assert.deepEqual(view.activity.map(row => row.id), ["payment:a", "access:b"]);
  assert.equal(view.activity[0].reference, "PABCD");
  assert.equal(view.activity[0].purpose, "topup");
  for (const query of f.queries.filter(query => query.name !== "session")) {
    assert.equal(query.name === "referral" ? query.where.inviterId : query.where.accountId, f.member.accountId);
    if (query.take !== undefined) assert.equal(query.take, accountActivityLimit);
    assert.ok(!JSON.stringify(query.select).match(/phone|Hash|Salt|note|By|screenshot|transactionRef/));
  }
  assert.doesNotMatch(JSON.stringify(view), /private-|phone|Hash|Salt|screenshot|transactionRef|note|createdBy|accountId/);
  assert.deepEqual((await f.service.read(f.member)).activity, view.activity);
});

test("referral awards appear once in activity without invitee identity or duplicate access entries", async () => {
  const f = fixture();
  f.period("reward-period", { source: "referral", planName: "Earned access" });
  f.rewards.push({ id: "reward", inviterId: f.member.accountId, rewardedAt: ago(1), status: "rewarded", phoneKey: "private-digest" },
    { id: "foreign", inviterId: "other", rewardedAt: at, status: "rewarded" },
    { id: "pending", inviterId: f.member.accountId, rewardedAt: null, status: "pending" });
  const view = await f.service.read(f.member);
  assert.equal(view.activePlanName, "Earned access");
  assert.deepEqual(view.activity.map(row => [row.kind, row.id]), [["referral", "referral:reward"]]);
  assert.doesNotMatch(JSON.stringify(view), /private|phoneKey|inviterId|accountId/);
});

test("missing decision timestamps retain the known submission event; empty and failed reads remain distinct", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.read(f.member), { activePlanName: null, activity: [] });
  f.payment("legacy", { status: "approved" });
  assert.equal((await f.service.read(f.member)).activity[0].status, "pending");
  const service = createAccountDashboard({ database: { async transaction() { throw new Error("database unavailable"); } } });
  await assert.rejects(service.read(f.member), /database unavailable/);
});
