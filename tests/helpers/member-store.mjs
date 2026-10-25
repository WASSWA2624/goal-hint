import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultSubscriptionSettings } from "../../src/domain/subscription-settings.ts";

/** Basic canonical outbox shape validation for the transactional fixture. */
function checkNotice(row) {
  assert.ok(["approved", "rejected", "credited", "renewed"].includes(row.decision));
  assert.equal(row.targetType, row.decision === "renewed" ? "access-code" : "payment");
  assert.ok(["queued", "dispatching", "sent", "failed", "uncertain", "unsupported", "unavailable", "cancelled"].includes(row.status));
  assert.equal(["queued", "dispatching"].includes(row.status), row.finishedAt == null);
  if (row.status === "queued") assert.deepEqual([row.startedAt, row.attemptId], [null, null]);
  if (["dispatching", "sent", "failed", "uncertain"].includes(row.status)) assert.ok(row.startedAt && row.attemptId);
  for (const key of Object.keys(row)) assert.doesNotMatch(key, /phone|message|text/iu, "the outbox stores no number or text");
}

const compare = (a, b) => a instanceof Date || b instanceof Date ? +a - +b : a < b ? -1 : a > b ? 1 : 0;
export function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (key === "AND") return value.every(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const actual = row[key];
      return Object.entries(value).every(([operator, expected]) => {
        switch (operator) {
          case "in": return expected.includes(actual);
          case "notIn": return !expected.includes(actual);
          case "not": return actual !== expected;
          case "gt": return actual != null && compare(actual, expected) > 0;
          case "gte": return actual != null && compare(actual, expected) >= 0;
          case "lt": return actual != null && compare(actual, expected) < 0;
          case "lte": return actual != null && compare(actual, expected) <= 0;
          default: return false; // Relation filters are not modelled: nothing matches them.
        }
      });
    }
    return (row[key] ?? null) === value;
  });
}
function sorted(rows, orderBy) {
  const orders = orderBy ? Array.isArray(orderBy) ? orderBy : [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const order of orders) for (const [key, direction] of Object.entries(order)) {
      const difference = compare(a[key], b[key]) * (direction === "desc" ? -1 : 1);
      if (difference) return difference;
    }
    return 0;
  });
}
function apply(row, data) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value && typeof value === "object" && !(value instanceof Date) && "increment" in value ? (row[key] ?? 0) + value.increment : value;
  }
}

/**
 * A transactional in-memory store for exercising the production payment and outbox services without MySQL or a provider.
 * Transactions serialize and roll back on error; `committed` is the state other connections would see.
 */
