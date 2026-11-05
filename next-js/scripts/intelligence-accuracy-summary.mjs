import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marketRules, marketSelections, validateMarketSnapshot } from '../src/domain/markets.ts';
import { evidenceFingerprint, freezeEvidence } from '../src/server/evidence/evidence-input.ts';
import { readEvaluationFile } from '../src/server/evaluation/evaluation-archive.ts';
import { evaluateMarketMetrics, wilson } from '../src/server/evaluation/evaluation-metrics.ts';
import { estimateLocalGoals, localGoalDefaults } from '../src/server/intelligence/local-goals-model.ts';
import { estimateLeagueFrequency } from '../src/server/intelligence/walk-forward-evaluation.ts';

const primary = ['match-result', 'total-goals', 'both-teams-to-score'];
const statuses = ['settled', 'pending', 'void', 'cancelled', 'unavailable'];
const bands = [0, 0.2, 0.4, 0.6, 0.8, 1];
const hashPattern = /^[a-f0-9]{64}$/u;
const requireInput = (condition, reason) => { if (!condition) throw new Error(`accuracy-summary:${reason}`); };
const same = (left, right) => evidenceFingerprint(left) === evidenceFingerprint(right);
function verifySeal(value, label) {
  requireInput(value && typeof value === 'object' && hashPattern.test(value.hash), `${label}-hash`);
  const { hash, ...body } = value;
  requireInput(evidenceFingerprint(body) === hash, `${label}-hash`);
}
function markets(probabilities) {
  return validateMarketSnapshot(Object.fromEntries(primary.filter(family => probabilities?.[family]).map(family =>
    [family, { source: 'ai', period: marketRules.period, probabilities: probabilities[family],
      ...(family === 'total-goals' ? { line: 2.5 } : {}) }]))).markets;
}
function metrics(family, observations) {
  const result = evaluateMarketMetrics(family, observations, bands, 1.96);
  return { ...result, hitRateInterval: result.count ? wilson(result.correct, result.count, 1.96) : null };
}
function difference(left, right) { return left === null || right === null ? null : left - right; }

/** Summarizes an already authorized archive. The externally retained hash checks
 * integrity, not source authenticity; the original privileged verifier is not rerun.
 * Raw local fits are replayed with the frozen defaults, separately from validator
 * decisions. No result, threshold, provider call or live setting is changed. */
