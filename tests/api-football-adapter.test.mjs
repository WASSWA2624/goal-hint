import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { API_FOOTBALL_ORIGIN } from "../src/server/football/api-football-contract.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";

// Every response/account/permission in this file is a labeled synthetic fixture.
// The fetch dependency is replaced; no credential or live provider call is used.
const NOW = parseUtcInstant("2026-10-08T12:00:00.000Z");
const KEY = "synthetic-private-provider-key";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bounds = (overrides = {}) => ({
  priority: "daily-inputs", deadlineAt: NOW + 60_000, timeoutMs: 1000,
  maxRequests: 10, maxPages: 5, maxRows: 100, maxResponseBytes: 100_000,
  retry: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100 }, cacheMaxAgeMs: 0,
  ...overrides,
});

function fixture(id = 1, providerStatus = "FT") {
  return {
    fixture: { id, date: "2026-10-08T18:00:00+03:00", timezone: "Africa/Kampala",
      timestamp: Date.parse("2026-10-08T15:00:00.000Z") / 1000,
      status: { short: providerStatus, elapsed: 90 } },
    league: { id: 39, name: "Synthetic league", country: "Synthetic country", season: 2026, round: "Round 1" },
    teams: { home: { id: 10, name: "Synthetic home", logo: "https://media.api-sports.io/football/teams/10.png" },
      away: { id: 20, name: "Synthetic away", logo: "https://media.api-sports.io/football/teams/20.png" } },
    goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 }, extratime: null, penalty: null },
  };
}
function player(id) {
  return { player: { id, name: `Synthetic player ${id}` }, statistics: [{
    team: { id: 10, name: "Synthetic home" },
    league: { id: 39, name: "Synthetic league", season: 2026 },
    games: { appearences: 5, minutes: 400 }, goals: { total: 2, assists: 1 },
  }] };
}
function envelope(url, rows = [], paging = { current: 1, total: 1 }, errors = []) {
  return { get: url.pathname.slice(1), parameters: Object.fromEntries(url.searchParams),
    errors, results: rows.length, paging, response: rows };
}
function jsonResponse(url, rows = [], options = {}) {
  return new Response(JSON.stringify(envelope(url, rows, options.paging, options.errors)), {
    status: options.status ?? 200, headers: { "content-type": "application/json", ...options.headers },
  });
}
function setup({ respond = (url) => jsonResponse(url), decision, completionDecision, authorize, options = {} } = {}) {
  let now = NOW;
  let cacheAllowed = true;
  const events = [], network = [], reservations = [], completions = [], sleeps = [];
  const limiter = {
    async reserve(request) {
      events.push("reserve"); reservations.push(request);
      return decision ?? { status: "reserved", permit: {
        requestId: request.requestId, periodId: hash("synthetic-period"), ownerToken: hash(request.requestId),
        dispatchedAt: now, launchBefore: now + 1000,
      } };
    },
    async claimLaunch() { events.push("claim"); return { status: "claimed", timeoutMs: 1000 }; },
    async complete(permit, feedback) {
      events.push("complete"); completions.push({ permit, feedback });
      return completionDecision ?? { status: "recorded" };
    },
  };
  const checkAuthorization = authorize ?? (() => {});
  const gateway = createQuotaGateway({ limiter, authorize: checkAuthorization });
  const adapter = createApiFootballAdapter({
    accountId: hash("synthetic-account"), credential: { read: () => KEY }, gateway,
    authorize: checkAuthorization, clock: { now: () => now }, random: () => 0.5,
    sleep: async (ms) => { sleeps.push(ms); now += ms; },
    verifyCacheUse: () => cacheAllowed,
    fetcher: async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      events.push("fetch"); network.push({ url, init }); return respond(url, init, network.length);
    },
    ...options,
  });
  return { adapter, network, reservations, completions, sleeps, events,
    setNow(value) { now = value; }, setCacheAllowed(value) { cacheAllowed = value; } };
}

test("fixture transport requires a counted launch, keeps credentials private and forces Kampala dates", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()]) });
  const result = await state.adapter.evidence.fixturesByDate("2026-10-08", bounds());
  assert.equal(result.status, "complete");
  assert.equal(result.data[0].id, 1);
  assert.equal(result.data[0].kickoff, Date.parse("2026-10-08T15:00:00Z"));
  assert.equal(result.data[0].source.retrievedAt, NOW);
  assert.equal(result.data[0].source.providerUpdatedAt, null);
  assert.ok(result.completeness.missingCoverage.includes("provider-update-time"));
  assert.deepEqual(state.events, ["reserve", "claim", "fetch", "complete"]);
  const { url, init } = state.network[0];
  assert.equal(url.origin, API_FOOTBALL_ORIGIN);
  assert.equal(url.pathname, "/fixtures");
  assert.equal(url.searchParams.get("date"), "2026-10-08");
  assert.equal(url.searchParams.get("timezone"), "Africa/Kampala");
  assert.equal(url.searchParams.has("page"), false);
  assert.equal(url.toString().includes(KEY), false);
  assert.equal(new Headers(init.headers).get("x-apisports-key"), KEY);
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.ok(init.signal instanceof AbortSignal);
  assert.match(state.reservations[0].requestId, /^[a-f0-9]{64}$/u);
  assert.match(state.reservations[0].workKey, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test("all evidence and fallback outbound operations use the same protected origin and gateway", async () => {
  const state = setup({ respond: (url) => jsonResponse(url,
    url.pathname === "/fixtures" && url.searchParams.has("id") ? [fixture(1)] : []) });
  const calls = [
    () => state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds()),
    () => state.adapter.evidence.liveFixtures(bounds()),
    () => state.adapter.evidence.teams({ teamId: 10 }, bounds()),
    () => state.adapter.evidence.competitions({ competitionId: 39, season: 2026 }, bounds()),
    () => state.adapter.evidence.statistics(1, bounds()),
    () => state.adapter.evidence.availability(1, "lineups", bounds()),
    () => state.adapter.evidence.availability(1, "injuries", bounds()),
    () => state.adapter.evidence.playerStatistics({ competitionId: 39, season: 2026 }, bounds()),
    () => state.adapter.fallback.predictions(1, bounds({ cacheScope: "synthetic-fallback-job" })),
  ];
  for (const operation of calls) assert.equal((await operation()).status, "complete");
  assert.deepEqual(state.network.map(({ url }) => url.pathname), [
    "/fixtures", "/fixtures", "/teams", "/leagues", "/fixtures/statistics", "/fixtures/lineups",
    "/injuries", "/players", "/predictions",
  ]);
  assert.equal(state.network[1].url.searchParams.get("live"), "all");
  assert.equal(state.reservations.length, calls.length);
  assert.equal(state.completions.length, calls.length);
  assert.equal(new Set(state.reservations.map(({ requestId }) => requestId)).size, calls.length);
  for (const { url } of state.network) assert.equal(url.origin, API_FOOTBALL_ORIGIN);
  assert.equal(Object.hasOwn(state.adapter.evidence, "predictions"), false);
});

