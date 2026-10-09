import "server-only";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";

import { getReportingDate, isBeforePublicationCutoff, toUtcIsoString, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { Clock, UtcInstant } from "../../domain/calendar.ts";
import { settleMarketSelection } from "../../domain/market-settlement.ts";
import { validateMarketGroup, marketRules } from "../../domain/markets.ts";
import type { NormalizedFixture, NormalizedFallbackPrediction, NormalizedCompetition, ProviderLogo } from "./api-football-normalize.ts";
import type { TrialEvidence, TrialFinding, TrialFreshness, TrialJournal, TrialObservation, TrialReport, TrialRequirement, TrialTask } from "./provider-trial-contract.ts";
import { PROVIDER_TRIAL_VERSION } from "./provider-trial-contract.ts";
import { trialRequirements } from "./provider-trial-input.ts";
import type { ApiFootballPageProvenance } from "./api-football-contract.ts";
import { chargedTrialRequests } from "./provider-trial-runner.ts";
export { trialRequirements } from "./provider-trial-input.ts";

export type TrialReportOptions = Readonly<{
  clock?: Clock;
  verifyEvidence?: (evidence: TrialEvidence) => boolean;
  verifyFreshness?: (policy: TrialFreshness) => boolean;
  verifyObservation?: (observation: TrialObservation) => boolean;
}>;
type Observed = Readonly<{ task: TrialTask; observation: TrialObservation }>;
type FixtureObservation = Observed & Readonly<{ fixture: NormalizedFixture }>;
type IdentityObservation = Observed & Readonly<{ kind: "team" | "competition"; id: number; name: string | null;
  country: string | null; season: number | null; competitionId: number }>;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonnegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const instant = (value: unknown): value is UtcInstant => {
  try { return typeof value === "number" && utcInstantFromEpochMilliseconds(value) === value; } catch { return false; }
};
function trusted<Data>(verify: ((value: Data) => boolean) | undefined, value: Data): boolean {
  try { return verify?.(value) === true; } catch { return false; }
}
function freeze<Data>(value: Data): Data {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function groupBy<Data, Key>(values: readonly Data[], keyFor: (value: Data) => Key): Map<Key, Data[]> {
  const groups = new Map<Key, Data[]>();
  for (const value of values) {
    const key = keyFor(value);
    const rows = groups.get(key);
    if (rows) rows.push(value); else groups.set(key, [value]);
  }
  return groups;
}
function safeId(value: string): string { return /^[A-Za-z0-9._-]{1,80}$/.test(value) ? value : "untrusted-reference"; }
function evidenceSource(evidence: TrialEvidence): string {
  try {
    const url = new URL(evidence.source);
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash) return url.href;
  } catch { /* Non-URL evidence is referred to by its validated ID. */ }
  return `evidence:${safeId(evidence.id)}`;
}
function observationSources(rows: readonly Observed[]): string[] {
  return [...new Set(rows.flatMap(({ task, observation }) => [
    `task:${safeId(task.id)}`,
    ...observation.result.data.filter(fixture).map((item) => `fixture:${item.id}`),
    ...("fixtureId" in task.operation ? [`fixture:${task.operation.fixtureId}`] : []),
  ]))];
}
function fixture(value: unknown): value is NormalizedFixture {
  return isRecord(value) && positiveInteger(value.id) && isRecord(value.homeTeam) && positiveInteger(value.homeTeam.id) &&
    isRecord(value.awayTeam) && positiveInteger(value.awayTeam.id) && value.homeTeam.id !== value.awayTeam.id &&
    isRecord(value.competition) && positiveInteger(value.competition.id) && typeof value.status === "string" &&
    isRecord(value.source) && value.source.provider === "api-football" && value.source.endpoint === "/fixtures" && instant(value.source.retrievedAt);
}
function prediction(value: unknown): value is NormalizedFallbackPrediction {
  return isRecord(value) && value.purpose === "fallback-only" && isRecord(value.reportedPercentages) &&
    isRecord(value.homeTeam) && positiveInteger(value.homeTeam.id) && isRecord(value.awayTeam) &&
    positiveInteger(value.awayTeam.id) && value.homeTeam.id !== value.awayTeam.id && isRecord(value.source) &&
    value.source.provider === "api-football" && value.source.endpoint === "/predictions" && instant(value.source.retrievedAt);
}
function competition(value: unknown): value is NormalizedCompetition {
  return isRecord(value) && positiveInteger(value.id) && Array.isArray(value.seasons) &&
    value.seasons.every((season) => isRecord(season) && positiveInteger(season.year) && isRecord(season.coverage)) &&
    isRecord(value.source);
}
function validLogo(value: unknown): value is ProviderLogo & { url: string } {
  if (!isRecord(value) || value.rights !== "approved" || typeof value.url !== "string") return false;
  return isSafeRemoteImageUrl(value.url);
}
function logoReferences(data: unknown): unknown[] {
  if (!isRecord(data)) return [];
  const references = [data.logo, ...[data.homeTeam, data.awayTeam, data.team, data.competition]
    .filter(isRecord).map((identity) => identity.logo)].filter((logo) => isRecord(logo) && logo.url !== null);
  if (Array.isArray(data.statistics)) references.push(...data.statistics.flatMap((entry) => isRecord(entry) ?
    [entry.team, entry.competition].filter(isRecord).map((identity) => identity.logo).filter((logo) => isRecord(logo) && logo.url !== null) : []));
  return references;
}
function parametersMatch(task: TrialTask, page: ApiFootballPageProvenance): boolean {
  const operation = task.operation;
  const parameters = page.requestParameters;
  let expected: Record<string, string>;
  switch (operation.kind) {
    case "fixtures":
      expected = { timezone: "Africa/Kampala" };
      for (const [key, parameter] of [["date", "date"], ["competitionId", "league"], ["season", "season"], ["teamId", "team"],
        ["from", "from"], ["to", "to"], ["round", "round"], ["fixtureId", "id"]] as const) {
        if (operation.query[key] !== undefined) expected[parameter] = String(operation.query[key]);
      }
      break;
    case "live": expected = { live: "all", timezone: "Africa/Kampala" }; break;
    case "account-status": expected = {}; break;
    case "teams": expected = "teamId" in operation.query ? { id: String(operation.query.teamId) } :
      { league: String(operation.query.competitionId), season: String(operation.query.season) }; break;
    case "competitions":
      expected = {};
      if (operation.query.competitionId !== undefined) expected.id = String(operation.query.competitionId);
      if (operation.query.season !== undefined) expected.season = String(operation.query.season);
      break;
    case "player-statistics":
      if (!parameters.page || !/^[1-9]\d*$/.test(parameters.page) || !positiveInteger(Number(parameters.page)) ||
          (page.currentPage !== null && Number(parameters.page) !== page.currentPage)) return false;
      expected = { league: String(operation.query.competitionId), season: String(operation.query.season), page: parameters.page };
      break;
    case "fixture-ids": {
      const raw = parameters.id ?? parameters.ids;
      if (!raw || !/^[1-9]\d*(?:-[1-9]\d*)*$/.test(raw) || (parameters.id !== undefined && parameters.ids !== undefined)) return false;
      const ids = raw.split("-").map(Number);
      if (ids.length > 20 || new Set(ids).size !== ids.length || ids.some((id) => !positiveInteger(id) || !operation.ids.includes(id)) ||
          (parameters.id !== undefined && ids.length !== 1)) return false;
      expected = { [parameters.id !== undefined ? "id" : "ids"]: raw, timezone: "Africa/Kampala" };
      break;
    }
    default: expected = { fixture: String(operation.fixtureId) };
  }
  return Object.keys(parameters).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => parameters[key] === value);
}
const successfulPages = (observation: TrialObservation) => observation.result.provenance.filter((page) => isRecord(page) &&
  isRecord(page.quota) && isRecord(page.requestParameters) && page.quota.kind === "success" &&
  (page.endpoint === "accountStatus" && page.currentPage === null && page.totalPages === null ||
    positiveInteger(page.currentPage) && positiveInteger(page.totalPages)));
