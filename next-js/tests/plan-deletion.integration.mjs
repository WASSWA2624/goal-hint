import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createPlansService } from "../src/server/members/plans.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { createAuthenticatedTestSessions } from "./helpers/member-fixtures.mjs";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("plan deletion preserves references and serializes the active-plan invariant on restricted MySQL", { timeout: 180_000 }, async (t) => {
  let fixture;
  try { fixture = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const { database, config } = fixture, at = new Date("2026-11-05T09:00:00Z"), now = () => +at;
  const plans = createPlansService(database, { now });
  const create = async (name) => {
    const outcome = await plans.create("owner", { name, durationDays: 7, priceUgx: 5000 });
    assert.equal(outcome.status, "saved"); return outcome.plans.at(-1).id;
  };
  const exists = (id) => database.query(tx => tx.subscriptionPlan.count({ where: { id } }));
  const deletionAudits = () => database.query(tx => tx.ownerAuditEvent.findMany({ where: { action: "plan_deleted" } }));
  const sessions = createAuthenticatedTestSessions({ database, config, now });
  const signed = await sessions.signIn("256700000451", "unknown"), member = await sessions.verify(signed.token);

  await t.test("unused permanent deletion removes the catalog row and retains its audit", async () => {
    const id = await create("Unused offer");
    assert.deepEqual(await plans.usage(id), { status: "usage", usage: { payments: 0, accessCodes: 0, autoRenewals: 0 } });
    assert.equal((await plans.remove("owner", id, false)).status, "invalid");
    assert.equal(await exists(id), 1);
    assert.equal((await plans.remove("owner", id, true)).status, "saved");
    assert.equal(await exists(id), 0);
    assert.equal((await plans.remove("owner", id, true)).status, "not-found");
    const rows = await deletionAudits();
    assert.equal(rows.length, 1); assert.equal(rows[0].targetId, id);
    assert.deepEqual(rows[0].details, { name: "Unused offer", durationDays: 7, priceUgx: 5000, active: true });
  });

  await t.test("pending payments, revoked access and disabled renewal selections all prevent deletion", async () => {
    const id = await create("Used offer");
    await database.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { paywallMode: "on", mtnEnabled: true,
      mtnNumber: "256700000901", mtnName: "TEST PAYEE", updatedAt: at, updatedBy: "owner" } }));
    const payments = createPayments({ database, config, now });
    assert.equal((await payments.submit(member, { planId: id, payerPhone: member.phone, network: "mtn",
      transactionId: "PLANDELETE1", accepted: true }, jpeg())).status, "saved");
    assert.deepEqual((await plans.remove("owner", id, true)).usage, { payments: 1, accessCodes: 0, autoRenewals: 0 });
    await database.query(tx => tx.accessCode.create({ data: { id: randomUUID(), accountId: member.accountId,
      codeSalt: randomBytes(16), codeHash: "a".repeat(64), reference: "D001", source: "manual", planId: id,
      planName: "Used offer", durationDays: 7, priceUgx: 5000, createdAt: at, createdBy: "owner",
      activatedAt: at, startsAt: at, endsAt: new Date(+at + 7 * 86_400_000), revokedAt: at, revokedReason: "owner" } }));
    await database.query(tx => tx.memberAccount.update({ where: { id: member.accountId }, data: { autoRenew: false, autoRenewPlanId: id } }));
    const usage = { payments: 1, accessCodes: 1, autoRenewals: 1 };
    assert.deepEqual(await plans.usage(id), { status: "usage", usage });
    assert.deepEqual(await plans.remove("owner", id, true), { status: "in-use", usage });
    assert.equal(await exists(id), 1);
    assert.equal((await deletionAudits()).length, 1, "refused deletions do not write audit records");
    await assert.rejects(database.query(tx => tx.subscriptionPlan.delete({ where: { id } })), "the foreign keys protect direct deletion too");
    assert.equal(await database.query(tx => tx.memberAccount.count({ where: { id: member.accountId } })), 1);
  });

  await t.test("concurrent removal of the remaining active offers leaves access enforcement On", async () => {
    await database.query(tx => tx.subscriptionPlan.updateMany({ data: { active: false } }));
    const first = await create("First offer"), second = await create("Second offer");
    const results = await Promise.all([plans.remove("owner", first, true), plans.remove("owner", second, true)]);
    assert.deepEqual(results.map(row => row.status), ["saved", "saved"]);
    assert.equal((await database.query(tx => tx.subscriptionSettings.findUnique({ where: { id: 1 } }))).paywallMode, "on");
    assert.equal(await database.query(tx => tx.subscriptionPlan.count({ where: { active: true } })), 0);
  });
});
