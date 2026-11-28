import assert from "node:assert/strict";
import test from "node:test";
import { emptyUserDirectoryQuery, parseUserDirectoryPage, parseUserDirectoryQuery, userDirectoryFiltered, userSearchTerms } from "../src/domain/user-directory.ts";
import { readUserDirectory } from "../src/server/admin/user-directory.ts";
import { createUserBulkHandler, createUserHandlers } from "../src/server/admin/users-http.ts";
import { readUserWorkspace } from "../src/server/admin/user-workspace.ts";
import { fixtureUserDirectory, fixtureUserDirectoryCount } from "./helpers/rendering/owner-payments/app/user-directory-query.ts";

const now = Date.parse("2026-10-29T09:00:00.000Z"), hour = 3_600_000;
const query = values => ({ ...emptyUserDirectoryQuery, ...values });
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
function fixture() {
  const calls = [], accessCalls = [];
  const rows = Array.from({ length: 110 }, (_, index) => ({
    id: id(index + 1), phone: `256700000${101 + index}`, lastSignInAt: new Date(now - index * hour),
    blockedAt: index === 104 ? new Date(now - hour) : null, erasedAt: index === 106 ? new Date(now - hour) : null,
    ownerNote: index === 104 ? "Priority review" : null,
    codes: [{ id: id(1000 + index), reference: `S${index}`, planName: index === 104 ? "Monthly" : "Weekly",
      startsAt: new Date(now - hour), endsAt: new Date(now + hour), revokedAt: null }],
    submissions: [{ reference: `P${index}` }],
  }));
  const data = () => ({ accounts: rows, codes: rows.flatMap(row => row.codes.map(code => ({ ...code, accountId: row.id }))),
    payments: rows.flatMap(row => row.submissions.map(payment => ({ ...payment, accountId: row.id }))) });
  const database = { transaction: (operation, options) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return operation({
      memberAccount: { count: async ({ where }) => fixtureUserDirectoryCount(data(), where), findMany: async args => {
        calls.push(args);
        return fixtureUserDirectory(data(), args);
      } },
      accessCode: { groupBy: async args => {
        accessCalls.push(args);
        const { accountId, revokedAt, endsAt } = args.where;
        const included = new Set(accountId.in), starts = new Map();
        for (const code of data().codes) {
          if (!included.has(code.accountId) || code.revokedAt !== revokedAt || code.endsAt <= endsAt.gt) continue;
          const initial = starts.get(code.accountId);
          if (!initial || initial > code.startsAt) starts.set(code.accountId, code.startsAt);
        }
        return [...starts].map(([accountId, startsAt]) => ({ accountId, _min: { startsAt } }));
      } },
    });
  } };
  const page = (values, number = 1) => readUserDirectory(database, query(values), number, now);
  return { rows, calls, accessCalls, database, page, read: async values => (await page(values)).accounts };
}

test("directory requests validate known filters and bounded search without requiring a complete phone", () => {
  assert.deepEqual(parseUserDirectoryQuery({ search: "  Weekly  " }), query({ search: "Weekly" }));
  assert.deepEqual(parseUserDirectoryQuery({ search: "07", status: "blocked", access: "queued", plan: "Monthly", recent: "7" }),
    query({ search: "07", status: "blocked", access: "queued", plan: "Monthly", recent: "7" }));
  for (const value of [null, [], {}, { search: 7 }, { search: "x".repeat(121) }, { search: "a\0b" }, { search: "", action: "delete" },
    { search: "", status: "unknown" }, { search: "", access: "online" }, { search: "", recent: "5" }, { search: "", plan: "" }]) {
    assert.equal(parseUserDirectoryQuery(value), null, JSON.stringify(value));
  }
  assert.equal(userDirectoryFiltered(emptyUserDirectoryQuery), false);
  assert.equal(userDirectoryFiltered(query({ status: "blocked" })), true);
  assert.deepEqual(userSearchTerms("+256 700 000 205"), ["256700000205"]);
  assert.deepEqual(userSearchTerms("07000002"), ["2567000002"]);
  assert.deepEqual(userSearchTerms("Priority Monthly"), ["Priority", "Monthly"]);
  assert.equal(parseUserDirectoryPage(undefined), 1);
  assert.equal(parseUserDirectoryPage("2"), 2);
  assert.equal(parseUserDirectoryPage(3), 3);
  for (const value of [0, -1, 1.5, "", " 2", "02", ["2"], null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseUserDirectoryPage(value), null);
  }
});

