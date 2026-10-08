import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { normalizeFixture, normalizeFallbackPrediction, normalizeCompetition } from "../src/server/football/api-football-normalize.ts";
import { buildTrialReport, renderTrialReport, trialRequirements } from "../src/server/football/provider-trial-evaluation.ts";

// Synthetic witnesses for the evaluator's trust boundary, never actual provider/account qualification.
const timestamp = parseUtcInstant("2026-10-08T10:00:00Z");
const clock = { now: () => timestamp + 60_000 };
const accountId = "a".repeat(64);
const trust = { clock, verifyObservation: () => true, verifyEvidence: () => true, verifyFreshness: () => true };
const source = { provider: "api-football", endpoint: "/fixtures", retrievedAt: timestamp, providerUpdatedAt: null };
const team = (id, overrides = {}) => ({ id, name: `Contract team ${id}`, code: `T${id}`, country: "Contract", national: false, ...overrides });
function fixture(overrides = {}, options = {}) {
  const raw = { fixture: { id: 101, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short: "NS", elapsed: 0 } },
    league: { id: 10, season: 2026, type: "League", name: "Contract league", country: "Contract", round: "1" },
    teams: { home: team(1), away: team(2) }, goals: { home: null, away: null },
    score: { fulltime: { home: null, away: null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } }, ...overrides };
  const result = normalizeFixture(raw, { retrievedAt: timestamp, endpoint: "/fixtures", ...options });
  assert.equal(result.valid, true);
  return result.data;
}
function fallback(overrides = {}) {
  const result = normalizeFallbackPrediction({ teams: { home: team(1), away: team(2) }, predictions: {
    winner: { id: 1, name: "Contract team 1" }, win_or_draw: true, under_over: "+2.5", goals: { home: "2", away: "1" },
    advice: "Contract pick only", percent: { home: "50%", draw: "30%", away: "20%" }, ...overrides,
  } }, { retrievedAt: timestamp, endpoint: "/predictions" });
  assert.equal(result.valid, true);
  return result.data;
}
function result(data, overrides = {}) {
  return { status: "complete", data, completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
    provenance: [{ provider: "api-football", endpoint: "fixtures", contractVersion: "direct-v3-official-examples-2026-10-08",
      requestParameters: {}, retrievedAt: timestamp, providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1,
      quota: { kind: "success", dailyLimit: 120_000, dailyRemaining: 119_999, minuteLimit: 720, minuteRemaining: 719 } }],
    requestsDispatched: 1, error: null, ...overrides };
}
function row(id, operation, data, overrides = {}) {
  const task = { id, case: "league", operation, maxRequests: 3, ...overrides.task };
  const endpoint = ({ fixtures: "fixtures", live: "fixtures", "fixture-ids": "fixtures", predictions: "predictions",
    "player-statistics": "playerStatistics", "account-status": "accountStatus" })[operation.kind] ?? operation.kind;
  let requestParameters;
  switch (operation.kind) {
    case "fixtures": requestParameters = { timezone: "Africa/Kampala", ...Object.fromEntries(Object.entries(operation.query).map(([key, value]) =>
      [({ competitionId: "league", fixtureId: "id", teamId: "team" })[key] ?? key, String(value)])) }; break;
    case "live": requestParameters = { timezone: "Africa/Kampala", live: "all" }; break;
    case "account-status": requestParameters = {}; break;
    case "teams": requestParameters = "teamId" in operation.query ? { id: String(operation.query.teamId) } :
      { league: String(operation.query.competitionId), season: String(operation.query.season) }; break;
    case "competitions": requestParameters = { ...("competitionId" in operation.query ? { id: String(operation.query.competitionId) } : {}),
      ...("season" in operation.query ? { season: String(operation.query.season) } : {}) }; break;
    case "player-statistics": requestParameters = { league: String(operation.query.competitionId), season: String(operation.query.season), page: "1" }; break;
    case "fixture-ids": requestParameters = { ids: operation.ids.join("-"), timezone: "Africa/Kampala" }; break;
    default: requestParameters = { fixture: String(operation.fixtureId) };
  }
  const observation = { taskId: id, source: "live-provider", observedAt: timestamp + 1_000,
    result: result(data, { provenance: [{ ...result([]).provenance[0], endpoint, requestParameters }], ...overrides.result }), ...overrides.observation };
  return { task, state: { id, status: "completed", startedAt: timestamp, finishedAt: observation.observedAt,
    reservedRequests: 3, dispatchedRequests: 1, observation, ...overrides.state } };
}
const evidence = (requirement, value, overrides = {}) => ({ id: requirement, requirement, kind: "account-record",
  source: `private-record:${requirement}`, recordedAt: timestamp, value: { accountId, ...value }, ...overrides });
