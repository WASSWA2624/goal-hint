import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getReportingDate, parseUtcInstant } from "../src/domain/calendar.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { normalizeFixture, normalizeTeam, normalizeCompetition } from "../src/server/football/api-football-normalize.ts";
import { CatalogInputError, catalogRequestFingerprint, catalogScopeKey, isSafeCatalogLogo, normalizeCatalogSearch,
  assertCatalogPreparedBatch, parseCatalogEvidenceRef, parseCatalogImportRequest, parseCatalogTeamMapping,
  validateCatalogBatch } from "../src/server/football/catalog-input.ts";

// All identities, permissions and observations are synthetic contract fixtures.
// They never qualify live provider evidence and perform no network or database I/O.
const NOW = parseUtcInstant("2026-10-09T00:00:00.000Z");
const clock = { now: () => NOW };
const clone = (value) => structuredClone(value);
const request = (selection = { kind: "fixtures", query: { date: "2026-10-09" } }, extra = {}) => ({
  id: randomUUID(), selection,
  bounds: { priority: "daily-inputs", deadlineAt: NOW + 60_000, timeoutMs: 1000, maxRequests: 5, maxPages: 5,
    maxRows: 100, maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
  retentionEvidenceRef: "synthetic-retention-evidence", ...extra,
});
const authority = (extra = {}) => ({
  authorize() {}, verifyRetention: () => true, verifyObservation: () => true,
  verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => true,
  regulationEvidenceRef: () => "synthetic-regulation-score-evidence", verifyKnownSubset: () => true, ...extra,
});
function fixture(id = 1, status = "FT", date = "2026-10-09T00:00:00+03:00") {
  const normalized = normalizeFixture({ fixture: { id, date, timezone: "Africa/Kampala", timestamp: Date.parse(date) / 1000,
    status: { short: status, elapsed: 90 } }, league: { id: 39, name: "Synthetic League", country: "Synthetic Country", season: 2026, round: "Round 1" },
  teams: { home: { id: 10, name: "Étoile FC", code: "ETO", logo: "https://media.example.test/home.png" },
    away: { id: 20, name: "Synthetic Away", logo: "https://media.example.test/away.png" } },
  goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 }, extratime: { home: 3, away: 2 }, penalty: { home: 5, away: 4 } } },
  { retrievedAt: NOW - 1000, endpoint: "/fixtures", verifyLogo: () => true, verifyRegulationScore: () => true });
  assert.equal(normalized.valid, true);
  return clone(normalized.data);
}
function result(rows = [], endpoint = "fixtures", parameters = { date: "2026-10-09", timezone: "Africa/Kampala" }) {
  return { status: "complete", data: rows, completeness: { complete: true, reasons: [], missingIds: [],
    missingCoverage: ["provider-update-time"], invalidRows: 0 }, provenance: [{ provider: "api-football", endpoint,
    requestParameters: parameters, contractVersion: API_FOOTBALL_CONTRACT_VERSION, retrievedAt: NOW - 1000,
    providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1,
    quota: { kind: "success", dailyRemaining: 98_765 } }], requestsDispatched: 1, error: null };
}
const prepare = (input = request(), observation = result([fixture()]), permissions = authority(), customClock = clock) =>
  validateCatalogBatch(input, observation, permissions, customClock);
const inputError = (reason) => (error) => error instanceof CatalogInputError && error.reason === reason &&
  !error.message.includes("synthetic-private-key");

test("strict immutable request contracts reject unsupported scopes, unsafe widths and malformed dates", () => {
  const cases = [
    { kind: "fixtures", query: {} }, { kind: "fixtures", query: { date: undefined } },
    { kind: "fixtures", query: { date: "2026-02-30" } }, { kind: "fixtures", query: { date: "0999-01-01" } },
    { kind: "fixtures", query: { competitionId: 39 } }, { kind: "fixtures", query: { season: 2026 } },
    { kind: "fixtures", query: { from: "2026-10-09" } }, { kind: "fixtures", query: { from: "2026-10-10", to: "2026-10-09" } },
    { kind: "fixtures", query: { date: "2026-10-09", from: "2026-10-09", to: "2026-10-10" } },
    { kind: "fixtures", query: { fixtureId: 1, date: "2026-10-09" } },
    { kind: "fixtures", query: { teamId: Number.MAX_SAFE_INTEGER + 1 } }, { kind: "fixtures", query: { teamId: 10, round: "Round 1" } },
    { kind: "teams", query: { teamId: 10, competitionId: 39 } }, { kind: "competitions", query: { apiKey: "synthetic-private-key" } },
  ];
  for (const selection of cases) assert.throws(() => parseCatalogImportRequest(request(selection)), inputError("invalid-request"));
  const parsed = parseCatalogImportRequest(request());
  assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.selection.query));
  assert.throws(() => { parsed.selection.query.date = "2026-10-10"; }, TypeError);
});

