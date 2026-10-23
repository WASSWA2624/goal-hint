import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import mariadb from "mariadb";
import { normalizePhone } from "../src/domain/phone.ts";
import { ownerSignInAudit } from "../src/server/admin/audit.ts";
import { createAdminAuth } from "../src/server/analytics/analytics-auth.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createPlansService } from "../src/server/members/plans.ts";
import { accessMode, createSettingsService } from "../src/server/members/settings.ts";
import { memberSessionRules, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createAuthenticatedTestSessions as createMemberSessions } from "./helpers/member-fixtures.mjs";
import { createMemberRateLimit } from "../src/server/members/rate-limit.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { remainingDays, subscriptionDayMs as day } from "../src/domain/subscription-period.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { execFile } from "./helpers/command-runtime.mjs";
import { costTestEnvironment } from "./helpers/cost-fixtures.mjs";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

const execFileAsync = promisify(execFile);
const workspace = fileURLToPath(new URL("../", import.meta.url));
const databaseScript = fileURLToPath(new URL("../scripts/database.py", import.meta.url));
const migrationName = "20261019142209_subscriptions";
const migrationFile = new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url);
const overlayFile = new URL(`../prisma/mariadb/${migrationName}.sql`, import.meta.url);
const tables = ["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode",
  "SubscriptionSettings", "RateLimitBucket", "OwnerAuditEvent"];
// docs/local-database.md: SELECT, INSERT and UPDATE on all nine; DELETE only where a purge or sign-out removes rows.
const deletable = new Set(["MemberAccount", "MemberSession", "MemberVerification", "PaymentScreenshot", "RateLimitBucket"]);
const DENIED = 1142, DUPLICATE = 1062, NO_PARENT = 1452, HAS_CHILDREN = 1451, CHECK = 3819;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function refused(promise, errno, label) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.errno, errno, `${label}: ${error.message}`);
    return true;
  });
}

/**
 * The MariaDB overlay as MySQL can run it: each `BEGIN NOT ATOMIC` block becomes a procedure that is called once, so the
 * guard and the verification run unchanged; the server parses the compound bodies, so no client DELIMITER is needed.
 */
function overlayForMysql(overlay) {
  const blocks = overlay.match(/^DELIMITER \/\/$/gmu)?.length ?? 0;
  const converted = overlay.replace(/^DELIMITER \/\/\nBEGIN NOT ATOMIC\n([\s\S]*?)^END \/\/\nDELIMITER ;$/gmu,
    (_, body) => `DROP PROCEDURE IF EXISTS overlay_block;\nCREATE PROCEDURE overlay_block() BEGIN\n${body}END;\nCALL overlay_block();\nDROP PROCEDURE overlay_block;`);
  assert.equal(blocks, 2, "the overlay has a guard and a verification block");
  assert.doesNotMatch(converted, /DELIMITER|NOT ATOMIC/u);
  return converted;
}