test("filters and text search select matching older accounts before paging", async () => {
  const store = fixture();
  assert.equal((await store.read({})).length, 100);
  const result = await store.read({ status: "blocked", access: "active", plan: "Monthly", search: "Priority Monthly" });
  assert.deepEqual(result, [{ id: id(105), phone: "256700000205", status: "blocked", access: "active",
    lastSignInAt: store.rows[104].lastSignInAt.toISOString() }]);
  assert.equal(store.calls.length, 2, "one page-row query per request");
  assert.equal(store.calls[1].take, 100);
  assert.equal("codes" in store.calls[1].select, false, "access filters do not send account access history to the directory");
  assert.deepEqual(store.accessCalls.map(call => call.where.accountId.in.length), [100, 1], "access aggregation covers only the returned account IDs");
  assert.deepEqual(store.accessCalls[1]._min, { startsAt: true });
  assert.deepEqual((await store.read({ search: "blocked Monthly" })).map(account => account.id), [id(105)]);
});

test("stable filtered pages bound selection and clamp the last page after removals", async () => {
  const store = fixture();
  store.rows[100].lastSignInAt = store.rows[99].lastSignInAt;
  const first = await store.page({ status: "open" });
  const second = await store.page({ status: "open" }, 2);
  const final = await store.page({ status: "open" }, 999);
  assert.deepEqual([first.page, first.pages, first.total, first.accounts.length], [1, 2, 108, 100]);
  assert.deepEqual([second.accounts[0].id, store.calls[1].skip], [id(101), 100]);
  assert.equal(first.accounts.some(account => second.accounts.some(next => next.id === account.id)), false);
  assert.deepEqual([final.page, final.accounts.length], [2, 8]);
  store.rows.splice(100);
  assert.deepEqual((await store.page({ status: "open" }, 2)).accounts.map(row => row.id), store.rows.map(row => row.id));
  assert.deepEqual(await store.page({ search: "unknown record" }, 7), { accounts: [], page: 1, pages: 1, total: 0, asOf: new Date(now).toISOString() });
});