export function memberStore({ instant, settings = {} }) {
  const account = { id: randomUUID(), phone: "256700000111", blockedAt: null, erasedAt: null, trialRequestedAt: new Date(instant), trialDismissedAt: null,
    creditUgx: 0, autoRenew: false, autoRenewPlanId: null, autoRenewTermsVersion: null, passwordHash: null };
  const plan = { id: randomUUID(), name: "Weekly", durationDays: 7, priceUgx: 5000, active: true };
  let state = { memberAccount: [account], subscriptionPlan: [plan], paymentSubmission: [], accessCode: [], ownerAuditEvent: [], memberSession: [],
    paymentScreenshot: [], walletEntry: [], accountMove: [], paymentNotificationOutbox: [], savedSlip: [], memberVerification: [],
    subscriptionSettings: [{ ...defaultSubscriptionSettings, id: 1, updatedAt: new Date(instant), ...settings }] };
  let committed = structuredClone(state), tail = Promise.resolve(), transactions = 0, abortCommit = null, inTransaction = false;
  const raw = [];
  const tx = Object.fromEntries(Object.keys(state).map(table => {
    const find = where => state[table].find(row => matches(row, where)) ?? null;
    // Reads return copies, as Prisma does: a later write must not change a row the service already read.
    const withRelations = (row, select) => row && (select?.account ? { ...row, account: { ...state.memberAccount.find(item => item.id === row.accountId) } } : { ...row });
    const written = row => { if (table === "paymentNotificationOutbox") checkNotice(row); return row; };
    return [table, {
      async findUnique({ where, select }) { return withRelations(find(where), select); },
      async findUniqueOrThrow({ where }) { const row = find(where); assert.ok(row, `${table} row must exist`); return { ...row }; },
      async findFirst({ where, orderBy }) { return withRelations(sorted(state[table].filter(row => matches(row, where)), orderBy)[0] ?? null); },
      async findMany({ where = {}, orderBy, take, select, include } = {}) {
        const rows = sorted(state[table].filter(row => matches(row, where)), orderBy);
        return (take === undefined ? rows : rows.slice(0, take)).map(row => withRelations(row, include ?? select));
      },
      async count({ where = {} } = {}) { return state[table].filter(row => matches(row, where)).length; },
      async create({ data }) {
        const row = { ...data, ...(table === "accessCode" ? { extensionDays: data.extensionDays ?? 0, revokedAt: data.revokedAt ?? null } : {}) };
        if (table === "paymentNotificationOutbox") {
          row.startedAt ??= null; row.finishedAt ??= null; row.attemptId ??= null;
          assert.ok(!state.paymentNotificationOutbox.some(other => other.targetType === row.targetType && other.targetId === row.targetId && other.decision === row.decision), "one notice per decision");
        }
        state[table].push(written(row)); return { ...row };
      },
      async update({ where, data }) { const row = find(where); assert.ok(row); apply(row, data); return { ...written(row) }; },
      async updateMany({ where, data }) { const rows = state[table].filter(row => matches(row, where)); for (const row of rows) { apply(row, data); written(row); } return { count: rows.length }; },
      async deleteMany({ where }) { const before = state[table].length; state[table] = state[table].filter(row => !matches(row, where)); return { count: before - state[table].length }; },
      async delete({ where }) { const row = find(where); assert.ok(row); state[table] = state[table].filter(item => item !== row); return row; },
    }];
  }));
  tx.$queryRaw = async (parts, ...values) => {
    const sql = parts.join("?");
    if (sql.includes("SELECT creditUgx FROM MemberAccount")) { const row = state.memberAccount.find(item => item.id === values[0]); return row ? [{ creditUgx: row.creditUgx }] : []; }
    if (sql.includes("SELECT entryNumber FROM WalletEntry")) {
      const last = state.walletEntry.filter(row => row.accountId === values[0]).sort((a, b) => b.entryNumber - a.entryNumber)[0];
      return last ? [{ entryNumber: last.entryNumber }] : [];
    }
    return [];
  };
  tx.$executeRaw = async (parts, ...values) => {
    const sql = parts.join("?");
    raw.push({ sql, values });
    if (sql.includes("INSERT INTO MemberAccount") && !state.memberAccount.some(row => row.phone === values[1])) {
      state.memberAccount.push({ id: values[0], phone: values[1], blockedAt: null, erasedAt: null, creditUgx: 0, autoRenew: false });
    }
    if (sql.includes("DELETE FROM PaymentNotificationOutbox")) {
      const [accepted, undelivered, limit] = values;
      const doomed = state.paymentNotificationOutbox.filter(row => row.finishedAt && (["sent", "unsupported", "unavailable", "cancelled"].includes(row.status) && +row.finishedAt <= +accepted
        || ["failed", "uncertain"].includes(row.status) && +row.finishedAt <= +undelivered)).slice(0, limit);
      state.paymentNotificationOutbox = state.paymentNotificationOutbox.filter(row => !doomed.includes(row));
      return doomed.length;
    }
    return sql.includes("UPDATE SubscriptionSettings") || sql.includes("INSERT INTO SubscriptionSettings") ? 1 : 0;
  };
  const database = {
    query: run => run(tx),
    async transaction(run) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const before = structuredClone(state); transactions++; inTransaction = true;
      try {
        const outcome = await run(tx);
        if (abortCommit) { const error = abortCommit; abortCommit = null; throw error; }
        committed = structuredClone(state); return outcome;
      } catch (error) { state = before; throw error; }
      finally { inTransaction = false; release(); }
    },
  };
  function report(fields = {}) {
    const row = { id: randomUUID(), accountId: account.id, payerPhone: "256700000999", reference: "ABCD", status: "pending", purpose: "plan", planId: plan.id,
      planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx, submittedSessionHash: null, ...fields };
    state.paymentSubmission.push(row); committed = structuredClone(state); return row;
  }
  return { database, tx, account, plan, report, raw,
    get state() { return state; }, get committed() { return committed; }, get transactions() { return transactions; }, get inTransaction() { return inTransaction; },
    /** The live account row (a transaction rollback replaces state objects). */
    get member() { return state.memberAccount.find(row => row.id === account.id); },
    abortNextCommit(error) { abortCommit = error; },
    fields: (transactionRef = "SYNTHETIC-PAID") => ({ planId: plan.id, network: "mtn", transactionRef, amountReceivedUgx: 5000 }),
  };
}

/** A recording SMS adapter: `answer` is called per send and may throw a classified YoolaMessagingError. */
export function recordingDelivery({ answer = async () => {}, configured = true } = {}) {
  const sent = [];
  return { sent, delivery: { configured: () => typeof configured === "function" ? configured() : configured,
    async sendSms(message) { sent.push(message); return answer(message); } } };
}
