import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { registeredForecastGoalMarkets } from "../src/domain/goal-market-definitions.ts";
import { assessLocalFeaturedPick, assessLocalFeaturedPickWithHistory, localFeaturedDecisionSchema,
  oddsFirstTieredFeaturedDecisionVersion as historicalBaselineVersion, validLocalFeaturedDecisionTime } from "../src/domain/local-featured-decision.ts";
import { assessLocalFeaturedHistory, historyAdjustedFeaturedProbability, localFeaturedHistoryKey,
  localFeaturedHistoryVersion } from "../src/domain/local-featured-history.ts";
import { legacyForecastMarketKey } from "../src/domain/legacy-goal-market-identities.ts";
import { isMarketFamily } from "../src/domain/markets.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { featuredEvaluationOccurrence, summarizeFeaturedHistoryComparison } from "../src/server/intelligence/local-featured-history-evaluation.ts";
import { readLocalFeaturedHistory } from "../src/server/intelligence/local-featured-history-store.ts";
import { readVerifiedReplayComparisonResults } from "../src/server/intelligence/november-replay-evaluation.ts";
import { loadNovemberReplayPricingInput } from "../src/server/intelligence/november-replay-featured.ts";
import { readFrozenLocalFeaturedPicks } from "../src/server/matches/frozen-featured-picks.ts";
import { collectUpcomingLocalFeaturedCandidates } from "../src/server/matches/upcoming-featured-pick.ts";
import { storedCutoffFeaturedBookmakerQuotes } from "../src/server/odds/odds-mysql-store.ts";
import { publicOddsEnabled } from "../src/server/odds/public-odds-policy.ts";
import { readFeaturedGoalMarkets } from "../src/server/predictions/extended-market-read.ts";
import { storedRevisions } from "../src/server/predictions/history-read.ts";
import { openForecastDatabase } from "./lib/forecast-database-target.mjs";

const coverageVersion = "november-market-coverage-v1";
const sealedCohort = "sealed-audit";
const newerCohort = "newer-frozen-cutoffs";
const definitions = registeredForecastGoalMarkets(true).map(({ definition }) => definition);
const reject = (reasons, reason) => { reasons[reason] = (reasons[reason] ?? 0) + 1; return null; };
class ComparisonInputError extends Error {}

async function readSealed(workspace, name) {
  const { hash, body } = JSON.parse(await readFile(join(workspace, name), "utf8"));
  if (hash !== evidenceFingerprint(body)) throw new ComparisonInputError("The selected replay workspace contains an invalid seal.");
  return body;
}

async function readReplayTargets(workspace, environment) {
  const audit = await readSealed(workspace, "audit.json");
  const run = await readSealed(workspace, "dry-run.json");
  if (audit.environment !== environment || audit.featuredDecisionVersion !== historicalBaselineVersion ||
    run.auditHash !== audit.auditHash || !run.summary.finished || run.coverageVersion !== coverageVersion)
    throw new ComparisonInputError("Supply a completed v3 audit from the selected database environment.");
  const names = (await readdir(workspace)).filter((name) => /^page-\d{5}\.json$/u.test(name)).sort();
  const estimates = [], seen = new Set(), finished = new Set();
  for (const [index, name] of names.entries()) {
    const page = await readSealed(workspace, name);
    if (page.auditHash !== audit.auditHash || page.index !== index || page.coverageVersion !== coverageVersion ||
      !["canonical", "displaced"].includes(page.phase) || finished.has(page.phase)) throw new ComparisonInputError("Replay checkpoint sequence does not match the completed audit.");
    if (page.finished) finished.add(page.phase);
    for (const item of page.rows) {
      const key = featuredEvaluationOccurrence(item);
      if (seen.has(key)) throw new ComparisonInputError("A sealed occurrence appears more than once.");
      seen.add(key);
      if (item.status === "estimated") estimates.push(item);
    }
  }
  if (seen.size !== run.summary.processed || estimates.length !== run.summary.estimated || finished.size !== 2)
    throw new ComparisonInputError("Replay workspace is missing completed checkpoint rows.");
  return { audit, summary: run.summary, estimates: estimates.sort((a, b) => a.input.decisionAt - b.input.decisionAt) };
}

function historyIndex(observations) {
  const indexed = new Map();
  for (const observation of observations) {
    const key = localFeaturedHistoryKey(observation.marketKey, observation.selection);
    if (!key) continue;
    const group = indexed.get(key) ?? [];
    group.push(observation);
    indexed.set(key, group);
  }
  return indexed;
}

