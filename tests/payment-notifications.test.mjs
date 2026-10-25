import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { createReviewHandlers } from "../src/server/admin/codes-http.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createPaymentNotifications } from "../src/server/members/payment-notifications.ts";
import { YoolaMessagingError } from "../src/server/members/yoola-messaging.ts";

const instant = Date.parse("2026-12-24T22:30:00Z"), day = 86_400_000;
const owner = "synthetic-owner";

/** A transactional store for exercising production payment services without MySQL or provider credentials. */
function fixture() {
  const account = { id: randomUUID(), phone: "256700000111", blockedAt: null, erasedAt: null, trialRequestedAt: new Date(instant), trialDismissedAt: null };
  const plan = { id: randomUUID(), name: "Weekly", durationDays: 7, priceUgx: 5000, active: true };
  let state = { memberAccount: [account], subscriptionPlan: [plan], paymentSubmission: [], accessCode: [], ownerAuditEvent: [], memberSession: [], paymentScreenshot: [], walletEntry: [],
    subscriptionSettings: [{ ...defaultSubscriptionSettings, id: 1, updatedAt: new Date(instant) }] };
  let committed = structuredClone(state), tail = Promise.resolve(), transactions = 0, abortCommit = null;
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("gt" in value) return row[key] > value.gt;
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const tx = Object.fromEntries(Object.keys(state).map(table => {
    const find = where => state[table].find(row => matches(row, where)) ?? null;
    return [table, {
      async findUnique({ where }) { return find(where); },
      async findUniqueOrThrow({ where }) { const row = find(where); assert.ok(row, `${table} row must exist`); return row; },
      async findFirst({ where, orderBy }) { const rows = state[table].filter(row => matches(row, where)); if (orderBy?.endsAt) rows.sort((a, b) => +b.endsAt - +a.endsAt); return rows[0] ?? null; },
      async findMany({ where = {} } = {}) { return state[table].filter(row => matches(row, where)); },
      async count({ where = {} } = {}) { return state[table].filter(row => matches(row, where)).length; },
      async create({ data }) { const row = { ...data, extensionDays: data.extensionDays ?? 0, revokedAt: data.revokedAt ?? null }; state[table].push(row); return row; },
      async update({ where, data }) { const row = find(where); assert.ok(row); Object.assign(row, data); return row; },
      async updateMany({ where, data }) { const rows = state[table].filter(row => matches(row, where)); for (const row of rows) Object.assign(row, data); return { count: rows.length }; },
      async deleteMany({ where }) { const before = state[table].length; state[table] = state[table].filter(row => !matches(row, where)); return { count: before - state[table].length }; },
    }];
  }));
  tx.$queryRaw = async () => [];
  tx.$executeRaw = async (parts, ...values) => {
    if (parts.join("").includes("INSERT INTO MemberAccount") && !state.memberAccount.some(row => row.phone === values[1])) {
      state.memberAccount.push({ id: values[0], phone: values[1], blockedAt: null, erasedAt: null });
    }
    return 1;
  };
  const database = {
    query: run => run(tx),
    async transaction(run) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const before = structuredClone(state); transactions++;
      try {
        const outcome = await run(tx);
        if (abortCommit) { const error = abortCommit; abortCommit = null; throw error; }
        committed = structuredClone(state); return outcome;
      } catch (error) { state = before; throw error; }
      finally { release(); }
    },
  };
  function report(fields = {}) {
    const row = { id: randomUUID(), accountId: account.id, payerPhone: "256700000999", reference: "ABCD", status: "pending", planId: plan.id,
      planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx, submittedSessionHash: null, ...fields };
    state.paymentSubmission.push(row); committed = structuredClone(state); return row;
  }
  const approvals = [], rejections = [];
  const notifications = {
    async approved(message) { assert.equal(committed.paymentSubmission.find(row => row.id === message.paymentId)?.status, "approved", "SMS follows the committed decision"); approvals.push(message); return "sent"; },
    async rejected(message) { assert.equal(committed.paymentSubmission.find(row => row.id === message.paymentId)?.status, "rejected", "SMS follows the committed decision"); rejections.push(message); return "sent"; },
  };
  return { database, account, plan, report, approvals, rejections, notifications, get state() { return state; }, get committed() { return committed; },
    get transactions() { return transactions; }, abortNextCommit(error) { abortCommit = error; },
    fields: (transactionRef = "SYNTHETIC-PAID") => ({ planId: plan.id, network: "mtn", transactionRef, amountReceivedUgx: 5000 }),
    codes: (overrides = {}) => createAccessCodes({ database, now: () => instant, notifications, ...overrides }),
    review: (overrides = {}) => createPaymentReview(database, () => instant, { notifications, ...overrides }),
  };
}

