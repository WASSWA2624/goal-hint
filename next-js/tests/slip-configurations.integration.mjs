import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createSlipConfigurations } from "../src/server/slips/slip-configurations.ts";
import { memberTokenHash } from "../src/server/members/member-sessions.ts";
import { defaultSlipCriteria, serializeSlipCriteria } from "../src/domain/slip-builder.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { createSubscribers } from "../src/server/admin/subscribers.ts";

test("isolated MySQL enforces configuration concurrency, nullable-default uniqueness, persistence and account cascade", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const at = new Date("2026-10-31T09:00:00Z"), accountId = randomUUID(), tokenHash = memberTokenHash("a".repeat(43)), phone = "256700000001";
  await f.database.query(tx => tx.memberAccount.create({ data: { id: accountId, phone, passwordHash: "test-hash", phoneVerifiedAt: at, createdAt: at, lastSignInAt: at } }));
  await f.database.query(tx => tx.memberSession.create({ data: { accountId, tokenHash, createdAt: at, lastSeenAt: at, authenticatedAt: at, expiresAt: new Date(+at + 86_400_000) } }));
  const member = { accountId, tokenHash, phone, blocked: false }, restart = () => createSlipConfigurations({ database: f.database, now: () => +at });
  const parameters = serializeSlipCriteria(defaultSlipCriteria("2026-10-31")).toString();
  const outcomes = await Promise.all(Array.from({ length: 14 }, (_, i) => restart().mutate(member, { action: "create", name: `Filters ${i}`, parameters, isDefault: true })));
  assert.equal(outcomes.filter(row => row.status === "saved").length, 10);
  assert.equal(outcomes.filter(row => row.status === "limit").length, 4);
  const records = (await restart().read(member)).configurations;
  assert.equal(records.length, 10); assert.equal(records.filter(row => row.isDefault).length, 1);
  const current = records.find(row => row.isDefault);
  const edits = await Promise.all(["Device one", "Device two"].map(name => restart().mutate(member, { action: "rename", id: current.id, revision: current.revision, name })));
  assert.deepEqual(edits.map(row => row.status).sort(), ["conflict", "saved"]);
  await assert.rejects(f.root.query("UPDATE SlipConfiguration SET isDefault = TRUE WHERE accountId = ?", [accountId]));
  await assert.rejects(f.root.query("UPDATE SlipConfiguration SET isDefault = FALSE WHERE id = ?", [current.id]));
  await f.database.query(tx => tx.memberAccount.delete({ where: { id: accountId } }));
  assert.equal(await f.database.query(tx => tx.slipConfiguration.count({ where: { accountId } })), 0);
  await f.database.query(tx => tx.memberAccount.create({ data: { id: accountId, phone, passwordHash: "test-hash", phoneVerifiedAt: at, createdAt: at, lastSignInAt: at } }));
  await f.database.query(tx => tx.memberSession.create({ data: { accountId, tokenHash, createdAt: at, lastSeenAt: at, authenticatedAt: at, expiresAt: new Date(+at + 86_400_000) } }));
  assert.equal((await restart().mutate(member, { action: "create", name: "Erase me", parameters, isDefault: true })).status, "saved");
  assert.equal((await createSubscribers(f.database, () => +at, f.config).action(accountId, "erase", undefined, "owner")).status, "saved");
  assert.equal(await f.database.query(tx => tx.slipConfiguration.count({ where: { accountId } })), 0);
});