test("invalid queries, incomplete date/season pairs and missing explicit budgets fail before reservation", async () => {
  const state = setup();
  const operations = [
    () => state.adapter.evidence.fixtures({}, bounds()),
    () => state.adapter.evidence.fixtures({ fixtureId: -1 }, bounds()),
    () => state.adapter.evidence.fixtures({ competitionId: 39 }, bounds()),
    () => state.adapter.evidence.fixtures({ from: "2026-10-08" }, bounds()),
    () => state.adapter.evidence.fixtures({ from: "2026-10-09", to: "2026-10-08" }, bounds()),
    () => state.adapter.evidence.fixtures({ fixtureId: 1, page: 2 }, bounds()),
    () => state.adapter.evidence.fixturesByDate("2026-02-30", bounds()),
    () => state.adapter.evidence.statistics(1, bounds({ maxRequests: 0 })),
    () => state.adapter.evidence.statistics(1, bounds({ timeoutMs: 0 })),
    () => state.adapter.evidence.statistics(1, bounds({ maxResponseBytes: Infinity })),
    () => state.adapter.evidence.statistics(1, bounds({ retry: { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 } })),
    () => state.adapter.fallback.predictions(1, bounds()),
  ];
  for (const operation of operations) {
    const result = await operation();
    assert.equal(result.status, "failed");
    assert.equal(result.error.reason, "invalid-request");
  }
  assert.equal(state.network.length, 0);
  assert.equal(state.reservations.length, 0);
});

test("missing, malformed or unreadable credentials remain private and cannot reserve", async () => {
  for (const read of [() => "", () => "synthetic\nsecret", () => { throw new Error(KEY); }]) {
    const state = setup({ options: { credential: { read } } });
    const result = await state.adapter.evidence.liveFixtures(bounds());
    assert.equal(result.status, "failed");
    assert.equal(result.error.reason, "invalid-credential");
    assert.equal(state.reservations.length, 0);
    assert.equal(state.network.length, 0);
    assert.equal(JSON.stringify(result).includes(KEY), false);
  }
});

test("credential rotation changes only the private header and retains the account work identity", async () => {
  let key = KEY;
  const state = setup({ options: { credential: { read: () => key } } });
  await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  key = "synthetic-rotated-private-key";
  await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  assert.equal(new Headers(state.network[0].init.headers).get("x-apisports-key"), KEY);
  assert.equal(new Headers(state.network[1].init.headers).get("x-apisports-key"), key);
  assert.equal(state.reservations[0].workKey, state.reservations[1].workKey);
  assert.notEqual(state.reservations[0].requestId, state.reservations[1].requestId);
});

test("authorization, unavailable quota state and joined shared work never reach fetch", async () => {
  const unauthorized = setup({ authorize: () => { throw new Error(KEY); } });
  const denied = await unauthorized.adapter.evidence.liveFixtures(bounds());
  assert.equal(denied.error.reason, "operation-not-authorized");
  assert.equal(unauthorized.network.length, 0);
  assert.equal(JSON.stringify(denied).includes(KEY), false);
  for (const decision of [
    { status: "denied", reason: "storage-unavailable" },
    { status: "denied", reason: "essential-reserve", retryAt: NOW + 1000 },
    { status: "joined", requestId: hash("synthetic-original-attempt"), leaseUntil: NOW + 1000 },
  ]) {
    const state = setup({ decision });
    const result = await state.adapter.evidence.liveFixtures(bounds());
    assert.equal(result.status, "failed");
    assert.equal(result.error.reason, decision.status === "joined" ? "shared-work-pending" : "quota-denied");
    if (decision.status === "denied") assert.equal(result.error.quotaReason, decision.reason);
    assert.equal(state.network.length, 0);
    assert.equal(state.completions.length, 0);
  }
});

test("failed durable completion withholds the fetched value and prevents it from entering the cache", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()]),
    completionDecision: { status: "denied", reason: "storage-unavailable" } });
  const input = bounds({ cacheMaxAgeMs: 10_000 });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
    assert.equal(result.status, "failed");
    assert.equal(result.error.reason, "quota-denied");
    assert.equal(result.error.quotaReason, "storage-unavailable");
    assert.equal(result.data.length, 0);
  }
  assert.equal(state.network.length, 2);
  assert.equal(state.reservations.length, 2);
  assert.equal(state.completions.length, 2);
});