function journal(rows = [], overrides = {}) {
  return { version: 1, planHash: "b".repeat(64), createdAt: timestamp, updatedAt: timestamp, tasks: rows.map(({ state }) => state),
    plan: { version: 1, id: "contract-trial", accountId, competitions: [{ id: 10, season: 2026 }], maxRequests: 100,
      deadlineAt: timestamp + 100_000, bounds: null,
      freshness: { maxRetrievalAgeMs: 30_000, maxSourceAgeMs: 60_000, unknownUpdateTime: "retrieval-only", evidenceRef: "approved-freshness" },
      tasks: rows.map(({ task }) => task), evidence: [], ...overrides },
  };
}
const finding = (report, requirement) => report.findings.find((item) => item.requirement === requirement);
const status = (report, requirement) => finding(report, requirement).status;
const mapping = evidence("fallback-match-result", { period: "regulation-including-stoppage-time", sourceField: "predictions.percent",
  probabilityUnits: "percent", completeProbabilities: true }, { kind: "official-source", source: "https://provider.example/contract" });
function predictionRows(fixtureOverrides = {}, fallbackOverrides = {}, rowOverrides = {}) {
  return [row("prior", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture(fixtureOverrides)]),
    row("prediction", { kind: "predictions", fixtureId: 101 }, [fallback(fallbackOverrides)],
      { ...rowOverrides, task: { fixtureTaskId: "prior", ...rowOverrides.task },
        observation: { observedAt: timestamp + 2_000, ...rowOverrides.observation } })];
}

test("offline baseline keeps every requirement separately untested and live operations blocked", () => {
  const report = buildTrialReport(journal(), { clock });
  assert.equal(report.findings.length, 34);
  assert.deepEqual(report.findings.map((item) => item.requirement), [...trialRequirements]);
  assert.ok(report.findings.every((item) => item.status === "untested" && item.testedAt === null));
  assert.equal(report.liveSuitability, "incomplete");
  assert.equal(report.liveOperations, "blocked");
  assert.equal(report.launch, "blocked");
  assert.equal(report.catalogImplementation, "permitted-with-pending-live-evidence");
  assert.ok(Object.isFrozen(report.findings));
});

test("synthetic observations and evidence cannot qualify requirements even when verifiers approve them", () => {
  const rows = predictionRows().map(({ task, state }) => ({ task, state: { ...state, observation: { ...state.observation, source: "synthetic" } } }));
  const report = buildTrialReport(journal(rows, { evidence: [evidence("payable-total", { totalUsdCents: 3_900 }, { kind: "synthetic" }),
    { ...mapping, kind: "synthetic" }] }), trust);
  assert.ok(report.findings.every((item) => item.status === "untested"));
  assert.equal(report.liveSuitability, "incomplete");
});

test("forged live labels and unverified records never confer trust", () => {
  const report = buildTrialReport(journal(predictionRows(), { evidence: [mapping] }), { clock });
  assert.ok(report.findings.every((item) => item.status === "untested"));
  const throwing = buildTrialReport(journal(predictionRows(), { evidence: [mapping] }), {
    clock, verifyObservation: () => { throw new Error("private diagnostic"); }, verifyEvidence: () => { throw new Error("private diagnostic"); },
  });
  assert.ok(throwing.findings.every((item) => item.status === "untested"));
});