function compareSelection({ input, expected, context, marketDefinitions, cohort }, indexed, reasons) {
  const baseline = assessLocalFeaturedPick(input, historicalBaselineVersion).decision;
  if (evidenceFingerprint(baseline) !== evidenceFingerprint(expected)) return reject(reasons, "baseline-not-reproduced");
  const { fixtureId, kickoffAt, decisionAt } = input;
  const cache = new Map();
  const { decision: informed } = assessLocalFeaturedPickWithHistory(input, (candidate) => {
    const key = localFeaturedHistoryKey(candidate.marketKey, candidate.selection);
    const candidateKey = JSON.stringify([candidate.marketKey, candidate.selection, candidate.probability]);
    if (!cache.has(candidateKey)) cache.set(candidateKey, assessLocalFeaturedHistory(
      { ...candidate, fixtureId, kickoffAt, decisionAt, context }, indexed.get(key) ?? []));
    return historyAdjustedFeaturedProbability(candidate.probability, cache.get(candidateKey));
  });
  if (baseline.status !== informed.status || baseline.status === "priced" &&
    (baseline.threshold !== informed.threshold || baseline.tier !== informed.tier || baseline.quote.decimal !== informed.quote.decimal))
    throw new ComparisonInputError("History ranking changed an existing selection gate.");
  const scopes = {}, support = [...cache.values()];
  for (const { scope, status } of support) {
    const name = `${scope ?? "none"}:${status}`;
    scopes[name] = (scopes[name] ?? 0) + 1;
  }
  const selectedKeys = new Set([baseline, informed].flatMap((pick) => pick.status === "abstained" ? [] :
    [isMarketFamily(pick.marketKey) ? legacyForecastMarketKey(pick.marketKey) : pick.marketKey]));
  return { fixtureId, kickoffAt, decisionAt, cohort, baseline, informed,
    definitions: marketDefinitions.filter(({ key }) => selectedKeys.has(key)),
    history: { assessed: cache.size, supported: support.filter(({ status }) => status === "supported").length, scopes,
      context: { competition: Boolean(context.competitionId), venue: typeof context.neutralVenue === "boolean", strength: Boolean(context.strength) } } };
}

const unavailableSealedQuotes = (decision) => decision.status !== "priced" && ["no-verified-odds", "odds-not-permitted"].includes(decision.reason);

function comparisonContext(contextByRevision, revisionId, homeTeamId, awayTeamId) {
  const proof = contextByRevision.get(revisionId);
  return proof && proof.homeTeamId === homeTeamId && proof.awayTeamId === awayTeamId
    ? proof : { homeTeamId, awayTeamId };
}

async function sealedComparison(database, row, audit, contexts, indexed, reasons) {
  const { fixtureId, kickoffAt, decisionAt, markets, teams, sourceRevisionId, featuredDecision } = row.input;
  const expected = localFeaturedDecisionSchema.parse(featuredDecision);
  if (row.fixtureId !== fixtureId || row.kickoffAt !== kickoffAt || row.decisionAt !== decisionAt ||
    !validLocalFeaturedDecisionTime(kickoffAt, decisionAt) || decisionAt > audit.auditedAt)
    return reject(reasons, "invalid-sealed-occurrence");
  const target = { fixtureId, kickoffAt, decisionAt };
  const context = comparisonContext(contexts, sourceRevisionId, teams[0], teams[1]);
  const input = unavailableSealedQuotes(expected) ? { ...target, quotes: null, quotesPermitted: expected.reason !== "odds-not-permitted",
    outcomes: markets.flatMap(({ definition, selections, unrepresentedProbability }) => selections.map(({ key, outcomes }) => ({
      marketKey: definition.key, selection: key, settlementProbabilities: outcomes, unrepresentedProbability,
    }))) } : await database.query((tx) => loadNovemberReplayPricingInput(tx, target, audit.auditedAt, markets));
  return compareSelection({ input, expected, context, marketDefinitions: markets.map(({ definition }) => definition),
    cohort: sealedCohort }, indexed, reasons);
}

async function newerCutoffs(database, from, evaluatedAt) {
  return database.query((tx) => tx.$queryRaw`SELECT f.id AS fixtureId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
    f.status, o.revisionId, o.at AS closedOperationAt,
    JSON_UNQUOTE(JSON_EXTRACT(o.operationJson,'$.effectiveCloseAt')) AS effectiveCloseAt
    FROM PredictionCycleOperation o JOIN PredictionCycle c ON c.id=o.cycleId AND c.fixtureId=o.fixtureId AND c.lockedSetId=o.revisionId
    JOIN FootballFixture f ON f.id=o.fixtureId AND f.activeCycleId=c.id
    WHERE o.kind='close' AND o.at>${new Date(from)} AND o.at<=${new Date(evaluatedAt)} AND o.featuredDecisionJson IS NOT NULL
      AND f.kickoff IS NOT NULL AND c.state='closed'
    ORDER BY o.at,f.id`);
}