test("daily/minute headers and Retry-After seconds are observed on counted rate-limit failures", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [], {
    status: 429, headers: {
      "x-ratelimit-requests-limit": "150000", "x-ratelimit-requests-remaining": "149999",
      "x-ratelimit-limit": "900", "x-ratelimit-remaining": "899", "retry-after": "2",
    },
  }) });
  const result = await state.adapter.evidence.liveFixtures(bounds());
  assert.equal(result.error.reason, "rate-limited");
  assert.equal(result.error.retryAfterMs, 2000);
  assert.deepEqual(state.completions[0].feedback, {
    kind: "rate-limited", dailyLimit: 150000, dailyRemaining: 149999,
    minuteLimit: 900, minuteRemaining: 899, retryAfterMs: 2000,
  });
  assert.equal(state.network.length, 1);
});

test("Retry-After HTTP dates use the observed retrieval clock and malformed quotas stay unknown", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [], { status: 429, headers: {
    "retry-after": new Date(NOW + 3000).toUTCString(), "x-ratelimit-requests-limit": "Infinity",
    "x-ratelimit-requests-remaining": "-1", "x-ratelimit-limit": "1.5", "x-ratelimit-remaining": "unknown",
  } }) });
  const result = await state.adapter.evidence.liveFixtures(bounds());
  assert.equal(result.error.retryAfterMs, 3000);
  const feedback = state.completions[0].feedback;
  assert.equal(feedback.retryAfterMs, 3000);
  for (const field of ["dailyLimit", "dailyRemaining", "minuteLimit", "minuteRemaining"]) {
    assert.equal(feedback[field], undefined);
  }
});

test("body-level authentication, subscription, quota and generic errors expose no provider diagnostics", async () => {
  for (const [errors, reason, kind] of [
    [{ token: "Error/Missing application key. synthetic-private-provider-key" }, "authentication-error", "credential-failure"],
    [{ subscription: "Your subscription has expired. synthetic-private-provider-key" }, "subscription-expired", "subscription-expired"],
    [{ requests: "You have reached the request limit for the minute." }, "rate-limited", "rate-limited"],
    [{ coverage: "Synthetic endpoint is unavailable on this plan." }, "coverage-error", "provider-error"],
    [{ fixture: "Synthetic diagnostic synthetic-private-provider-key" }, "response-body-error", "provider-error"],
  ]) {
    const state = setup({ respond: (url) => jsonResponse(url, [], { errors }) });
    const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({
      retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 },
    }));
    assert.equal(result.error.reason, reason);
    assert.equal(state.completions[0].feedback.kind, kind);
    assert.equal(JSON.stringify(result).includes(KEY), false);
    if (reason !== "rate-limited") assert.equal(state.network.length, 1);
  }
});

test("bounded retries acquire fresh attempts, retain canonical work identity and honor provider delay", async () => {
  const state = setup({ respond: (url, _init, count) => count === 1
    ? jsonResponse(url, [], { status: 429, headers: { "retry-after": "1" } })
    : jsonResponse(url, [fixture()]) });
  const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({
    retry: { maxAttempts: 2, baseDelayMs: 50, maxDelayMs: 100 },
  }));
  assert.equal(result.status, "complete");
  assert.equal(result.requestsDispatched, 2);
  assert.deepEqual(state.sleeps, [1000]);
  assert.equal(state.reservations.length, 2);
  assert.notEqual(state.reservations[0].requestId, state.reservations[1].requestId);
  assert.equal(state.reservations[0].workKey, state.reservations[1].workKey);
  assert.deepEqual(state.completions.map(({ feedback }) => feedback.kind), ["rate-limited", "success"]);
});

test("failed HTTP provenance keeps observed times, while a successful retry cache preserves only its successful page", async () => {
  const denied = setup({ respond: (url) => jsonResponse(url, [], { status: 401,
    headers: { "x-ratelimit-requests-remaining": "400" } }) });
  const failure = await denied.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  assert.equal(failure.status, "failed");
  assert.deepEqual(failure.data, []);
  assert.equal(failure.provenance.length, 1);
  assert.equal(failure.provenance[0].retrievedAt, NOW);
  assert.equal(failure.provenance[0].providerUpdatedAt, null);
  assert.equal(failure.provenance[0].currentPage, null);
  assert.equal(failure.provenance[0].totalPages, null);
  assert.equal(failure.provenance[0].quota.kind, "credential-failure");
  assert.equal(failure.provenance[0].quota.dailyRemaining, 400);
  assert.deepEqual(failure.provenance[0].requestParameters, { timezone: "Africa/Kampala", id: "1" });

  const state = setup({ respond: (url, _init, count) => count === 1
    ? jsonResponse(url, [], { status: 429, headers: { "retry-after": "1", "x-ratelimit-requests-remaining": "400" } })
    : jsonResponse(url, [fixture()], { headers: { "x-ratelimit-requests-remaining": "399" } }) });
  const input = bounds({ maxPages: 1, cacheMaxAgeMs: 10_000,
    retry: { maxAttempts: 2, baseDelayMs: 50, maxDelayMs: 100 },
  });
  const complete = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(complete.status, "complete");
  assert.equal(complete.requestsDispatched, 2);
  assert.deepEqual(complete.provenance.map(({ retrievedAt }) => retrievedAt), [NOW, NOW + 1000]);
  assert.deepEqual(complete.provenance.map(({ currentPage }) => currentPage), [null, 1]);
  assert.deepEqual(complete.provenance.map(({ quota }) => quota.kind), ["rate-limited", "success"]);
  assert.ok(complete.provenance.every(({ providerUpdatedAt, fromCache }) => providerUpdatedAt === null && !fromCache));
  assert.equal(complete.data[0].source.retrievedAt, NOW + 1000);

  state.setNow(NOW + 2000);
  const cached = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(cached.status, "complete");
  assert.equal(cached.requestsDispatched, 0);
  assert.equal(cached.provenance.length, 1);
  assert.equal(cached.provenance[0].fromCache, true);
  assert.equal(cached.provenance[0].retrievedAt, NOW + 1000);
  assert.equal(cached.provenance[0].quota.kind, "success");
  assert.equal(cached.data[0].source.retrievedAt, NOW + 1000);
  assert.equal(cached.data[0].source.providerUpdatedAt, null);
  assert.equal(state.network.length, 2);
});