test("caller bounds and explicit known-subset intent remain mandatory and validated", () => {
  const invalidBounds = [{ maxRequests: 0 }, { timeoutMs: 2_147_483_648 }, { deadlineAt: Number.NaN },
    { retry: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 9 } }, { cacheMaxAgeMs: -1 }];
  for (const changes of invalidBounds) {
    const input = request(); input.bounds = { ...input.bounds, ...changes };
    assert.throws(() => parseCatalogImportRequest(input), inputError("invalid-request"));
  }
  assert.throws(() => parseCatalogImportRequest(request(undefined, { knownSubset: { fixtureIds: [1, 1], evidenceRef: "synthetic-proof" } })), inputError("invalid-request"));
  assert.throws(() => parseCatalogImportRequest(request({ kind: "teams", query: { teamId: 10 } },
    { knownSubset: { fixtureIds: [1], evidenceRef: "synthetic-proof" } })), inputError("invalid-request"));
});

test("request fingerprints ignore object key order and preserve every immutable authorization bound", () => {
  const input = request({ kind: "fixtures", query: { competitionId: 39, season: 2026, date: "2026-10-09" } });
  const reordered = { ...input, selection: { query: { date: "2026-10-09", season: 2026, competitionId: 39 }, kind: "fixtures" } };
  assert.equal(catalogRequestFingerprint(input), catalogRequestFingerprint(reordered));
  const changed = clone(input); changed.bounds.maxRequests++;
  assert.notEqual(catalogRequestFingerprint(input), catalogRequestFingerprint(changed));
  const optional = clone(input); optional.bounds.cacheScope = undefined;
  assert.equal(catalogRequestFingerprint(input), catalogRequestFingerprint(optional));
  assert.equal(catalogScopeKey(input.selection), catalogScopeKey(reordered.selection));
  assert.equal(catalogRequestFingerprint(input), catalogRequestFingerprint({ ...input, id: input.id.toUpperCase() }));
});

test("aliases use Unicode normalization and case-insensitive whitespace without discarding accents", () => {
  assert.equal(normalizeCatalogSearch("  ＦＣ\tÉTOILE  "), "fc étoile");
  assert.equal(normalizeCatalogSearch("E\u0301toile FC"), "étoile fc");
  assert.notEqual(normalizeCatalogSearch("Étoile FC"), normalizeCatalogSearch("Etoile FC"));
  assert.throws(() => normalizeCatalogSearch("x".repeat(513)), inputError("invalid-request"));
  assert.throws(() => normalizeCatalogSearch("\ufdfa".repeat(40)), inputError("invalid-request"));
});

test("alternate identity candidates require attributable distinct numeric identities", () => {
  const mapping = { externalId: 10, candidateExternalId: 11, evidenceRef: null, sourceRef: "synthetic-private-review", observedAt: NOW };
  assert.ok(Object.isFrozen(parseCatalogTeamMapping(mapping)));
  for (const invalid of [{ ...mapping, candidateExternalId: 10 }, { ...mapping, candidateExternalId: Number.MAX_SAFE_INTEGER + 1 },
    { ...mapping, sourceRef: "https://source.example.test/evidence?apiKey=synthetic-private-key" }, { ...mapping, name: "Name cannot establish identity" }]) {
    assert.throws(() => parseCatalogTeamMapping(invalid), inputError("invalid-mapping"));
  }
});