test("directory POST accepts live filters and legacy search while refusing invalid queries before storage", async () => {
  const store = fixture(), { POST } = createUserHandlers();
  const post = body => POST({ services: { database: store.database, config: { production: false } }, owner: { username: "owner" },
    request: new Request("http://localhost:3000/api/admin/users", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  for (const body of [{ search: "", status: "online" }, { search: "x".repeat(121) }, { search: "", action: "delete" }, { search: "", page: 0 }, { search: "", pageSize: 25 }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(store.calls.length, 0);
  for (const body of [query({ search: "Priority Monthly", status: "blocked" }), { search: "0700000205" }]) {
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { accounts, page, pages, total } = await response.json();
    assert.deepEqual(accounts.map(account => account.id), [id(105)]);
    assert.deepEqual([page, pages, total], [1, 1, 1]);
  }
  assert.equal(store.calls.length, 2);
});

test("general search supports local phone fragments, access references, payment references and account IDs", async () => {
  for (const search of ["0700000205", "+256 700 000 205", "C-S104", "P-P104", id(105)]) {
    const store = fixture(), result = await store.read({ search });
    assert.deepEqual(result.map(account => account.id), [id(105)], search);
  }
});

test("active access outranks queued periods and revoked/expired periods never count as current access", async () => {
  const store = fixture(), account = store.rows[0];
  account.codes.push({ ...account.codes[0], id: id(9998), startsAt: new Date(now + hour), endsAt: new Date(now + 2 * hour), planName: "Monthly" });
  assert.equal((await store.read({ search: account.phone, access: "active" }))[0].access, "active");
  assert.equal((await store.read({ search: account.phone, access: "queued" })).length, 0);
  account.codes[0].revokedAt = new Date(now);
  assert.equal((await store.read({ search: account.phone, access: "queued" }))[0].access, "queued");
  account.codes[1].endsAt = new Date(now);
  assert.equal((await store.read({ search: account.phone, access: "none", plan: "none" }))[0].access, "none");
});

test("recent sign-in filters use explicit windows and exclude future timestamps", async () => {
  const store = fixture();
  store.rows[0].lastSignInAt = new Date(now + hour);
  const result = await store.read({ recent: "1" });
  assert.equal(result.length, 24);
  assert.ok(result.every(account => Date.parse(account.lastSignInAt) <= now && Date.parse(account.lastSignInAt) >= now - 24 * hour));
  assert.equal((await store.read({ status: "erased" }))[0].status, "erased");
  assert.ok((await store.read({ status: "open" })).every(account => account.status === "open"));
});

function detailClients({ missing = false, detailFails = false, plansFail = false } = {}) {
  const empty = { findMany: async () => [] };
  return {
    memberAccount: { findUnique: async ({ where }) => {
      if (detailFails) throw new Error("Synthetic account read failure");
      return missing ? null : { id: where.id, phone: "256700000205", blockedAt: null, blockedReason: null,
        erasedAt: null, lastSignInAt: new Date(now), ownerNote: "Private note", creditUgx: 0, autoRenew: false, autoRenewPlan: null };
    } },
    subscriptionPlan: { findMany: async () => { if (plansFail) throw new Error("Synthetic plan read failure"); return []; } },
    accessCode: empty, paymentSubmission: empty, memberSession: empty, walletEntry: empty,
  };
}

test("an initial list or plan failure leaves explicit account details available", async () => {
  const detailId = id(105);
  const database = {
    transaction: async () => { throw new Error("Synthetic directory read failure"); },
    query: async operation => operation(detailClients({ plansFail: true })),
  };
  const initial = await readUserWorkspace(database, emptyUserDirectoryQuery, 2, detailId);
  assert.ok(initial.initialDirectoryError);
  assert.ok(initial.initialPlansError);
  assert.equal(initial.initialRequestedPage, 2);
  assert.equal(initial.initialDetailError, undefined);
  assert.equal(initial.initialAccountId, detailId);
  assert.equal(initial.detail.id, detailId);
  assert.equal(initial.selectedExplicitly, true);
});

test("an initial account failure leaves the directory and its retry target available", async () => {
  const database = { ...fixture().database, query: async operation => operation(detailClients({ detailFails: true })) };
  const initial = await readUserWorkspace(database, emptyUserDirectoryQuery, 1, null);
  assert.equal(initial.accounts.length, 100);
  assert.equal(initial.initialDirectoryError, undefined);
  assert.equal(initial.initialPlansError, undefined);
  assert.ok(initial.initialDetailError);
  assert.equal(initial.initialAccountId, initial.accounts[0].id);
});

test("the scoped detail read returns private no-store results and distinguishes missing records from storage failures", async () => {
  const { GET } = createUserHandlers();
  const get = (accountId, options) => GET({
    services: { database: { query: async operation => operation(detailClients(options)) } },
    request: new Request(`http://localhost/api/admin/users/${accountId}`),
  });
  const response = await get(id(105));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).detail.id, id(105));
  assert.equal((await get("invalid")).status, 400);
  assert.equal((await get(id(105), { missing: true })).status, 404);
  assert.equal((await get(id(105), { detailFails: true })).status, 503);
});

test("bulk validation accepts one full page and checks the live administrator for each target", async () => {
  let authorizationChecks = 0;
  const handler = createUserBulkHandler({ authorize: async () => { authorizationChecks++; return null; } });
  const run = (count) => handler({
    services: { database: {}, config: {} }, owner: { memberAccountId: id(105), username: "test" },
    request: new Request("http://localhost/api/admin/users/bulk", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({
        accountIds: Array.from({ length: count }, (_, index) => id(index)), count, confirmed: true, action: "sign-out-all",
      }) }),
  });
  assert.equal((await run(101)).status, 400);
  assert.equal(authorizationChecks, 0);
  const fullPage = await run(100);
  assert.equal(fullPage.status, 200);
  const result = await fullPage.json();
  assert.equal(result.results.length, 100);
  assert.equal(result.failed, 100);
  assert.equal(authorizationChecks, 100);
});