test("paid-access storage keeps its keys, checks and least-privilege grants, and the MariaDB overlay matches it, on isolated genuine MySQL", { timeout: 600_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Database-backed paid-access storage acceptance remains pending.`);
    return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. Numbers, codes and payments are synthetic.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString("hex"), applicationPassword = randomBytes(24).toString("hex");
  const migrationUrl = `mysql://members_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const applicationUrl = `mysql://members_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const env = costTestEnvironment(applicationUrl, migrationUrl);
  let app, root, database;
  try {
    await instance.executeAdmin(`
      CREATE USER 'members_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'members_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'members_migration'@'127.0.0.1';
    `);
    // After every migration, status is clean and verify finds no drift from prisma/schema.prisma.
    for (const command of ["deploy", "status", "verify"]) {
      await execFileAsync(process.execPath, ["--conditions=react-server", databaseScript, command],
        { cwd: workspace, env, windowsHide: true, timeout: 240_000, maxBuffer: 1024 * 1024 });
    }
    await instance.executeAdmin(tables.map((table) => `GRANT SELECT, INSERT, UPDATE${deletable.has(table) ? ", DELETE" : ""} ON goal_hint_test.${table} TO 'members_application'@'127.0.0.1';`).join("\n"));
    app = mariadb.createPool({ host: "127.0.0.1", port: instance.port, user: "members_application", password: applicationPassword,
      database: "goal_hint_test", timezone: "Z", connectionLimit: 8, allowPublicKeyRetrieval: true });
    root = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", timezone: "Z", multipleStatements: true });

    const insert = (table, row) => app.query(`INSERT INTO ${table} (${Object.keys(row).map((key) => `\`${key}\``).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`,
      Object.values(row));
    let sequence = 0;
    const reference = () => (sequence++).toString(32).toUpperCase().padStart(4, "0");
    const now = new Date("2026-10-19T09:00:00.000Z"), week = new Date(now.getTime() + 7 * 86_400_000);
    async function account(phone = null) {
      const id = randomUUID();
      await insert("MemberAccount", { id, phone, createdAt: now, lastSignInAt: now });
      return id;
    }
    async function plan({ id = randomUUID(), ...fields } = {}) {
      await insert("SubscriptionPlan", { id, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 1, createdAt: now, updatedAt: now, ...fields });
      return id;
    }
    async function submission(accountId, planId, fields = {}) {
      const id = randomUUID();
      await insert("PaymentSubmission", { id, reference: reference(), source: "report", accountId, planId, planName: "Weekly", durationDays: 7,
        priceUgx: 5000, payerPhone: "256700000001", claimedNetwork: "mtn", claimedTxnRef: "TX.100-1", claimedTxnKey: "TX1001",
        claimedAmountUgx: 5000, status: "pending", submittedAt: now, ...fields });
      return id;
    }
    async function code(accountId, fields = {}) {
      const id = randomUUID();
      await insert("AccessCode", { id, accountId, codeSalt: randomBytes(16), codeHash: sha256(randomUUID()), reference: reference(), source: "manual",
        planName: "Weekly", durationDays: 7, priceUgx: 0, createdAt: now, createdBy: "owner", activatedAt: now, startsAt: now, endsAt: week, ...fields });
      return id;
    }
    const approve = (id, network, key) => app.query(`UPDATE PaymentSubmission SET status = 'approved', network = ?, transactionRef = 'TX.100-1',
      amountReceivedUgx = 5000, approvedTxnKey = ?, decidedAt = ?, decidedBy = 'owner' WHERE id = ?`, [network, key, now, id]);
    // Its all-digit middle groups sit between dashes, as about 1 random plan id in 120 do: the reorder audit below must not read
    // them as an access code.
    const weekly = await plan({ id: "bc53c263-f1d6-4547-9618-7968d7ebf028" });

    await t.test("phones are stored only as canonical digits, are unique, and an erased account frees its number", async () => {
      const first = await account("256700000001");
      await refused(account("256700000001"), DUPLICATE, "one account per number");
      for (const phone of ["0700000001", "+256700000002", "256 700 000 003", "256600000004", "25670000000", "0201234567"]) {
        await refused(account(phone), CHECK, phone);
      }
      await account("447700900001");
      // Whatever the domain normalizer accepts, storage accepts.
      for (const input of ["0700 000 005", "+256 700-000-006", "2560700000007", "256+447700900002"]) await account(normalizePhone(input));
      const second = await account("256700000008");
      await app.query("UPDATE MemberAccount SET phone = NULL, erasedAt = ? WHERE id IN (?, ?)", [now, first, second]);
      await account("256700000001");
    });

    await t.test("an approved transaction key is unique per network, set only at approval and kept after reversal", async () => {
      const payer = await account("256700000101"), stranger = await account("256700000102");
      const genuine = await submission(payer, weekly), copied = await submission(stranger, weekly);
      await refused(approve(copied, "mtn", null), CHECK, "approval without its key");
      await refused(approve(copied, "mtn", "airtel:TX1001"), CHECK, "a key naming another network");
      await refused(app.query("UPDATE PaymentSubmission SET approvedTxnKey = 'mtn:TX1001' WHERE id = ?", [copied]), CHECK, "a pending payment holding a key");
      await approve(genuine, "mtn", "mtn:TX1001");
      await refused(approve(copied, "mtn", "mtn:TX1001"), DUPLICATE, "the same payment approved twice");
      await app.query("UPDATE PaymentSubmission SET status = 'reversed', reversedAt = ?, reverseReason = 'wrong-account' WHERE id = ?", [now, genuine]);
      const [reversed] = await app.query("SELECT approvedTxnKey FROM PaymentSubmission WHERE id = ?", [genuine]);
      assert.equal(reversed.approvedTxnKey, "mtn:TX1001");
      await refused(approve(copied, "mtn", "mtn:TX1001"), DUPLICATE, "a reversed payment's key is never approved again");
      // Pending duplicates are accepted, and many submissions have no key.
      await submission(stranger, weekly);
      assert.equal((await app.query("SELECT COUNT(*) AS n FROM PaymentSubmission WHERE approvedTxnKey IS NULL AND claimedTxnKey = 'TX1001'"))[0].n, 2n);
      await refused(app.query("UPDATE PaymentSubmission SET approvedTxnKey = NULL WHERE id = ?", [genuine]), CHECK, "a reversed payment keeps its key");
      // Owner-recorded payments share the key and carry no image, session or terms.
      await submission(payer, weekly, { source: "owner", status: "approved", payerPhone: null, network: "mtn", amountReceivedUgx: 5000, approvedTxnKey: "mtn:TX2002",
        claimedTxnRef: "TX2002", claimedTxnKey: "TX2002", decidedAt: now, decidedBy: "owner" });
      await refused(submission(payer, weekly, { source: "owner", status: "pending" }), CHECK, "an owner payment is recorded approved");
      await refused(submission(payer, weekly, { source: "owner", status: "approved", network: "mtn", approvedTxnKey: "mtn:TX3003", imageSha256: sha256("image") }),
        CHECK, "an owner payment has no image");
      for (const [field, value] of [["source", "api"], ["status", "approving"], ["claimedNetwork", "mpesa"], ["rejectReason", "spam"],
        ["reverseReason", "refund"], ["durationDays", 0], ["payerPhone", "0700000001"]]) {
        await refused(submission(payer, weekly, { [field]: value }), CHECK, `${field} = ${value}`);
      }
      const image = Buffer.from("synthetic jpeg bytes");
      await insert("PaymentScreenshot", { submissionId: copied, width: 1080, height: 2400, bytes: image.length, data: image });
      await refused(insert("PaymentScreenshot", { submissionId: genuine, width: 1080, height: 2400, bytes: 1, data: image }), CHECK, "byte count");
      await refused(insert("PaymentScreenshot", { submissionId: genuine, width: 5000, height: 2400, bytes: image.length, data: image }), CHECK, "width");
      await app.query("DELETE FROM PaymentScreenshot WHERE submissionId = ?", [copied]);
    });

    await t.test("codes bind to one account and one approved payment, and keep their own period", async () => {
      const owner = await account("256700000201"), other = await account("256700000202");
      const paid = await submission(owner, weekly, { claimedTxnKey: "TX4004" });
      await approve(paid, "airtel", "airtel:TX4004");
      const first = await code(owner, { source: "payment", paymentSubmissionId: paid, planId: weekly, priceUgx: 5000 });
      await refused(code(owner, { source: "payment", paymentSubmissionId: paid }), DUPLICATE, "one code per approved payment");
      await refused(code(owner, { source: "payment" }), CHECK, "a payment code without its payment");
      await refused(code(owner, { paymentSubmissionId: paid }), CHECK, "a manual code carrying a payment");
      await refused(code(owner, { endsAt: now }), CHECK, "an empty period");
      await refused(code(owner, { source: "gift" }), CHECK, "an unknown source");
      await refused(code(owner, { durationDays: 367 }), CHECK, "more than 366 days");
      await refused(code(randomUUID()), NO_PARENT, "a code for no account");
      // Reissue stays on the account; a number change points the old code at a successor on the new account.
      const reissued = await code(owner, { source: "reissue" });
      await app.query("UPDATE AccessCode SET revokedAt = ?, revokedReason = 'reissue', replacedById = ? WHERE id = ?", [now, reissued, first]);
      const moved = await code(other, { source: "number-change", durationDays: 5 });
      await app.query("UPDATE AccessCode SET revokedAt = ?, revokedReason = 'number-change', replacedById = ? WHERE id = ?", [now, moved, reissued]);
      await refused(app.query("UPDATE AccessCode SET replacedById = ? WHERE id = ?", [randomUUID(), moved]), NO_PARENT, "a successor that does not exist");
      await code(other, { source: "trial", durationDays: 2 });
    });

    await t.test("a session unlocks only with a code of its own account and goes with the account", async () => {
      const member = await account("256700000301"), other = await account("256700000302"), neverPaid = await account("256700000303");
      const own = await code(member), foreign = await code(other);
      const session = (accountId, fields = {}) => insert("MemberSession", { tokenHash: sha256(randomUUID()), accountId, createdAt: now, lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 90 * 86_400_000), ...fields });
      await session(member);
      await session(member, { codeEnteredAt: now, accessCodeId: own });
      await refused(session(member, { codeEnteredAt: now, accessCodeId: foreign }), NO_PARENT, "another account's code");
      await refused(session(member, { codeEnteredAt: now }), CHECK, "an unlock without its code");
      await refused(session(member, { accessCodeId: own }), CHECK, "a code without its unlock time");
      await session(neverPaid);
      await session(neverPaid);
      await app.query("DELETE FROM MemberAccount WHERE id = ?", [neverPaid]);
      assert.equal((await app.query("SELECT COUNT(*) AS n FROM MemberSession WHERE accountId = ?", [neverPaid]))[0].n, 0n);
      await refused(app.query("DELETE FROM MemberAccount WHERE id = ?", [member]), HAS_CHILDREN, "an account with codes is kept");
      await refused(app.query("UPDATE MemberSession SET accountId = ? WHERE accountId = ? AND accessCodeId IS NOT NULL", [other, member]), NO_PARENT,
        "a session cannot move to another account with its unlock");
    });

    await t.test("the application role never deletes payments, codes, plans, settings or audit rows", async () => {
      for (const table of tables.filter((name) => !deletable.has(name))) {
        await refused(app.query(`DELETE FROM ${table} WHERE 1 = 0`), DENIED, table);
      }
      await refused(app.query("DROP TABLE RateLimitBucket"), DENIED, "no DDL");
      await refused(plan({ priceUgx: 50 }), CHECK, "a price below UGX 100");
      await refused(plan({ durationDays: 0 }), CHECK, "a plan without days");
      await refused(plan({ name: "" }), CHECK, "a plan without a name");
      await app.query("UPDATE SubscriptionPlan SET active = FALSE WHERE id = ?", [weekly]);
    });

    await t.test("throttle buckets count every concurrent hit through one atomic upsert", async () => {
      const key = sha256("synthetic-purpose:203.0.113.9");
      await Promise.all(Array.from({ length: 24 }, () => app.query(`INSERT INTO RateLimitBucket (\`key\`, count, bytes, windowStartedAt) VALUES (?, 1, 1000, ?)
        ON DUPLICATE KEY UPDATE count = count + 1, bytes = bytes + 1000`, [key, now])));
      const [bucket] = await app.query("SELECT count, bytes FROM RateLimitBucket WHERE `key` = ?", [key]);
      assert.deepEqual({ ...bucket }, { count: 24, bytes: 24_000 });
      await app.query("DELETE FROM RateLimitBucket WHERE `key` = ?", [key]);
    });

    await t.test("settings default to off with a 2-day trial and keep the owner's ranges", async () => {
      await app.query("INSERT INTO SubscriptionSettings (id, updatedAt, updatedBy) VALUES (1, ?, 'owner')", [now]);
      const [settings] = await app.query("SELECT * FROM SubscriptionSettings");
      assert.deepEqual({ ...settings }, { id: 1, paywallMode: "off", mtnNumber: null, mtnName: null, mtnMenuShortcut: null, airtelNumber: null,
        airtelName: null, airtelMenuShortcut: null, copyFormat: "international", contactPhone: null, whatsappPhone: null, paymentNote: null,
        reviewTime: null, maxUnlockedDevices: 2, trialDays: 2, screenshotRetentionDays: 90, paymentNumbersChangedAt: null,
        lastMembersPurgeAt: null, updatedAt: now, updatedBy: "owner" });
      await refused(app.query("INSERT INTO SubscriptionSettings (id, updatedAt, updatedBy) VALUES (2, ?, 'owner')", [now]), CHECK, "a second row");
      for (const assignment of ["paywallMode = 'maybe'", "copyFormat = 'national'", "maxUnlockedDevices = 0", "maxUnlockedDevices = 6",
        "trialDays = 8", "screenshotRetentionDays = 6", "screenshotRetentionDays = 366", "mtnNumber = '0700000001'",
        "whatsappPhone = '+256700000001'", "contactPhone = '256600000001'", "mtnMenuShortcut = '*165#'"]) {
        await refused(app.query(`UPDATE SubscriptionSettings SET ${assignment} WHERE id = 1`), CHECK, assignment);
      }
      await app.query("UPDATE SubscriptionSettings SET paywallMode = 'test', mtnNumber = '256700000001', mtnName = 'TEST PAYEE', mtnMenuShortcut = '*165*{amount}#', trialDays = 0 WHERE id = 1");
      for (const shortcut of ["*165*1;", "*165*{price}#", "#".repeat(61)]) {
        await refused(app.query("UPDATE SubscriptionSettings SET mtnMenuShortcut = ? WHERE id = 1", [shortcut]), shortcut.length > 60 ? 1406 : CHECK, shortcut);
      }
      await refused(app.query("UPDATE SubscriptionSettings SET mtnNumber = NULL WHERE id = 1"), CHECK, "a shortcut outliving its number");
    });

    await t.test("the generated client reads and writes every paid-access model", async () => {
      database = createDatabase(parseRuntimePolicy(env));
      const id = randomUUID(), salt = randomBytes(16), image = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
      const event = await database.transaction(async (tx) => {
        await tx.memberAccount.create({ data: { id, phone: "256700000401", createdAt: now, lastSignInAt: now } });
        const submissionId = randomUUID();
        await tx.paymentSubmission.create({ data: { id: submissionId, reference: reference(), source: "report", accountId: id, planId: weekly,
          planName: "Weekly", durationDays: 7, priceUgx: 5000, payerPhone: "256700000401", claimedNetwork: "mtn", claimedTxnRef: "TX5005",
          claimedTxnKey: "TX5005", claimedAmountUgx: 5000, status: "pending", submittedAt: now, imageSha256: sha256(image), imageBytes: image.length } });
        await tx.paymentScreenshot.create({ data: { submissionId, width: 200, height: 200, bytes: image.length, data: image } });
        const codeId = randomUUID();
        await tx.accessCode.create({ data: { id: codeId, accountId: id, codeSalt: salt, codeHash: sha256("code"), reference: reference(), source: "trial",
          planName: "Free trial", durationDays: 2, priceUgx: 0, createdAt: now, createdBy: "owner", activatedAt: now, startsAt: now,
          endsAt: new Date(now.getTime() + 2 * 86_400_000) } });
        await tx.memberSession.create({ data: { tokenHash: sha256("token"), accountId: id, createdAt: now, lastSeenAt: now, expiresAt: week, codeEnteredAt: now, accessCodeId: codeId } });
        return tx.ownerAuditEvent.create({ data: { at: now, actor: "owner", action: "trial_sent", accountId: id, targetType: "access-code", targetId: codeId,
          details: { reference: "C-0000", days: 2 } } });
      });
      assert.equal(typeof event.id, "bigint");
      const stored = await database.query((client) => client.memberAccount.findUniqueOrThrow({ where: { phone: "256700000401" },
        include: { codes: { include: { sessions: true } }, submissions: { include: { screenshot: true } } } }));
      assert.deepEqual(Buffer.from(stored.codes[0].codeSalt), salt);
      assert.deepEqual(Buffer.from(stored.submissions[0].screenshot.data), Buffer.from(image));
      assert.equal(stored.codes[0].sessions[0].accessCodeId, stored.codes[0].id);
      assert.equal(stored.codes[0].extensionDays, 0);
      assert.deepEqual((await database.query((client) => client.ownerAuditEvent.findUniqueOrThrow({ where: { id: event.id } }))).details, { reference: "C-0000", days: 2 });
    });

    await t.test("settings and plans services keep canonical numbers, the owner password on eight fields, mode requirements and an audit of every change", async () => {
      // Re-entry runs the owner login's check and throttle, so the application role also needs the analytics login tables.
      await instance.executeAdmin(["AnalyticsLoginThrottle", "AnalyticsAdminSession"].map((table) =>
        `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.${table} TO 'members_application'@'127.0.0.1';`).join("\n"));
      // Start as a fresh install does: no settings row, no audit rows, and no active plan (the earlier subtests deactivated theirs).
      await root.query("DELETE FROM goal_hint_test.SubscriptionSettings");
      await root.query("DELETE FROM goal_hint_test.OwnerAuditEvent");
      assert.equal((await app.query("SELECT COUNT(*) AS n FROM SubscriptionPlan WHERE active"))[0].n, 0n);
      const clock = { now: Date.parse("2026-10-19T10:00:00.000Z") };
      const now = () => clock.now;
      const right = "a long synthetic owner passphrase";
      const hmacKey = (purpose, value) => sha256(`synthetic-secret\0${purpose}\0${value}`);
      const auth = createAdminAuth({ database, now, config: { admin: { username: "owner", passwordHash: await hashPassword(right) }, key: hmacKey } });
      const settings = createSettingsService(database, { environment: null, now });
      const plans = createPlansService(database, { now });
      const reentry = (password, address = "198.51.100.40") => ({ password, confirm: (typed) => auth.confirmPassword("owner", typed, address) });
      // Read through Prisma, which writes and reads instants in UTC like the services.
      const stored = () => database.query((client) => client.subscriptionSettings.findUnique({ where: { id: 1 } }));
      const audits = (action) => database.query((client) => client.ownerAuditEvent.findMany({ where: { action }, orderBy: { id: "asc" } }));
      const keys = (outcome) => outcome.missing.map(({ key }) => key);
      // Synthetic owner numbers, distinct from every member number above.
      const MTN = "256700000901", CONTACT = "256700000902", MOVED = "256700000904";

      const fresh = await settings.current();
      assert.deepEqual([fresh.source, fresh.settings.paywallMode, fresh.settings.trialDays, accessMode(fresh)], ["defaults", "off", 2, "off"],
        "A missing row reads off with the 2-day trial.");
      const refusedTest = await settings.setMode("owner", "test");
      assert.deepEqual([refusedTest.status, keys(refusedTest)], ["requirements", ["plan", "payment-number", "contact"]]);
      assert.equal(await stored(), null, "A refused switch writes nothing, not even the defaults row.");

      clock.now += 60_000;
      const plain = await settings.save("owner", { trialDays: 0, copyFormat: "local", paymentNote: "Pay, then send the screenshot." }, reentry(null));
      assert.deepEqual([plain.status, plain.changed], ["saved", ["copyFormat", "paymentNote", "trialDays"]], "Unprotected fields need no password.");
      assert.deepEqual({ ...(await stored()) }, { ...(await stored()), trialDays: 0, copyFormat: "local", paywallMode: "off", updatedBy: "owner",
        updatedAt: new Date(clock.now), paymentNumbersChangedAt: null });

      const protectedChange = { mtnNumber: "0700 000 901", mtnName: "TEST PAYEE", mtnMenuShortcut: "*165*3*{amount}#", contactPhone: "+256 700 000 902" };
      const unconfirmed = await settings.save("owner", protectedChange, reentry(null));
      assert.deepEqual([unconfirmed.status, unconfirmed.fields], ["password-required", ["mtnNumber", "mtnName", "mtnMenuShortcut", "contactPhone"]]);
      assert.equal((await app.query("SELECT COUNT(*) AS n FROM AnalyticsLoginThrottle"))[0].n, 0n, "No password, no counted attempt.");
      const wrong = await settings.save("owner", protectedChange, reentry("not the passphrase"));
      assert.deepEqual([wrong.status, wrong.check.status], ["password-refused", "invalid"]);
      assert.equal((await stored()).mtnNumber, null, "A wrong password changes nothing.");
      assert.equal((await audits("settings_password_refused")).length, 1);

      clock.now += 60_000;
      const confirmed = await settings.save("owner", protectedChange, reentry(right));
      assert.equal(confirmed.status, "saved");
      const afterNumbers = await stored();
      assert.deepEqual([afterNumbers.mtnNumber, afterNumbers.contactPhone, afterNumbers.mtnName, afterNumbers.mtnMenuShortcut], [MTN, CONTACT, "TEST PAYEE",
        "*165*3*{amount}#"], "Numbers are stored as canonical digits.");
      assert.deepEqual(afterNumbers.paymentNumbersChangedAt, new Date(clock.now));
      assert.equal((await app.query("SELECT COUNT(*) AS n FROM AnalyticsAdminSession"))[0].n, 0n, "Re-entry creates no owner session.");
      const [numbersAudit] = (await audits("settings_changed")).slice(-1);
      assert.deepEqual([numbersAudit.actor, numbersAudit.targetType, numbersAudit.targetId], ["owner", "settings", "1"]);
      assert.deepEqual(numbersAudit.details, { changes: { mtnNumber: { from: null, to: MTN }, mtnName: { from: null, to: "TEST PAYEE" },
        mtnMenuShortcut: { from: null, to: "*165*3*{amount}#" }, contactPhone: { from: null, to: CONTACT } }, cleared: [], passwordConfirmed: true },
      "Audited with the old and new values.");

      clock.now += 60_000;
      const contactOnly = await settings.save("owner", { whatsappPhone: "0700000902" }, reentry(right));
      assert.equal(contactOnly.status, "saved");
      assert.deepEqual((await stored()).paymentNumbersChangedAt, new Date(clock.now - 60_000), "Only payment numbers move paymentNumbersChangedAt.");
      clock.now += 60_000;
      const moved = await settings.save("owner", { mtnNumber: MOVED }, reentry(right));
      assert.deepEqual([moved.status, moved.changed, moved.cleared], ["saved", ["mtnNumber", "mtnMenuShortcut"], ["mtnMenuShortcut"]]);
      assert.deepEqual([(await stored()).mtnMenuShortcut, (await stored()).paymentNumbersChangedAt], [null, new Date(clock.now)],
        "A payment-number change clears its menu shortcut.");
      assert.deepEqual((await audits("settings_changed")).at(-1).details.changes, { mtnNumber: { from: MTN, to: MOVED },
        mtnMenuShortcut: { from: "*165*3*{amount}#", to: null } });

      // The re-entry throttle is the login's: five wrong passwords from one address lock it for re-entry and sign-in alike.
      const attempts = [];
      for (let attempt = 0; attempt < 6; attempt++) attempts.push((await settings.save("owner", { mtnName: "OTHER PAYEE" }, reentry("guess", "198.51.100.41"))).check);
      assert.deepEqual(attempts.map(({ status, newlyLocked }) => `${status}${newlyLocked ? "+new" : ""}`), ["invalid", "invalid", "invalid", "invalid", "locked+new", "locked"]);
      assert.equal((await settings.save("owner", { mtnName: "OTHER PAYEE" }, reentry(right, "198.51.100.41"))).check.status, "locked");
      assert.equal((await auth.login("owner", right, "198.51.100.41")).status, "locked", "One throttle for re-entry and sign-in.");
      assert.equal((await settings.save("owner", { mtnName: "OTHER PAYEE" }, reentry(right, "198.51.100.42"))).status, "saved", "Another address still works.");
      assert.equal((await audits("settings_password_refused")).length, 6, "Counted refusals are audited; refusals during a lock are not.");

      // Plans: the owner enters them; nothing is seeded. Never deleted.
      const created = [];
      for (const plan of [{ name: "Daily", durationDays: 1, priceUgx: 1000 }, { name: "Weekly", durationDays: 7, priceUgx: 5000 }, { name: "Monthly", durationDays: 30, priceUgx: 20000 }]) {
        clock.now += 1_000;
        const outcome = await plans.create("owner", plan);
        assert.equal(outcome.status, "saved");
        created.push(outcome.plans.at(-1));
      }
      assert.deepEqual(created.map(({ name, durationDays, priceUgx, active }) => [name, durationDays, priceUgx, active]),
        [["Daily", 1, 1000, true], ["Weekly", 7, 5000, true], ["Monthly", 30, 20000, true]]);
      const [daily, weeklyPlan, monthly] = created.map(({ id }) => id);
      assert.equal((await plans.create("owner", { name: "Free", durationDays: 1, priceUgx: 0 })).status, "invalid");
      assert.deepEqual((await plans.create("owner", { name: "Promo 2025-2026-XMAS", durationDays: 1, priceUgx: 1000 })).errors,
        { name: "Remove what reads as an access code: the owner audit never stores one." }, "Text the audit refuses is invalid, not unavailable storage.");
      const edited = await plans.edit("owner", weeklyPlan, { priceUgx: 5500 });
      assert.equal(edited.plans.find(({ id }) => id === weeklyPlan).priceUgx, 5500);
      assert.deepEqual((await audits("plan_updated")).at(-1).details, { changes: { priceUgx: { from: 5000, to: 5500 } } });
      assert.equal((await plans.edit("owner", randomUUID(), { priceUgx: 5500 })).status, "not-found");
      const everyPlan = (await plans.list()).map(({ id }) => id);
      const order = [monthly, ...everyPlan.filter((id) => id !== monthly)];
      const reordered = await plans.reorder("owner", order);
      assert.deepEqual(reordered.plans.map(({ id }) => id), order);
      assert.ok(everyPlan.includes(weekly));
      assert.deepEqual((await audits("plans_reordered")).at(-1).details, { from: everyPlan, to: order }, "Plan ids are audited as they are.");
      assert.equal((await plans.reorder("owner", [monthly, daily])).status, "invalid", "A reorder names every plan.");

      // Requirements now hold, so test mode switches; another process sees it within the 30 s cache.
      const otherProcess = createSettingsService(database, { environment: null, now });
      assert.equal((await otherProcess.current()).settings.paywallMode, "off");
      clock.now += 1_000;
      assert.equal((await settings.setMode("owner", "test")).status, "saved");
      assert.equal((await settings.current()).settings.paywallMode, "test", "This process sees its own change at once.");
      assert.equal((await otherProcess.current()).settings.paywallMode, "off", "Others keep their value until it is 30 s old.");
      clock.now += 30_000;
      assert.equal((await otherProcess.current()).settings.paywallMode, "test");
      assert.deepEqual((await audits("paywall_mode_changed")).map(({ details }) => details), [{ from: "off", to: "test" }]);
      const notReady = await settings.setMode("owner", "on");
      assert.deepEqual([notReady.status, keys(notReady)], ["requirements", ["privacy", "terms"]], "On waits for release-ready privacy and terms.");
      const releaseReady = createSettingsService(database, { environment: null, now, readiness: () => ({ privacy: true, terms: true }) });
      assert.equal((await releaseReady.setMode("owner", "on")).status, "saved");

      // While on, the requirements keep holding: the last active plan and the last contact number cannot go.
      assert.equal((await plans.setActive("owner", daily, false)).status, "saved");
      assert.equal((await plans.setActive("owner", weeklyPlan, false)).status, "saved");
      const lastPlan = await plans.setActive("owner", monthly, false);
      assert.deepEqual([lastPlan.status, keys(lastPlan)], ["requirements", ["plan"]]);
      const lastContact = await releaseReady.save("owner", { contactPhone: null, whatsappPhone: "" }, reentry(right, "198.51.100.42"));
      assert.deepEqual([lastContact.status, keys(lastContact)], ["requirements", ["contact"]]);
      assert.equal((await stored()).contactPhone, CONTACT);
      const unrelated = await settings.save("owner", { reviewTime: "Within an hour" }, reentry(null));
      assert.equal(unrelated.status, "saved", "A requirement that was already unmet (here the notices) never blocks an unrelated save.");
      assert.equal((await releaseReady.setMode("owner", "off")).status, "saved");
      assert.equal((await plans.setActive("owner", monthly, false)).status, "saved", "With paid access off, every plan may be inactive.");
      assert.deepEqual((await audits("plan_deactivated")).length, 3);

      // Two saves of different fields at once both land: each applies its change to the locked row.
      await Promise.all([settings.save("owner", { paymentNote: "Note from one tab" }, reentry(null)), settings.save("owner", { reviewTime: "Within 30 minutes" }, reentry(null))]);
      assert.deepEqual([(await stored()).paymentNote, (await stored()).reviewTime], ["Note from one tab", "Within 30 minutes"]);

      // Plans are never deleted: the role cannot, and every plan ever created is still there.
      await refused(app.query("DELETE FROM SubscriptionPlan WHERE id = ?", [daily]), DENIED, "plan delete");
      assert.equal((await plans.list()).length, everyPlan.length);

      // Environment identity is authoritative even while editing non-identity settings or switching modes.
      const blankIdentity = { mtnNumber: null, mtnName: null, mtnMenuShortcut: null, airtelNumber: null, airtelName: null,
        airtelMenuShortcut: null, contactPhone: null, whatsappPhone: null };
      const identity = { ...blankIdentity, mtnNumber: "256700000910", mtnName: "ENV MTN", airtelNumber: "256700000911",
        airtelName: "ENV AIRTEL", contactPhone: "256700000912", whatsappPhone: "256700000913" };
      const configured = createSettingsService(database, { environment: identity, now });
      const storedBefore = await stored();
      const managed = await configured.save("owner", { mtnNumber: MTN }, reentry(right));
      assert.equal(managed.status, "invalid");
      assert.match(managed.errors.mtnNumber, /environment variables/u);
      const overview = await configured.overview();
      assert.deepEqual([...overview.environmentFields].sort(), Object.keys(identity).sort());
      for (const [key, value] of Object.entries(identity)) assert.equal(overview.settings[key], value, key);
      const updated = await configured.save("owner", { trialDays: 1 }, reentry(null));
      assert.equal(updated.status, "saved");
      for (const [key, value] of Object.entries(identity)) assert.equal(updated.settings[key], value, key);
      assert.equal((await plans.setActive("owner", daily, true)).status, "saved");
      const noIdentity = createSettingsService(database, { environment: blankIdentity, now });
      assert.deepEqual(keys(await noIdentity.setMode("owner", "test")), ["payment-number", "contact"], "Stored wallet history is never an environment fallback.");
      assert.equal((await configured.setMode("owner", "test")).status, "saved");
      assert.equal((await configured.current()).settings.airtelNumber, identity.airtelNumber);
      const storedAfter = await stored();
      for (const key of Object.keys(identity)) assert.equal(storedAfter[key], storedBefore[key], `stored identity preserved: ${key}`);
      assert.equal((await configured.setMode("owner", "off")).status, "saved");
      assert.equal((await plans.setActive("owner", daily, false)).status, "saved");

      await ownerSignInAudit(async () => ({ database }), "admin", { now })({ action: "sign-in", username: "owner" });
      assert.equal((await audits("owner_signed_in")).length, 1);
      // No audit row holds a subscriber's number, a payer's number or an access code.
      const memberNumbers = (await app.query("SELECT phone FROM MemberAccount WHERE phone IS NOT NULL UNION SELECT payerPhone FROM PaymentSubmission WHERE payerPhone IS NOT NULL"))
        .map(({ phone }) => phone);
      assert.ok(memberNumbers.length > 10);
      const trail = JSON.stringify((await database.query((client) => client.ownerAuditEvent.findMany())).map(({ details }) => details));
      for (const phone of memberNumbers) assert.equal(trail.includes(phone), false, phone);
    });

    await t.test("concurrent authenticated-session issuance and first throttle upserts serialize; session expiry slides at most daily", async () => {
      const config = { key: (purpose, value) => sha256(`${purpose}:${value}`) };
      let instant = Date.parse("2026-10-19T09:00:00Z");
      const sessions = createMemberSessions({ database, config, now: () => instant });
      const results = await Promise.all([sessions.signIn("256700000701", "test-address"), sessions.signIn("256700000701", "test-address")]);
      assert.ok(results.every((result) => result.status === "signed-in"));
      assert.notEqual(results[0].token, results[1].token);
      const first = await sessions.verify(results[0].token);
      const other = await sessions.verify(results[1].token);
      assert.equal(first.accountId, other.accountId);
      assert.equal(await database.query((tx) => tx.memberAccount.count({ where: { phone: "256700000701" } })), 1, "Concurrent authenticated issuance keeps one account per phone");
      assert.equal(first.codeEnteredAt, null);
      assert.equal(first.tokenHash, memberTokenHash(results[0].token));
      const row = () => database.query((tx) => tx.memberSession.findUniqueOrThrow({ where: { tokenHash: first.tokenHash } }));
      assert.equal((await row()).expiresAt.getTime(), instant + memberSessionRules.expiryMs);
      instant += memberSessionRules.touchAfterMs - 1;
      await sessions.verify(results[0].token);
      assert.equal((await row()).lastSeenAt.getTime(), instant - memberSessionRules.touchAfterMs + 1);
      instant++;
      await sessions.verify(results[0].token);
      assert.equal((await row()).lastSeenAt.getTime(), instant);
      instant += memberSessionRules.expiryMs;
      assert.equal(await sessions.verify(results[0].token), null);
      const limit = createMemberRateLimit(database, config, () => instant);
      const rule = { purpose: "concurrency-test", value: "test-address", maximum: 1, windowMs: 3_600_000 };
      assert.deepEqual((await Promise.all([limit(rule), limit(rule)])).sort(), [false, true]);
      instant += rule.windowMs;
      assert.equal(await limit(rule), true);
      const before = await database.query((tx) => tx.rateLimitBucket.count());
      assert.equal(await limit({ ...rule, value: "unknown" }), true);
      assert.equal(await database.query((tx) => tx.rateLimitBucket.count()), before);
    });

    await t.test("a sign-in flood preserves unlocked devices and evicts pending and superseded payment sessions last", async () => {
      const config = { key: (purpose, value) => sha256(`${purpose}:${value}`) };
      let instant = now.getTime();
      const sessions = createMemberSessions({ database, config, now: () => ++instant });
      const phone = "256700000702", tokens = [];
      for (let index = 0; index < 10; index++) tokens.push((await sessions.signIn(phone, "unknown")).token);
      const member = await sessions.verify(tokens[0]);
      for (const [index, status] of [[0, "pending"], [1, "superseded"]]) await submission(member.accountId, weekly,
        { status, submittedSessionHash: memberTokenHash(tokens[index]) });
      const codeId = await code(member.accountId, { endsAt: new Date(now.getTime() - 1), startsAt: new Date(now.getTime() - 86_400_000) });
      await app.query("UPDATE MemberSession SET codeEnteredAt = ?, accessCodeId = ? WHERE tokenHash = ?", [now, codeId, memberTokenHash(tokens[2])]);
      await sessions.signIn(phone, "unknown");
      assert.ok(await sessions.verify(tokens[0]));
      assert.ok(await sessions.verify(tokens[1]));
      assert.ok(await sessions.verify(tokens[2]));
      assert.equal(await sessions.verify(tokens[3]), null);
      assert.equal(await database.query((tx) => tx.memberSession.count({ where: { accountId: member.accountId } })), 10);
      assert.equal(await sessions.signOutOthers(member), false);
      assert.equal(await sessions.signOutOthers(await sessions.verify(tokens[2])), true, "an ended period can still sign out other devices");
      assert.equal(await sessions.verify(tokens[0]), null);
      const replacement = await sessions.signIn(phone, "unknown", tokens[2]);
      assert.equal(await sessions.verify(tokens[2]), null, "sign-in replaces the previous browser token");
      assert.equal((await sessions.verify(replacement.token)).codeEnteredAt, null);
      await app.query("UPDATE MemberAccount SET blockedAt = ? WHERE id = ?", [now, member.accountId]);
      const blockedSignIn = await sessions.signIn(phone, "unknown");
      assert.equal(blockedSignIn.status, "signed-in");
      assert.equal((await sessions.verify(blockedSignIn.token)).blocked, true);
      await sessions.signOut(blockedSignIn.token);
      assert.equal(await sessions.verify(blockedSignIn.token), null);
    });

    await t.test("confirmation chains concurrent codes, unlock rotates and caps devices, renewals retain entitlement, and wrong-code throttles never block a correct code", async () => {
      let instant = now.getTime();
      const config = { production: false, cookies: { session: "owner" }, key: (purpose, value) => sha256(`${purpose}:${value}`) };
      const sessions = createMemberSessions({ database, config, now: () => instant });
      const codes = createAccessCodes({ database, config, now: () => instant });
      const phone = "256700000711", initial = await sessions.signIn(phone, "unknown"), member = await sessions.verify(initial.token);
      assert.equal(await codes.accountView(member), null);
      const first = await codes.manual({ phone, durationDays: 1, amountReceivedUgx: 0, note: "Synthetic daily" }, "owner");
      assert.equal(first.status, "created");
      const stored = () => database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: first.ready.id } }));
      assert.deepEqual([(await stored()).startsAt, (await stored()).endsAt], [now, new Date(+now + day)]);
      instant += day / 2;
      const wrongLimit = createMemberRateLimit(database, config, () => instant);
      for (let n = 0; n < 101; n++) await wrongLimit({ purpose: "wrong-codes", value: "locked-ip", maximum: 100, windowMs: 3_600_000 });
      assert.equal((await codes.redeem(member, "ZZZZ-ZZZZ-ZZZZ", "locked-ip", 2, "2026-10-19")).status, "busy");
      const unlocked = await codes.redeem(member, first.ready.code, "locked-ip", 2, "2026-10-19");
      assert.equal(unlocked.status, "accepted");
      assert.notEqual(unlocked.token, initial.token);
      assert.equal(await sessions.verify(initial.token), null);
      assert.deepEqual([(await stored()).startsAt, (await stored()).endsAt], [now, new Date(+now + day)]);
      assert.equal((await stored()).termsVersion, "2026-10-19");
      const memberUnlocked = await sessions.verify(unlocked.token);
      const renewals = await Promise.all([1, 7].map((durationDays) => codes.manual({ phone, durationDays, amountReceivedUgx: 0, note: "Synthetic renewal" }, "owner")));
      assert.ok(renewals.every((result) => result.status === "created"));
      const periods = await database.query((tx) => tx.accessCode.findMany({ where: { accountId: member.accountId }, orderBy: { startsAt: "asc" } }));
      assert.equal(+periods[1].startsAt, +periods[0].endsAt);
      assert.equal(+periods[2].startsAt, +periods[1].endsAt);
      let mode = "on";
      const resolve = createViewerAccess({ services: async () => ({ config, database, auth: null }), now: () => instant,
        settings: async () => ({ settings: { ...defaultSubscriptionSettings, paywallMode: mode } }) });
      const access = (token) => resolve((name) => name === "goal-hint-member" ? token : undefined);
      assert.deepEqual(await access(unlocked.token), { tier: "full", signedIn: true, mode: "on" });
      instant = +now + day;
      assert.equal((await access(unlocked.token)).tier, "full", "the entered code expired but the renewal keeps the device entitled");
      assert.equal((await codes.accountView(memberUnlocked)).devices.length, 1);
      const numberOnly = await sessions.signIn(phone, "unknown");
      assert.equal((await access(numberOnly.token)).tier, "free");
      mode = "test";
      assert.equal((await access(numberOnly.token)).tier, "free");
      assert.equal((await access(undefined)).tier, "free", "test mode keeps anonymous predictions gated");
      mode = "off";
      assert.equal((await access(undefined)).tier, "free", "closed subscriptions never bypass prediction gates");
      assert.equal((await access(unlocked.token)).tier, "full", "existing unlocked periods remain valid until expiry");
      mode = "test";
      for (let n = 0; n < 2; n++) {
        instant++;
        const signedIn = await sessions.signIn(phone, "unknown");
        assert.equal((await codes.redeem(await sessions.verify(signedIn.token), renewals[1].ready.code, "unknown", 2, "2026-10-19")).status, "accepted");
      }
      assert.equal((await sessions.verify(unlocked.token)).codeEnteredAt, null, "the oldest device loses its unlock");
      assert.equal((await access(unlocked.token)).tier, "free");
      const evictions = await database.query((tx) => tx.ownerAuditEvent.count({ where: { accountId: member.accountId, action: "device_evicted" } }));
      assert.equal(evictions, 1);
      const before = await database.query((tx) => tx.memberAccount.count());
      const sessionsBefore = await database.query((tx) => tx.memberSession.count());
      assert.equal((await codes.signInWithCode("256700000799", first.ready.code, "unknown", 2, "2026-10-19")).status, "not-recognized");
      assert.equal(await database.query((tx) => tx.memberAccount.count()), before);
      assert.equal(await database.query((tx) => tx.memberSession.count()), sessionsBefore);
      const other = await sessions.signIn("256700000712", "unknown");
      assert.equal((await codes.redeem(await sessions.verify(other.token), renewals[0].ready.code, "unknown", 2, "2026-10-19")).status, "not-recognized");
      assert.equal((await codes.signInWithCode("256700000712", renewals[0].ready.code, "unknown", 2, "2026-10-19")).status, "not-recognized");
      const direct = await codes.signInWithCode(phone, renewals[0].ready.code, "unknown", 2, "2026-10-19");
      assert.equal(direct.status, "accepted");
      assert.equal(await sessions.verify(direct.token), null, "Legacy subscription-code issuance cannot authenticate a password account");
      assert.equal((await access(direct.token)).tier, "free");
      const authenticated = await sessions.signIn(phone, "unknown");
      const redeemed = await codes.redeem(await sessions.verify(authenticated.token), renewals[0].ready.code, "unknown", 2, "2026-10-19");
      assert.equal((await access(redeemed.token)).tier, "full");
      await app.query("UPDATE MemberAccount SET blockedAt = ? WHERE id = ?", [new Date(instant), member.accountId]);
      assert.equal((await access(redeemed.token)).tier, "free");
      assert.equal((await codes.redeem(await sessions.verify(redeemed.token), renewals[0].ready.code, "unknown", 2, "2026-10-19")).status, "refused");
      await app.query("UPDATE MemberAccount SET blockedAt = NULL WHERE id = ?", [member.accountId]);
      instant = +periods.at(-1).endsAt;
      mode = "on";
      assert.equal((await access(unlocked.token)).tier, "free");
      assert.equal((await codes.redeem(memberUnlocked, first.ready.code, "unknown", 2, "2026-10-19")).status, "ended");
    });

    await t.test("extend and revoke move queued periods, and reissue copies the period and transfers unlocks without a payment FK", async () => {
      const config = { key: (purpose, value) => sha256(`${purpose}:${value}`) };
      const instant = +now, phone = "256700000721";
      const codes = createAccessCodes({ database, config, now: () => instant });
      const sessions = createMemberSessions({ database, config, now: () => instant });
      const first = await codes.manual({ phone, durationDays: 1, amountReceivedUgx: 0, note: "Synthetic" }, "owner");
      const second = await codes.manual({ phone, durationDays: 7, amountReceivedUgx: 0, note: "Synthetic" }, "owner");
      const read = (id) => database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id } }));
      assert.equal((await codes.extend(first.ready.id, 2, "owner")).status, "saved");
      assert.equal(+(await read(second.ready.id)).startsAt, instant + 3 * day);
      const signed = await sessions.signIn(phone, "unknown");
      const unlocked = await codes.redeem(await sessions.verify(signed.token), first.ready.code, "unknown", 2, "2026-10-19");
      const replacement = await codes.reissue(first.ready.id, "owner");
      assert.equal(replacement.status, "created");
      assert.equal((await read(first.ready.id)).replacedById, replacement.ready.id);
      const code = await read(replacement.ready.id);
      assert.equal(code.paymentSubmissionId, null);
      assert.equal(code.extensionDays, 2);
      assert.equal(+code.startsAt, instant);
      assert.equal(+code.endsAt, instant + 3 * day);
      assert.equal((await sessions.verify(unlocked.token)).accessCodeId, code.id);
      assert.equal((await codes.revoke(code.id, "owner-request", "owner")).status, "saved");
      assert.equal((await sessions.verify(unlocked.token)).codeEnteredAt, null);
      assert.equal(+(await read(second.ready.id)).startsAt, instant);
      assert.equal((await codes.extend(code.id, 1, "owner")).status, "refused");
    });

    await t.test("payment approvals race across spelling and network, and reversal follows reissue and number-change replacements", async () => {
      const config = { key: (purpose, value) => sha256(`${purpose}:${value}`) };
      let instant = +now;
      const codes = createAccessCodes({ database, config, now: () => instant });
      const firstPhone = "256700000731", otherPhone = "256700000732";
      const otherAccount = await account(otherPhone), report = await submission(otherAccount, weekly);
      const outcomes = await Promise.all([
        codes.manual({ phone: firstPhone, planId: weekly, amountReceivedUgx: 5000, note: "Synthetic payment", network: "mtn", transactionRef: "RACE.100" }, "owner"),
        codes.approvePayment(report, { network: "airtel", transactionRef: "RACE100", amountReceivedUgx: 5000, planId: weekly }, "owner"),
      ]);
      assert.deepEqual(outcomes.map((row) => row.status).sort(), ["created", "duplicate"]);
      const original = await codes.manual({ phone: "256700000733", planId: weekly, amountReceivedUgx: 5000, note: "Synthetic payment", network: "mtn", transactionRef: "REVERSE.100" }, "owner");
      const paid = await database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: original.ready.id } }));
      const reissued = await codes.reissue(paid.id, "owner");
      instant += (3 * 24 + 19) * 3_600_000;
      await codes.manual({ phone: "256700000733", planId: weekly, amountReceivedUgx: 0, note: "Synthetic queue" }, "owner");
      const transfer = await codes.changeNumber(paid.accountId, { newPhone: "256700000734", verifiedBy: "old-number" }, "owner");
      assert.equal(transfer.status, "created");
      const live = await database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: transfer.ready.id } }));
      assert.equal(live.durationDays, 11, "3 days 5 hours plus 7 days rounds to 11 days");
      assert.equal(remainingDays([live], new Date(instant)), 11);
      assert.notEqual(live.accountId, paid.accountId);
      assert.equal((await database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: reissued.ready.id } }))).replacedById, live.id);
      const reversed = await codes.reversePayment(paid.paymentSubmissionId, "wrong-account", "owner");
      assert.equal(reversed.status, "saved");
      assert.equal(reversed.carriedOtherDays, true);
      const payment = await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { id: paid.paymentSubmissionId } }));
      assert.equal(payment.status, "reversed");
      assert.equal(payment.approvedTxnKey, "mtn:REVERSE100");
      assert.equal((await database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: live.id } }))).revokedReason, "wrong-account");
      assert.equal((await codes.manual({ phone: "256700000735", planId: weekly, amountReceivedUgx: 5000, note: "Synthetic duplicate", network: "airtel", transactionRef: "REVERSE100" }, "owner")).status, "duplicate");
    });

    await t.test("a trial is issued only for a requested account with no prior code and is exactly trialDays from confirmation", async () => {
      const config = { key: (purpose, value) => sha256(`${purpose}:${value}`) };
      const codes = createAccessCodes({ database, config, now: () => +now });
      const requested = await account("256700000741");
      assert.equal((await codes.sendTrial(requested, 2, "owner")).status, "refused");
      await app.query("UPDATE MemberAccount SET trialRequestedAt = ? WHERE id = ?", [now, requested]);
      const outcome = await codes.sendTrial(requested, 2, "owner");
      assert.equal(outcome.status, "created");
      const trial = await database.query((tx) => tx.accessCode.findUniqueOrThrow({ where: { id: outcome.ready.id } }));
      assert.equal(+trial.endsAt - +trial.startsAt, 2 * day);
      assert.equal(trial.amountReceivedUgx, 0);
      assert.equal(trial.source, "trial");
      assert.equal((await codes.sendTrial(requested, 2, "owner")).status, "refused");
      assert.equal((await codes.dismissTrial(requested, "owner")).status, "refused");
      const dismissed = await account("256700000742");
      await app.query("UPDATE MemberAccount SET trialRequestedAt = ? WHERE id = ?", [now, dismissed]);
      assert.equal((await codes.dismissTrial(dismissed, "owner")).status, "saved");
      assert.equal((await codes.sendTrial(dismissed, 2, "owner")).status, "refused");
    });

    await t.test("the MariaDB overlay builds the same tables, records Prisma's checksum once and refuses a wrong engine or shape", async () => {
      const migration = (await readFile(migrationFile, "utf8")).replace(/\r\n/gu, "\n");
      const overlay = overlayForMysql((await readFile(overlayFile, "utf8")).replace(/\r\n/gu, "\n"));
      const [deployed] = await root.query("SELECT checksum FROM goal_hint_test._prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL", [migrationName]);
      // Prisma hashes the file as checked out; the committed text has LF line endings.
      assert.ok([sha256(migration), sha256(migration.replace(/\n/gu, "\r\n"))].includes(deployed.checksum));
      const showCreate = async (schema) => Object.fromEntries(await Promise.all(tables.map(async (table) =>
        [table, (await root.query(`SHOW CREATE TABLE \`${schema}\`.\`${table}\``))[0]["Create Table"].replace(/ AUTO_INCREMENT=\d+/u, "")])));
      await root.query("CREATE DATABASE goal_hint_overlay CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
      await root.query("CREATE TABLE goal_hint_overlay._prisma_migrations LIKE goal_hint_test._prisma_migrations");
      await root.query("USE goal_hint_overlay");
      await root.query(overlay);
      await root.query(overlay);
      // Apply subsequent changes to the compared tables before checking the overlay against the deployed schema.
      for (const migration of ["20261020193000_member_password_sms", "20261021090000_payment_screenshot_approval",
        "20261021120000_manual_password_recovery", "20261023090000_member_message_verification"])
        await root.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
      assert.deepEqual(await showCreate("goal_hint_overlay"), await showCreate("goal_hint_test"));
      const records = await root.query("SELECT checksum, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations WHERE migration_name = ?", [migrationName]);
      assert.equal(records.length, 1, "a second import records nothing");
      assert.equal(records[0].checksum, sha256(migration));
      assert.ok(records[0].finished_at instanceof Date);
      assert.equal(records[0].rolled_back_at, null);
      assert.equal(records[0].applied_steps_count, 1);

      // A MyISAM leftover stops the import before anything is created.
      await root.query("CREATE DATABASE goal_hint_guard CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
      await root.query("USE goal_hint_guard");
      await root.query("CREATE TABLE RateLimitBucket (`key` CHAR(64) PRIMARY KEY) ENGINE=MyISAM");
      await assert.rejects(root.query(overlay), (error) => error.sqlState === "45000" && /another storage engine/u.test(error.message));
      assert.deepEqual((await root.query("SHOW TABLES")).map((row) => Object.values(row)[0].toLowerCase()), ["ratelimitbucket"]);

      // An InnoDB leftover of another shape passes the guard but stops the import before the migration is recorded.
      await root.query("CREATE DATABASE goal_hint_shape CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
      await root.query("CREATE TABLE goal_hint_shape._prisma_migrations LIKE goal_hint_test._prisma_migrations");
      await root.query("USE goal_hint_shape");
      await root.query("CREATE TABLE RateLimitBucket (`key` CHAR(64) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      await assert.rejects(root.query(overlay), (error) => error.sqlState === "45000" && /do not match the reviewed migration/u.test(error.message));
      assert.equal((await root.query("SELECT COUNT(*) AS n FROM _prisma_migrations"))[0].n, 0n);
    });
  } finally {
    await root?.end().catch(() => {});
    await app?.end().catch(() => {});
    await database?.disconnect().catch(() => {});
    await instance.stop();
  }
});