function requestedIdsCovered(row: Observed): boolean {
  if (row.task.operation.kind !== "fixture-ids") return true;
  const ids = successfulPages(row.observation).flatMap((page) => (page.requestParameters.id ?? page.requestParameters.ids ?? "").split("-").map(Number));
  const requested = new Set(row.task.operation.ids);
  return ids.length === requested.size && ids.every((id) => requested.has(id)) && new Set(ids).size === requested.size;
}

/** Claims and synthetic fixtures never become real evidence without trusted, source-specific verification. */
export function buildTrialReport(journal: TrialJournal, options: TrialReportOptions = {}): TrialReport {
  const generatedAt = utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  const findings = new Map<TrialRequirement, TrialFinding>(trialRequirements.map((requirement) => [requirement, {
    requirement, status: "untested", sources: [], testedAt: null, result: "No verified real evidence recorded.",
    limitation: "Synthetic fixtures and unverified claims cannot establish provider suitability.",
    followUp: "Record the relevant authorized provider response or account/rights evidence and verify its source.",
  }]));
  const evidence = journal.plan.evidence.filter((item) => item.kind !== "synthetic" && instant(item.recordedAt) &&
    item.recordedAt <= generatedAt && trusted(options.verifyEvidence, item));
  const tasks = new Map(journal.plan.tasks.map((task) => [task.id, task]));
  const observed: Observed[] = journal.tasks.flatMap((state) => {
    const observation = state.observation;
    const task = tasks.get(state.id);
    if (state.status !== "completed" || !task || !observation || observation.taskId !== task.id ||
        observation.source !== "live-provider" || !instant(observation.observedAt) || observation.observedAt > generatedAt ||
        !trusted(options.verifyObservation, observation)) return [];
    return [{ task, observation }];
  });
  const expectedEndpoint = (task: TrialTask) => ({ fixtures: "fixtures", live: "fixtures", "fixture-ids": "fixtures",
    teams: "teams", competitions: "competitions", "player-statistics": "playerStatistics", "account-status": "accountStatus",
    statistics: "statistics", lineups: "lineups", injuries: "injuries", predictions: "predictions" } as const)[task.operation.kind];
  const validProvenance = (row: Observed) => row.observation.result.provenance.length > 0 &&
    row.observation.result.provenance.every((page) => isRecord(page) && isRecord(page.quota) && isRecord(page.requestParameters) &&
      page.provider === "api-football" && page.endpoint === expectedEndpoint(row.task) &&
      instant(page.retrievedAt) && page.retrievedAt <= row.observation.observedAt && parametersMatch(row.task, page));
  const selectedCompetition = (id: number, season: number | null) => journal.plan.competitions.some((item) => item.id === id && item.season === season);
  const fixtures: FixtureObservation[] = observed.flatMap((row) =>
    validProvenance(row) && ["fixtures", "live", "fixture-ids"].includes(row.task.operation.kind)
      ? row.observation.result.data.filter(fixture).filter((item) => selectedCompetition(item.competition.id, item.competition.season))
        .map((item) => ({ ...row, fixture: item })) : []);
  const predictions = observed.filter((row) => validProvenance(row) && row.task.operation.kind === "predictions");
  const set = (requirement: TrialRequirement, status: TrialFinding["status"], rows: readonly Observed[], result: string,
    limitation = "The recorded sample establishes this finding only for the tested account, fixtures and seasons.",
    followUp = "Repeat qualification when the provider contract, account or selected competitions change.") => {
    findings.set(requirement, { requirement, status, sources: observationSources(rows),
      testedAt: rows.length ? Math.max(...rows.map((row) => row.observation.observedAt)) as UtcInstant : null,
      result, limitation, followUp });
  };
  const record = (requirement: TrialRequirement, check: (item: TrialEvidence) => boolean, validKinds?: readonly TrialEvidence["kind"][]) => {
    const rows = evidence.filter((item) => item.requirement === requirement && (!validKinds || validKinds.includes(item.kind)));
    if (!rows.length) return;
    const confirmed = rows.every(check);
    findings.set(requirement, { requirement, status: confirmed ? "confirmed" : "failed", sources: rows.map(evidenceSource),
      testedAt: Math.max(...rows.map((item) => item.recordedAt)) as UtcInstant,
      result: confirmed ? "Verified source satisfies the recorded requirement." : "Verified source does not satisfy the requirement.",
      limitation: "Confirmation applies only to the verified record and its stated account, scope and period.",
      followUp: confirmed ? "Recheck before live operation or whenever these terms change." : "Resolve the conflicting or insufficient account/rights record before live operation." });
  };
  const citeEvidence = (requirement: TrialRequirement, evidenceRequirement: TrialRequirement = requirement) => {
    const records = evidence.filter((item) => item.requirement === evidenceRequirement);
    const current = findings.get(requirement)!;
    if (records.length) findings.set(requirement, { ...current, sources: [...new Set([...current.sources, ...records.map(evidenceSource)])],
      testedAt: Math.max(current.testedAt ?? 0, ...records.map((item) => item.recordedAt)) as UtcInstant });
  };
  const account = (item: TrialEvidence) => typeof journal.plan.accountId === "string" && item.value.accountId === journal.plan.accountId;
  record("candidate-competitions", (item) => journal.plan.competitions.length > 0 &&
    item.value.competitions === journal.plan.competitions.map(({ id, season }) => `${id}:${season}`).sort().join(","), ["operator-record"]);
  record("trial-allowance", (item) => positiveInteger(journal.plan.maxRequests) && item.value.allowance === journal.plan.maxRequests, ["operator-record"]);
  record("account-plan", (item) => account(item) && item.value.provider === "api-football" && item.value.plan === "Mega", ["account-record"]);
  record("account-limits", (item) => account(item) && positiveInteger(item.value.dailyLimit) && positiveInteger(item.value.minuteLimit), ["account-record"]);
  record("provider-reset", (item) => account(item) && item.value.observedBoundary === true &&
    typeof item.value.resetAtUtc === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.value.resetAtUtc), ["account-record"]);
  record("subscription-expiry", (item) => account(item) && instant(item.value.expiresAt) && item.value.expiresAt > generatedAt, ["account-record"]);
  record("payable-total", (item) => account(item) && item.value.currency === "USD" &&
    nonnegativeInteger(item.value.baseUsdCents) && nonnegativeInteger(item.value.taxUsdCents) &&
    nonnegativeInteger(item.value.paymentChargesUsdCents) && nonnegativeInteger(item.value.totalUsdCents) &&
    item.value.totalUsdCents === item.value.baseUsdCents + item.value.taxUsdCents + item.value.paymentChargesUsdCents &&
    item.value.totalUsdCents <= 4_500 &&
    item.value.taxesIncluded === true && item.value.paymentChargesIncluded === true, ["account-record"]);
  for (const [requirement, scope] of [["private-use-rights", "private-use"], ["data-redistribution", "data-redistribution"],
    ["prediction-redistribution", "prediction-redistribution"], ["remote-logo-rights", "remote-logo-display"]] as const) {
    record(requirement, (item) => item.value.permitted === true && item.value.scope === scope &&
      item.value.restrictionsReviewed === true, ["rights-record", "official-source"]);
  }
  record("media-host-restrictions", (item) => item.value.permitted === true && item.value.restrictionsReviewed === true &&
    typeof item.value.host === "string" && /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(item.value.host), ["rights-record", "official-source"]);

  if (observed.length) {
    const accounts = observed.filter((row) => validProvenance(row) && row.task.operation.kind === "account-status");
    if (accounts.length) {
      const values = accounts.flatMap(({ observation }) => observation.result.data).filter((data) =>
        isRecord(data) && isRecord(data.subscription) && isRecord(data.requests));
      const complete = accounts.every(({ observation }) => observation.result.status === "complete") && values.length === accounts.length;
      if (findings.get("account-plan")!.status === "untested") set("account-plan", complete && values.every((data) =>
        isRecord(data) && isRecord(data.subscription) && data.subscription.plan === "Mega" && data.subscription.active === true) ? "confirmed" : "failed",
        accounts, "Verified account status was checked for an active Mega subscription.", "Account status does not establish taxes, payment charges or redistribution rights.");
      if (findings.get("subscription-expiry")!.status === "untested") set("subscription-expiry", complete && values.every((data) =>
        isRecord(data) && isRecord(data.subscription) && instant(data.subscription.expiresAt) && data.subscription.expiresAt > generatedAt) ? "confirmed" : "failed",
        accounts, "Verified account expiry was checked against the report timestamp.");
      const accountLimitRecords = evidence.filter((item) => item.requirement === "account-limits" && item.kind === "account-record" && account(item));
      const actualLimitsValid = complete && accounts.every(({ observation }) => observation.result.provenance.some((page) => positiveInteger(page.quota.minuteLimit))) &&
        values.every((data) => {
          if (!isRecord(data) || !isRecord(data.requests)) return false;
          const requests = data.requests;
          return positiveInteger(requests.dailyLimit) && nonnegativeInteger(requests.current) && requests.current <= requests.dailyLimit &&
            accountLimitRecords.every((item) => item.value.dailyLimit === requests.dailyLimit && accounts.every(({ observation }) =>
              observation.result.provenance.every((page) => page.quota.minuteLimit === item.value.minuteLimit)));
        });
      set("account-limits", actualLimitsValid ? "confirmed" : "failed", accounts,
        "Verified actual account limits and minute headers were checked independently of the application's quota ceilings.",
        "The shared limiter applies its own stricter ceiling. Account limits do not independently establish the reset boundary.");
      citeEvidence("account-limits");
    }
    const incomplete = observed.filter((row) => !validProvenance(row) || !requestedIdsCovered(row) || row.observation.result.status !== "complete" ||
      row.observation.result.error !== null ||
      row.observation.result.completeness.missingIds.length > 0 || row.observation.result.completeness.reasons.length > 0 ||
      !row.observation.result.completeness.complete || row.observation.result.completeness.invalidRows > 0 ||
      successfulPages(row.observation).length === 0);
    const playerRows = observed.filter(({ task }) => task.operation.kind === "player-statistics");
    const pagesComplete = playerRows.length > 0 && playerRows.every(({ observation }) => {
      const pages = successfulPages(observation).filter((page) => page.endpoint === "playerStatistics");
      const total = pages[0]?.totalPages;
      return positiveInteger(total) && pages.length === total && pages.every((page, index) =>
        page.currentPage === index + 1 && page.totalPages === total);
    });
    if (incomplete.length || (playerRows.length && !pagesComplete)) set("pagination", "failed", observed,
      "A recorded import is incomplete or its pages do not establish every page exactly once.",
      "Partial results do not establish complete coverage.", "Repeat the bounded import and resolve every missing page or invalid row.");
    else if (pagesComplete) set("pagination", "confirmed", observed, "Recorded paginated player imports and unpaginated responses are complete.");
    else set("pagination", "untested", observed, "Recorded responses are complete; actual player pagination has not been sampled.",
      "Unpaginated fixture responses do not prove the player pagination contract.", "Run a bounded /players import spanning its reported pages.");
    const pages = observed.flatMap(({ observation }) => observation.result.provenance);
    if (pages.length) set("quota-headers", pages.every((page) => isRecord(page) && isRecord(page.quota) && nonnegativeInteger(page.quota.dailyRemaining) &&
      positiveInteger(page.quota.dailyLimit) && page.quota.dailyRemaining <= page.quota.dailyLimit &&
      nonnegativeInteger(page.quota.minuteRemaining) && positiveInteger(page.quota.minuteLimit) &&
      page.quota.minuteRemaining <= page.quota.minuteLimit) ? "confirmed" : "failed", observed,
      "Daily and minute quota headers were checked for presence and consistent numeric limits.",
      "Header observations do not independently prove billing entitlement or the reset boundary.");
    const sourceTimes = observed.flatMap(({ observation }) => observation.result.provenance);
    if (sourceTimes.length) set("provider-update-times", sourceTimes.every((page) => isRecord(page) && instant(page.providerUpdatedAt) &&
      page.providerUpdatedAt <= page.retrievedAt) ? "confirmed" : "failed", observed,
      "Provider update timestamps were checked independently of retrieval timestamps.",
      "Missing update time remains unknown; kickoff and HTTP Date are not provider update times.",
      "Verify source update semantics or explicitly approve a retrieval-only freshness policy.");
  }
  const sample = (requirement: TrialRequirement, matches: (row: FixtureObservation) => boolean, detail: string) => {
    const rows = fixtures.filter(matches);
    if (rows.length) set(requirement, "confirmed", rows, detail);
  };
  sample("league-sample", ({ fixture: item }) => item.competition.type === "League", "A real fixture identifies a league competition.");
  sample("cup-sample", ({ fixture: item }) => item.competition.type === "Cup", "A real fixture identifies a cup competition.");
  sample("postponed-sample", ({ fixture: item }) => item.status === "postponed" && settleMarketSelection("match-result", "draw", {
    status: item.status, cycleEligibility: { eligible: true }, regulationScore: item.regulationScore,
  }).status === "void", "A real postponed fixture is void under the shared settlement rules.");
  sample("extra-time-sample", ({ fixture: item }) => item.status === "finished-extra-time" && item.providerStatus === "AET",
    "A real extra-time fixture retains separate regulation and extra-time score fields.");
  sample("shootout-sample", ({ fixture: item }) => item.status === "finished-penalties" && item.providerStatus === "PEN",
    "A real shootout fixture retains separate regulation and penalty score fields.");
  sample("cross-midnight-sample", ({ fixture: item, task }) => instant(item.kickoff) &&
    getReportingDate(item.kickoff) !== toUtcIsoString(item.kickoff).slice(0, 10) && task.operation.kind === "fixtures" &&
    task.operation.query.date === getReportingDate(item.kickoff), "A real fixture belongs to the requested Kampala day across the UTC midnight boundary.");
  const competitionRows = observed.filter((row) => validProvenance(row) && row.task.operation.kind === "competitions");
  const lowCoverage = competitionRows.filter(({ observation }) => observation.result.data.filter(competition).some((item) =>
    item.seasons.some((season) => isRecord(season.coverage) && Object.values(season.coverage).some((value) => value === false))));
  const sampledLowCoverage = lowCoverage.filter(({ observation }) => observation.result.data.filter(competition).some((item) =>
    fixtures.some(({ fixture: match }) => match.competition.id === item.id && item.seasons.some((season) =>
      season.year === match.competition.season && Object.values(season.coverage).some((value) => value === false)))));
  if (sampledLowCoverage.length) set("low-coverage-sample", "confirmed", sampledLowCoverage,
    "A sampled fixture belongs to a competition season with reported unavailable field coverage.",
    "Coverage flags describe a competition season; availability still needs per-fixture inspection.");
  if (fixtures.length) {
    const complete = fixtures.every(({ fixture: item, observation }) => observation.result.status === "complete" &&
      instant(item.kickoff) && item.status !== "unknown" && positiveInteger(item.competition.season) &&
      typeof item.homeTeam.name === "string" && typeof item.awayTeam.name === "string");
    set("field-coverage", complete ? "confirmed" : "failed", fixtures,
      "Fixture identities, kickoff, status, season and team names were checked for actual availability.",
      "Optional statistics, injuries, lineups, xG and historical coverage are not implied by fixture endpoint access.",
      "Inspect requested ancillary fields per fixture and record their unavailable values.");
    const terminal = fixtures.filter(({ fixture: item }) => ["finished-regulation", "finished-extra-time", "finished-penalties"].includes(item.status));
    if (terminal.length) {
      const scoresValid = terminal.every(({ fixture: item }) => {
        const score = item.regulationScore;
        const mapping = evidence.some((record) => record.requirement === "regulation-scores" &&
          record.value.sourceField === "score.fulltime" && record.value.period === marketRules.period &&
          record.value.providerStatus === item.providerStatus && record.value.independentlyVerified === true);
        const checked = settleMarketSelection("match-result", "draw", { status: item.status,
          cycleEligibility: { eligible: true }, regulationScore: score });
        return mapping && score?.fixtureId === item.id && score.sourceField === "score.fulltime" &&
          score.providerStatus === item.providerStatus && (checked.status === "correct" || checked.status === "incorrect");
      });
      set("regulation-scores", scoresValid ? "confirmed" : "failed", terminal,
        scoresValid ? "Independently verified regulation score mappings pass the shared settlement validator."
          : "Final fixture scores cannot be independently qualified as regulation scores.",
        "Extra-time totals and shootout scores are excluded from regulation settlement.",
        "Obtain source-specific score-period evidence for every sampled final status.");
      citeEvidence("regulation-scores");
    }
    const groups = groupBy(fixtures, ({ fixture: item }) => item.id);
    const transitions = [...groups.values()].filter((rows) => new Set(rows.map(({ fixture: item }) => item.status)).size > 1 &&
      new Set(rows.map((row) => row.observation.observedAt)).size > 1);
    if (transitions.length) set("status-transitions", "confirmed", transitions.flat(),
      "Repeated observations of the same fixture ID show actual status transitions.",
      "A fixture disappearing from the live list is not a final-status observation.");
  }

  const identities: IdentityObservation[] = fixtures.flatMap(({ fixture: item, observation, task }) => [
    { kind: "team", id: item.homeTeam.id, name: item.homeTeam.name, country: item.homeTeam.country,
      season: item.competition.season, competitionId: item.competition.id, task, observation },
    { kind: "team", id: item.awayTeam.id, name: item.awayTeam.name, country: item.awayTeam.country,
      season: item.competition.season, competitionId: item.competition.id, task, observation },
    { kind: "competition", id: item.competition.id, name: item.competition.name, country: item.competition.country,
      season: item.competition.season, competitionId: item.competition.id, task, observation },
  ]);
  for (const row of observed) {
    if (!validProvenance(row) || row.task.operation.kind !== "teams" || !("competitionId" in row.task.operation.query)) continue;
    const { competitionId, season } = row.task.operation.query;
    if (!selectedCompetition(competitionId, season)) continue;
    for (const data of row.observation.result.data) {
      if (isRecord(data) && positiveInteger(data.id)) identities.push({ ...row, kind: "team", id: data.id,
        name: typeof data.name === "string" ? data.name : null, country: typeof data.country === "string" ? data.country : null,
        competitionId, season });
    }
  }
  const identityGroups = groupBy(identities, (item) => `${item.kind}:${item.id}`);
  const repeated = [...identityGroups.values()].filter((rows) => rows.every((row) => positiveInteger(row.season)) &&
    new Set(rows.map((row) => `${row.competitionId}:${row.season}`)).size > 1 && new Set(rows.map((row) => row.task.id)).size > 1);
  const fixtureGroups = groupBy(fixtures, ({ fixture: item }) => item.id);
  const conflictingFixtures = [...fixtureGroups.values()].filter((rows) => new Set(rows.map(({ fixture: item }) =>
    `${item.homeTeam.id}:${item.awayTeam.id}:${item.competition.id}:${item.competition.season}`)).size > 1);
  if (repeated.length || conflictingFixtures.length) {
    const stable = conflictingFixtures.length === 0 && repeated.every((rows) => {
      const contexts = groupBy(rows, (row) => `${row.competitionId}:${row.season}`);
      return [...contexts.values()].every((context) => context.some((row) => typeof row.name === "string" && typeof row.country === "string")) &&
        new Set(rows.filter((row) => row.country !== null).map((row) => row.country)).size === 1;
    });
    set("canonical-identities", stable ? "confirmed" : "failed", [...repeated.flat(), ...conflictingFixtures.flat()],
      "Repeated provider IDs were checked across seasons/competitions, including fixture team assignments and metadata.",
      "Sampled IDs do not prove global canonical identity or resolve ambiguous name collisions.");
    const aliases = repeated.filter((rows) => new Set(rows.filter((row) => row.name !== null).map((row) => row.name)).size > 1);
    if (aliases.length) set("aliases", stable ? "confirmed" : "failed", aliases.flat(),
      "Different reported names are attached to the same stable provider ID across contexts.",
      "Aliases remain source-owned labels; similarly named teams are not merged.");
  }

  const ancillary = observed.filter(({ task }) => task.operation.kind === "player-statistics"
    ? selectedCompetition(task.operation.query.competitionId, task.operation.query.season)
    : ["statistics", "lineups", "injuries"].includes(task.operation.kind) && "fixtureId" in task.operation &&
      fixtures.some(({ fixture: item }) => "fixtureId" in task.operation && item.id === task.operation.fixtureId));
  if (ancillary.length) {
    const available = ancillary.every((row) => validProvenance(row) && row.observation.result.status === "complete" && row.observation.result.completeness.complete &&
      row.observation.result.data.length > 0 && row.observation.result.data.every((data) => {
        if (!isRecord(data)) return false;
        switch (row.task.operation.kind) {
          case "statistics": return Array.isArray(data.statistics) && data.statistics.length > 0 && data.statistics.every((entry) =>
            isRecord(entry) && entry.supported === true && entry.value !== null);
          case "lineups": return data.kind === "lineups" && Array.isArray(data.startingPlayers) && data.startingPlayers.length === 11 &&
            data.startingPlayers.every((entry) => isRecord(entry) && positiveInteger(entry.id) && typeof entry.position === "string");
          case "injuries": return data.kind === "injuries" && isRecord(data.reportedInjury) &&
            positiveInteger(data.reportedInjury.playerId) && typeof data.reportedInjury.type === "string" && typeof data.reportedInjury.reason === "string";
          case "player-statistics": return isRecord(data.player) && positiveInteger(data.player.id) && Array.isArray(data.statistics) &&
            data.statistics.length > 0 && data.statistics.every((entry) => isRecord(entry) && isRecord(entry.games) && isRecord(entry.goals) &&
              nonnegativeInteger(entry.games.appearances) && nonnegativeInteger(entry.games.minutes) && nonnegativeInteger(entry.goals.total));
          default: return false;
        }
      }));
    const core = findings.get("field-coverage")!;
    set("field-coverage", available && core.status !== "failed" ? "confirmed" : "failed", [...fixtures, ...ancillary],
      available ? "Actual requested fixture and ancillary field availability was inspected."
        : "At least one requested ancillary response is incomplete, empty or lacks supported field values.",
      "Empty injuries or lineups remain unknown; missing fields do not establish healthy players or complete field coverage.",
      "Inspect unavailable fields per fixture and explicitly decide which enrichment inputs can be omitted.");
  }

  if (predictions.length) {
    const matchingFixture = (row: Observed, item: NormalizedFallbackPrediction): FixtureObservation | undefined => {
      if (row.task.operation.kind !== "predictions" || !row.task.fixtureTaskId) return undefined;
      const fixtureId = row.task.operation.fixtureId;
      return fixtures.find((prior) => prior.task.id === row.task.fixtureTaskId && prior.fixture.id === fixtureId &&
        prior.fixture.homeTeam.id === item.homeTeam.id && prior.fixture.awayTeam.id === item.awayTeam.id &&
        prior.observation.observedAt <= row.observation.observedAt);
    };
    const prematch = predictions.every((row) => row.observation.result.status === "complete" && row.observation.result.completeness.complete &&
      row.observation.result.data.length > 0 &&
      row.observation.result.data.every((data) => {
        if (!prediction(data)) return false;
        const prior = matchingFixture(row, data);
        return prior?.fixture.status === "scheduled" && instant(prior.fixture.kickoff) &&
          isBeforePublicationCutoff(row.observation.observedAt, prior.fixture.kickoff) &&
          isBeforePublicationCutoff(data.source.retrievedAt, prior.fixture.kickoff);
      }));
    set("fallback-prematch", prematch ? "confirmed" : "failed", predictions,
      prematch ? "Fallback responses are correlated with an earlier scheduled fixture observation and retrieved before the publication cutoff."
        : "Fallback response lacks complete, independently retrieved pre-match fixture context.",
      "Task tags alone do not establish pre-match availability.", "Record the scheduled fixture first and bind fallback to its ID, home/away assignments and kickoff.");
    const policy = journal.plan.freshness;
    const policyVerified = policy !== null && nonnegativeInteger(policy.maxRetrievalAgeMs) && nonnegativeInteger(policy.maxSourceAgeMs) &&
      trusted(options.verifyFreshness, policy);
    const sourceFresh = (timestamps: NormalizedFixture["source"], observedAt: UtcInstant) => {
      const age = observedAt - timestamps.retrievedAt;
      const update = timestamps.providerUpdatedAt;
      return age >= 0 && age <= policy!.maxRetrievalAgeMs && (update === null ? policy!.unknownUpdateTime === "retrieval-only" :
        instant(update) && update <= timestamps.retrievedAt && observedAt - update <= policy!.maxSourceAgeMs);
    };
    const fresh = policyVerified && predictions.every((row) => row.observation.result.data.length > 0 && row.observation.result.data.every((data) => {
      if (!prediction(data)) return false;
      const context = matchingFixture(row, data);
      return context !== undefined && sourceFresh(data.source, row.observation.observedAt) && sourceFresh(context.fixture.source, row.observation.observedAt);
    }));
    set("fallback-freshness", policyVerified ? fresh ? "confirmed" : "failed" : "untested", predictions,
      fresh ? "Stored timestamps satisfy the independently verified fallback freshness policy." :
        policyVerified ? "Fallback timestamps do not satisfy the approved freshness policy." : "Fallback freshness policy is missing or unverified.",
      "There is no default acceptance policy for an unknown provider update time.", "Approve explicit retrieval/source age limits and unknown-update handling, then repeat the checks.");
    citeEvidence("fallback-freshness");
    if (policyVerified) {
      const current = findings.get("fallback-freshness")!;
      findings.set("fallback-freshness", { ...current, sources: [...current.sources, `freshness-policy:${safeId(policy!.evidenceRef)}`] });
    }
    const mapping = evidence.some((item) => item.requirement === "fallback-match-result" &&
      item.value.period === marketRules.period && item.value.sourceField === "predictions.percent" &&
      item.value.probabilityUnits === "percent" && item.value.completeProbabilities === true);
    const probabilitiesValid = predictions.every((row) => row.observation.result.data.length > 0 && row.observation.result.data.every((data) =>
      prediction(data) && validateMarketGroup("match-result", { source: "api-football", period: marketRules.period,
        probabilities: { "home-win": typeof data.reportedPercentages.home === "number" ? data.reportedPercentages.home / 100 : null,
          draw: typeof data.reportedPercentages.draw === "number" ? data.reportedPercentages.draw / 100 : null,
          "away-win": typeof data.reportedPercentages.away === "number" ? data.reportedPercentages.away / 100 : null } }).valid));
    for (const requirement of ["fallback-match-result", "fallback-double-chance"] as const) {
      set(requirement, mapping && probabilitiesValid && prematch && fresh ? "confirmed" : "failed", predictions,
        !probabilitiesValid ? "Fallback fails the shared complete-probability validator." : !mapping ?
          "Numerical probabilities are usable, but their regulation-period source mapping is unverified." :
          !prematch || !fresh ? "Fallback probabilities lack qualified pre-match context or approved freshness." :
          requirement === "fallback-double-chance" ? "Double chance is derived by the shared validator from a qualified match-result group."
            : "Complete regulation match-result probabilities pass the shared validator.",
        "Advice, winners and endpoint access do not establish usable probabilities.",
        "Verify the probability source period, complete numerical group, pre-match context and freshness policy.");
      citeEvidence(requirement, "fallback-match-result");
    }
    for (const requirement of ["fallback-total-goals", "fallback-btts"] as const) set(requirement, "failed", predictions,
      requirement === "fallback-total-goals" ? "Recorded normalized fallback does not contain complementary 2.5-goal probabilities."
        : "Recorded normalized fallback does not contain complete BTTS probabilities or a verified derivation.",
      "No probabilities are invented from advice, a total-goals pick or predicted team goals.",
      "Obtain an explicit complete probability group or document and validate a supported derivation before enabling this family.");
  }
  const logoRows = observed.filter((row) => validProvenance(row) && row.observation.result.data.some((data) => logoReferences(data).length > 0));
  if (logoRows.length) set("credential-free-logo-urls", logoRows.every(({ observation }) =>
    observation.result.data.flatMap(logoReferences).every(validLogo)) ? "confirmed" : "failed", logoRows,
    "Every retained logo reference was checked for approved credential-free HTTPS without query strings or fragments.",
    "URL safety does not establish logo display rights or permission to download media.");
  const chargedRequests = chargedTrialRequests(journal);
  const knownDispatchedRequests = journal.tasks.reduce((total, task) => total + (task.dispatchedRequests ?? 0), 0);
  const uncertainTasks = journal.tasks.filter((task) => task.status === "running" || task.status === "uncertain" || task.dispatchedRequests === null).length;
  const hasDeferredTasks = journal.tasks.some((task) => task.status === "deferred");
  if (journal.plan.maxRequests !== null && chargedRequests > journal.plan.maxRequests) {
    const current = findings.get("trial-allowance")!;
    findings.set("trial-allowance", { ...current, status: "failed", result: "Recorded reservations exceed the configured trial allowance.",
      limitation: "Unknown dispatch counts retain their full reservation; resuming never refunds uncertain requests.",
      followUp: "Audit the journal and quota records before making another provider request." });
  }
  const rows = [...findings.values()];
  const liveSuitability = rows.some((row) => row.status === "failed") ? "failed" :
    uncertainTasks === 0 && !hasDeferredTasks && rows.every((row) => row.status === "confirmed") ? "qualified" : "incomplete";
  return freeze({ version: PROVIDER_TRIAL_VERSION, trialId: safeId(journal.plan.id), generatedAt, liveSuitability,
    budget: { allowance: journal.plan.maxRequests, chargedRequests, knownDispatchedRequests, uncertainTasks }, findings: rows,
    catalogImplementation: "permitted-with-pending-live-evidence", liveOperations: liveSuitability === "qualified" ? "qualified" : "blocked", launch: "blocked" });
}

