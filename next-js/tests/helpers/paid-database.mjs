import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import mariadb from "mariadb";
import { parseRuntimePolicy } from "../../src/server/config/runtime-policy.ts";
import { createDatabase } from "../../src/server/database/client.ts";
import { costTestEnvironment } from "./cost-fixtures.mjs";
import { startIsolatedMysql } from "./mysql-instance.mjs";

/** Paid-access/auth tables on an owned throwaway engine. No developer settings or data are touched. */
export async function paidDatabase({ seedPlans = false, beforeCheckout, databaseName } = {}) {
  const instance = await startIsolatedMysql({ databaseName });
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
    await root.query(await readFile(new URL("../../prisma/migrations/20261021120000_manual_password_recovery/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261023090000_member_message_verification/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261023130000_single_member_login/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261024200000_payment_screenshot_amount/migration.sql", import.meta.url), "utf8"));
    // Applied whole: its trigger bodies contain semicolons.
    await root.query(await readFile(new URL("../../prisma/migrations/20261024210000_account_credit/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261025230000_payment_notification_outbox/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261029120000_remove_admin_password_requests/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261029140000_desktop_settings_contacts_messages/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261031040514_saved_slip_configurations/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261031120000_referral_rewards/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261031104143_account_notifications/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261031135652_referral_review/migration.sql", import.meta.url), "utf8"));
    await beforeCheckout?.(root);
    await root.query(await readFile(new URL("../../prisma/migrations/20261101120000_payment_checkout/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261103160000_readable_slip_and_referral_codes/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261103170000_community_payment_alerts/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261104140000_manual_providers_and_opt_in_trials/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261105110000_public_community_channels/migration.sql", import.meta.url), "utf8"));
    await root.query(await readFile(new URL("../../prisma/migrations/20261105120000_contact_page_settings/migration.sql", import.meta.url), "utf8"));
    const password = randomBytes(24).toString("hex");
    await root.query(`CREATE USER 'paid_application'@'127.0.0.1' IDENTIFIED BY '${password}'`);
    const deletable = new Set(["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode", "OwnerAuditEvent", "RateLimitBucket", "PaymentNotificationOutbox", "SlipConfiguration", "MemberNotification"]);
    // The credit ledger is append-only: SELECT and INSERT only; permanent deletion removes its rows by cascade.
    const appendOnly = new Set(["WalletEntry", "AccountMove", "ReferralReviewEvent", "ReferralCredit", "PaymentEvent"]);
    for (const table of ["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode", "SubscriptionSettings", "RateLimitBucket", "OwnerAuditEvent", "WalletEntry", "AccountMove", "PaymentNotificationOutbox", "SlipConfiguration", "MemberReferral", "MemberNotification", "ReferralReviewCase", "ReferralReviewEvidence", "ReferralReviewEvent", "ReferralGrantReversal"])
      await root.query(`GRANT SELECT, INSERT${appendOnly.has(table) ? "" : ", UPDATE"}${deletable.has(table) ? ", DELETE" : ""} ON ${instance.databaseName}.${table} TO 'paid_application'@'127.0.0.1'`);
    for (const table of ["PaymentReceipt", "PaymentReceiptClaim", "PaymentReceiptEvidence", "ReferralCredit", "PaymentEvent"])
      await root.query(`GRANT SELECT, INSERT${appendOnly.has(table) ? "" : ", UPDATE"} ON ${instance.databaseName}.${table} TO 'paid_application'@'127.0.0.1'`);
    await root.query(`GRANT SELECT, INSERT ON ${instance.databaseName}.SlipNumber TO 'paid_application'@'127.0.0.1'`);
    for (const table of ["PaymentReviewEvent", "PaymentAlertEndpoint", "PaymentAlertDelivery"])
      await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${instance.databaseName}.${table} TO 'paid_application'@'127.0.0.1'`);
    const url = `mysql://paid_application:${password}@127.0.0.1:${instance.port}/${instance.databaseName}`;
    database = createDatabase(parseRuntimePolicy(costTestEnvironment(url, instance.url)));
    const secret = randomBytes(32);
    const config = { key: (purpose, value) => createHash("sha256").update(secret).update(purpose).update(value).digest("hex") };
    return { instance, root, database, config, async close() { await database.disconnect(); await root.end(); await instance.stop(); } };
  } catch (error) { await database?.disconnect(); await root?.end(); await instance.stop(); throw error; }
}