test("network failures are counted, redacted and bounded by retry and total request budgets", async () => {
  const state = setup({ respond: () => { throw new Error(`Synthetic transport ${KEY}`); } });
  const result = await state.adapter.evidence.liveFixtures(bounds({ maxRequests: 2,
    retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 20 },
  }));
  assert.equal(result.status, "failed");
  assert.equal(result.requestsDispatched, 2);
  assert.equal(state.network.length, 2);
  assert.equal(state.reservations.length, 2);
  assert.ok(state.completions.every(({ feedback }) => feedback.kind === "uncertain"));
  assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.ok(state.sleeps.every((ms) => ms > 0 && ms <= 20));
});

test("server failures can retry, while authentication failure is terminal", async () => {
  for (const [status, expectedCalls] of [[500, 2], [401, 1]]) {
    const state = setup({ respond: (url, _init, count) => count === 1
      ? jsonResponse(url, [], { status }) : jsonResponse(url) });
    const result = await state.adapter.evidence.liveFixtures(bounds({
      retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 20 },
    }));
    assert.equal(state.network.length, expectedCalls);
    assert.equal(result.status, status === 500 ? "complete" : "failed");
    if (status === 401) assert.equal(result.error.reason, "authentication-error");
  }
});

test("provider HTTP 499 remains a counted retryable transport failure", async () => {
  const state = setup({ respond: (url, _init, count) => jsonResponse(url, [], { status: count === 1 ? 499 : 200 }) });
  const result = await state.adapter.evidence.liveFixtures(bounds({
    retry: { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 20 },
  }));
  assert.equal(result.status, "complete");
  assert.equal(result.requestsDispatched, 2);
  assert.equal(state.reservations.length, 2);
  assert.notEqual(state.reservations[0].requestId, state.reservations[1].requestId);
  assert.deepEqual(state.completions.map(({ feedback }) => feedback.kind), ["provider-error", "success"]);
});

test("nonempty error arrays are terminal response-body errors rather than malformed successful evidence", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()], { errors: [`Synthetic diagnostic ${KEY}`] }) });
  const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({
    retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 },
  }));
  assert.equal(result.status, "failed");
  assert.equal(result.error.reason, "response-body-error");
  assert.deepEqual(result.data, []);
  assert.equal(state.completions[0].feedback.kind, "provider-error");
  assert.equal(state.reservations.length, 1);
  assert.equal(state.network.length, 1);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test("provider delay that exceeds the caller deadline prevents another reservation", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [], { status: 429, headers: { "retry-after": "10" } }) });
  const result = await state.adapter.evidence.liveFixtures(bounds({ deadlineAt: NOW + 2000,
    retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 },
  }));
  assert.equal(result.status, "failed");
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.equal(state.sleeps.length, 0);
});

test("unpaginated fixture endpoints flag unexpected additional pages without inventing page requests", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()], { paging: { current: 1, total: 2 } }) });
  const result = await state.adapter.evidence.fixturesByDate("2026-10-08", bounds());
  assert.equal(result.status, "partial");
  assert.equal(result.error.reason, "pagination-incomplete");
  assert.equal(result.completeness.complete, false);
  assert.equal(state.network.length, 1);
  assert.equal(state.network[0].url.searchParams.has("page"), false);
});

test("player pagination dispatches each documented page through its own reservation", async () => {
  const state = setup({ respond: (url) => {
    const current = Number(url.searchParams.get("page"));
    return jsonResponse(url, current === 1 ? Array.from({ length: 20 }, (_, index) => player(index + 1)) : [player(21)],
      { paging: { current, total: 2 } });
  } });
  const result = await state.adapter.evidence.playerStatistics({ competitionId: 39, season: 2026 }, bounds());
  assert.equal(result.status, "complete");
  assert.equal(result.data.length, 21);
  assert.deepEqual(state.network.map(({ url }) => url.searchParams.get("page")), ["1", "2"]);
  assert.equal(state.reservations.length, 2);
  assert.notEqual(state.reservations[0].workKey, state.reservations[1].workKey);
  assert.deepEqual(result.provenance.map(({ currentPage }) => currentPage), [1, 2]);
});