test("provider identities above 32 bits retain the full 007 safe integer contract", () => {
  const id = 4_294_967_296;
  const input = request({ kind: "fixtures", query: { fixtureId: id } });
  const batch = prepare(input, result([fixture(id)], "fixtures", { id: String(id), timezone: "Africa/Kampala" }));
  assert.equal(batch.rows.fixtures[0].id, id);
  assert.equal(batch.status, "complete");
  assert.equal(parseCatalogTeamMapping({ externalId: id, candidateExternalId: Number.MAX_SAFE_INTEGER,
    evidenceRef: null, sourceRef: "synthetic-private-review", observedAt: NOW }).candidateExternalId, Number.MAX_SAFE_INTEGER);
});

test("only original deeply frozen validator results may enter catalog persistence", () => {
  const permissions = authority(), batch = prepare(request(), result([fixture()]), permissions);
  assert.doesNotThrow(() => assertCatalogPreparedBatch(batch));
  assert.doesNotThrow(() => assertCatalogPreparedBatch(batch, permissions));
  assert.throws(() => assertCatalogPreparedBatch(batch, authority()), inputError("invalid-result"));
  for (const forged of [null, undefined, "batch", {}, clone(batch), Object.freeze({ ...batch })]) {
    assert.throws(() => assertCatalogPreparedBatch(forged), inputError("invalid-result"));
  }
  assert.ok(Object.isFrozen(batch.rows.fixtures[0].homeTeam.source));
  assert.throws(() => { batch.rows.fixtures[0].homeTeam.id = 999; }, TypeError);
});

test("shared evidence reference parsing withholds malformed and credential-bearing private values", () => {
  assert.equal(parseCatalogEvidenceRef("synthetic-attributable-proof"), "synthetic-attributable-proof");
  assert.equal(parseCatalogEvidenceRef("https://evidence.example.test/record"), "https://evidence.example.test/record");
  for (const value of [null, "", " invalid ", "line\nbreak", "x".repeat(513),
    "https://evidence.example.test/record?token=synthetic-private-key", "https://user:synthetic-private-key@evidence.example.test/record"]) {
    assert.throws(() => parseCatalogEvidenceRef(value), inputError("invalid-request"));
  }
});

test("complete empty requires verified, exactly scoped successful retrieval while absent update time stays unknown", () => {
  const batch = prepare(request(), result([]));
  assert.equal(batch.status, "complete"); assert.equal(batch.completeEmpty, true);
  assert.equal(batch.observedAt, NOW - 1000); assert.equal(batch.latestRetrievedAt, NOW - 1000);
  assert.deepEqual(batch.missingCoverage, ["provider-update-time"]);
  assert.equal(batch.provenance[0].providerUpdatedAt, null);
  assert.equal("quota" in batch.provenance[0], false);
  assert.equal(JSON.stringify(batch).includes("98765"), false);
});

test("empty invalid, partial and failed responses never establish an empty date", () => {
  const cases = [];
  const partial = result([]); partial.status = "partial"; partial.completeness.complete = false; cases.push(partial);
  const missing = result([]); missing.completeness.missingIds = [1]; cases.push(missing);
  const invalid = result([]); invalid.completeness.invalidRows = 1; cases.push(invalid);
  const noSource = result([]); noSource.provenance = []; cases.push(noSource);
  const paging = result([]); paging.provenance[0].totalPages = 2; cases.push(paging);
  const failed = result([]); failed.status = "failed"; failed.error = { reason: "transport-error", retryable: true }; cases.push(failed);
  const feedback = result([]); feedback.provenance[0].quota.kind = "provider-error"; cases.push(feedback);
  for (const observation of cases) {
    const batch = prepare(request(), observation);
    assert.equal(batch.status, "failed"); assert.equal(batch.completeEmpty, false);
  }
});

test("a complete fixed-fixture response missing its requested identity is incomplete", () => {
  const batch = prepare(request({ kind: "fixtures", query: { fixtureId: 1 } }), result([], "fixtures", { id: "1", timezone: "Africa/Kampala" }));
  assert.equal(batch.status, "failed"); assert.deepEqual(batch.missingIds, [1]); assert.equal(batch.completeEmpty, false);
});