test("payable total requires exact integer cents including taxes and payment fees within US$45", () => {
  const valid = { currency: "USD", baseUsdCents: 3_900, taxUsdCents: 300, paymentChargesUsdCents: 300,
    totalUsdCents: 4_500, taxesIncluded: true, paymentChargesIncluded: true };
  assert.equal(status(buildTrialReport(journal([], { evidence: [evidence("payable-total", valid)] }), trust), "payable-total"), "confirmed");
  for (const changes of [{ totalUsdCents: 4_501 }, { totalUsdCents: 3_900 }, { taxesIncluded: false },
    { paymentChargesIncluded: false }, { taxUsdCents: 2.5 }, { currency: "UGX" }, { accountId: "c".repeat(64) }]) {
    assert.equal(status(buildTrialReport(journal([], { evidence: [evidence("payable-total", { ...valid, ...changes })] }), trust), "payable-total"), "failed");
  }
  const advertised = evidence("payable-total", valid, { kind: "official-source", source: "https://provider.example/pricing" });
  assert.equal(status(buildTrialReport(journal([], { evidence: [advertised] }), trust), "payable-total"), "untested");
});

test("rights require verified permission for each scope and separate media restrictions", () => {
  const records = [evidence("private-use-rights", { permitted: true, scope: "private-use", restrictionsReviewed: true }, { kind: "rights-record" }),
    evidence("remote-logo-rights", { permitted: true, scope: "remote-logo-display", restrictionsReviewed: true }, { kind: "rights-record" })];
  const report = buildTrialReport(journal([], { evidence: records }), trust);
  assert.equal(status(report, "private-use-rights"), "confirmed");
  assert.equal(status(report, "remote-logo-rights"), "confirmed");
  assert.equal(status(report, "media-host-restrictions"), "untested");
  assert.equal(status(report, "data-redistribution"), "untested");
  const negative = evidence("prediction-redistribution", { permitted: false, scope: "prediction-redistribution", restrictionsReviewed: true }, { kind: "rights-record" });
  assert.equal(status(buildTrialReport(journal([], { evidence: [negative] }), trust), "prediction-redistribution"), "failed");
});

test("account records must match the account and actual reset evidence is independent of official terms", () => {
  const records = [evidence("account-plan", { provider: "api-football", plan: "Mega" }),
    evidence("account-limits", { dailyLimit: 120_000, minuteLimit: 720 }), evidence("subscription-expiry", { expiresAt: timestamp + 120_000 }),
    evidence("provider-reset", { resetAtUtc: "00:00", observedBoundary: true }, { kind: "official-source" })];
  const report = buildTrialReport(journal([], { evidence: records }), trust);
  for (const requirement of ["account-plan", "account-limits", "subscription-expiry"]) assert.equal(status(report, requirement), "confirmed");
  assert.equal(status(report, "provider-reset"), "untested");
  const reset = evidence("provider-reset", { resetAtUtc: "00:00", observedBoundary: true });
  assert.equal(status(buildTrialReport(journal([], { evidence: [reset] }), trust), "provider-reset"), "confirmed");
  const expired = evidence("subscription-expiry", { expiresAt: timestamp });
  assert.equal(status(buildTrialReport(journal([], { evidence: [expired] }), trust), "subscription-expiry"), "failed");
});

test("verified account-status observations qualify only account facts and preserve reset/payment/rights gaps", () => {
  const rows = [row("account", { kind: "account-status" }, [{ subscription: { plan: "Mega", active: true, expiresAt: timestamp + 120_000 },
    requests: { current: 10, dailyLimit: 120_000 }, source }])];
  const report = buildTrialReport(journal(rows), trust);
  for (const requirement of ["account-plan", "account-limits", "subscription-expiry", "quota-headers"]) assert.equal(status(report, requirement), "confirmed");
  for (const requirement of ["provider-reset", "payable-total", "private-use-rights"]) assert.equal(status(report, requirement), "untested");
});

test("actual Mega account limits can exceed the application ceilings and status may omit pagination", () => {
  const data = { subscription: { plan: "Mega", active: true, expiresAt: timestamp + 120_000 },
    requests: { current: 10, dailyLimit: 150_000 }, source };
  const records = [evidence("account-limits", { dailyLimit: 150_000, minuteLimit: 900 })];
  const rows = [row("account", { kind: "account-status" }, [data], { result: { provenance: [{ ...result([]).provenance[0],
    endpoint: "accountStatus", requestParameters: {}, currentPage: null, totalPages: null,
    quota: { kind: "success", dailyLimit: 150_000, dailyRemaining: 149_990, minuteLimit: 900, minuteRemaining: 899 },
  }] } })];
  const report = buildTrialReport(journal(rows, { evidence: records }), trust);
  assert.equal(status(report, "account-limits"), "confirmed");
  assert.equal(status(report, "pagination"), "untested");
  assert.match(finding(report, "account-limits").limitation, /stricter ceiling/);
  const conflicting = evidence("account-limits", { dailyLimit: 120_000, minuteLimit: 720 });
  assert.equal(status(buildTrialReport(journal(rows, { evidence: [conflicting] }), trust), "account-limits"), "failed");
});