async function compareNewer(database, rows, from, contexts, indexed, reasons) {
  const comparisons = [], occurrences = [];
  for (let offset = 0; offset < rows.length; offset += 25) {
    const page = rows.slice(offset, offset + 25);
    const [frozen, revisions, goals] = await database.query(async (tx) => {
      const ids = page.map(({ revisionId }) => revisionId);
      return [await readFrozenLocalFeaturedPicks(tx, page.map(({ fixtureId }) => fixtureId)),
        await storedRevisions(tx, ids), await readFeaturedGoalMarkets(tx, ids)];
    });
    for (const row of page) {
      const { fixtureId, revisionId, homeTeamId, awayTeamId } = row;
      const expected = frozen.get(fixtureId), revision = revisions.get(revisionId), kickoffAt = row.kickoffAt.getTime();
      const decisionAt = Number(row.effectiveCloseAt) - 1;
      if (decisionAt <= from) { reject(reasons, "cutoff-not-newer"); continue; }
      const context = revision?.candidate.context.context;
      if (!expected || !revision || expected.version !== historicalBaselineVersion || !validLocalFeaturedDecisionTime(kickoffAt, decisionAt) ||
        revision.fixtureId !== fixtureId || revision.publishedAt > decisionAt || revision.recordedAt > decisionAt ||
        !context || context.kickoffAt !== kickoffAt || context.home.teamId !== homeTeamId || context.away.teamId !== awayTeamId ||
        expected.status === "abstained" && expected.reason === "invalid-decision-time") {
        reject(reasons, "invalid-frozen-occurrence"); continue;
      }
      const accepted = Object.values(revision.candidate.markets).filter((item) => item.available);
      const outcomes = collectUpcomingLocalFeaturedCandidates({ markets: accepted }, goals.get(revisionId))?.map(({ outcome }) => outcome);
      if (!outcomes?.length) { reject(reasons, "missing-original-forecasts"); continue; }
      const target = { fixtureId, kickoffAt, decisionAt };
      const quotesPermitted = unavailableSealedQuotes(expected) ? expected.reason !== "odds-not-permitted" : publicOddsEnabled();
      const quotes = !quotesPermitted || unavailableSealedQuotes(expected) ? null : await database.query((tx) =>
        storedCutoffFeaturedBookmakerQuotes(tx, target, row.closedOperationAt.getTime()));
      const comparison = compareSelection({ input: { ...target, outcomes, quotes, quotesPermitted }, expected,
        context: comparisonContext(contexts, revisionId, homeTeamId, awayTeamId),
        marketDefinitions: definitions, cohort: newerCohort }, indexed, reasons);
      if (comparison) {
        comparisons.push(comparison);
        occurrences.push({ fixtureId, kickoffAt, teams: [homeTeamId, awayTeamId], status: row.status });
      }
    }
  }
  return { comparisons, occurrences };
}

let database;
try {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, environment: { type: "string", default: "development" } } });
  if (!values.workspace) throw new ComparisonInputError("Supply --workspace for the reviewed v3 replay.");
  const { audit, summary, estimates } = await readReplayTargets(resolve(values.workspace), values.environment);
  database = await openForecastDatabase(values.environment);
  const [{ asOf }] = await database.query((tx) => tx.$queryRaw`SELECT UTC_TIMESTAMP(3) AS asOf`);
  const evaluatedAt = asOf.getTime();
  if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt <= audit.auditedAt) throw new ComparisonInputError("The database audit clock did not advance.");
  const history = await readLocalFeaturedHistory(database, { before: evaluatedAt });
  const indexed = historyIndex(history.observations);
  const canonical = new Map(audit.occurrences.map((item) => [featuredEvaluationOccurrence(item), item]));
  const reasons = { [sealedCohort]: {}, [newerCohort]: {} };
  const comparisons = [];
  for (let offset = 0; offset < estimates.length; offset += 2) {
    const completed = await Promise.all(estimates.slice(offset, offset + 2).map((row) => sealedComparison(database, row, audit,
      history.contextByOriginalRevision, indexed, reasons[sealedCohort])));
    for (const item of completed) if (item) comparisons.push(item);
  }
  const occurrences = comparisons.flatMap((item) => canonical.get(featuredEvaluationOccurrence(item)) ?? []);
  const cutoffs = await newerCutoffs(database, audit.auditedAt, evaluatedAt);
  const newer = await compareNewer(database, cutoffs, audit.auditedAt, history.contextByOriginalRevision, indexed, reasons[newerCohort]);
  comparisons.push(...newer.comparisons);
  occurrences.push(...newer.occurrences);
  const truth = await readVerifiedReplayComparisonResults(database, occurrences, evaluatedAt);
  const report = summarizeFeaturedHistoryComparison(comparisons, truth);
  console.log(JSON.stringify({ environment: values.environment, auditHash: audit.auditHash, range: audit.range, auditedAt: audit.auditedAt,
    evaluatedAt, baselineVersion: historicalBaselineVersion, rankingVersion: localFeaturedHistoryVersion,
    scope: { [sealedCohort]: { occurrences: summary.processed, estimates: estimates.length, prospective: summary.prospective,
      precomparisonAbstained: summary.abstained }, [newerCohort]: { storedClosuresInspected: cutoffs.length } }, exclusions: reasons,
    acceptedHistory: history.coverage, resultTruth: truth.size, ...report }, null, 2));
} catch (error) {
  console.error(error instanceof ComparisonInputError ? error.message : "Historical featured-pick comparison failed; check the read-only database profile and replay seals.");
  process.exitCode = 1;
} finally {
  await database?.disconnect().catch(() => { process.exitCode = 1; });
}
