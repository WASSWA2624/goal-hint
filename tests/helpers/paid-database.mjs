import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";
import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createDatabase } from "../../src/server/database/client.ts";
import { costTestEnvironment } from "./cost-fixtures.mjs";
import { startIsolatedMysql } from "./mysql-instance.mjs";

/** Paid-access/auth tables on an owned throwaway engine. No developer settings or data are touched. */
export async function paidDatabase({ seedPlans = false } = {}) {
  const instance = await startIsolatedMysql();
  let root, database;
  try {
    root = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", database: instance.databaseName,
      timezone: "+00:00", sessionVariables: { time_zone: "+00:00" }, multipleStatements: true });
    // The raw connector encodes Date parameters using local calendar fields even for a UTC session.
    // Match the production Prisma adapter, which sends explicit UTC DATETIME strings.
    const query = root.query.bind(root), parameter = value => value instanceof Date ? value.toISOString().slice(0, -1).replace('T', ' ') : value;
    root.query = (sql, values) => query(sql, Array.isArray(values) ? values.map(parameter) : parameter(values));
    await root.query(await readFile(new URL("../../prisma/migrations/20261019142209_subscriptions/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261020193000_member_password_sms/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261021090000_payment_screenshot_approval/migration.sql", import.meta.url), "utf8"));
    if (seedPlans) await root.query(await readFile(new URL("../../prisma/migrations/20261021103000_standard_subscription_packages/migration.sql", import.meta.url), "utf8"));
    // Account erasure also removes saved slips. This auth fixture has no football catalog, so only its independent table
    // is installed here; saved-slip integration fixtures install SavedSlipFixture with the real FootballFixture table.
    await root.query((await readFile(new URL("../../prisma/migrations/20261021110000_saved_slips/migration.sql", import.meta.url), "utf8")).split(";")[0]);
    await root.query(await readFile(new URL("../../prisma/migrations/20261021120000_manual_password_recovery/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261023090000_member_message_verification/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261023130000_single_member_login/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261024200000_payment_screenshot_amount/migration.sql", import.meta.url), "utf8"));
    // Applied whole: its trigger bodies contain semicolons.
    await root.query(await readFile(new URL("../../prisma/migrations/20261024210000_account_credit/migration.sql", import.meta.url), "utf8"));
    const password = randomBytes(24).toString("hex");
    await root.query(`CREATE USER 'paid_application'@'127.0.0.1' IDENTIFIED BY '${password}'`);
    const deletable = new Set(["MemberAccount", "MemberSession", "MemberVerification", "PaymentSubmission", "PaymentScreenshot", "AccessCode", "OwnerAuditEvent", "RateLimitBucket", "SavedSlip"]);
    // The credit ledger is append-only: SELECT and INSERT only; permanent deletion removes its rows by cascade.
    const appendOnly = new Set(["WalletEntry", "AccountMove"]);
    for (const table of ["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode", "SubscriptionSettings", "RateLimitBucket", "OwnerAuditEvent", "SavedSlip", "WalletEntry", "AccountMove"])
      await root.query(`GRANT SELECT, INSERT${appendOnly.has(table) ? "" : ", UPDATE"}${deletable.has(table) ? ", DELETE" : ""} ON ${instance.databaseName}.${table} TO 'paid_application'@'127.0.0.1'`);
    const url = `mysql://paid_application:${password}@127.0.0.1:${instance.port}/${instance.databaseName}`;
    database = createDatabase(parseRuntimePolicy(costTestEnvironment(url, instance.url)));
    const secret = randomBytes(32);
    const config = { key: (purpose, value) => createHash("sha256").update(secret).update(purpose).update(value).digest("hex") };
    return { instance, root, database, config, async close() { await database.disconnect(); await root.end(); await instance.stop(); } };
  } catch (error) { await database?.disconnect(); await root?.end(); await instance.stop(); throw error; }
}