test("operator competition and request allowance decisions require verified records matching the exact plan", () => {
  const records = [evidence("candidate-competitions", { competitions: "10:2026" }, { kind: "operator-record" }),
    evidence("trial-allowance", { allowance: 100 }, { kind: "operator-record" })];
  const report = buildTrialReport(journal([], { evidence: records }), trust);
  assert.equal(status(report, "candidate-competitions"), "confirmed");
  assert.equal(status(report, "trial-allowance"), "confirmed");
  assert.equal(status(buildTrialReport(journal([], { evidence: records, maxRequests: 99 }), trust), "trial-allowance"), "failed");
});

test("sampling relies on fixture status and competition metadata rather than case tags", () => {
  const report = buildTrialReport(journal([row("claim", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()], { task: { case: "shootout" } })]), trust);
  assert.equal(status(report, "league-sample"), "confirmed");
  for (const requirement of ["shootout-sample", "extra-time-sample", "cup-sample", "postponed-sample"]) assert.equal(status(report, requirement), "untested");
});

test("cross-midnight qualification uses the shared Kampala calendar and the actual date query", () => {
  const data = fixture({ fixture: { id: 101, date: "2026-10-09T00:30:00+03:00", timezone: "Africa/Kampala", status: { short: "NS" } } });
  const correct = row("boundary", { kind: "fixtures", query: { date: "2026-10-09" } }, [data]);
  assert.equal(status(buildTrialReport(journal([correct]), trust), "cross-midnight-sample"), "confirmed");
  const wrong = row("boundary", { kind: "fixtures", query: { date: "2026-10-08" } }, [data]);
  assert.equal(status(buildTrialReport(journal([wrong]), trust), "cross-midnight-sample"), "untested");
});

test("postponed, extra-time and shootout cases exercise safe settlement without final-total substitution", () => {
  const rows = [];
  for (const short of ["PST", "AET", "PEN"]) rows.push(row(short, { kind: "fixtures", query: { fixtureId: 101 } }, [fixture({
    fixture: { id: 101, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short } },
    goals: { home: 4, away: 2 }, score: { fulltime: { home: 1, away: 1 }, extratime: { home: 4, away: 2 }, penalty: { home: 5, away: 4 } },
  })]));
  const report = buildTrialReport(journal(rows), trust);
  for (const requirement of ["postponed-sample", "extra-time-sample", "shootout-sample"]) assert.equal(status(report, requirement), "confirmed");
  assert.equal(status(report, "regulation-scores"), "failed");
  assert.match(finding(report, "regulation-scores").limitation, /Extra-time totals and shootout scores are excluded/);
});

test("verified normalized score still needs independently verified source-period mapping", () => {
  const data = fixture({ fixture: { id: 101, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short: "AET" } },
    goals: { home: 4, away: 2 }, score: { fulltime: { home: 1, away: 1 }, extratime: { home: 4, away: 2 }, penalty: { home: null, away: null } },
  }, { verifyRegulationScore: () => true });
  const rows = [row("aet", { kind: "fixtures", query: { fixtureId: 101 } }, [data])];
  assert.equal(status(buildTrialReport(journal(rows), trust), "regulation-scores"), "failed");
  const record = evidence("regulation-scores", { sourceField: "score.fulltime", period: "regulation-including-stoppage-time",
    providerStatus: "AET", independentlyVerified: true }, { kind: "official-source" });
  assert.equal(status(buildTrialReport(journal(rows, { evidence: [record] }), trust), "regulation-scores"), "confirmed");
  const invalid = { ...data, regulationScore: { ...data.regulationScore, period: "extra-time", home: -1 } };
  assert.equal(status(buildTrialReport(journal([row("aet", { kind: "fixtures", query: { fixtureId: 101 } }, [invalid])], { evidence: [record] }), trust), "regulation-scores"), "failed");
});