test("pagination drift and duplicate player identities stop retrieval with explicit incompleteness", async () => {
  for (const problem of ["total-drift", "duplicate-player"]) {
    const state = setup({ respond: (url) => {
      const current = Number(url.searchParams.get("page"));
      const rows = current === 1 ? Array.from({ length: 20 }, (_, index) => player(index + 1))
        : [player(problem === "duplicate-player" ? 20 : 21)];
      return jsonResponse(url, rows, { paging: { current, total: current === 2 && problem === "total-drift" ? 3 : 2 } });
    } });
    const result = await state.adapter.evidence.playerStatistics({ competitionId: 39, season: 2026 }, bounds());
    assert.equal(result.status, "partial");
    assert.equal(result.error.reason, problem === "total-drift" ? "pagination-incomplete" : "schema-error");
    assert.equal(result.completeness.complete, false);
    assert.equal(state.network.length, 2);
    assert.equal(new Set(result.data.map(({ player }) => player.id)).size, result.data.length);
  }
});

test("caller page, request and row caps return partial pagination without more provider calls", async () => {
  for (const cap of [{ maxPages: 1 }, { maxRequests: 1 }, { maxRows: 20 }]) {
    const state = setup({ respond: (url) => jsonResponse(url,
      Array.from({ length: 20 }, (_, index) => player(index + 1)), { paging: { current: 1, total: 3 } }) });
    const result = await state.adapter.evidence.playerStatistics({ competitionId: 39, season: 2026 }, bounds(cap));
    assert.equal(result.status, "partial");
    assert.equal(result.completeness.complete, false);
    assert.equal(state.network.length, 1);
    assert.equal(state.reservations.length, 1);
    assert.ok(result.data.length <= 20);
  }
});

test("a short non-final player page is incomplete under the documented 20-row pagination contract", async () => {
  const state = setup({ respond: (url) => jsonResponse(url,
    Array.from({ length: 19 }, (_, index) => player(index + 1)), { paging: { current: 1, total: 2 } }) });
  const result = await state.adapter.evidence.playerStatistics({ competitionId: 39, season: 2026 }, bounds());
  assert.equal(result.status, "partial");
  assert.equal(result.error.reason, "pagination-incomplete");
  assert.equal(result.completeness.complete, false);
  assert.equal(result.data.length, 19);
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
});

test("malformed envelopes and invalid rows remain counted but cannot become complete evidence", async () => {
  for (const mutate of [
    (body) => ({ ...body, results: 99 }),
    (body) => ({ ...body, get: "predictions" }),
    (body) => ({ ...body, paging: { current: 0, total: 1 } }),
    (body) => ({ ...body, response: "invalid" }),
    (body) => ({ ...body, response: [fixture(), { ...fixture(2), fixture: { id: "bad" } }], results: 2 }),
  ]) {
    const state = setup({ respond: (url) => new Response(JSON.stringify(mutate(envelope(url, [fixture()]))),
      { headers: { "content-type": "application/json" } }) });
    const result = await state.adapter.evidence.fixturesByDate("2026-10-08", bounds());
    assert.notEqual(result.status, "complete");
    assert.equal(result.completeness.complete, false);
    assert.equal(state.network.length, 1);
    assert.equal(state.completions.length, 1);
  }
});

test("missing or mismatched selector echoes cannot establish the requested evidence scope", async () => {
  for (const [parameters, expectedReason] of [
    [{ timezone: "Africa/Kampala" }, "coverage-error"],
    [[], "coverage-error"],
    [{ id: "2", timezone: "Africa/Kampala" }, "schema-error"],
    [{ id: "1", timezone: "UTC" }, "schema-error"],
  ]) {
    const state = setup({ respond: (url) => new Response(JSON.stringify({ ...envelope(url, [fixture()]), parameters }),
      { headers: { "content-type": "application/json" } }) });
    const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({ cacheMaxAgeMs: 10_000 }));
    assert.equal(result.status, "failed");
    assert.equal(result.error.reason, expectedReason);
    assert.deepEqual(result.data, []);
    assert.equal(state.completions[0].feedback.kind, "provider-error");
    assert.equal(state.reservations.length, 1);
  }
});

test("fixture rows must match the requested Kampala date, range, team, competition, season and round", async () => {
  for (const query of [
    { date: "2026-10-09" },
    { from: "2026-10-09", to: "2026-10-10" },
    { teamId: 99 },
    { competitionId: 38, season: 2026 },
    { competitionId: 39, season: 2025 },
    { competitionId: 39, season: 2026, round: "Round 2" },
  ]) {
    const state = setup({ respond: (url) => jsonResponse(url, [fixture()]) });
    const result = await state.adapter.evidence.fixtures(query, bounds());
    assert.equal(result.status, "partial");
    assert.equal(result.error.reason, "schema-error");
    assert.deepEqual(result.data, []);
    assert.equal(result.completeness.invalidRows, 1);
    assert.equal(state.network.length, 1);
  }
});

test("date scope uses the Kampala reporting day across the UTC midnight boundary", async () => {
  const row = fixture();
  row.fixture.date = "2026-10-09T01:00:00+03:00";
  row.fixture.timestamp = Date.parse("2026-10-08T22:00:00Z") / 1000;
  const state = setup({ respond: (url) => jsonResponse(url, [row]) });
  const accepted = await state.adapter.evidence.fixturesByDate("2026-10-09", bounds());
  const rejected = await state.adapter.evidence.fixturesByDate("2026-10-08", bounds());
  assert.equal(accepted.status, "complete");
  assert.equal(accepted.data[0].kickoff, Date.parse("2026-10-08T22:00:00Z"));
  assert.equal(rejected.status, "partial");
  assert.equal(rejected.error.reason, "schema-error");
  assert.deepEqual(rejected.data, []);
  assert.equal(state.reservations.length, 2);
});