test("all catalog retention and observation gates are real verifier hooks rather than evidence labels", () => {
  assert.throws(() => prepare(request(), result([]), authority({ authorize() { throw new Error("synthetic-private-key"); } })), inputError("operation-not-authorized"));
  assert.throws(() => prepare(request(), result([]), authority({ verifyRetention: () => false })), inputError("retention-not-authorized"));
  assert.throws(() => prepare(request(), result([]), authority({ verifyObservation: () => false })), inputError("unverified-observation"));
  assert.throws(() => prepare(request(), result([]), authority({ verifyObservation() { throw new Error("synthetic-private-key"); } })), inputError("unverified-observation"));
  let permission;
  prepare(request(), result([]), authority({ verifyRetention(value) { permission = value; return true; } }));
  assert.equal(permission.purpose, "structured-catalog-and-audit-history"); assert.equal(permission.rawPayloadsStored, false);
});

test("source endpoint, contract version, query echo, UTC chronology and shape cannot be forged complete", () => {
  const mutate = [
    (page) => { page.endpoint = "teams"; }, (page) => { page.contractVersion = "unverified-v4"; },
    (page) => { page.requestParameters = { date: "2026-10-10", timezone: "Africa/Kampala" }; },
    (page) => { page.requestParameters.extra = "synthetic-private-key"; }, (page) => { delete page.requestParameters.date; },
    (page) => { page.retrievedAt = NOW + 1; }, (page) => { page.providerUpdatedAt = NOW; },
    (page) => { page.rawPayload = "synthetic-private-key"; }, (page) => { page.retrievedAt = Date.parse("0999-12-31T00:00:00Z"); },
  ];
  for (const modify of mutate) {
    const observation = result([]); modify(observation.provenance[0]);
    const batch = prepare(request(), observation);
    assert.equal(batch.status, "failed"); assert.equal(batch.completeEmpty, false);
    assert.equal(JSON.stringify(batch).includes("synthetic-private-key"), false);
  }
});

test("malformed top-level results and count overruns are rejected without retaining diagnostics", () => {
  for (const changes of [{ requestsDispatched: 6 }, { rawPayload: "synthetic-private-key" },
    { error: { reason: "schema-error", retryable: false, diagnostics: "synthetic-private-key" } },
    { completeness: { complete: true, reasons: ["synthetic-private-key"], missingIds: [], missingCoverage: [], invalidRows: 0 } }]) {
    assert.throws(() => prepare(request(), { ...result([]), ...changes }), inputError("invalid-result"));
  }
});

test("the EAT midnight boundary is reused for date and inclusive range correlations", () => {
  const midnight = fixture(); assert.equal(getReportingDate(midnight.kickoff), "2026-10-09");
  assert.equal(prepare(request(), result([midnight])).status, "complete");
  const beforeMidnight = fixture(2, "NS", "2026-10-08T23:59:59+03:00");
  const rejected = prepare(request(), result([beforeMidnight]));
  assert.equal(rejected.status, "failed"); assert.equal(rejected.invalidRows, 1);
  const input = request({ kind: "fixtures", query: { from: "2026-10-08", to: "2026-10-09" } });
  assert.equal(prepare(input, result([beforeMidnight, midnight], "fixtures", { from: "2026-10-08", to: "2026-10-09", timezone: "Africa/Kampala" })).status, "complete");
});

test("competition, season, team, round and fixture identity constraints reject out-of-scope rows", () => {
  const cases = [
    [{ competitionId: 40, season: 2026 }, { league: "40", season: "2026", timezone: "Africa/Kampala" }],
    [{ competitionId: 39, season: 2025 }, { league: "39", season: "2025", timezone: "Africa/Kampala" }],
    [{ teamId: 99 }, { team: "99", timezone: "Africa/Kampala" }],
    [{ competitionId: 39, season: 2026, round: "Round 2" }, { league: "39", season: "2026", round: "Round 2", timezone: "Africa/Kampala" }],
    [{ fixtureId: 2 }, { id: "2", timezone: "Africa/Kampala" }],
  ];
  for (const [query, params] of cases) {
    const batch = prepare(request({ kind: "fixtures", query }), result([fixture()], "fixtures", params));
    assert.equal(batch.rows.fixtures.length, 0); assert.equal(batch.completeEmpty, false);
  }
});

test("embedded sources retain independent original timestamps and must correlate to observed provenance", () => {
  const mutate = [(row) => { row.homeTeam.source.retrievedAt++; }, (row) => { row.awayTeam.source.endpoint = "/teams"; },
    (row) => { row.competition.source.providerUpdatedAt = NOW; }, (row) => { row.source.provider = "other-provider"; }];
  for (const modify of mutate) {
    const row = fixture(); modify(row);
    const batch = prepare(request(), result([row])); assert.equal(batch.rows.fixtures.length, 0); assert.equal(batch.status, "failed");
  }
});