test("complete paginated imports are distinct from unpaginated fixtures and incomplete pages fail", () => {
  const page = (currentPage) => ({ ...result([]).provenance[0], endpoint: "playerStatistics", currentPage, totalPages: 2,
    requestParameters: { league: "10", season: "2026", page: String(currentPage) } });
  const complete = row("players", { kind: "player-statistics", query: { competitionId: 10, season: 2026 } }, [],
    { result: { provenance: [page(1), page(2)] } });
  assert.equal(status(buildTrialReport(journal([complete]), trust), "pagination"), "confirmed");
  const incomplete = row("players", complete.task.operation, [], { result: { provenance: [page(1), page(1)] } });
  assert.equal(status(buildTrialReport(journal([incomplete]), trust), "pagination"), "failed");
  const fixtureOnly = row("fixture", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()]);
  assert.equal(status(buildTrialReport(journal([fixtureOnly]), trust), "pagination"), "untested");
  const partial = row("fixture", fixtureOnly.task.operation, [fixture()], { result: { status: "partial",
    completeness: { ...result([]).completeness, complete: false, missingIds: [102] } } });
  assert.equal(status(buildTrialReport(journal([partial]), trust), "pagination"), "failed");
  const retryPage = { ...page(1), currentPage: null, totalPages: null,
    quota: { ...page(1).quota, kind: "rate-limited" } };
  const retried = row("players", complete.task.operation, [], { result: { provenance: [retryPage, page(1), page(2)] } });
  assert.equal(status(buildTrialReport(journal([retried]), trust), "pagination"), "confirmed");
});

test("batch completeness checks every requested ID while preserving actual per-request query provenance", () => {
  const missing = row("batch", { kind: "fixture-ids", ids: [101, 102] }, [fixture()], { result: { provenance: [{
    ...result([]).provenance[0], requestParameters: { ids: "101", timezone: "Africa/Kampala" },
  }] } });
  assert.equal(status(buildTrialReport(journal([missing]), trust), "pagination"), "failed");
});

test("absent provider update time and quota headers remain observed failures", () => {
  const report = buildTrialReport(journal([row("fixture", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()],
    { result: { provenance: [{ ...result([]).provenance[0], quota: { kind: "success" } }] } })]), trust);
  assert.equal(status(report, "provider-update-times"), "failed");
  assert.equal(status(report, "quota-headers"), "failed");
  assert.equal(report.liveSuitability, "failed");
});

test("low-coverage flags require a real fixture in the same competition season", () => {
  const normalized = normalizeCompetition({ league: { id: 10, name: "Contract league", type: "League" }, country: { name: "Contract" },
    seasons: [{ year: 2026, current: true, coverage: { predictions: false } }] }, { retrievedAt: timestamp, endpoint: "/leagues" });
  assert.equal(normalized.valid, true);
  const coverage = row("coverage", { kind: "competitions", query: { competitionId: 10, season: 2026 } }, [normalized.data]);
  assert.equal(status(buildTrialReport(journal([coverage]), trust), "low-coverage-sample"), "untested");
  const match = row("fixture", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()]);
  assert.equal(status(buildTrialReport(journal([coverage, match]), trust), "low-coverage-sample"), "confirmed");
});

test("identity history and aliases need the same IDs across actual different seasons or competitions", () => {
  const first = row("first", { kind: "fixtures", query: { competitionId: 10, season: 2025 } }, [fixture({
    fixture: { id: 100, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short: "NS" } },
    league: { id: 10, season: 2025, type: "League", name: "Contract league", country: "Contract" } })]);
  const second = row("second", { kind: "fixtures", query: { competitionId: 10, season: 2026 } }, [fixture({
    teams: { home: team(1, { name: "Contract alias" }), away: team(2) } })]);
  assert.equal(status(buildTrialReport(journal([first]), trust), "canonical-identities"), "untested");
  const competitions = [{ id: 10, season: 2025 }, { id: 10, season: 2026 }];
  const report = buildTrialReport(journal([first, second], { competitions }), trust);
  assert.equal(status(report, "canonical-identities"), "confirmed");
  assert.equal(status(report, "aliases"), "confirmed");
  const wrong = row("wrong", second.task.operation, [fixture({ teams: { home: team(1, { country: "Conflicting country" }), away: team(2) } })]);
  assert.equal(status(buildTrialReport(journal([first, wrong], { competitions }), trust), "canonical-identities"), "failed");
});

