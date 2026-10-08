import assert from "node:assert/strict";
import test from "node:test";
import { createApiFootballAdapter } from "../src/server/football/api-football-adapter.ts";
import { normalizeFixture } from "../src/server/football/api-football-normalize.ts";
import { createQuotaGateway } from "../src/server/football/quota-gateway.ts";
import { createFootballEvidenceCollector } from "../src/server/evidence/evidence-football.ts";
import { evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { buildEvidenceSnapshot } from "../src/server/evidence/evidence-snapshot.ts";
import { EVIDENCE_NOW as NOW, evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy } from "./helpers/evidence-fixtures.mjs";

// This exercises the real existing adapter and quota gateway using synthetic HTTP responses and canonical records.
// No test reads credentials, contacts a provider or invents production cycle/run references.
const BASE = evidenceContext();
const uuid = (id) => `20000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
const teamUuid = (id) => id === BASE.home.externalId ? BASE.home.teamId : id === BASE.away.externalId ? BASE.away.teamId : uuid(id);
function rawFixture(id, home, away, kickoffAt = NOW - 86_400_000, status = "FT", score = { home: 2, away: 1 }) {
  return { fixture: { id, date: new Date(kickoffAt).toISOString(), timestamp: kickoffAt / 1000, timezone: "UTC", status: { short: status, elapsed: 90 } },
    league: { id: 39, name: "Synthetic league", season: 2026, country: "Synthetic country", round: "Synthetic round" },
    teams: { home: { id: home, name: `Synthetic team ${home}` }, away: { id: away, name: `Synthetic team ${away}` } },
    goals: score, score: { fulltime: score, extratime: null, penalty: null } };
}
const HOME = rawFixture(201, 10, 30), AWAY = rawFixture(202, 40, 20, NOW - 2 * 86_400_000);
function canonical(raw, changes = {}) {
  const result = normalizeFixture(raw, { endpoint: "/fixtures", retrievedAt: NOW - 1000, verifyRegulationScore: () => true });
  assert.equal(result.valid, true);
  const row = result.data;
  return { id: uuid(row.id), externalId: row.id, dataVersion: 1n, homeTeamId: teamUuid(row.homeTeam.id), awayTeamId: teamUuid(row.awayTeam.id),
    homeExternalIds: [row.homeTeam.id], awayExternalIds: [row.awayTeam.id], kickoff: row.kickoff, status: row.status, providerStatus: row.providerStatus,
    regulationScore: row.regulationScore === null ? null : { verified: true, period: "regulation-including-stoppage-time",
      home: row.regulationScore.home, away: row.regulationScore.away },
    regulationEvidenceRef: "synthetic-regulation-proof", regulationVerifiedAt: NOW - 2000, retrievedAt: NOW - 1000,
    providerUpdatedAt: null, ...changes };
}
function plan(changes = {}) {
  const base = { from: "2026-10-01", to: "2026-10-09", historyLimitPerTeam: 3, statisticsLimitPerTeam: 1,
    includeInjuries: true, includeLineups: true, maxRequests: 10, maxElapsedMs: 5000,
    bounds: { priority: "daily-inputs", deadlineAt: NOW + 60_000, timeoutMs: 1000, maxRequests: 3, maxPages: 1,
      maxRows: 50, maxResponseBytes: 100_000, cacheMaxAgeMs: 60_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 } },
    evidenceRef: "synthetic-football-evidence-proof", reuse: { evidenceRef: "synthetic-football-reuse-proof", allowSummary: true, retainUntil: NOW + 86_400_000 } };
  return { ...base, ...changes, bounds: { ...base.bounds, ...changes.bounds }, reuse: { ...base.reuse, ...changes.reuse } };
}
function jsonResponse(url, rows) {
  return new Response(JSON.stringify({ get: url.pathname.slice(1), parameters: Object.fromEntries(url.searchParams), errors: [], results: rows.length,
    paging: { current: 1, total: 1 }, response: rows }), { status: 200, headers: { "content-type": "application/json" } });
}
function setup(changes = {}) {
  let now = NOW, cacheAllowed = true;
  const sent = [], reservations = [], completions = [], lookups = [];
  const records = new Map([[BASE.externalFixtureId, { ...canonical(rawFixture(BASE.externalFixtureId, 10, 20, BASE.kickoffAt, "NS")),
    id: BASE.fixtureId, regulationScore: null, regulationVerifiedAt: null }], [201, canonical(HOME)], [202, canonical(AWAY)]]);
  for (const [id, value] of changes.records ?? []) records.set(id, value);
  const authority = evidenceAuthority(changes.authority);
  const limiter = { async reserve(request) { reservations.push(request); return { status: "reserved", permit: { requestId: request.requestId,
    periodId: evidenceHash("synthetic-period"), ownerToken: evidenceHash(request.requestId), dispatchedAt: now, launchBefore: now + 1000 } }; },
  async claimLaunch(permit) { const request = reservations.find((value) => value.requestId === permit.requestId); return { status: "claimed", timeoutMs: request.timeoutMs }; },
  async complete(permit, feedback) { completions.push({ permit, feedback }); return { status: "recorded" }; } };
  const gateway = createQuotaGateway({ limiter, authorize() {} });
  const adapter = createApiFootballAdapter({ accountId: evidenceHash("synthetic-account"), credential: { read: () => "synthetic-provider-key" }, gateway,
    authorize() {}, clock: { now: () => now }, verifyCacheUse: () => cacheAllowed, verifyRegulationScore: () => true,
    sleep: async (milliseconds) => { now += milliseconds; }, random: () => 0,
    fetcher: async (input, init) => {
      const url = new URL(input); sent.push({ url, init });
      if (changes.respond) return changes.respond(url, init, sent.length);
      if (url.pathname === "/fixtures") return jsonResponse(url, url.searchParams.get("team") === "10" ? changes.homeRows ?? [HOME] : changes.awayRows ?? [AWAY]);
      if (url.pathname === "/fixtures/statistics") return jsonResponse(url, [{ team: { id: url.searchParams.get("fixture") === "201" ? 10 : 20 },
        statistics: [{ type: "Shots on Goal", value: 4 }, { type: "Ball Possession", value: "55%" }, { type: "expected_goals", value: "1.2" }] }]);
      if (url.pathname === "/injuries") return jsonResponse(url, [{ fixture: { id: 101 }, team: { id: 10 },
        player: { id: 501, name: "Synthetic player", type: "Missing Fixture", reason: "Synthetic ankle injury" } }]);
      if (url.pathname === "/fixtures/lineups") return jsonResponse(url, [{ team: { id: 20 }, formation: "4-4-2",
        startXI: [{ player: { id: 502, name: "Synthetic starter", number: 7, pos: "M", grid: "2:3" } }], substitutes: [] }]);
      throw new Error("Unexpected synthetic endpoint.");
    } });
  const evidenceAdapter = changes.adapter ? changes.adapter(adapter.evidence) : adapter.evidence;
  const collector = createFootballEvidenceCollector({ adapter: evidenceAdapter, catalog: {
    async fixtureByProviderId(id) { lookups.push(id); return changes.catalog ? changes.catalog(id, records) : records.get(id) ?? null; },
  }, authority, clock: { now: () => now }, verifyPlan: changes.verifyPlan ?? (() => true), verifyFootball: changes.verifyFootball ?? (() => true) });
  return { adapter, collector, authority, records, sent, reservations, completions, lookups,
    setNow(value) { now = value; }, setCacheAllowed(value) { cacheAllowed = value; } };
}
const claims = (collection, kind) => collection.sources.flatMap((source) => source.claims.filter((claim) => claim.kind === kind));

test("football evidence uses existing protected adapter with canonical regulation history and inert missingness", async () => {
  const h = setup(), policy = evidencePolicy();
  const collected = await h.collector.collect(BASE, policy, plan());
  assert.equal(collected.requestsDispatched, 6); assert.equal(collected.requestCountUnknown, false);
  assert.equal(h.sent.length, 6); assert.equal(h.reservations.length, 6); assert.equal(h.completions.length, 6);
  assert.equal(h.sent.some(({ url }) => url.pathname === "/predictions"), false);
  assert.equal(claims(collected, "history").length, 2); assert.equal(claims(collected, "form").length, 2);
  assert.equal(claims(collected, "rest").length, 2); assert.equal(claims(collected, "statistic").length, 4);
  assert.equal(claims(collected, "injury")[0].value.status, "reported"); assert.equal(claims(collected, "lineup")[0].value.role, "starting");
  assert.equal(claims(collected, "xg").length, 0);
  assert.equal(claims(collected, "venue").every((claim) => claim.value.neutral === null), true);
  const snapshot = buildEvidenceSnapshot({ context: BASE, policy, sources: collected.sources }, h.authority);
  assert.equal(snapshot.context.cycleId, null); assert.equal(snapshot.context.runId, null);
  assert.equal(snapshot.coverage.sufficient, true); assert.deepEqual(snapshot.coverage.labels, ["Limited news coverage"]);
});

test("form uses verified regulation scores and opponent orientation, never extra time or penalties", async () => {
  const home = rawFixture(203, 30, 10, NOW - 86_400_000, "PEN", { home: 1, away: 2 });
  home.goals = { home: 4, away: 4 }; home.score.extratime = { home: 4, away: 4 }; home.score.penalty = { home: 5, away: 4 };
  const h = setup({ homeRows: [home], records: [[203, canonical(home)]] });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ statisticsLimitPerTeam: 0, includeInjuries: false, includeLineups: false }));
  const form = claims(result, "form").find((claim) => claim.subjectTeamId === BASE.home.teamId);
  assert.equal(form.value.wins, 1); assert.equal(form.value.goalsFor, 2); assert.equal(form.value.goalsAgainst, 1); assert.equal(form.value.points, 3);
  assert.equal(claims(result, "history").find((claim) => claim.subjectTeamId === BASE.home.teamId).value.period, "regulation-including-stoppage-time");
});

test("wrong canonical fixture, team alias, version and kickoff context fail before provider I/O", async () => {
  for (const changed of [{ dataVersion: 2n }, { homeTeamId: BASE.away.teamId }, { kickoff: BASE.kickoffAt + 1000 },
    { externalId: 999 }, { homeExternalIds: [999] }, { awayExternalIds: [999] }]) {
    const h = setup(); Object.assign(h.records.get(101), changed);
    await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan()), /Fixture evidence is invalid/);
    assert.equal(h.sent.length, 0);
  }
});

test("catalog aliases remain many-to-one without choosing an invented primary provider ID", async () => {
  const h = setup(); h.records.get(101).homeExternalIds = [10, 99]; h.records.get(201).homeExternalIds = [10, 99];
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ statisticsLimitPerTeam: 0, includeInjuries: false, includeLineups: false }));
  assert.equal(claims(result, "history").filter((claim) => claim.subjectTeamId === BASE.home.teamId).length, 1);
});

test("history must match canonical external aliases, internal orientation, score and verification availability", async () => {
  for (const changed of [{ homeTeamId: BASE.away.teamId }, { homeExternalIds: [999] }, { awayExternalIds: [999] },
    { kickoff: NOW - 2 * 86_400_000 }, { externalId: 999 }, { status: "scheduled" }, { providerStatus: "AET" },
    { regulationScore: { verified: true, period: "regulation-including-stoppage-time", home: 9, away: 1 } },
    { regulationVerifiedAt: NOW + 1 }, { retrievedAt: NOW + 1 }, { regulationEvidenceRef: null }]) {
    const h = setup(); Object.assign(h.records.get(201), changed);
    const result = await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
    assert.equal(claims(result, "history").some((claim) => claim.subjectTeamId === BASE.home.teamId), false);
    assert.equal(claims(result, "form").some((claim) => claim.subjectTeamId === BASE.home.teamId), false);
    assert.equal(h.sent.some(({ url }) => url.pathname === "/fixtures/statistics" && url.searchParams.get("fixture") === "201"), false);
  }
});

test("wrong-team, future-kickoff, scheduled and current-fixture rows cannot enter historical form", async () => {
  const rows = [rawFixture(211, 50, 60), rawFixture(212, 10, 30, NOW + 1000), rawFixture(213, 10, 30, NOW - 86_400_000, "NS"),
    rawFixture(101, 10, 20, NOW - 86_400_000), HOME];
  const h = setup({ homeRows: rows });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ statisticsLimitPerTeam: 0, includeInjuries: false, includeLineups: false }));
  const home = claims(result, "history").filter((claim) => claim.subjectTeamId === BASE.home.teamId);
  assert.deepEqual(home.map((claim) => claim.value.fixtureId), [201]);
  assert.equal(claims(result, "form").find((claim) => claim.subjectTeamId === BASE.home.teamId).value.matches, 1);
});

test("history fetched after cutoff remains excluded and cannot produce older-looking form or statistics", async () => {
  const h = setup(); h.setNow(NOW + 1000);
  const context = { ...BASE, analysisAt: NOW + 1000 };
  const result = await h.collector.collect(context, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
  assert.equal(claims(result, "history").length, 2); assert.equal(claims(result, "form").length, 0);
  assert.equal(claims(result, "rest").length, 0); assert.equal(claims(result, "statistic").length, 0);
  assert.equal(h.sent.some(({ url }) => url.pathname === "/fixtures/statistics"), false);
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: result.sources }, h.authority);
  assert.equal(snapshot.exclusions.filter((excluded) => excluded.reason === "future").length, 2);
  assert.equal(snapshot.facts.some((fact) => fact.kind === "history" || fact.kind === "form"), false);
});

test("strict unknown-clock and stale policies prevent derived form/rest and paid statistics", async () => {
  for (const policy of [evidencePolicy({ freshness: { football: { maxAgeMs: 60_000, basis: "retrieved", unknownTimestamp: "exclude", conflicts: "preserve" } } }),
    evidencePolicy({ freshness: { football: { maxAgeMs: 0, basis: "retrieved", unknownTimestamp: "allow-flagged", conflicts: "preserve" } } })]) {
    const h = setup();
    await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
    h.setNow(NOW + 100);
    const result = await h.collector.collect({ ...BASE, analysisAt: NOW + 100, cutoffAt: NOW + 100 }, policy,
      plan({ includeInjuries: false, includeLineups: false }));
    assert.equal(claims(result, "form").length, 0); assert.equal(claims(result, "rest").length, 0);
    assert.equal(result.requestsDispatched, 0);
  }
});

test("unaligned endpoint/query/row provenance is withheld even when an external verifier approves", async () => {
  for (const change of [
    (result) => { result.provenance[0].endpoint = "predictions"; },
    (result) => { result.provenance[0].requestParameters.team = "999"; },
    (result) => { result.provenance[0].requestParameters.ignored = "unsafe"; },
    (result) => { result.provenance[0].contractVersion = "invented"; },
    (result) => { result.data[0].source.retrievedAt--; },
    (result) => { result.data[0].homeTeam.source.retrievedAt--; },
  ]) {
    const h = setup({ adapter(real) { return { ...real, async fixtures(query, bounds) {
      const result = structuredClone(await real.fixtures(query, bounds)); if (query.teamId === 10) change(result); return result;
    } }; } });
    const result = await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
    assert.equal(claims(result, "history").some((claim) => claim.subjectTeamId === BASE.home.teamId), false);
    assert.equal(result.issues.some((issue) => issue.kind === "history" && issue.reason === "unverified"), true);
  }
});

test("statistics are fixture-query bound, team scoped, and unsupported xG remains unavailable", async () => {
  const h = setup({ adapter(real) { return { ...real, async statistics(id, bounds) {
    const result = structuredClone(await real.statistics(id, bounds));
    if (id === 201) result.provenance[0].requestParameters.fixture = "999";
    return result;
  } }; } });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
  assert.equal(claims(result, "statistic").some((claim) => claim.subjectTeamId === BASE.home.teamId), false);
  assert.equal(claims(result, "statistic").filter((claim) => claim.subjectTeamId === BASE.away.teamId).length, 2);
  assert.equal(claims(result, "xg").length, 0);
});

test("missing injury/lineup responses remain unknown and wrong-fixture absence rows are excluded", async () => {
  const h = setup({ respond(url) {
    if (url.pathname === "/fixtures") return jsonResponse(url, []);
    if (url.pathname === "/injuries") return jsonResponse(url, [{ fixture: { id: 999 }, team: { id: 10 }, player: { id: 501 } }]);
    return jsonResponse(url, []);
  } });
  const policy = evidencePolicy(), result = await h.collector.collect(BASE, policy, plan());
  assert.equal(claims(result, "injury").length, 0); assert.equal(claims(result, "lineup").length, 0);
  const snapshot = buildEvidenceSnapshot({ context: BASE, policy, sources: result.sources }, h.authority);
  assert.equal(snapshot.missingness.some((entry) => entry.kind === "injury" && entry.subjectTeamId === BASE.home.teamId), true);
  assert.equal(snapshot.facts.some((fact) => fact.values.some((value) => value.value.status === "fit")), false);
});

test("all retries and endpoints consume the shared confirmed request budget", async () => {
  const h = setup();
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ maxRequests: 2 }));
  assert.equal(result.requestsDispatched, 2); assert.equal(h.sent.length, 2); assert.equal(h.reservations.length, 2);
  assert.equal(result.issues.some((issue) => issue.reason === "request-limit"), true);
  assert.equal(h.sent.some(({ url }) => url.pathname === "/injuries" || url.pathname === "/fixtures/lineups"), false);
});

test("adapter cache reuse preserves all original observation times and dispatches zero new calls", async () => {
  const h = setup(), policy = evidencePolicy(), selected = plan();
  const first = await h.collector.collect(BASE, policy, selected); h.setNow(NOW + 1000);
  const reused = await h.collector.collect({ ...BASE, analysisAt: NOW + 1000, cutoffAt: NOW + 1000 }, policy, selected);
  assert.equal(first.requestsDispatched, 6); assert.equal(reused.requestsDispatched, 0); assert.equal(h.sent.length, 6);
  assert.deepEqual(reused.sources.map((source) => [source.id, source.retrievedAt, source.providerUpdatedAt]),
    first.sources.map((source) => [source.id, source.retrievedAt, source.providerUpdatedAt]));
  h.setCacheAllowed(false);
  const rejectedCache = await h.collector.collect({ ...BASE, analysisAt: NOW + 2000, cutoffAt: NOW + 2000 }, policy, selected);
  assert.equal(rejectedCache.requestsDispatched, 6); assert.equal(h.sent.length, 12);
});

test("deadline expiry after a counted dispatch stops later calls and preserves an explicitly unknown count", async () => {
  const h = setup({ respond(url) {
    // Advance only after the real adapter/gateway has dispatched, avoiding scheduler-dependent pre-dispatch timeouts.
    h.setNow(NOW + 5000); return jsonResponse(url, [HOME]);
  } });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ maxElapsedMs: 5000, bounds: { timeoutMs: 5000 } }));
  assert.equal(result.requestCountUnknown, true); assert.equal(h.sent.length, 1); assert.equal(h.reservations.length, 1);
  assert.equal(result.issues.some((issue) => issue.reason === "timeout"), true);
  assert.equal(h.sent.length, 1);
});

test("an uncertain adapter transport suppresses all later calls and retains the counted attempt", async () => {
  const h = setup({ respond() { throw new Error("synthetic-private-secret"); } });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan());
  assert.equal(result.requestsDispatched, 1); assert.equal(result.requestCountUnknown, true); assert.equal(h.sent.length, 1);
  assert.equal(h.completions[0].feedback.kind, "uncertain"); assert.equal(evidenceSerialize(result).includes("synthetic-private-secret"), false);
});

test("authorization, plan verification and source retention remain fail closed", async () => {
  for (const changes of [{ authority: { authorize() { throw new Error("synthetic-private-secret"); } } }, { verifyPlan: () => false }]) {
    const h = setup(changes);
    await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan()), (error) => error.reason === "not-authorized" && !error.message.includes("synthetic-private-secret"));
    assert.equal(h.sent.length, 0); assert.equal(h.lookups.length, 0);
  }
  const h = setup({ authority: { verifyReuse: () => false } });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
  assert.equal(result.sources.length, 0); assert.equal(claims(result, "form").length, 0); assert.equal(h.sent.length, 2);
});

test("strict existing adapter bounds and plan references reject malformed inputs before any I/O", async () => {
  for (const changed of [{ bounds: { priority: "invented" } }, { bounds: { deadlineAt: NaN } }, { bounds: { timeoutMs: 2_147_483_648 } },
    { bounds: { retry: { maxAttempts: 1, baseDelayMs: 2, maxDelayMs: 1 } } }, { bounds: { unexpected: true } },
    { maxRequests: 0 }, { historyLimitPerTeam: 0 }, { statisticsLimitPerTeam: 4 }, { from: "2026-10-10" },
    { to: "2026-10-10" }, { reuse: { allowSummary: false } }, { reuse: { retainUntil: NOW - 1 } }, { evidenceRef: "secret\nvalue" }]) {
    const h = setup(); await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan(changed)), /Fixture evidence is invalid/);
    assert.equal(h.sent.length, 0); assert.equal(h.lookups.length, 0);
  }
});

test("private catalog failures expose only a sanitized evidence error", async () => {
  const h = setup({ catalog() { throw new Error("synthetic-private-database-url"); } });
  await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan()), (error) => !error.message.includes("synthetic-private-database-url"));
  assert.equal(h.sent.length, 0);
});

test("workflow abortion before collection prevents catalog and provider I/O", async () => {
  const h = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan(), { signal: controller.signal, deadlineAt: NOW + 1000, check() {} }),
    /Fixture evidence is invalid/);
  assert.equal(h.lookups.length, 0); assert.equal(h.sent.length, 0);
});

test("workflow abortion drains a pending provider and forbids retries or later endpoints", async () => {
  let release;
  const controller = new AbortController();
  const h = setup({ respond(url) { queueMicrotask(() => controller.abort());
    return new Promise((resolve) => { release = () => resolve(jsonResponse(url, [HOME])); }); } });
  await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan({ bounds: { retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 } } }),
    { signal: controller.signal, deadlineAt: NOW + 1000, check() {} }), /Fixture evidence is invalid/);
  assert.equal(h.sent.length, 1); assert.equal(h.reservations.length, 1);
  release(); await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(h.sent.length, 1);
});

test("workflow global checks run immediately before provider stages and shorten dispatch deadlines", async () => {
  let active = true;
  const controller = new AbortController();
  const h = setup({ catalog(id, records) { queueMicrotask(() => { active = false; }); return records.get(id); } });
  await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan(), { signal: controller.signal, deadlineAt: NOW + 1000,
    check() { if (!active) throw new Error("Synthetic overall deadline expired."); } }), /Fixture evidence is invalid/);
  assert.equal(h.sent.length, 0);
  const limited = setup();
  await limited.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }),
    { signal: controller.signal, deadlineAt: NOW + 500, check() {} });
  assert.equal(limited.reservations.every((request) => request.deadlineAt === NOW + 500 && request.timeoutMs <= 500), true);
});

test("source permissions are rechecked before derived facts and subsequent paid statistics", async () => {
  let permitted = true;
  const newer = rawFixture(203, 10, 30, NOW - 2 * 86_400_000);
  const h = setup({ homeRows: [HOME, newer], records: [[203, canonical(newer)]], authority: { verifyReuse: () => permitted },
    catalog(id, records) { if (id === 203) permitted = false; return records.get(id); } });
  await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan()), (error) => error.reason === "not-authorized");
  assert.equal(h.sent.length, 1); assert.equal(h.sent.some(({ url }) => url.pathname === "/fixtures/statistics"), false);
});

test("async authority hooks fail closed and reject promises without worker errors", async () => {
  for (const changes of [{ authority: { async authorize() { throw new Error("Synthetic private authorization."); } } },
    { authority: { async verifyContext() { throw new Error("Synthetic private context."); } } },
    { authority: { async verifyPolicy() { throw new Error("Synthetic private policy."); } } },
    { async verifyPlan() { throw new Error("Synthetic private plan."); } }]) {
    const h = setup(changes);
    await assert.rejects(h.collector.collect(BASE, evidencePolicy(), plan()), (error) => error.reason === "not-authorized");
    assert.equal(h.sent.length, 0); assert.equal(h.lookups.length, 0); await new Promise((resolve) => setImmediate(resolve));
  }
  const h = setup({ async verifyFootball() { throw new Error("Synthetic private source evidence."); } });
  const result = await h.collector.collect(BASE, evidencePolicy(), plan({ includeInjuries: false, includeLineups: false }));
  assert.equal(claims(result, "history").length, 0); await new Promise((resolve) => setImmediate(resolve));
});

test("source retention is checked against the current clock even for an older analysis context", async () => {
  const h = setup(), selected = plan({ reuse: { retainUntil: NOW + 500 }, includeInjuries: false, includeLineups: false });
  await h.collector.collect(BASE, evidencePolicy(), selected);
  const initialRequests = h.sent.length; h.setNow(NOW + 1000);
  const result = await h.collector.collect(BASE, evidencePolicy(), selected);
  assert.equal(result.sources.length, 0); assert.equal(claims(result, "form").length, 0);
  assert.equal(result.requestsDispatched, 0); assert.equal(h.sent.length, initialRequests);
});
