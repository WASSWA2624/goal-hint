import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPaymentOutboxWorker, createQueuedPaymentNotifications, paymentOutboxRules } from "../src/server/members/payment-notification-outbox.ts";
import { defaultMessageTemplates } from "../src/domain/message-templates.ts";

const instant = Date.parse("2026-10-25T10:00:00Z");

function fixture(configuration = structuredClone(defaultMessageTemplates)) {
  let state = { rows: [], accounts: [{ id: randomUUID(), phone: "256700000111", phoneVerifiedAt: new Date(instant), blockedAt: null, erasedAt: null, creditUgx: 2000 }], audits: [], payments: [], periods: [] };
  let tail = Promise.resolve(), clock = instant, failFinish = false;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(clause => matches(row, clause));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lte" in value) return row[key] !== null && row[key] <= value.lte;
    }
    return row[key] === value;
  });
  const tx = {
    subscriptionSettings: { async findUnique() { return { messageTemplates: configuration }; } },
    async $queryRaw() { return []; },
    memberAccount: { async findUnique({ where }) { return state.accounts.find(row => matches(row, where)) ?? null; } },
    paymentSubmission: { async findUnique({ where }) { return state.payments.find(row => matches(row, where)) ?? null; } },
    accessCode: { async findUnique({ where }) { return state.periods.find(row => matches(row, where)) ?? null; } },
    ownerAuditEvent: { async create({ data }) { state.audits.push(data); return data; } },
    paymentNotificationOutbox: {
      async create({ data }) {
        if (state.rows.some(row => row.targetType === data.targetType && row.targetId === data.targetId && row.decision === data.decision && row.channel === data.channel)) throw new Error("Duplicate intent");
        const row = { startedAt: null, finishedAt: null, attemptId: null, ...data }; state.rows.push(row); return row;
      },
      async findUnique({ where }) { return state.rows.find(row => matches(row, where)) ?? null; },
      async findFirst({ where }) { return state.rows.find(row => matches(row, where)) ?? null; },
      async count({ where }) { return state.rows.filter(row => matches(row, where)).length; },
      async findMany({ where, take }) { return state.rows.filter(row => matches(row, where)).sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id)).slice(0, take).map(({ id }) => ({ id })); },
      async update({ where, data }) { const row = state.rows.find(row => matches(row, where)); assert.ok(row); Object.assign(row, data); return row; },
      async updateMany({ where, data }) {
        if (failFinish) { failFinish = false; throw new Error("Synthetic completion outage"); }
        const rows = state.rows.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
      },
      async groupBy() { return [...new Set(state.rows.map(row => row.status))].map(status => ({ status, _count: { _all: state.rows.filter(row => row.status === status).length } })); },
    },
  };
  const database = {
    query: run => run(tx),
    async transaction(run) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const before = structuredClone(state);
      try { return await run(tx); } catch (error) { state = before; throw error; } finally { release(); }
    },
  };
  const calls = [], delivery = { async sendSms(message) { calls.push(message); } };
  const worker = (override = {}) => createPaymentOutboxWorker({ database, now: () => clock, delivery, ...override });
  return { database, calls, worker, get state() { return state; }, setClock(at) { clock = at; }, failFinish() { failFinish = true; },
    async enqueue(fields = {}) {
      const event = { accountId: state.accounts[0].id, targetType: "payment", targetId: randomUUID(), decision: "approved", at: new Date(instant), ...fields };
      await database.transaction(tx => createQueuedPaymentNotifications().enqueue(tx, event)); return state.rows.at(-1);
    },
  };
}

test("a committed pending intent survives process replacement and sends minimal text once", async () => {
  const f = fixture(); await f.enqueue();
  assert.equal(f.calls.length, 0);
  const first = await f.worker().run(); assert.equal(first.sent, 1);
  assert.equal((await f.worker().run()).examined, 0); assert.equal(f.calls.length, 1);
  assert.equal(f.state.rows[0].status, "sent"); assert.equal(f.state.audits[0].details.status, "sent");
  assert.match(f.calls[0].message, /Sign in/u); assert.doesNotMatch(f.calls[0].message, /payment|UGX|approved|expiry|balance/iu);
  assert.ok(!JSON.stringify(f.state.rows).includes(f.state.accounts[0].phone));
  assert.ok(!JSON.stringify(f.state.audits).includes(f.state.accounts[0].phone));
});