test("historical team endpoint observations qualify IDs and aliases without inventing season context", () => {
  const first = row("historical-teams", { kind: "teams", query: { competitionId: 10, season: 2025 } }, [team(1)]);
  const current = row("current-teams", { kind: "teams", query: { competitionId: 20, season: 2026 } }, [team(1, { name: "Contract alias" })]);
  const report = buildTrialReport(journal([first, current], { competitions: [{ id: 10, season: 2025 }, { id: 20, season: 2026 }] }), trust);
  assert.equal(status(report, "canonical-identities"), "confirmed");
  assert.equal(status(report, "aliases"), "confirmed");
  const noContext = row("no-context", { kind: "teams", query: { teamId: 1 } }, [team(1)]);
  assert.equal(status(buildTrialReport(journal([noContext, current]), trust), "canonical-identities"), "untested");
});

test("a genuine response attached to a different historical query cannot qualify canonical identity", () => {
  const first = row("forged-context", { kind: "teams", query: { competitionId: 10, season: 2025 } }, [team(1)], { result: { provenance: [{
    ...result([]).provenance[0], endpoint: "teams", requestParameters: { league: "10", season: "2026" },
  }] } });
  const current = row("current", { kind: "teams", query: { competitionId: 10, season: 2026 } }, [team(1)]);
  const report = buildTrialReport(journal([first, current], { competitions: [{ id: 10, season: 2025 }, { id: 10, season: 2026 }] }), trust);
  assert.equal(status(report, "canonical-identities"), "untested");
  assert.equal(status(report, "pagination"), "failed");
});

test("shared all-live results cannot qualify fixtures outside selected competition seasons", () => {
  const foreign = fixture({ fixture: { id: 202, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short: "PEN" } },
    league: { id: 20, season: 2026, type: "Cup", name: "Other cup", country: "Contract" },
    goals: { home: 4, away: 2 }, score: { fulltime: { home: 1, away: 1 }, extratime: { home: 4, away: 2 }, penalty: { home: 5, away: 4 } } });
  const report = buildTrialReport(journal([row("global-live", { kind: "live" }, [foreign])]), trust);
  for (const requirement of ["cup-sample", "shootout-sample", "regulation-scores", "canonical-identities", "field-coverage"]) {
    assert.equal(status(report, requirement), "untested", requirement);
  }
});

test("the same fixture ID cannot silently change team assignments or competition season", () => {
  const first = row("first", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()]);
  const wrong = row("reassigned", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture({
    teams: { home: team(3), away: team(2) } })]);
  assert.equal(status(buildTrialReport(journal([first, wrong]), trust), "canonical-identities"), "failed");
});

test("status transitions require repeated time-ordered observations of the same fixture", () => {
  const first = row("scheduled", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()]);
  const last = row("live", { kind: "live" }, [fixture({ fixture: { id: 101, date: "2026-10-08T15:00:00+03:00",
    timezone: "Africa/Kampala", status: { short: "1H" } } })], { observation: { observedAt: timestamp + 2_000 } });
  assert.equal(status(buildTrialReport(journal([first, last]), trust), "status-transitions"), "confirmed");
  const disappeared = row("empty-live", { kind: "live" }, [], { observation: { observedAt: timestamp + 2_000 } });
  assert.equal(status(buildTrialReport(journal([first, disappeared]), trust), "status-transitions"), "untested");
});

