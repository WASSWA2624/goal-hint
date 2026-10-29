import assert from "node:assert/strict";
import test from "node:test";
import { emptySubscriberDirectoryQuery, parseSubscriberDirectoryQuery, subscriberDirectoryFiltered, subscriberSearchTerms } from "../src/domain/subscriber-directory.ts";
import { readSubscriberDirectory } from "../src/server/admin/subscriber-directory.ts";
import { createSubscriberHandlers } from "../src/server/admin/subscribers-http.ts";
import { fixtureSubscriberDirectory } from "./helpers/rendering/owner-payments/app/subscriber-directory-query.ts";

const now = Date.parse("2026-10-29T09:00:00.000Z"), hour = 3_600_000;
const query = values => ({ ...emptySubscriberDirectoryQuery, ...values });
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
function fixture() {
  const calls = [];
  const rows = Array.from({ length: 110 }, (_, index) => ({
    id: id(index + 1), phone: `256700000${101 + index}`, lastSignInAt: new Date(now - index * hour),
    blockedAt: index === 104 ? new Date(now - hour) : null, erasedAt: index === 106 ? new Date(now - hour) : null,
    ownerNote: index === 104 ? "Priority review" : null,
    codes: [{ id: id(1000 + index), reference: `S${index}`, planName: index === 104 ? "Monthly" : "Weekly",
      startsAt: new Date(now - hour), endsAt: new Date(now + hour), revokedAt: null }],
    submissions: [{ reference: `P${index}` }],
  }));
  const database = { query: operation => operation({ memberAccount: { findMany: async args => {
    calls.push(args);
    return fixtureSubscriberDirectory({ accounts: rows,
      codes: rows.flatMap(row => row.codes.map(code => ({ ...code, accountId: row.id }))),
      payments: rows.flatMap(row => row.submissions.map(payment => ({ ...payment, accountId: row.id }))) }, args);
  } } }) };
  return { rows, calls, database, read: values => readSubscriberDirectory(database, query(values), now) };
}

test("directory requests validate known filters and bounded search without requiring a complete phone", () => {
  assert.deepEqual(parseSubscriberDirectoryQuery({ search: "  Weekly  " }), query({ search: "Weekly" }));
  assert.deepEqual(parseSubscriberDirectoryQuery({ search: "07", status: "blocked", access: "queued", plan: "Monthly", recent: "7" }),
    query({ search: "07", status: "blocked", access: "queued", plan: "Monthly", recent: "7" }));
  for (const value of [null, [], {}, { search: 7 }, { search: "x".repeat(121) }, { search: "a\0b" }, { search: "", action: "delete" },
    { search: "", status: "unknown" }, { search: "", access: "online" }, { search: "", recent: "5" }, { search: "", plan: "" }]) {
    assert.equal(parseSubscriberDirectoryQuery(value), null, JSON.stringify(value));
  }
  assert.equal(subscriberDirectoryFiltered(emptySubscriberDirectoryQuery), false);
  assert.equal(subscriberDirectoryFiltered(query({ status: "blocked" })), true);
  assert.deepEqual(subscriberSearchTerms("+256 700 000 205"), ["256700000205"]);
  assert.deepEqual(subscriberSearchTerms("07000002"), ["2567000002"]);
  assert.deepEqual(subscriberSearchTerms("Priority Monthly"), ["Priority", "Monthly"]);
});

test("filters and text search select matching older accounts before the 100-account cap", async () => {
  const store = fixture();
  assert.equal((await store.read({})).length, 100);
  const result = await store.read({ status: "blocked", access: "active", plan: "Monthly", search: "Priority Monthly" });
  assert.deepEqual(result.map(account => account.id), [id(105)]);
  assert.equal(result[0].access, "active");
  assert.deepEqual(result[0].planNames, ["Monthly"]);
  assert.equal(result[0].network, null, "an unconfigured prefix cannot invent a carrier");
  assert.equal("ownerNote" in result[0], false, "searching a private note does not add it to the directory response");
  assert.equal(store.calls.length, 2, "one directory query per request, never an account-by-account query");
  assert.equal(store.calls[1].take, 100);
  assert.equal(store.calls[1].select.codes.take, 100);
  assert.deepEqual((await store.read({ search: "blocked Monthly" })).map(account => account.id), [id(105)]);
});

test("directory POST accepts live filters and legacy search while refusing invalid queries before storage", async () => {
  const store = fixture(), { POST } = createSubscriberHandlers();
  const post = body => POST({ services: { database: store.database, config: { production: false } }, owner: { username: "owner" },
    request: new Request("http://localhost:3000/api/admin/subscribers", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  for (const body of [{ search: "", status: "online" }, { search: "x".repeat(121) }, { search: "", action: "delete" }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(store.calls.length, 0);
  for (const body of [query({ search: "Priority Monthly", status: "blocked" }), { search: "0700000205" }]) {
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).accounts.map(account => account.id), [id(105)]);
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
  assert.equal((await store.read({ search: account.phone }))[0].access, "active");
  assert.equal((await store.read({ search: account.phone, access: "queued" })).length, 0);
  account.codes[0].revokedAt = new Date(now);
  assert.equal((await store.read({ search: account.phone, access: "queued" }))[0].access, "queued");
  account.codes[1].endsAt = new Date(now);
  assert.equal((await store.read({ search: account.phone, access: "none", plan: "none" }))[0].access, "none");
  assert.deepEqual((await store.read({ search: account.phone }))[0].planNames, []);
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