test("concurrent workers fence a single automatic provider dispatch", async () => {
  const f = fixture(); await f.enqueue();
  await Promise.all([f.worker().run(), f.worker().run(), f.worker().run()]);
  assert.equal(f.calls.length, 1); assert.equal(f.state.rows[0].status, "sent"); assert.equal(f.state.audits.length, 1);
});

test("gateway failure remains classified and is never automatically resent", async () => {
  const f = fixture(); await f.enqueue(); let attempts = 0;
  const worker = f.worker({ delivery: { async sendSms() { attempts++; throw new Error("Synthetic secret gateway response"); } } });
  assert.equal((await worker.run()).failed, 1);
  await f.worker().run(); assert.equal(attempts, 1); assert.equal(f.calls.length, 0);
  assert.equal(f.state.rows[0].status, "failed"); assert.ok(!JSON.stringify(f.state).includes("Synthetic secret"));
});

test("a crash after the durable dispatch claim is surfaced as uncertain without resending", async () => {
  const f = fixture(), row = await f.enqueue();
  Object.assign(row, { status: "dispatching", startedAt: new Date(instant), attemptId: randomUUID() });
  assert.equal((await f.worker().run()).examined, 0);
  f.setClock(instant + paymentOutboxRules.interruptedAfterMs);
  assert.equal((await f.worker().run()).uncertain, 1); assert.equal(f.calls.length, 0);
  assert.equal(f.state.rows[0].status, "uncertain"); assert.deepEqual(await f.worker().status(), { uncertain: 1 });
});

test("an interrupted final commit cannot cause a second accepted SMS", async () => {
  const f = fixture(); await f.enqueue(); f.failFinish();
  await assert.rejects(f.worker().run(), /Synthetic completion outage/u);
  assert.equal(f.calls.length, 1); assert.equal(f.state.rows[0].status, "dispatching");
  f.setClock(instant + paymentOutboxRules.interruptedAfterMs);
  assert.equal((await f.worker().run()).uncertain, 1); assert.equal(f.calls.length, 1);
});

test("the original fenced attempt may confirm acceptance after interruption classification", async () => {
  const f = fixture(); await f.enqueue();
  let begin, release, attempts = 0;
  const started = new Promise(resolve => { begin = resolve; }), continued = new Promise(resolve => { release = resolve; });
  const first = f.worker({ delivery: { async sendSms() { attempts++; begin(); await continued; } } }).run();
  await started; f.setClock(instant + paymentOutboxRules.interruptedAfterMs);
  assert.equal((await f.worker().run()).uncertain, 1);
  release(); assert.equal((await first).sent, 1); assert.equal(attempts, 1);
  assert.equal(f.state.rows[0].status, "sent");
});

test("erased, blocked, missing and unsupported numbers never reach the gateway", async () => {
  for (const [fields, status] of [[{ erasedAt: new Date(instant), phone: null }, "cancelled"], [{ blockedAt: new Date(instant) }, "cancelled"],
    [{ phone: null }, "unavailable"], [{ phone: "551155550123" }, "unsupported"]]) {
    const f = fixture(); await f.enqueue(); Object.assign(f.state.accounts[0], fields);
    assert.equal((await f.worker().run())[status], 1); assert.equal(f.calls.length, 0); assert.equal(f.state.rows[0].status, status);
    if (fields.erasedAt) assert.equal(f.state.audits.length, 0);
  }
});

test("batch bounds reject invalid input and leave further queued work for the next run", async () => {
  const f = fixture(); for (let i = 0; i < 3; i++) await f.enqueue();
  for (const limit of [0, 101, 1.5, NaN]) await assert.rejects(f.worker().run(limit), RangeError);
  assert.equal((await f.worker().run(2)).sent, 2); assert.deepEqual(await f.worker().status(), { sent: 2, queued: 1 });
  assert.equal((await f.worker().run(1)).sent, 1);
});

test("a custom event snapshots its template and resolves only its available payment sources at dispatch", async () => {
  const templates = structuredClone(defaultMessageTemplates), configured = templates.events["payment-approved"];
  configured.sms = "Approved {{payment_reference}}: {{amount}} for {{plan_name}}. {{account_url}}";
  const f = fixture(templates), row = await f.enqueue();
  f.state.payments.push({ id: row.targetId, accountId: row.accountId, reference: "ABCD", planName: "Weekly", claimedAmountUgx: 5000, amountReceivedUgx: 6000 });
  configured.sms = "Changed after the decision";
  assert.equal((await f.worker().run()).sent, 1);
  assert.match(f.calls[0].message, /^Approved PABCD: UGX 6,000 for Weekly\./u);
  assert.match(f.calls[0].message, /https:\/\/goalhint.com\/en\/account/u);
  assert.equal(JSON.stringify(row).includes("6000"), false);
  assert.equal(JSON.stringify(row).includes("256700000111"), false);
});