test("fallback validates complete numerical groups and derives double chance only after trusted mapping and freshness", () => {
  const report = buildTrialReport(journal(predictionRows(), { evidence: [mapping] }), trust);
  for (const requirement of ["fallback-match-result", "fallback-double-chance", "fallback-prematch", "fallback-freshness"]) {
    assert.equal(status(report, requirement), "confirmed", requirement);
  }
  for (const requirement of ["fallback-total-goals", "fallback-btts"]) assert.equal(status(report, requirement), "failed");
  const unmapped = buildTrialReport(journal(predictionRows()), trust);
  assert.equal(status(unmapped, "fallback-match-result"), "failed");
  assert.match(finding(unmapped, "fallback-match-result").result, /source mapping is unverified/);
  for (const percent of [{ home: "50%", draw: "30%" }, { home: "0%", draw: "50%", away: "50%" },
    { home: "60%", draw: "30%", away: "20%" }]) {
    const invalid = buildTrialReport(journal(predictionRows({}, { percent }), { evidence: [mapping] }), trust);
    assert.equal(status(invalid, "fallback-match-result"), "failed");
    assert.equal(status(invalid, "fallback-double-chance"), "failed");
  }
});

test("fallback pre-match correlation rejects unlinked, reversed or already started fixture contexts", () => {
  for (const rows of [predictionRows({}, {}, { task: { fixtureTaskId: undefined } }),
    predictionRows({ fixture: { id: 101, date: "2026-10-08T15:00:00+03:00", timezone: "Africa/Kampala", status: { short: "1H" } } }),
    predictionRows({ teams: { home: team(2), away: team(1) } }),
    predictionRows({}, {}, { observation: { observedAt: timestamp + 3 * 3_600_000 } })]) {
    const report = buildTrialReport(journal(rows, { evidence: [mapping] }), { ...trust, clock: { now: () => timestamp + 4 * 3_600_000 } });
    assert.equal(status(report, "fallback-prematch"), "failed");
    assert.equal(status(report, "fallback-match-result"), "failed");
  }
});

test("fallback freshness has no implicit unknown-update policy and honors stored retrieval ages", () => {
  const rows = predictionRows();
  const rejected = buildTrialReport(journal(rows, { evidence: [mapping], freshness: {
    maxRetrievalAgeMs: 30_000, maxSourceAgeMs: 60_000, unknownUpdateTime: "reject", evidenceRef: "approved-reject" } }), trust);
  assert.equal(status(rejected, "fallback-freshness"), "failed");
  const unverified = buildTrialReport(journal(rows, { evidence: [mapping] }), { ...trust, verifyFreshness: undefined });
  assert.equal(status(unverified, "fallback-freshness"), "untested");
  assert.equal(status(unverified, "fallback-match-result"), "failed");
  const stale = buildTrialReport(journal(predictionRows({}, {}, { observation: { observedAt: timestamp + 30_001 } }), { evidence: [mapping] }), trust);
  assert.equal(status(stale, "fallback-freshness"), "failed");
});

test("fallback context source timestamps obey the same approved freshness policy as predictions", () => {
  const rows = predictionRows();
  const context = rows[0].state.observation.result.data[0];
  const staleContext = { ...rows[0], state: { ...rows[0].state, observation: { ...rows[0].state.observation,
    result: { ...rows[0].state.observation.result, data: [{ ...context, source: { ...context.source, providerUpdatedAt: timestamp - 120_000 } }] } } } };
  const report = buildTrialReport(journal([staleContext, rows[1]], { evidence: [mapping] }), trust);
  assert.equal(status(report, "fallback-freshness"), "failed");
  assert.equal(status(report, "fallback-match-result"), "failed");
});

test("a safe retained HTTPS logo does not qualify remote rights or media-host permission", () => {
  const approved = fixture({ teams: { home: team(1, { logo: "https://media.api-sports.io/football/teams/1.png" }), away: team(2) } }, { verifyLogo: () => true });
  const report = buildTrialReport(journal([row("logo", { kind: "fixtures", query: { fixtureId: 101 } }, [approved])]), trust);
  assert.equal(status(report, "credential-free-logo-urls"), "confirmed");
  assert.equal(status(report, "remote-logo-rights"), "untested");
  assert.equal(status(report, "media-host-restrictions"), "untested");
  const unsafe = { ...approved, competition: { ...approved.competition,
    logo: { url: "https://user:secret@media.api-sports.io/football/leagues/1.png?key=secret", rights: "approved" } } };
  const invalid = buildTrialReport(journal([row("unsafe", { kind: "fixtures", query: { fixtureId: 101 } }, [unsafe])]), trust);
  assert.equal(status(invalid, "credential-free-logo-urls"), "failed");
});