test("payment approval notifies the registered account after commit, with its real renewal expiry", async () => {
  const f = fixture(), first = f.report(), codes = f.codes();
  const approved = await codes.approvePayment(first.id, f.fields(), owner);
  assert.equal(approved.status, "created"); assert.equal(approved.notification, "sent");
  assert.equal(f.approvals[0].phone, f.account.phone); assert.notEqual(f.approvals[0].phone, first.payerPhone);
  assert.equal(+f.approvals[0].expiresAt, +approved.grant.endsAt);
  assert.equal(f.approvals[0].reference, `P${first.reference}`);
  assert.equal(approved.grant.payment, `P${first.reference}`);
  assert.equal(f.state.paymentSubmission[0].transactionRef, "SYNTHETICPAID");
  assert.equal(f.approvals[0].planName, "Weekly");
  assert.equal((await codes.extend(approved.grant.id, 2, owner)).status, "saved");
  assert.equal(f.approvals.length, 1);
  const next = f.report({ reference: "EFGH" });
  const renewed = await codes.approvePayment(next.id, f.fields("SYNTHETIC-RENEWAL"), owner);
  assert.equal(+renewed.grant.startsAt, +approved.grant.endsAt + 2 * day);
  assert.equal(+f.approvals[1].expiresAt, instant + 16 * day);
});

test("replayed and concurrent payment approvals produce a single notification", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  const outcomes = await Promise.all([codes.approvePayment(row.id, f.fields(), owner), codes.approvePayment(row.id, f.fields(), owner)]);
  assert.deepEqual(outcomes.map(row => row.status).sort(), ["created", "duplicate"]);
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "duplicate");
  assert.equal(f.approvals.length, 1); assert.equal(f.state.accessCode.length, 1);
});

test("rolled back payments never notify; a retried transaction sends only after its final commit", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  f.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(codes.approvePayment(row.id, f.fields(), owner), DatabaseOperationError);
  assert.equal(f.approvals.length, 0); assert.equal(f.committed.paymentSubmission[0].status, "pending");
  f.abortNextCommit(new DatabaseOperationError("conflict"));
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "created");
  assert.equal(f.transactions, 3); assert.equal(f.approvals.length, 1); assert.equal(f.state.accessCode.length, 1);
});

test("missing, invalid and blocked approvals never send SMS", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  assert.equal((await codes.approvePayment(randomUUID(), f.fields(), owner)).status, "refused");
  assert.equal((await codes.approvePayment(row.id, { ...f.fields(), transactionRef: "" }, owner)).status, "invalid");
  f.state.memberAccount[0].blockedAt = new Date(instant);
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "refused");
  assert.equal(f.approvals.length, 0);
});

test("only manual grants that record actual payment details notify", async () => {
  const f = fixture(), codes = f.codes();
  const fields = { phone: f.account.phone, planId: f.plan.id, amountReceivedUgx: 5000, note: "Synthetic owner confirmation" };
  assert.equal((await codes.manual(fields, owner)).status, "created"); assert.equal(f.approvals.length, 0);
  const paid = await codes.manual({ ...fields, network: "mtn", transactionRef: "SYNTHETIC-MANUAL" }, owner);
  assert.equal(paid.status, "created"); assert.equal(paid.notification, "sent"); assert.equal(f.approvals.length, 1);
  assert.equal(f.state.paymentSubmission[0].transactionRef, "SYNTHETICMANUAL");
  assert.equal(+f.approvals[0].expiresAt, +paid.grant.endsAt);
  assert.equal((await codes.manual({ ...fields, network: "airtel", transactionRef: "SYNTHETICMANUAL" }, owner)).status, "duplicate");
  await codes.extend(paid.grant.id, 1, owner); await codes.revoke(paid.grant.id, "owner-revoked", owner);
  assert.equal((await codes.reversePayment(paid.grant.paymentSubmissionId, "network-reversal", owner)).status, "saved");
  assert.equal(f.approvals.length, 1); assert.equal(f.rejections.length, 0);
});