test("team, competition, player-statistics and injury rows must match their requested identities", async () => {
  for (const [rows, operation] of [
    [[{ team: { id: 20, name: "Synthetic wrong team" } }], (adapter) => adapter.evidence.teams({ teamId: 10 }, bounds())],
    [[{ league: { id: 38, name: "Synthetic wrong league" }, seasons: [{ year: 2026 }] }],
      (adapter) => adapter.evidence.competitions({ competitionId: 39 }, bounds())],
    [[{ league: { id: 39, name: "Synthetic league" }, seasons: [{ year: 2025 }] }],
      (adapter) => adapter.evidence.competitions({ competitionId: 39, season: 2026 }, bounds())],
    [[player(1)], (adapter) => adapter.evidence.playerStatistics({ competitionId: 38, season: 2026 }, bounds())],
    [[{ team: { id: 10 }, player: { id: 100, name: "Synthetic injured player" }, fixture: { id: 2 } }],
      (adapter) => adapter.evidence.availability(1, "injuries", bounds())],
  ]) {
    const state = setup({ respond: (url) => jsonResponse(url, rows) });
    const result = await operation(state.adapter);
    assert.equal(result.status, "partial");
    assert.equal(result.error.reason, "schema-error");
    assert.deepEqual(result.data, []);
    assert.equal(result.completeness.invalidRows, 1);
    assert.equal(state.network.length, 1);
  }
});

test("duplicate team statistics, lineups and injury observations are excluded from complete evidence", async () => {
  const team = { id: 10, name: "Synthetic home" };
  for (const [row, operation] of [
    [{ team, statistics: [{ type: "Shots on Goal", value: 3 }] },
      (adapter) => adapter.evidence.statistics(1, bounds())],
    [{ team, formation: "4-4-2", startXI: [], substitutes: [] },
      (adapter) => adapter.evidence.availability(1, "lineups", bounds())],
    [{ team, player: { id: 100, name: "Synthetic player", type: "Missing Fixture", reason: "Synthetic injury" }, fixture: { id: 1 } },
      (adapter) => adapter.evidence.availability(1, "injuries", bounds())],
  ]) {
    const state = setup({ respond: (url) => jsonResponse(url, [row, row]) });
    const result = await operation(state.adapter);
    assert.equal(result.status, "partial");
    assert.equal(result.error.reason, "schema-error");
    assert.equal(result.data.length, 1);
    assert.equal(result.completeness.invalidRows, 1);
    assert.equal(state.network.length, 1);
  }
});

test("different injured players on one team remain distinct observations with unknown fitness", async () => {
  const rows = [100, 101].map((id) => ({ team: { id: 10, name: "Synthetic home" },
    player: { id, name: `Synthetic player ${id}`, type: "Missing Fixture", reason: "Synthetic injury" }, fixture: { id: 1 } }));
  const state = setup({ respond: (url) => jsonResponse(url, rows) });
  const result = await state.adapter.evidence.availability(1, "injuries", bounds());
  assert.equal(result.status, "complete");
  assert.deepEqual(result.data.map(({ reportedInjury }) => reportedInjury.playerId), [100, 101]);
  assert.ok(result.data.every(({ fitnessConclusion }) => fitnessConclusion === "unknown"));
  assert.equal(result.completeness.invalidRows, 0);
});

test("invalid JSON and response bodies beyond the byte bound do not retry or expose raw content", async () => {
  for (const response of [
    () => new Response(`{malformed ${KEY}`, { headers: { "content-type": "application/json" } }),
    () => new Response(`{"secret":"${KEY}${"x".repeat(1000)}"}`, { headers: { "content-type": "application/json" } }),
  ]) {
    const state = setup({ respond: response });
    const result = await state.adapter.evidence.liveFixtures(bounds({ maxResponseBytes: 128,
      retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 },
    }));
    assert.equal(result.status, "failed");
    assert.equal(state.network.length, 1);
    assert.equal(JSON.stringify(result).includes(KEY), false);
  }
});

test("bounded streaming reads cancel excess bodies even without a Content-Length header", async () => {
  let cancelled = false;
  const state = setup({ respond: () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(" ".repeat(80)));
      controller.enqueue(new TextEncoder().encode(" ".repeat(80)));
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }) });
  const result = await state.adapter.evidence.liveFixtures(bounds({ maxResponseBytes: 128 }));
  assert.equal(result.status, "failed");
  assert.equal(result.error.reason, "response-too-large");
  assert.equal(cancelled, true);
  assert.equal(state.completions.length, 1);
});

test("the gateway timeout aborts and cancels a blocked response stream without another attempt", async () => {
  let cancelled = false;
  const state = setup({ respond: () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }) });
  const result = await state.adapter.evidence.liveFixtures(bounds({ timeoutMs: 30 }));
  assert.equal(result.status, "failed");
  assert.equal(state.network.length, 1);
  assert.equal(state.network[0].init.signal.aborted, true);
  assert.equal(cancelled, true);
  assert.equal(state.completions.length, 1);
  assert.equal(state.completions[0].feedback.kind, "uncertain");
});