test("duplicate rows, unknown normalized fields and SQL-width overflow retain only valid rows and partial audit", () => {
  const oversized = fixture(2); oversized.homeTeam.code = "X".repeat(65);
  const rawLeak = fixture(3); rawLeak.rawProviderResponse = "synthetic-private-key";
  const expanded = fixture(4); expanded.homeTeam.name = "\ufdfa".repeat(40);
  const country = fixture(5); country.homeTeam.country = "X".repeat(257);
  const batch = prepare(request(), result([fixture(), fixture(), oversized, rawLeak, expanded, country]));
  assert.equal(batch.status, "partial"); assert.equal(batch.rows.fixtures.length, 1); assert.equal(batch.invalidRows, 5);
  assert.equal(JSON.stringify(batch).includes("synthetic-private-key"), false);
});

test("unknown fixture competition seasons remain coverage failures without creating guessed season identities", () => {
  const row = fixture(); row.competition.season = null;
  const batch = prepare(request({ kind: "fixtures", query: { fixtureId: 1 } }),
    result([row], "fixtures", { id: "1", timezone: "Africa/Kampala" }));
  assert.equal(batch.rows.fixtures.length, 0);
  assert.equal(batch.invalidRows, 1);
  assert.equal(batch.status, "failed");
  assert.deepEqual(batch.missingIds, [1]);
});

test("normalized status and regulation candidate fixture context reuse the existing provider contract", () => {
  const wrongStatus = fixture(); wrongStatus.status = "live";
  const wrongFixture = fixture(2); wrongFixture.regulationScore.fixtureId = 3;
  const wrongPeriodStatus = fixture(3); wrongPeriodStatus.regulationScore.providerStatus = "AET";
  const wrongGoals = fixture(4); wrongGoals.reportedGoals.home = 3;
  for (const row of [wrongStatus, wrongFixture, wrongPeriodStatus, wrongGoals]) {
    assert.equal(prepare(request(), result([row])).status, "failed");
  }
});

test("regulation score needs exact trusted proof and attributable evidence distinct from retention permission", () => {
  const row = fixture();
  const batch = prepare(request(), result([row]));
  assert.equal(batch.rows.fixtures[0].regulationScore.verified, true);
  assert.deepEqual(batch.scoreEvidenceRefs, { 1: "synthetic-regulation-score-evidence" });
  for (const changes of [{ verifyRegulationScore: () => false }, { regulationEvidenceRef: () => null },
    { regulationEvidenceRef: () => "" }, { regulationEvidenceRef: () => "https://proof.example.test/score?token=synthetic-private-key" },
    { regulationEvidenceRef() { throw new Error("synthetic-private-key"); } }]) {
    const incomplete = prepare(request(), result([row]), authority(changes));
    assert.equal(incomplete.rows.fixtures[0].regulationScore.verified, false);
    assert.deepEqual(incomplete.scoreEvidenceRefs, {});
    assert.ok(incomplete.missingCoverage.includes("regulation-score-verification"));
    assert.equal(incomplete.status, "complete");
    assert.equal(JSON.stringify(incomplete).includes("synthetic-private-key"), false);
  }
  row.regulationScore.verified = false;
  assert.equal(prepare(request(), result([row])).rows.fixtures[0].regulationScore.verified, false);
});

test("extra-time and penalty totals never substitute for independently verified regulation fulltime scores", () => {
  for (const status of ["AET", "PEN"]) {
    const row = fixture(1, status);
    const batch = prepare(request(), result([row]));
    assert.deepEqual({ home: batch.rows.fixtures[0].regulationScore.home, away: batch.rows.fixtures[0].regulationScore.away }, { home: 2, away: 1 });
    const noScore = fixture(2, status); noScore.regulationScore = null;
    assert.equal(prepare(request(), result([noScore])).rows.fixtures[0].regulationScore, null);
  }
});