test("selected SMS and WhatsApp channels have independent durable claims and require actual WhatsApp opt-in", async () => {
  const templates = structuredClone(defaultMessageTemplates), configured = templates.events["payment-approved"];
  configured.channels = ["sms", "whatsapp"];
  configured.whatsapp = { templateName: "goal_hint_approved", parameters: ["{{account_url}}"] };
  const f = fixture(templates); await f.enqueue();
  const whatsapp = [], delivery = { async sendSms(message) { f.calls.push(message); }, async sendWhatsApp(message) { whatsapp.push(message); } };
  const result = await f.worker({ delivery }).run();
  assert.equal(result.sent, 1); assert.equal(result.skipped, 1); assert.equal(whatsapp.length, 0);
  assert.equal(f.state.rows.find(row => row.channel === "whatsapp").status, "skipped");
  f.state.accounts[0].whatsappNotificationsAt = new Date(instant);
  await f.enqueue();
  await Promise.all([f.worker({ delivery }).run(), f.worker({ delivery }).run()]);
  assert.equal(f.calls.length, 2); assert.equal(whatsapp.length, 1);
  assert.equal(whatsapp[0].consent, true); assert.deepEqual(whatsapp[0].parameters, ["https://goalhint.com/en/account"]);
});

test("an opted-out account is rechecked immediately before a queued WhatsApp dispatch", async () => {
  const templates = structuredClone(defaultMessageTemplates), configured = templates.events["payment-rejected"];
  configured.channels = ["whatsapp"]; configured.whatsapp = { templateName: "goal_hint_rejected", parameters: [] };
  const f = fixture(templates); f.state.accounts[0].whatsappNotificationsAt = new Date(instant);
  await f.enqueue({ decision: "rejected" }); f.state.accounts[0].whatsappNotificationsAt = null;
  let sends = 0;
  assert.equal((await f.worker({ delivery: { async sendSms() { assert.fail(); }, async sendWhatsApp() { sends++; } } }).run()).skipped, 1);
  assert.equal(sends, 0); assert.equal(f.state.rows[0].attemptId, null);
});

test("queued account messages never dispatch to an unverified replacement phone", async () => {
  const templates = structuredClone(defaultMessageTemplates);
  templates.events["payment-approved"].sms = "Your account balance is {{balance}}. See {{account_url}}";
  const f = fixture(templates); await f.enqueue();
  Object.assign(f.state.accounts[0], { phone: "256700000222", phoneVerifiedAt: null });
  assert.equal((await f.worker().run()).unavailable, 1); assert.equal(f.calls.length, 0);
  assert.equal(f.state.rows[0].attemptId, null); assert.equal(f.state.rows[0].status, "unavailable");
});

test("disabled event templates produce no durable intent and truthfully report skipped", async () => {
  const templates = structuredClone(defaultMessageTemplates); templates.events["payment-approved"].enabled = false;
  const f = fixture(templates), targetId = randomUUID(); await f.enqueue({ targetId });
  assert.equal(f.state.rows.length, 0);
  assert.equal(await createQueuedPaymentNotifications(f.database).approved({ paymentId: targetId }), "skipped");
  assert.equal((await f.worker().run()).sent, 0);
});

test("welcome and report-received events are runnable only when enabled and never store rendered values", async () => {
  const templates = structuredClone(defaultMessageTemplates); templates.events.welcome.enabled = true; templates.events["payment-received"].enabled = true;
  const f = fixture(templates), account = f.state.accounts[0];
  await f.enqueue({ targetId: account.id, targetType: "member", decision: "welcome" });
  await f.enqueue({ targetId: account.id, targetType: "member", decision: "welcome" });
  assert.equal(f.state.rows.length, 1);
  const report = await f.enqueue({ decision: "received" });
  f.state.payments.push({ id: report.targetId, accountId: report.accountId, reference: "ABCD", planName: "Weekly", claimedAmountUgx: 5000, amountReceivedUgx: null });
  assert.equal((await f.worker().run()).sent, 2);
  assert.ok(f.calls.some(call => /^Welcome/u.test(call.message))); assert.ok(f.calls.some(call => /Payment report PABCD is waiting for review/u.test(call.message)));
  assert.equal(JSON.stringify(f.state.rows).includes(account.phone), false);
});