export function summarizeIntelligenceAccuracy(bundle, expectedBundleHash) {
  const dataset = bundle?.dataset, report = bundle?.report;
  requireInput(bundle?.version === 1 && Array.isArray(dataset?.history) && dataset.history.length <= 100_000 &&
    Array.isArray(dataset.fixtures) && dataset.fixtures.length <= 10_000 && Array.isArray(report?.forecasts) &&
    report.forecasts.length === dataset.fixtures.length && Array.isArray(report.cells) && report.cells.length <= 160_000,
  'invalid-bundle');
  requireInput(hashPattern.test(expectedBundleHash) && evidenceFingerprint(bundle) === expectedBundleHash, 'bundle-hash');
  requireInput(hashPattern.test(bundle.datasetHash) && evidenceFingerprint(dataset) === bundle.datasetHash, 'dataset-hash');
  verifySeal(report, 'report');
  requireInput(['synthetic', 'historical', 'prospective'].includes(dataset.mode) && report.mode === dataset.mode &&
    report.version === 'walk-forward-intelligence-v1' && report.fixtures === dataset.fixtures.length &&
    bundle.productionQualified === false && bundle.publicClaimAuthorized === false &&
    report.publicationAuthorized === false && report.predictiveAccuracyEstablished === false, 'report-binding');
  requireInput(dataset.configuration === undefined || dataset.configuration !== null && typeof dataset.configuration === 'object' &&
    !Array.isArray(dataset.configuration), 'configuration');
  const configuration = { ...localGoalDefaults, ...dataset.configuration };
  requireInput(same(configuration, localGoalDefaults), 'nondefault-configuration');
  const historyByFixture = new Map(dataset.history.map(row => [row.fixtureId, row]));
  requireInput(historyByFixture.size === dataset.history.length, 'duplicate-history');
  const fixtures = new Map();
  for (const entry of dataset.fixtures) {
    const fixture = entry.fixture, result = entry.result;
    requireInput(fixture && !fixtures.has(fixture.fixtureId) && statuses.includes(entry.status) &&
      fixture.forecastAt < fixture.kickoffAt - 300_000, 'fixture-binding');
    fixtures.set(fixture.fixtureId, entry);
    if (result) requireInput(['fixtureId', 'competitionId', 'homeTeamId', 'awayTeamId', 'kickoffAt']
      .every(key => result[key] === fixture[key]) && result.availableAt >= fixture.kickoffAt &&
      result.period === marketRules.period && [result.homeGoals, result.awayGoals].every(value => Number.isInteger(value) && value >= 0),
    'result-binding');
    requireInput(entry.status !== 'settled' || result, 'missing-result');
    if (entry.status === 'settled') {
      requireInput(!historyByFixture.has(fixture.fixtureId) || same(historyByFixture.get(fixture.fixtureId), result), 'conflicting-history');
      historyByFixture.set(fixture.fixtureId, result);
    }
  }
  const history = [...historyByFixture.values()], forecasts = new Map(), reasons = new Map();
  const operational = { eligibleShadow: 0, withheld: 0, published: 0 };
  for (const forecast of report.forecasts) {
    verifySeal(forecast, 'forecast');
    const entry = fixtures.get(forecast.fixtureId), local = forecast.components?.local;
    requireInput(entry && !forecasts.has(forecast.fixtureId) && forecast.forecastAt === entry.fixture.forecastAt &&
      forecast.version === 'shadow-validator-v1' && forecast.mode === 'shadow' && forecast.publish === false &&
      forecast.calibratedProbability === null && ['eligible-shadow', 'withhold'].includes(forecast.decision) &&
      Array.isArray(forecast.reasons) && forecast.reasons.every(reason => typeof reason === 'string'), 'forecast-binding');
    verifySeal(local, 'local');
    requireInput(same(local.fixture, entry.fixture) && same(local.configuration, configuration), 'local-binding');
    const replay = estimateLocalGoals({ fixture: entry.fixture, history, configuration });
    requireInput(local.hash === replay.hash, 'local-replay');
    forecasts.set(forecast.fixtureId, forecast);
    operational[forecast.decision === 'eligible-shadow' ? 'eligibleShadow' : 'withheld']++;
    // Reasons include diagnostic warnings even for eligible shadow forecasts.
    for (const reason of new Set(forecast.reasons)) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const groups = new Map();
  for (const { fixture, status, result } of dataset.fixtures) {
    const forecast = forecasts.get(fixture.fixtureId), local = markets(forecast.components.local.probabilities);
    const baseline = markets(estimateLeagueFrequency(history, fixture, configuration));
    const horizon = fixture.kickoffAt - fixture.forecastAt < 86_400_000 ? 'under-24h' : '24h-or-more';
    for (const family of Object.keys(marketSelections)) {
      const key = JSON.stringify([fixture.competitionId, horizon, family]);
      let group = groups.get(key);
      if (!group) {
        group = { competitionId: fixture.competitionId, horizon, family, fixtures: 0,
          statuses: Object.fromEntries(statuses.map(value => [value, 0])),
          operational: { eligibleShadow: 0, withheld: 0 }, localAvailable: 0, baselineAvailable: 0,
          local: [], baseline: [], matchedLocal: [], matchedBaseline: [], matchedKeys: [] };
        groups.set(key, group);
      }
      group.fixtures++; group.statuses[status]++;
      group.operational[forecast.decision === 'eligible-shadow' ? 'eligibleShadow' : 'withheld']++;
      const localMarket = local[family].available ? local[family].market : null;
      const baselineMarket = baseline[family].available ? baseline[family].market : null;
      if (localMarket) group.localAvailable++;
      if (baselineMarket) group.baselineAvailable++;
      if (status !== 'settled') continue;
      const context = { status: 'finished-regulation', cycleEligibility: { eligible: true },
        regulationScore: { verified: true, period: marketRules.period, home: result.homeGoals, away: result.awayGoals } };
      if (localMarket) group.local.push({ market: localMarket, result: context });
      if (baselineMarket) group.baseline.push({ market: baselineMarket, result: context });
      if (localMarket && baselineMarket) {
        group.matchedLocal.push({ market: localMarket, result: context });
        group.matchedBaseline.push({ market: baselineMarket, result: context });
        group.matchedKeys.push(fixture.fixtureId);
      }
    }
  }
  const cells = [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => {
    const own = (system, available, observations) => {
      const scored = metrics(group.family, observations), { hitRateInterval, ...originalMetrics } = scored;
      const archived = report.cells.filter(cell => cell.system === system && cell.competitionId === group.competitionId &&
        cell.family === group.family && cell.horizon === group.horizon);
      requireInput(archived.length === 1 && archived[0].fixtures === group.fixtures && archived[0].available === available &&
        same(archived[0].metrics, originalMetrics), 'archived-metrics-mismatch');
      return { available, abstentions: group.fixtures - available, coverage: available / group.fixtures,
        metrics: { ...originalMetrics, hitRateInterval } };
    };
    const local = metrics(group.family, group.matchedLocal), baseline = metrics(group.family, group.matchedBaseline);
    return { competitionId: group.competitionId, horizon: group.horizon, family: group.family, fixtures: group.fixtures,
      statuses: group.statuses, operational: group.operational,
      local: own('local', group.localAvailable, group.local), leagueFrequency: own('league-frequency', group.baselineAvailable, group.baseline),
      matched: { count: group.matchedKeys.length, fixtureKeysHash: evidenceFingerprint(group.matchedKeys.sort()),
        local, leagueFrequency: baseline, brierDifference: difference(local.brier, baseline.brier),
        logLossDifference: difference(local.logLoss, baseline.logLoss), hitRateDifference: difference(local.hitRate, baseline.hitRate) } };
  });
  const archivedAvailability = system => report.cells.filter(cell => cell.system === system).map(cell => ({
    competitionId: cell.competitionId, family: cell.family, horizon: cell.horizon, fixtures: cell.fixtures,
    available: cell.available, coverage: cell.coverage }));
  return freezeEvidence({ version: 'intelligence-accuracy-summary-v1', mode: dataset.mode, bundleHash: expectedBundleHash,
    datasetHash: bundle.datasetHash, reportHash: report.hash, configuration, fixtures: dataset.fixtures.length, history: dataset.history.length,
    operational: { ...operational, reasons: [...reasons].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([reason, count]) => ({ reason, count })) }, cells,
    otherComparisons: { status: 'unavailable', reason: 'This summary evaluates only the local model and league-frequency baseline.',
      providerArchivedAvailability: archivedAvailability('provider'), ensembleArchivedAvailability: archivedAvailability('ensemble') },
    wholeSlips: { status: 'unavailable', reason: 'Whole-slip captures and dependence qualification are outside this summary.' },
    roi: { status: 'unavailable', reason: 'No independently matched priced-bet analysis is performed.' },
    productionQualified: false, publicClaimAuthorized: false, limitations: [
      ...(dataset.mode === 'synthetic' ? ['Synthetic test data establishes no predictive accuracy.'] : []),
      'Hashes prove archive integrity only; this summary does not rerun the source authority or certify an untouched holdout.',
      'Raw model availability is separate from validator decisions; reason counts include warnings and can overlap.',
      'Matched differences use identical settled fixtures; own-cohort means may have different coverage.',
      'Wilson intervals are pointwise and assume independent fixtures; no bootstrap or significance claim is made.',
      'Small cohorts and sparse calibration bins are descriptive, not calibration qualification.',
      'The four markets overlap; do not pool their counts or compare their differently scaled Brier scores.',
      'Local fitting replays the frozen defaults using only results available at each forecast; no hyperparameters are tuned here.',
    ] });
}

export async function runIntelligenceAccuracySummary(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index], value = argv[++index];
    requireInput(['--bundle', '--hash'].includes(key) && !flags.has(key) && typeof value === 'string' && value && !value.startsWith('--'), 'arguments');
    flags.set(key, value);
  }
  requireInput(flags.size === 2, 'arguments');
  return summarizeIntelligenceAccuracy(JSON.parse(await readEvaluationFile(flags.get('--bundle'))), flags.get('--hash'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(await runIntelligenceAccuracySummary(process.argv.slice(2)), null, 2) + '\n'); }
  catch { process.stderr.write('Local accuracy summary refused; private inputs and diagnostics are withheld.\n'); process.exitCode = 1; }
}
