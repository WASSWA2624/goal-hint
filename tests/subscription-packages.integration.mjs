import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("initial daily, weekly and monthly offers retain administrator price edits", { timeout: 180_000 }, async (t) => {
  let fixture;
  try { fixture = await paidDatabase({ seedPlans: true }); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const rows = await fixture.database.query((tx) => tx.subscriptionPlan.findMany({ orderBy: { durationDays: "asc" } }));
  assert.deepEqual(rows.map(({ name, durationDays, priceUgx }) => [name, durationDays, priceUgx]), [
    ["Daily", 1, 1000], ["Weekly", 7, 5000], ["Monthly", 30, 20000],
  ]);
  await fixture.database.query((tx) => tx.subscriptionPlan.update({ where: { id: rows[1].id }, data: { priceUgx: 6000 } }));
  await fixture.root.query(await readFile(new URL("../prisma/migrations/20261021103000_standard_subscription_packages/migration.sql", import.meta.url), "utf8"));
  assert.equal(await fixture.database.query((tx) => tx.subscriptionPlan.count()), 3);
  assert.equal((await fixture.database.query((tx) => tx.subscriptionPlan.findUniqueOrThrow({ where: { id: rows[1].id } }))).priceUgx, 6000);
});
