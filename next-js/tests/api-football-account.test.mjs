import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { normalizeAccountStatus } from "../src/server/football/api-football-normalize.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { parseUtcInstant } from "../src/domain/calendar.ts";

// Synthetic /status contracts; these establish no real account, plan, rights or free allowance.
const NOW = parseUtcInstant("2026-10-08T12:00:00Z");
const KEY = "synthetic-account-private-key";
const PII = "synthetic-private-holder@example.invalid";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bounds = (overrides = {}) => ({
  priority: "enrichment", deadlineAt: NOW + 60_000, timeoutMs: 1000,
  maxRequests: 3, maxPages: 1, maxRows: 1, maxResponseBytes: 10_000,
  retry: { maxAttempts: 1, baseDelayMs: 20, maxDelayMs: 100 }, cacheMaxAgeMs: 0,
  ...overrides,
});
const payload = (overrides = {}) => ({
  get: "status", parameters: [], errors: [], results: 1,
  response: {
    account: { firstname: "Synthetic Private First Name", lastname: "Synthetic Private Last Name", email: PII },
    subscription: { plan: "Mega", end: "2026-11-01T03:00:00+03:00", active: true },
    requests: { current: 500, limit_day: 150_000 },
  }, ...overrides,
});
function response(body = payload(), { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
function setup({ respond = () => response(), authorize = () => {}, reserveDecision, cacheAllowed = false } = {}) {
  let now = NOW;
  const events = [], reservations = [], feedback = [], calls = [], sleeps = [], cacheChecks = [];
  const limiter = {
    async reserve(request) {
      events.push("reserve"); reservations.push(request);
      return reserveDecision ?? { status: "reserved", permit: { requestId: request.requestId,
        periodId: hash("synthetic-account-period"), ownerToken: hash(request.requestId), dispatchedAt: now, launchBefore: now + 1000 } };
    },
    async claimLaunch() { events.push("claim"); return { status: "claimed", timeoutMs: 1000 }; },
    async complete(_permit, observation) { events.push("complete"); feedback.push(observation); return { status: "recorded" }; },
  };
  const adapter = createApiFootballAdapter({ accountId: hash("synthetic-account-status-account"),
    credential: { read: () => KEY }, gateway: createQuotaGateway({ limiter, authorize }), authorize,
    clock: { now: () => now }, random: () => 0.5,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); now += milliseconds; },
    verifyCacheUse(permission) { cacheChecks.push(permission); return cacheAllowed; },
    async fetcher(input, init) {
      events.push("fetch"); calls.push({ url: new URL(input), init });
      return respond(calls.length);
    },
  });
  return { adapter, events, reservations, feedback, calls, sleeps, cacheChecks,
    setNow(value) { now = value; } };
}

