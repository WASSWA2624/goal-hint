import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";
import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createDatabase } from "../../src/server/database/client.ts";
import { costTestEnvironment } from "./cost-fixtures.mjs";
import { startIsolatedMysql } from "./mysql-instance.mjs";

/** Paid-access/auth tables on an owned throwaway engine. No developer settings or data are touched. */
export async function paidDatabase() {
  const instance = await startIsolatedMysql();
  let root, database;
  try {
    root = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", database: instance.databaseName, timezone: "Z", multipleStatements: true });
    await root.query(await readFile(new URL("../../prisma/migrations/20261019142209_subscriptions/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261020193000_member_password_sms/migration.sql", import.meta.url), "utf8"));
    const password = randomBytes(24).toString("hex");
    await root.query(`CREATE USER 'paid_application'@'127.0.0.1' IDENTIFIED BY '${password}'`);
    const deletable = new Set(["MemberAccount", "MemberSession", "MemberVerification", "PaymentScreenshot", "RateLimitBucket"]);
    for (const table of ["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode", "SubscriptionSettings", "RateLimitBucket", "OwnerAuditEvent"])
      await root.query(`GRANT SELECT, INSERT, UPDATE${deletable.has(table) ? ", DELETE" : ""} ON ${instance.databaseName}.${table} TO 'paid_application'@'127.0.0.1'`);
    const url = `mysql://paid_application:${password}@127.0.0.1:${instance.port}/${instance.databaseName}`;
    database = createDatabase(parseRuntimePolicy(costTestEnvironment(url, instance.url)));
    const secret = randomBytes(32);
    const config = { key: (purpose, value) => createHash("sha256").update(secret).update(purpose).update(value).digest("hex") };
    return { instance, root, database, config, async close() { await database.disconnect(); await root.end(); await instance.stop(); } };
  } catch (error) { await database?.disconnect(); await root?.end(); await instance.stop(); throw error; }
}
