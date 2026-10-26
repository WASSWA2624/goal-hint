import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPaymentOutboxWorker, createQueuedPaymentNotifications, paymentOutboxRules } from "../src/server/members/payment-notification-outbox.ts";

const instant = Date.parse("2026-10-25T10:00:00Z");

function fixture() {
  let state = { rows: [], accounts: [{ id: randomUUID(), phone: "256700000111", blockedAt: null, erasedAt: null }], audits: [] };
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
    async $queryRaw() { return []; },
    memberAccount: { async findUnique({ where }) { return state.accounts.find(row => matches(row, where)) ?? null; } },
    ownerAuditEvent: { async create({ data }) { state.audits.push(data); return data; } },
    paymentNotificationOutbox: {
      async create({ data }) {
        if (state.rows.some(row => row.targetType === data.targetType && row.targetId === data.targetId && row.decision === data.decision)) throw new Error("Duplicate intent");
        const row = { startedAt: null, finishedAt: null, attemptId: null, ...data }; state.rows.push(row); return row;
      },
      async findUnique({ where }) { return state.rows.find(row => matches(row, where)) ?? null; },
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