test("stalled response bodies preserve early quota exhaustion and rate-limit header observations", async () => {
  for (const status of [200, 429]) {
    let cancelled = false;
    const state = setup({ respond: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status, headers: { "content-type": "application/json", "x-ratelimit-requests-limit": "150000",
        "x-ratelimit-requests-remaining": "0", "x-ratelimit-limit": "900", "x-ratelimit-remaining": "0",
        ...(status === 429 ? { "retry-after": "2" } : {}),
      },
    }) });
    const result = await state.adapter.evidence.liveFixtures(bounds({ timeoutMs: 40 }));
    assert.equal(result.status, "failed");
    assert.equal(cancelled, true);
    assert.equal(state.network.length, 1);
    assert.equal(state.completions.length, 1);
    assert.deepEqual(state.completions[0].feedback, {
      kind: status === 429 ? "rate-limited" : "uncertain", dailyLimit: 150000, dailyRemaining: 0,
      minuteLimit: 900, minuteRemaining: 0, ...(status === 429 ? { retryAfterMs: 2000 } : {}),
    });
    if (status === 429) {
      assert.equal(result.error.reason, "rate-limited");
      assert.equal(result.error.retryAfterMs, 2000);
    }
  }
});

test("verified unresolved-ID batch limits produce bounded groups and missing-ID metadata", async () => {
  const state = setup({ options: {
    batchEvidence: { maximumIds: 2, evidenceRef: "synthetic-batch-observation" },
    verifyBatchEvidence: (evidence) => evidence.evidenceRef === "synthetic-batch-observation",
  }, respond: (url) => jsonResponse(url, url.searchParams.get("ids") === "1-2" ? [fixture(1)] : [fixture(3)]) });
  const result = await state.adapter.evidence.unresolvedFixtures([3, 2, 1, 1], bounds());
  assert.deepEqual(state.network.map(({ url }) => url.searchParams.get("ids")), ["1-2", "3"]);
  assert.deepEqual(result.data.map(({ id }) => id), [1, 3]);
  assert.equal(result.status, "partial");
  assert.deepEqual(result.completeness.missingIds, [2]);
  assert.equal(state.reservations.length, 2);
});

test("unverified batch support uses individually reserved fixture-ID queries", async () => {
  const state = setup({ options: { batchEvidence: { maximumIds: 20, evidenceRef: "reference-alone" } },
    respond: (url) => jsonResponse(url, [fixture(Number(url.searchParams.get("id")))]) });
  const result = await state.adapter.evidence.unresolvedFixtures([2, 1], bounds());
  assert.equal(result.status, "complete");
  assert.deepEqual(state.network.map(({ url }) => url.searchParams.get("id")), ["1", "2"]);
  assert.ok(state.network.every(({ url }) => !url.searchParams.has("ids")));
  assert.equal(state.reservations.length, 2);
});

test("unexpected requested fixture identities are excluded and reported as missing coverage", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture(2)]) });
  const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  assert.equal(result.status, "partial");
  assert.equal(result.error.reason, "schema-error");
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.completeness.missingIds, [1]);
  assert.equal(result.completeness.invalidRows, 1);
  assert.equal(state.network.length, 1);
});

test("permitted fresh structured cache preserves original timestamps and avoids a new dispatch", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()]) });
  const input = bounds({ cacheMaxAgeMs: 10_000 });
  const first = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  state.setNow(NOW + 1000);
  const cached = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.equal(cached.requestsDispatched, 0);
  assert.equal(cached.provenance[0].fromCache, true);
  assert.equal(cached.provenance[0].retrievedAt, first.provenance[0].retrievedAt);
  assert.equal(cached.data[0].source.retrievedAt, NOW);
  assert.equal(cached.data[0].source.providerUpdatedAt, null);
});

test("stale cache, revoked permissions and absent cache approval require a fresh counted request", async () => {
  for (const mode of ["stale", "future", "revoked", "unapproved"]) {
    const state = setup({ respond: (url) => jsonResponse(url, [fixture()]),
      options: mode === "unapproved" ? { verifyCacheUse: undefined } : {} });
    const input = bounds({ cacheMaxAgeMs: 1000 });
    await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
    if (mode === "stale") state.setNow(NOW + 1001);
    if (mode === "future") state.setNow(NOW - 1);
    if (mode === "revoked") state.setCacheAllowed(false);
    const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
    assert.equal(result.status, "complete");
    assert.equal(state.network.length, 2);
    assert.equal(state.reservations.length, 2);
  }
});

test("a revoked operation cannot return a previously permitted cached response", async () => {
  let authorized = true;
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()]), authorize: () => {
    if (!authorized) throw new Error(`Synthetic revoked permission ${KEY}`);
  } });
  const input = bounds({ cacheMaxAgeMs: 10_000 });
  assert.equal((await state.adapter.evidence.fixtures({ fixtureId: 1 }, input)).status, "complete");
  authorized = false;
  const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(result.status, "failed");
  assert.equal(result.error.reason, "operation-not-authorized");
  assert.equal(result.data.length, 0);
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test("cache approval crossing the job deadline withholds evidence and cannot persist the expired result", async () => {
  let state;
  let expireDuringApproval = true;
  state = setup({ respond: (url) => jsonResponse(url, [fixture()]), options: {
    verifyCacheUse: () => {
      if (expireDuringApproval) state.setNow(NOW + 1000);
      return true;
    },
  } });
  const expired = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({
    deadlineAt: NOW + 1000, cacheMaxAgeMs: 10_000,
  }));
  assert.equal(expired.status, "failed");
  assert.equal(expired.error.reason, "deadline-exceeded");
  assert.deepEqual(expired.data, []);
  assert.equal(state.network.length, 1);

  expireDuringApproval = false;
  const fresh = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({ cacheMaxAgeMs: 10_000 }));
  assert.equal(fresh.status, "complete");
  assert.equal(fresh.provenance[0].fromCache, false);
  assert.equal(state.network.length, 2);
  assert.equal(state.reservations.length, 2);
});