const cell = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, " ").replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/`/g, "&#96;");

/** Fixed prose and source references only; never includes raw provider bodies, account values or credentials. */
export function renderTrialReport(report: TrialReport): string {
  return [
    `# Football provider trial ${cell(report.trialId)}`,
    "",
    `Generated ${toUtcIsoString(report.generatedAt)}. Live provider suitability: **${report.liveSuitability}**. ` +
      `Catalog implementation: ${report.catalogImplementation}. Live operations: ${report.liveOperations}. Launch: ${report.launch}.`,
    "",
    `Trial allowance: ${report.budget.allowance ?? "unresolved"}; charged reservations: ${report.budget.chargedRequests}; ` +
      `known dispatched requests: ${report.budget.knownDispatchedRequests}; uncertain tasks: ${report.budget.uncertainTasks}. ` +
      "Synthetic fixtures exercise local contracts and never qualify provider/account/rights evidence. This report does not activate live operations or qualify AI quality.",
    "",
    "| Requirement | Status | Fixture or source | Tested at (UTC) | Result | Limitation | Follow-up |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.findings.map((finding) => `| ${[finding.requirement, finding.status, finding.sources.join(", ") || "—",
      finding.testedAt === null ? "—" : toUtcIsoString(finding.testedAt), finding.result, finding.limitation, finding.followUp].map(cell).join(" | ")} |`),
    "",
  ].join("\n");
}