test("rejection notifies the registered number after commit once and omits private admin text", async () => {
  const f = fixture(), row = f.report(), review = f.review();
  const result = await review.reject(row.id, "unreadable", "Private administrator investigation", true, owner);
  assert.equal(result.status, "saved"); assert.equal(result.notification, "sent");
  assert.equal(f.rejections.length, 1); assert.equal(f.rejections[0].phone, f.account.phone);
  assert.equal(f.rejections[0].reference, `P${row.reference}`);
  assert.equal(f.rejections[0].reason, "unreadable");
  assert.ok(!JSON.stringify(f.rejections).includes("Private administrator investigation"));
  assert.equal((await review.reject(row.id, "other", "", false, owner)).status, "refused");
  assert.equal((await review.reject(randomUUID(), "other", "", false, owner)).status, "refused");
  assert.equal((await review.reject(row.id, "invalid", "", false, owner)).status, "invalid");
  assert.equal(f.rejections.length, 1);
});

test("concurrent rejections notify once, while a rolled back rejection sends nothing", async () => {
  const f = fixture(), row = f.report(), review = f.review();
  f.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(review.reject(row.id, "other", "", false, owner), DatabaseOperationError);
  assert.equal(f.rejections.length, 0); assert.equal(f.committed.paymentSubmission[0].status, "pending");
  const results = await Promise.all([review.reject(row.id, "other", "", false, owner), review.reject(row.id, "other", "", false, owner)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["refused", "saved"]);
  assert.equal(f.rejections.length, 1);
});

test("trial grants do not send payment notifications", async () => {
  const f = fixture();
  assert.equal((await f.codes().sendTrial(f.account.id, 2, owner)).status, "created");
  assert.equal(f.approvals.length, 0); assert.equal(f.rejections.length, 0);
});

test("notification failures cannot roll back a completed approval or rejection", async () => {
  const f = fixture(), a = f.report(), b = f.report({ reference: "EFGH" });
  const notifications = { async approved() { throw new Error("Synthetic delivery outage"); }, async rejected() { throw new Error("Synthetic delivery outage"); } };
  const approved = await f.codes({ notifications }).approvePayment(a.id, f.fields(), owner);
  const rejected = await f.review({ notifications }).reject(b.id, "not-received", "", false, owner);
  assert.equal(approved.status, "created"); assert.equal(approved.notification, "failed");
  assert.equal(rejected.status, "saved"); assert.equal(rejected.notification, "failed");
  assert.deepEqual(f.committed.paymentSubmission.map(row => row.status), ["approved", "rejected"]);
});

test("payment decision HTTP responses report notification status without changing successful decisions", async () => {
  const f = fixture(), a = f.report(), b = f.report({ reference: "EFGH" });
  const handlers = createReviewHandlers({ notifications: { async approved() { return "failed"; }, async rejected() { return "sent"; } } });
  const context = (id, body) => ({ services: { database: f.database }, owner: { username: owner }, request: new Request(`http://localhost/api/admin/payments/${id}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) });
  const approval = await handlers.POST(context(a.id, { action: "approve", planId: f.plan.id, network: "mtn", transactionId: "SYNTHETIC-HTTP", amount: 5000 }));
  assert.equal(approval.status, 201); const approved = await approval.json();
  assert.equal(approved.status, "approved"); assert.equal(approved.notification, "failed");
  assert.equal(approved.reference, `P${a.reference}`);
  assert.equal(f.committed.paymentSubmission[0].transactionRef, "SYNTHETICHTTP");
  assert.equal(approved.endsAt, f.committed.accessCode[0].endsAt.toISOString());
  const rejection = await handlers.POST(context(b.id, { action: "reject", reason: "not-received", text: "Private text" }));
  assert.equal(rejection.status, 200); assert.deepEqual(await rejection.json(), { status: "saved", notification: "sent" });
});

test("approval SMS directs the member to sign in without disclosing payment or subscription details", async () => {
  const f = fixture(), messages = [];
  const notifications = createPaymentNotifications({ database: f.database, now: () => instant, delivery: { async sendSms(message) { messages.push(message); } } });
  const result = await notifications.approved({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PABCD", planName: "Weekly", expiresAt: new Date("2026-12-31T22:30:00Z") });
  assert.equal(result, "sent"); assert.equal(messages.length, 1); assert.equal(messages[0].phone, f.account.phone);
  assert.match(messages[0].message, /Sign in/u);
  assert.doesNotMatch(messages[0].message, /PABCD|Weekly|2027|EAT|payment|approved/iu);
  assert.equal(f.state.ownerAuditEvent[0].action, "payment_sms_attempted");
  assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(f.account.phone));
  assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(messages[0].message));
});

test("rejection SMS excludes payment references, decisions, reasons and private administrator text", async () => {
  const f = fixture(), messages = [];
  const notifications = createPaymentNotifications({ database: f.database, delivery: { async sendSms(message) { messages.push(message); } } });
  await notifications.rejected({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PABCD", reason: "not-received" });
  assert.match(messages[0].message, /Sign in/u); assert.doesNotMatch(messages[0].message, /PABCD|reject|not.received|could not be confirmed/iu);
  await notifications.rejected({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PEFGH", reason: "Private admin text: secret 256700000333" });
  assert.ok(!messages[1].message.includes("Private admin text")); assert.ok(!messages[1].message.includes("256700000333"));
});

test("credit and renewal SMS exclude amounts, balances, plan names and expiry times", async () => {
  const f = fixture(), messages = [];
  const notifications = createPaymentNotifications({ database: f.database, delivery: { async sendSms(message) { messages.push(message); } } });
  await notifications.credited({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PCREDIT", addedUgx: 25000, balanceUgx: 32000 });
  await notifications.renewed({ accessCodeId: randomUUID(), accountId: f.account.id, phone: f.account.phone, planName: "Private Weekly", expiresAt: new Date("2027-01-01T09:00:00Z"), balanceUgx: 17000 });
  for (const { message } of messages) {
    assert.match(message, /Sign in/u); assert.ok(message.length <= 160);
    assert.doesNotMatch(message, /PCREDIT|25000|25,000|32000|17000|UGX|credit|Private Weekly|2027|EAT/iu);
  }
  assert.equal(f.state.ownerAuditEvent.at(-1).targetType, "access-code");
});

test("SMS delivery failures return safe statuses without leaking provider diagnostics", async () => {
  for (const code of ["configuration", "unsupported-country", "delivery"]) {
    const f = fixture();
    const notifications = createPaymentNotifications({ database: f.database, delivery: { async sendSms() { throw new YoolaMessagingError(code); } } });
    assert.equal(await notifications.rejected({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PABCD", reason: "other" }), "failed");
    assert.equal(f.state.ownerAuditEvent[0].action, "payment_sms_attempted");
    assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(f.account.phone));
  }
  const f = fixture(), secret = "Synthetic private provider payload 256700000333";
  const notifications = createPaymentNotifications({ database: f.database, delivery: { async sendSms() { throw new Error(secret); } } });
  assert.equal(await notifications.rejected({ paymentId: randomUUID(), accountId: f.account.id, phone: f.account.phone, reference: "PABCD", reason: "other" }), "failed");
  assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(secret));
});

test("missing or unsupported registered numbers do not call the SMS provider", async () => {
  const f = fixture(); let calls = 0;
  const notifications = createPaymentNotifications({ database: f.database, delivery: { async sendSms() { calls++; } } });
  for (const [phone, status] of [[null, "unavailable"], ["551155550123", "unsupported"]]) {
    assert.equal(await notifications.rejected({ paymentId: randomUUID(), accountId: f.account.id, phone, reference: "PABCD", reason: "other" }), status);
  }
  assert.equal(calls, 0);
});

test("an audit outage does not undo an SMS accepted by the provider", async () => {
  let calls = 0;
  const notifications = createPaymentNotifications({ database: { async query() { throw new Error("Synthetic audit outage"); } }, delivery: { async sendSms() { calls++; } } });
  assert.equal(await notifications.rejected({ paymentId: randomUUID(), accountId: randomUUID(), phone: "256700000111", reference: "PABCD", reason: "other" }), "sent");
  assert.equal(calls, 1);
});