test("the explicit structured-cache capacity evicts old entries before they can grow without bound", async () => {
  const state = setup({ options: { cacheCapacity: 2 },
    respond: (url) => jsonResponse(url, [fixture(Number(url.searchParams.get("id")))]) });
  const input = bounds({ cacheMaxAgeMs: 10_000 });
  for (const fixtureId of [1, 2, 3, 1]) {
    assert.equal((await state.adapter.evidence.fixtures({ fixtureId }, input)).status, "complete");
  }
  assert.equal(state.network.length, 4);
  assert.equal(state.reservations.length, 4);
});

test("failed or incomplete responses cannot enter the structured cache", async () => {
  for (const incomplete of [false, true]) {
    const state = setup({ respond: (url, _init, count) => count === 1
      ? jsonResponse(url, [fixture()], incomplete ? { paging: { current: 1, total: 2 } }
        : { errors: { fixture: "Synthetic unsupported coverage" } })
      : jsonResponse(url, [fixture()]) });
    const input = bounds({ cacheMaxAgeMs: 10_000 });
    assert.notEqual((await state.adapter.evidence.fixtures({ fixtureId: 1 }, input)).status, "complete");
    assert.equal((await state.adapter.evidence.fixtures({ fixtureId: 1 }, input)).status, "complete");
    assert.equal(state.network.length, 2);
    assert.equal(state.reservations.length, 2);
  }
});

test("missing requested-ID coverage cannot be cached as a complete provider response", async () => {
  const state = setup({ respond: (url, _init, count) => jsonResponse(url, count === 1 ? [] : [fixture(1)]) });
  const input = bounds({ cacheMaxAgeMs: 10_000 });
  const missing = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(missing.status, "partial");
  assert.equal(missing.error.reason, "coverage-error");
  assert.deepEqual(missing.completeness.missingIds, [1]);
  const complete = await state.adapter.evidence.fixtures({ fixtureId: 1 }, input);
  assert.equal(complete.status, "complete");
  assert.equal(complete.data[0].id, 1);
  assert.equal(state.network.length, 2);
  assert.equal(state.reservations.length, 2);
});

test("local in-flight duplicates join one protected dispatch and retain original retrieval time", async () => {
  let release, began;
  const fetching = new Promise((resolve) => { began = resolve; });
  const state = setup({ respond: (url) => { began(); return new Promise((resolve) => {
    release = () => resolve(jsonResponse(url, [fixture()]));
  }); } });
  const first = state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  await fetching;
  const second = state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  release();
  const results = await Promise.all([first, second]);
  assert.ok(results.every((result) => result.status === "complete"));
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
  assert.ok(results.every((result) => result.data[0].source.retrievedAt === NOW));
});

test("an in-flight follower respects its own deadline without launching another request", async () => {
  let release, began;
  const fetching = new Promise((resolve) => { began = resolve; });
  const state = setup({ respond: (url) => { began(); return new Promise((resolve) => {
    release = () => resolve(jsonResponse(url, [fixture()]));
  }); } });
  const first = state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  await fetching;
  const follower = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds({ deadlineAt: NOW + 20 }));
  assert.equal(follower.status, "failed");
  assert.equal(follower.error.reason, "deadline-exceeded");
  assert.equal(follower.requestsDispatched, 0);
  release();
  assert.equal((await first).status, "complete");
  assert.equal(state.network.length, 1);
  assert.equal(state.reservations.length, 1);
});

test("a fixture disappearing from the shared live response never manufactures a full-time result", async () => {
  const state = setup({ respond: (url, _init, count) => jsonResponse(url, count === 1 ? [fixture(1, "LIVE")] : []) });
  const live = await state.adapter.evidence.liveFixtures(bounds());
  const disappeared = await state.adapter.evidence.liveFixtures(bounds());
  assert.equal(live.data[0].status, "live");
  assert.equal(live.data[0].regulationScore, null);
  assert.equal(disappeared.status, "complete");
  assert.deepEqual(disappeared.data, []);
  assert.equal(state.network.length, 2);
});

test("fallback cache is scoped to one job and remains separate from evidence consumers", async () => {
  const prediction = { teams: fixture().teams, predictions: { winner: { id: 10, name: "Synthetic home" },
    win_or_draw: true, under_over: null, goals: { home: "1.5", away: "0.5" }, advice: "Synthetic provider advice",
    percent: { home: "60%", draw: "25%", away: "15%" } } };
  const state = setup({ respond: (url) => jsonResponse(url, [prediction]) });
  const input = bounds({ cacheMaxAgeMs: 10_000, cacheScope: "synthetic-job-A" });
  const first = await state.adapter.fallback.predictions(1, input);
  const cached = await state.adapter.fallback.predictions(1, input);
  const otherJob = await state.adapter.fallback.predictions(1, bounds({ ...input, cacheScope: "synthetic-job-B" }));
  assert.equal(first.data[0].purpose, "fallback-only");
  assert.equal(cached.provenance[0].fromCache, true);
  assert.equal(otherJob.provenance[0].fromCache, false);
  assert.equal(state.network.length, 2);
});

test("approved third-party logos remain URL metadata and are never fetched by the adapter", async () => {
  const state = setup({ respond: (url) => jsonResponse(url, [fixture()]), options: { verifyLogo: () => true } });
  const result = await state.adapter.evidence.fixtures({ fixtureId: 1 }, bounds());
  assert.equal(result.data[0].homeTeam.logo.url, "https://media.api-sports.io/football/teams/10.png");
  assert.equal(result.data[0].homeTeam.logo.rights, "approved");
  assert.equal(state.network.length, 1);
  assert.equal(state.network[0].url.pathname, "/fixtures");
});
