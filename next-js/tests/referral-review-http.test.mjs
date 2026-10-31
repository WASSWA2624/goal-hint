import assert from "node:assert/strict";
import test from "node:test";
import { createReferralReviewHandlers } from "../src/server/admin/referral-reviews-http.ts";
import { createMemberReferralReviewHandler } from "../src/server/members/referral-reviews-http.ts";

const id = "10000000-0000-4000-8000-000000000001", grantId = "10000000-0000-4000-8000-000000000002";
const member = { accountId: "account-a", phone: "256700000001", tokenHash: "opaque-session", administrator: false, blocked: false };
const safeCase = { id, reason: "duplicate-award", status: "reversed", revision: 2, reversedMs: 7200000, restoredMs: 0,
  openedAt: "2026-10-31T10:00:00.000Z", updatedAt: "2026-10-31T11:00:00.000Z", closedAt: "2026-10-31T11:00:00.000Z", canAppeal: true };
const request = (path, body, headers = {}, method = body === undefined ? "GET" : "POST") => new Request(`https://goal.test${path}`, {
  method, headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});
function memberServices(value = member, reviews = {}) {
  return async () => ({ config: { production: false }, settings: { settings: { paywallMode: "off" } },
    sessions: { async verify() { return value; } }, referralReviews: { async member() { return [safeCase]; }, async appeal() { return { status: "saved", case: { ...safeCase, status: "appealed", canAppeal: false } }; }, ...reviews } });
}

test("member review routes require own authenticated account and same-origin context, without a paid subscription", async () => {
  for (const identity of [null, { ...member, blocked: true }, { ...member, administrator: true }]) {
    const read = createMemberReferralReviewHandler("read", memberServices(identity, { member() { assert.fail("Denied before review read"); } }));
    assert.equal((await read(request("/api/account/referral-reviews"))).status, 403);
  }
  const read = createMemberReferralReviewHandler("read", memberServices());
  const response = await read(request("/api/account/referral-reviews"));
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/u);
  assert.deepEqual(await response.json(), { cases: [safeCase] });
  const text = JSON.stringify(safeCase);
  assert.doesNotMatch(text, /phone|evidenceRef|summary|actor|tokenHash|accountId/);
  assert.equal((await read(request("/api/account/referral-reviews", undefined, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  for (const query of ["accountId=foreign", "before=invalid", "before=x&before=y"])
    assert.equal((await read(request(`/api/account/referral-reviews?${query}`))).status, 400);
});

test("member appeals reject malformed/oversized/cross-account-shaped input and map service conflict/privacy safely", async () => {
  let calls = 0;
  const write = createMemberReferralReviewHandler("appeal", memberServices(member, { async appeal(identity, input) {
    calls++; assert.equal(identity, member); assert.deepEqual(input, { id, revision: 2, statement: "Please review support case TEST-7" });
    return { status: "conflict" };
  } }));
  for (const body of ["{", "[]", { id, revision: 2, statement: "valid statement", accountId: "foreign" }, { id, revision: -1, statement: "valid statement" },
    { id: "foreign", revision: 2, statement: "valid statement" }, { id, revision: 2, statement: "x".repeat(3000) }])
    assert.equal((await write(request("/api/account/referral-reviews", body))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await write(request("/api/account/referral-reviews", { id, revision: 2, statement: "Please review support case TEST-7" }))).status, 409);
  assert.equal(calls, 1);
  assert.equal((await write(request("/api/account/referral-reviews", {}, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
});

test("administrator review transport re-verifies current identity and validates every mutation before services", async () => {
  const context = request => ({ request, owner: { username: "member-admin:test" }, services: { database: {}, config: { production: false } } });
  const denied = createReferralReviewHandlers({ verify: async () => null, create: () => { assert.fail("No review service for stale admin"); } });
  assert.equal((await denied.GET(context(request("/api/admin/referral-reviews")))).status, 403);
  let writes = 0;
  const handlers = createReferralReviewHandlers({ verify: async () => ({ ...member, administrator: true }), create: () => ({
    async list() { return [safeCase]; }, async detail() { return null; }, async grants() { return []; },
    async mutate(_admin, input) { writes++; assert.equal(input.grantId, grantId); return { status: "saved", case: safeCase }; },
  }) });
  for (const query of ["status=unknown", "id=invalid", "before=bad", "accountId=foreign", "status=all&status=open"])
    assert.equal((await handlers.GET(context(request(`/api/admin/referral-reviews?${query}`)))).status, 400);
  const valid = { action: "create", requestId: id, grantId, reason: "duplicate-award", summary: "Corroborated technical duplicate", evidenceRef: "support:TEST-7", evidenceConfirmed: true };
  for (const body of [{ ...valid, evidenceConfirmed: false }, { ...valid, accountId: "foreign" }, { ...valid, reason: "same-ip" }])
    assert.equal((await handlers.POST(context(request("/api/admin/referral-reviews", body)))).status, 400);
  assert.equal(writes, 0);
  const saved = await handlers.POST(context(request("/api/admin/referral-reviews", valid)));
  assert.equal(saved.status, 200); assert.match(saved.headers.get("cache-control"), /no-store/u); assert.equal(writes, 1);
  assert.equal((await handlers.POST(context(request("/api/admin/referral-reviews", { action: "grants", search: "256700000001" })))).status, 200);
});