test("logo rights are reverified and unsafe credential-bearing URLs are dropped without fetching images", () => {
  const unsafe = ["http://media.example.test/logo.png", "https://user:synthetic-private-key@media.example.test/logo.png",
    "https://media.example.test/logo.png?key=synthetic-private-key", "https://media.example.test/logo.png#fragment",
    " https://media.example.test/logo.png", "data:image/png;base64,abc"];
  for (const url of unsafe) {
    assert.equal(isSafeCatalogLogo(url), false);
    const row = fixture(); row.homeTeam.logo.url = url;
    const batch = prepare(request(), result([row]));
    assert.equal(batch.rows.fixtures[0].homeTeam.logo.url, null);
    assert.equal(JSON.stringify(batch).includes("synthetic-private-key"), false);
  }
  const batch = prepare(request(), result([fixture()]), authority({ verifyLogo: () => false }));
  assert.equal(batch.rows.fixtures[0].awayTeam.logo.url, null);
  assert.equal(batch.rows.fixtures[0].awayTeam.logo.rights, "review-required");
});

test("explicit degraded known subsets require verified partial scope and can never establish full emptiness", () => {
  const input = request(undefined, { knownSubset: { fixtureIds: [1, 2], evidenceRef: "synthetic-known-subset-evidence" } });
  const observation = result([fixture()]); observation.status = "partial"; observation.completeness.complete = false;
  observation.error = { reason: "coverage-error", retryable: false };
  const batch = prepare(input, observation);
  assert.equal(batch.status, "degraded"); assert.equal(batch.completeEmpty, false);
  assert.equal(prepare(input, observation, authority({ verifyKnownSubset: () => false })).status, "partial");
  assert.equal(prepare(input, result([fixture()])).status, "partial");
  assert.equal(prepare(input, result([])).completeEmpty, false);
  const outside = clone(observation); outside.data = [fixture(3)];
  assert.equal(prepare(input, outside).status, "partial");
});

test("teams and competition seasons retain independent canonical numeric identities and exact query scopes", () => {
  const team = normalizeTeam({ id: 10, name: "Étoile FC" }, { retrievedAt: NOW - 1000, endpoint: "/teams" }).data;
  const input = request({ kind: "teams", query: { teamId: 10 } });
  assert.equal(prepare(input, result([team], "teams", { id: "10" })).rows.teams[0].id, 10);
  assert.equal(prepare(request({ kind: "teams", query: { teamId: 11 } }), result([team], "teams", { id: "11" })).status, "failed");
  const competition = normalizeCompetition({ league: { id: 39, name: "Synthetic League" }, seasons: [{ year: 2026, current: true }] },
    { retrievedAt: NOW - 1000, endpoint: "/leagues" }).data;
  const selected = request({ kind: "competitions", query: { competitionId: 39, season: 2026 } });
  assert.equal(prepare(selected, result([competition], "competitions", { id: "39", season: "2026" })).status, "complete");
  assert.equal(prepare(request({ kind: "competitions", query: { competitionId: 39, season: 2025 } }),
    result([competition], "competitions", { id: "39", season: "2025" })).status, "failed");
});

test("cached observations preserve original source timestamps and deterministic content fingerprints", () => {
  const input = request(), observation = result([fixture()]);
  observation.requestsDispatched = 0; observation.provenance[0].fromCache = true;
  const first = prepare(input, observation), later = prepare(input, observation, authority(), { now: () => NOW + 20_000 });
  assert.equal(first.fingerprint, later.fingerprint); assert.equal(first.observedAt, NOW - 1000);
  assert.equal(later.latestRetrievedAt, NOW - 1000); assert.equal(later.requestsDispatched, 0);
  assert.ok(Object.isFrozen(first.rows.fixtures[0].homeTeam));
});

test("source-less failures retain original typed classifications and stable fingerprints across receipt clocks", () => {
  const input = request(), observation = result([]);
  observation.status = "failed"; observation.provenance = []; observation.completeness.complete = false;
  observation.error = { reason: "quota-denied", retryable: false, quotaReason: "daily-limit" };
  observation.requestsDispatched = 0;
  const first = prepare(input, observation), later = prepare(input, observation, authority(), { now: () => NOW + 20_000 });
  assert.equal(first.fingerprint, later.fingerprint); assert.equal(first.latestRetrievedAt, null);
  assert.equal(first.status, "failed"); assert.equal(first.error.quotaReason, "daily-limit");
});