test("account diagnostics use the counted gateway and discard account holder identity", async () => {
  const state = setup({ respond: () => response(payload(), { headers: {
    "x-ratelimit-requests-limit": "150000", "x-ratelimit-requests-remaining": "149500",
    "X-RateLimit-Limit": "900", "X-RateLimit-Remaining": "899",
  } }) });
  const result = await state.adapter.evidence.accountStatus(bounds());
  assert.equal(result.status, "complete");
  assert.equal(result.requestsDispatched, 1);
  assert.deepEqual(state.events, ["reserve", "claim", "fetch", "complete"]);
  assert.equal(state.calls[0].url.href, "https://v3.football.api-sports.io/status");
  assert.equal(new Headers(state.calls[0].init.headers).get("x-apisports-key"), KEY);
  assert.equal(state.calls[0].init.redirect, "error");
  assert.deepEqual(result.data[0].subscription, { plan: "Mega", expiresAt: parseUtcInstant("2026-11-01T00:00:00Z"), active: true });
  assert.deepEqual(result.data[0].requests, { current: 500, dailyLimit: 150_000 });
  assert.equal(result.data[0].source.retrievedAt, NOW);
  assert.equal(result.data[0].source.providerUpdatedAt, null);
  assert.equal(result.provenance[0].currentPage, null);
  assert.equal(result.provenance[0].totalPages, null);
  assert.equal(result.provenance[0].quota.dailyRemaining, 149_500);
  assert.equal(state.feedback[0].minuteLimit, 900);
  const serialized = JSON.stringify(result);
  for (const privateValue of [KEY, PII, "Synthetic Private First Name", "Synthetic Private Last Name"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.ok(Object.isFrozen(result.data[0].subscription));
});

test("unknown account fields remain unknown instead of asserting entitlement or expiry", async () => {
  const state = setup({ respond: () => response(payload({ response: { subscription: null, requests: {} } })) });
  const result = await state.adapter.evidence.accountStatus(bounds());
  assert.equal(result.status, "complete");
  assert.deepEqual(result.data[0].subscription, { plan: null, expiresAt: null, active: null });
  assert.deepEqual(result.data[0].requests, { current: null, dailyLimit: null });
  for (const missing of ["subscription-plan", "subscription-expiry", "subscription-active", "account-request-current",
    "account-request-daily-limit", "provider-update-time"]) assert.ok(result.completeness.missingCoverage.includes(missing));
  assert.equal(state.feedback[0].kind, "success");
  assert.equal(Object.hasOwn(state.feedback[0], "dailyLimit"), false);
});

test("inactive and expired account observations do not reset or activate shared capacity", async () => {
  const body = payload();
  body.response.subscription = { plan: "Free", end: "2026-10-01T00:00:00Z", active: false };
  body.response.requests = { current: 100, limit_day: 100 };
  const state = setup({ respond: () => response(body) });
  const result = await state.adapter.evidence.accountStatus(bounds());
  assert.equal(result.status, "complete");
  assert.equal(result.data[0].subscription.active, false);
  assert.equal(result.data[0].subscription.expiresAt, parseUtcInstant("2026-10-01T00:00:00Z"));
  assert.deepEqual(state.events, ["reserve", "claim", "fetch", "complete"]);
  assert.deepEqual(state.feedback[0], { kind: "success" });
});

test("subscription expiry validates offset calendar values without date normalization", () => {
  const context = { retrievedAt: NOW, endpoint: "/status" };
  const body = { subscription: { end: "2026-10-08T01:15:00-03:30" }, requests: { current: 0, limit_day: 100 } };
  const valid = normalizeAccountStatus(body, context);
  assert.equal(valid.valid, true);
  assert.equal(valid.data.subscription.expiresAt, parseUtcInstant("2026-10-08T04:45:00Z"));
  for (const end of ["2026-02-30T00:00:00Z", "2026-10-08T24:00:00Z", "2026-10-08T00:00:00+14:01",
    "2026-10-08T00:00:00+15:00", "2026-10-08", "2026-10-08T00:00:00", "not-a-date"]) {
    assert.deepEqual(normalizeAccountStatus({ ...body, subscription: { end } }, context), { valid: false, reason: "schema-error" });
  }
});

test("malformed account envelope, metadata and paging fail without publishing private diagnostics", async () => {
  const malformed = [
    payload({ response: [payload().response] }), payload({ response: null }), payload({ results: 0 }),
    payload({ get: "fixtures" }), payload({ paging: null }), payload({ paging: { current: 0, total: 1 } }),
    payload({ response: { subscription: { active: "true" } } }),
    payload({ response: { requests: { current: -1 } } }), payload({ response: { requests: { limit_day: "150000" } } }),
  ];
  for (const body of malformed) {
    const state = setup({ respond: () => response(body) });
    const result = await state.adapter.evidence.accountStatus(bounds());
    assert.equal(result.error.reason, "schema-error");
    assert.equal(result.data.length, 0);
    assert.equal(result.requestsDispatched, 1);
    assert.equal(JSON.stringify(result).includes(PII), false);
  }
});

test("supplied account paging is preserved and unexpected pages never trigger invented requests", async () => {
  const ordinary = setup({ respond: () => response(payload({ paging: { current: 1, total: 1 } })) });
  const completed = await ordinary.adapter.evidence.accountStatus(bounds());
  assert.equal(completed.status, "complete");
  assert.equal(completed.provenance[0].currentPage, 1);
  const incomplete = setup({ respond: () => response(payload({ paging: { current: 1, total: 2 } })) });
  const result = await incomplete.adapter.evidence.accountStatus(bounds({ maxPages: 5 }));
  assert.equal(result.status, "partial");
  assert.equal(result.error.reason, "pagination-incomplete");
  assert.equal(result.provenance[0].totalPages, 2);
  assert.equal(incomplete.calls.length, 1);
  assert.equal(incomplete.calls[0].url.searchParams.has("page"), false);
});

test("authorization, quota unavailability and zero explicit allowance prevent status calls", async () => {
  const blocked = [
    setup({ authorize() { throw new Error(PII); } }),
    setup({ reserveDecision: { status: "denied", reason: "storage-unavailable" } }),
  ];
  for (const state of blocked) {
    const result = await state.adapter.evidence.accountStatus(bounds());
    assert.equal(result.status, "failed");
    assert.equal(state.calls.length, 0);
    assert.equal(JSON.stringify(result).includes(PII), false);
  }
  const state = setup();
  const result = await state.adapter.evidence.accountStatus(bounds({ maxRequests: 0 }));
  assert.equal(result.error.reason, "invalid-request");
  assert.equal(state.reservations.length, 0);
});

test("status retries reserve every attempt despite the provider's published quota-free description", async () => {
  const state = setup({ respond: (attempt) => attempt === 1
    ? response(payload({ errors: { rateLimit: `Synthetic limit diagnostic ${PII}` } }), { status: 429, headers: { "Retry-After": "0.02" } })
    : response() });
  const result = await state.adapter.evidence.accountStatus(bounds({ retry: { maxAttempts: 2, baseDelayMs: 20, maxDelayMs: 100 } }));
  assert.equal(result.status, "complete");
  assert.equal(result.requestsDispatched, 2);
  assert.equal(state.reservations.length, 2);
  assert.notEqual(state.reservations[0].requestId, state.reservations[1].requestId);
  assert.equal(state.reservations[0].workKey, state.reservations[1].workKey);
  assert.deepEqual(state.sleeps, [20]);
  assert.deepEqual(state.feedback.map(({ kind }) => kind), ["rate-limited", "success"]);
  assert.equal(JSON.stringify(result).includes(PII), false);
});

test("account body expiry errors are redacted and retain counted diagnostic evidence", async () => {
  const state = setup({ respond: () => response(payload({ errors: { subscription: `Subscription expired ${KEY} ${PII}` } })) });
  const result = await state.adapter.evidence.accountStatus(bounds());
  assert.equal(result.status, "failed");
  assert.equal(result.error.reason, "subscription-expired");
  assert.equal(state.feedback[0].kind, "subscription-expired");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(result.data.length, 0);
  assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.equal(JSON.stringify(result).includes(PII), false);
});

test("approved account cache keeps retrieval provenance and never stores holder identity", async () => {
  const state = setup({ cacheAllowed: true });
  const input = bounds({ cacheMaxAgeMs: 1000 });
  await state.adapter.evidence.accountStatus(input);
  state.setNow(NOW + 100);
  const result = await state.adapter.evidence.accountStatus(input);
  assert.equal(result.requestsDispatched, 0);
  assert.equal(state.calls.length, 1);
  assert.equal(result.provenance[0].retrievedAt, NOW);
  assert.equal(result.provenance[0].fromCache, true);
  assert.equal(result.provenance[0].totalPages, null);
  assert.equal(state.cacheChecks[0].endpoint, "accountStatus");
  assert.equal(state.cacheChecks[0].purpose, "structured-evidence");
  assert.equal(JSON.stringify(state.cacheChecks).includes(PII), false);
});

test("status body bounds preserve quota headers when the account response exceeds the limit", async () => {
  const state = setup({ respond: () => response(payload(), { headers: { "x-ratelimit-requests-remaining": "149500" } }) });
  const result = await state.adapter.evidence.accountStatus(bounds({ maxResponseBytes: 20 }));
  assert.equal(result.error.reason, "response-too-large");
  assert.equal(result.requestsDispatched, 1);
  assert.equal(result.provenance[0].quota.dailyRemaining, 149_500);
  assert.equal(result.data.length, 0);
});
