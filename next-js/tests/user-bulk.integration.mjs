import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { emptyUserDirectoryQuery } from "../src/domain/user-directory.ts";
import { createAdminPasswordRequestHandlers } from "../src/server/admin/password-requests-http.ts";
import { readUserDirectory } from "../src/server/admin/user-directory.ts";
import { createUserBulkHandler, createUserHandlers } from "../src/server/admin/users-http.ts";
import { memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createAuthenticatedTestSessions } from "./helpers/member-fixtures.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { paidDatabase } from "./helpers/paid-database.mjs";

test("user bulk actions and secure reset initiation use the existing account transactions", { timeout: 180_000 }, async t => {
  let fixture;
  try { fixture = await paidDatabase(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(error.message);
    return;
  }
  t.after(() => fixture.close());
  const { database, config } = fixture;
  const services = { database, config };
  const sessions = createAuthenticatedTestSessions({ database, config });
  let phoneSuffix = 4000;
  async function account() {
    const signed = await sessions.signIn(`25670000${++phoneSuffix}`, "unknown");
    return { ...await sessions.verify(signed.token), token: signed.token };
  }
  const currentAdministrator = await account();
  const owner = { memberAccountId: currentAdministrator.accountId, username: `member-admin:${currentAdministrator.accountId}` };
  const context = (path, body) => ({ services, owner, request: new Request(`http://localhost${path}`, {
    ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  }) });
  const bulkPath = "/api/admin/users/bulk";
  let authorizationChecks = 0;
  const bulk = createUserBulkHandler({ authorize: async () => { authorizationChecks++; return owner; } });
  const adminAction = createUserHandlers().POST;
  const submit = (action, accountIds, fields = {}, handler = bulk) => handler(context(bulkPath, {
    action, accountIds, count: accountIds.length, confirmed: true, ...fields,
  }));
  const rows = (ids) => database.query(tx => tx.memberAccount.findMany({ where: { id: { in: ids } } }));

  await t.test("invalid, duplicate or unconfirmed selections perform no target work", async () => {
    const first = await account();
    const ids = [first.accountId];
    for (const response of [
      await submit("erase", ids, { confirmed: false }),
      await submit("delete", ids, { count: 2 }),
      await submit("sign-out-all", [first.accountId, first.accountId]),
      await submit("password-reset", ids),
      await submit("grant", ids, { requestId: randomUUID(), note: "Extra access", days: 1, amount: 2500 }),
    ]) assert.equal(response.status, 400);
    assert.equal(authorizationChecks, 0);
    assert.ok(await sessions.verify(first.token));
  });

  await t.test("each target is authorized and an unavailable account does not hide successes", async () => {
    const first = await account(), second = await account(), missing = randomUUID();
    const ids = [first.accountId, missing, second.accountId];
    const response = await submit("block", ids, { value: "Synthetic suspicious activity" });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.results.map(({ accountId, status }) => [accountId, status]),
      [[first.accountId, "saved"], [missing, "failed"], [second.accountId, "saved"]]);
    assert.equal(result.succeeded, 2); assert.equal(result.failed, 1);
    assert.equal(authorizationChecks, 3);
    assert.equal(await sessions.verify(first.token), null);
    assert.equal(await sessions.verify(second.token), null);

    let remaining = 1;
    const revokedAdmin = createUserBulkHandler({ authorize: async () => remaining-- > 0 ? owner : null });
    const unblocked = await (await submit("unblock", [first.accountId, second.accountId], { value: "Reviewed evidence" }, revokedAdmin)).json();
    assert.deepEqual(unblocked.results.map(row => row.status), ["saved", "failed"]);
    const accounts = new Map((await rows(ids)).map(row => [row.id, row]));
    assert.equal(accounts.get(first.accountId).blockedAt, null);
    assert.ok(accounts.get(second.accountId).blockedAt);
  });

  await t.test("one complete directory page can be managed in a single confirmed request", async () => {
    const search = "Synthetic full directory page", at = new Date();
    const data = Array.from({ length: 101 }, () => ({ id: randomUUID(), phone: `25670000${++phoneSuffix}`,
      createdAt: at, lastSignInAt: at, ownerNote: search }));
    await database.query(tx => tx.memberAccount.createMany({ data }));
    const filter = { ...emptyUserDirectoryQuery, search, status: "open" };
    const firstPage = await readUserDirectory(database, filter);
    assert.deepEqual([firstPage.page, firstPage.pages, firstPage.total, firstPage.accounts.length], [1, 2, 101, 100]);

    const ids = firstPage.accounts.map(row => row.id), checksBefore = authorizationChecks;
    const response = await submit("block", ids, { value: "Synthetic full page review" });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.succeeded, 100);
    assert.equal(result.failed, 0);
    assert.equal(authorizationChecks - checksBefore, 100);
    assert.ok((await rows(ids)).every(row => row.blockedAt !== null));

    const remaining = await readUserDirectory(database, filter, 2);
    assert.deepEqual([remaining.page, remaining.pages, remaining.total, remaining.accounts.length], [1, 1, 1, 1]);
    assert.ok(!ids.includes(remaining.accounts[0].id));
  });

  await t.test("bulk grants are free, account-scoped and idempotent across a concurrent retry", async () => {
    const first = await account(), second = await account(), missing = randomUUID();
    const ids = [first.accountId, missing, second.accountId];
    const request = { requestId: randomUUID(), note: "Synthetic batch access", days: 3 };
    const grant = fields => submit("grant", ids, fields).then(response => response.json());
    const results = await Promise.all([grant(request), grant(request)]);
    for (const result of results) {
      assert.equal(result.succeeded, 2);
      assert.equal(result.failed, 1);
      assert.doesNotMatch(JSON.stringify(result), /C-[A-Z0-9]+|codeHash|Synthetic batch access/u);
    }
    assert.equal((await grant({ ...request, days: 4 })).succeeded, 0);
    const periods = await database.query(tx => tx.accessCode.findMany({ where: { accountId: { in: ids } } }));
    assert.equal(periods.length, 2);
    for (const period of periods) {
      assert.equal(period.durationDays, 3);
      assert.equal(period.amountReceivedUgx, 0);
      assert.equal(period.source, "manual");
    }
    assert.equal((await rows(ids)).length, 2);
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: { in: ids } } })), 0);
    assert.equal(await database.query(tx => tx.paymentNotificationOutbox.count({ where: { accountId: { in: ids } } })), 0);
    const grantEvents = await database.query(tx => tx.ownerAuditEvent.findMany({
      where: { targetId: request.requestId, action: "member_bulk_grant" },
    }));
    assert.equal(grantEvents.length, 2);
    for (const event of grantEvents) assert.deepEqual(event.details, {
      fingerprint: config.key("subscriber-bulk-grant", JSON.stringify([event.accountId, request.requestId, null, 3, request.note])),
    });

    const response = await adminAction(context(`/api/admin/users/${first.accountId}`, {
      action: "grant", note: "Synthetic account grant", amount: 0, days: 1,
    }));
    assert.equal(response.status, 201);
    const issued = await response.json();
    const accountPeriods = await database.query(tx => tx.accessCode.findMany({
      where: { accountId: first.accountId }, orderBy: { startsAt: "asc" },
    }));
    assert.equal(issued.endsAt, accountPeriods[1].endsAt.toISOString());
    assert.equal(+accountPeriods[1].startsAt, +accountPeriods[0].endsAt);
  });

  await t.test("bulk block, erase and delete protect both the signed-in administrator and other allowlisted accounts", async () => {
    const otherAdministrator = await account();
    const originalAllowlist = process.env.GOAL_HINT_ADMIN_PHONES;
    try {
      process.env.GOAL_HINT_ADMIN_PHONES = JSON.stringify([otherAdministrator.phone]);
      for (const [action, fields] of [["block", { value: "Synthetic moderation" }], ["erase", {}], ["delete", {}]]) {
        const ordinary = await account();
        const ids = [currentAdministrator.accountId, otherAdministrator.accountId, ordinary.accountId];
        const result = await (await submit(action, ids, fields)).json();
        assert.deepEqual(result.results.map(row => row.status), ["failed", "failed", "saved"]);
        if (action === "delete") assert.equal((await rows(ids)).length, 2);
        else {
          const accounts = new Map((await rows(ids)).map(row => [row.id, row]));
          assert.ok(accounts.get(ordinary.accountId)[action === "block" ? "blockedAt" : "erasedAt"]);
          for (const id of ids.slice(0, 2)) {
            assert.equal(accounts.get(id).blockedAt, null);
            assert.equal(accounts.get(id).erasedAt, null);
          }
        }
      }
    } finally {
      if (originalAllowlist === undefined) delete process.env.GOAL_HINT_ADMIN_PHONES;
      else process.env.GOAL_HINT_ADMIN_PHONES = originalAllowlist;
    }
  });

  await t.test("erasure waits for active hosted payments and then clears identifiers while keeping payment history", async () => {
    const target = await account(), checkoutId = randomUUID(), planId = randomUUID(), at = new Date();
    await database.transaction(async tx => {
      await tx.memberAccount.update({ where: { id: target.accountId }, data: { legacyReferralCode: "a".repeat(32) } });
      await tx.subscriptionPlan.create({ data: { id: planId, name: "Synthetic", durationDays: 3, priceUgx: 1000,
        active: true, sortOrder: 0, createdAt: at, updatedAt: at } });
      await tx.paymentSubmission.create({ data: {
        id: checkoutId, requestKey: randomUUID(), reference: "ZX88", source: "checkout", workflowVersion: 2,
        accountId: target.accountId, purpose: "plan", planId, planName: "Synthetic", priceUgx: 1000, durationDays: 3,
        method: "flw", claimedNetwork: "flw", claimedAmountUgx: 1000, status: "provider-pending", submittedAt: at,
        submittedSessionHash: memberTokenHash(target.token), checkoutLease: randomUUID(), checkoutLeaseUntil: new Date(+at + 60_000),
      } });
    });
    const erase = async () => (await (await submit("erase", [target.accountId])).json()).results[0];
    assert.match((await erase()).message, /pending provider payment/u);
    assert.ok(await sessions.verify(target.token));
    await database.query(tx => tx.paymentSubmission.update({ where: { id: checkoutId },
      data: { checkoutLeaseUntil: new Date(+at - 1) } }));
    assert.equal((await erase()).status, "saved");
    const [erased] = await rows([target.accountId]);
    assert.equal(erased.phone, null);
    assert.equal(erased.legacyReferralCode, null);
    assert.equal(await sessions.verify(target.token), null);
    const retained = await database.query(tx => tx.paymentSubmission.findUniqueOrThrow({ where: { id: checkoutId } }));
    assert.equal(retained.submittedSessionHash, null);
    assert.equal(retained.priceUgx, 1000);
  });

  await t.test("the individual reset action only opens a pending verified-ownership workflow", async () => {
    const target = await account();
    const path = `/api/admin/users/${target.accountId}`;
    const open = async () => {
      const answer = await adminAction(context(path, { action: "password-reset" }));
      assert.equal(answer.status, 200);
      return answer.json();
    };
    const [initial, duplicate] = await Promise.all([open(), open()]);
    assert.deepEqual(Object.keys(initial).sort(), ["requestId", "status"]);
    assert.deepEqual(initial, duplicate);
    const { requestId } = initial;
    const passwordRequests = createAdminPasswordRequestHandlers();
    const requestPath = "/api/admin/password-requests";
    const current = await (await passwordRequests.GET(context(`${requestPath}?id=${requestId}`))).json();
    assert.equal(current.request.status, "pending");
    assert.equal(current.request.link, null);
    assert.equal(current.request.ownershipVerifiedAt, null);
    const generate = () => passwordRequests.POST(context(requestPath, { id: requestId, action: "generate-link", generation: 0 }));
    assert.equal((await generate()).status, 409);
    assert.equal((await passwordRequests.POST(context(requestPath, {
      id: requestId, action: "verify-ownership", method: "call", confirmed: true,
    }))).status, 200);
    const linked = await generate();
    assert.equal(linked.status, 200);
    const { request } = await linked.json();
    assert.match(new URL(request.link).hash, /^#[\w-]{43}$/u);
    const audit = await database.query(tx => tx.ownerAuditEvent.findMany({
      where: { accountId: target.accountId, action: "password_request_opened" },
    }));
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0].details, {});
  });
});