test("ancillary coverage records incomplete lineups and empty injuries as unknown availability", () => {
  const prior = row("fixture", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()]);
  for (const missing of [row("injuries", { kind: "injuries", fixtureId: 101 }, []),
    row("lineups", { kind: "lineups", fixtureId: 101 }, [{ kind: "lineups", startingPlayers: [] }]),
    row("statistics", { kind: "statistics", fixtureId: 101 }, [{ statistics: [{ supported: false, value: "unknown" }] }])]) {
    const report = buildTrialReport(journal([prior, missing]), trust);
    assert.equal(status(report, "field-coverage"), "failed");
    assert.match(finding(report, "field-coverage").limitation, /remain unknown/);
  }
});

test("wrong endpoint provenance and source time cannot qualify fixture samples", () => {
  for (const invalid of [{ ...result([]).provenance[0], endpoint: "predictions" },
    { ...result([]).provenance[0], retrievedAt: timestamp + 10_000 }]) {
    const report = buildTrialReport(journal([row("fixture", { kind: "fixtures", query: { fixtureId: 101 } }, [fixture()],
      { result: { provenance: [invalid] } })]), trust);
    assert.equal(status(report, "pagination"), "failed");
    assert.equal(status(report, "league-sample"), "untested");
  }
});

test("completed tasks charge actual dispatch while uncertain or running work retains its full reservation", () => {
  const finished = row("finished", { kind: "live" }, [], { state: { dispatchedRequests: 1, reservedRequests: 10 } });
  const uncertain = row("uncertain", { kind: "live" }, [], { state: { status: "uncertain", dispatchedRequests: null, reservedRequests: 4 } });
  const running = row("running", { kind: "live" }, [], { state: { status: "running", dispatchedRequests: null, reservedRequests: 2 } });
  const report = buildTrialReport(journal([finished, uncertain, running]), trust);
  assert.deepEqual(report.budget, { allowance: 100, chargedRequests: 7, knownDispatchedRequests: 1, uncertainTasks: 2 });
  assert.equal(report.liveOperations, "blocked");
});

test("deferred zero-I/O quota waits release trial reservation but never qualify observed provider facts", () => {
  const deferred = row("waiting", { kind: "fixtures", query: { fixtureId: 101 } }, [], { state: {
    status: "deferred", dispatchedRequests: 0, reservedRequests: 5,
  }, result: { status: "failed", requestsDispatched: 0, provenance: [], error: { reason: "quota-denied", retryable: true } } });
  const report = buildTrialReport(journal([deferred]), trust);
  assert.deepEqual(report.budget, { allowance: 100, chargedRequests: 0, knownDispatchedRequests: 0, uncertainTasks: 0 });
  assert.ok(report.findings.every((item) => item.status === "untested"));
  assert.equal(report.liveSuitability, "incomplete");
});

test("Markdown reports are reproducible, escape table cells and omit raw account values and diagnostics", () => {
  const sensitive = evidence("payable-total", { currency: "USD", baseUsdCents: 3_900, taxUsdCents: 0, paymentChargesUsdCents: 0,
    totalUsdCents: 3_900, taxesIncluded: true, paymentChargesIncluded: true, privateDiagnostic: "DO-NOT-RENDER" },
  { source: "https://user:PRIVATE-CREDENTIAL@provider.example/record?key=PRIVATE-KEY" });
  const report = buildTrialReport(journal([], { evidence: [sensitive] }), trust);
  const markdown = renderTrialReport(report);
  assert.equal(markdown, renderTrialReport(report));
  assert.ok(!markdown.includes("DO-NOT-RENDER"));
  assert.ok(!markdown.includes("PRIVATE-CREDENTIAL"));
  assert.ok(!markdown.includes("PRIVATE-KEY"));
  assert.ok(!markdown.includes(accountId));
  assert.equal(markdown.split("\n").filter((line) => line.startsWith("| ")).length, 36);
  const malicious = { ...report, trialId: "row | <script>\n", findings: [{ ...report.findings[0], result: "row | <script>\nnext" }] };
  assert.ok(renderTrialReport(malicious).includes("row &#124; &lt;script&gt; next"));
});
