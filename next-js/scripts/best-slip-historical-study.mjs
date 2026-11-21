import { parseArgs } from 'node:util';
import { addReportingDays, getReportingDayBounds, parseReportingDate, validateReportingDateRange } from '../src/domain/calendar.ts';
import { getRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createReadOnlyDatabase, DatabaseOperationError } from '../src/server/database/client.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { publicOddsEnabled } from '../src/server/odds/public-odds-policy.ts';
import { readBestSlipHistoricalInputs } from '../src/server/slips/best-slip-historical-inputs.ts';
import { readBestSlipHistoricalResults } from '../src/server/slips/best-slip-historical-results.ts';
import {
  bestSlipHistoricalObservationAt, buildBestSlipHistoricalSlates, evaluateBestSlipHistoricalStudy, gradeBestSlipHistoricalDay,
} from '../src/server/slips/best-slip-historical-slates.ts';

const maximumStudyDays = 90;
const profile = 'four-legs-2.50-5.00-06.30-eat-v1';
const windowOptions = ['fit-from', 'fit-until', 'holdout-from', 'holdout-until'];

function declaredWindows(args) {
  const { values } = parseArgs({ args, options: Object.fromEntries(windowOptions.map(key => [key, { type: 'string' }])) });
  const [fitFrom, fitUntil, holdoutFrom, holdoutUntil] = windowOptions.map(key => parseReportingDate(values[key]));
  if (fitFrom >= fitUntil || fitUntil > holdoutFrom || holdoutFrom >= holdoutUntil)
    throw new RangeError('Fit and holdout must be separate chronological windows.');
  validateReportingDateRange(fitFrom, addReportingDays(holdoutUntil, -1), maximumStudyDays);
  return { fitFrom, fitUntil, holdoutFrom, holdoutUntil };
}

function daysIn(from, until) {
  const result = [];
  for (let day = from; day < until; day = addReportingDays(day, 1)) result.push(day);
  return result;
}

async function main() {
  const windows = declaredWindows(process.argv.slice(2));
  const policy = getRuntimePolicy();
  const environment = process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT;
  if (!['development', 'staging', 'production'].includes(environment) || !publicOddsEnabled())
    throw new Error('A validated study target and verified odds rights are required.');
  const competitionIds = policy.choices.competitionIds ?? [];
  const scopeHash = evidenceFingerprint({ profile, environment, competitionIds: [...competitionIds].sort((a, b) => a - b) });
  const database = createReadOnlyDatabase(policy);
  try {
    const [session] = await database.query(tx => tx.$queryRaw`SELECT UTC_TIMESTAMP(3) AS auditedAt, @@SESSION.transaction_read_only AS readOnly`);
    const auditedAt = session?.auditedAt?.getTime();
    if (Number(session?.readOnly) !== 1 || !Number.isSafeInteger(auditedAt) ||
      auditedAt < getReportingDayBounds(windows.holdoutUntil).startInclusive)
      throw new Error('The study requires a read-only database and closed windows.');

    const captures = [], receipts = [], unavailable = [], coverage = [];
    for (const [phase, from, until] of [['fit', windows.fitFrom, windows.fitUntil],
      ['holdout', windows.holdoutFrom, windows.holdoutUntil]]) {
      const availableAt = getReportingDayBounds(until).startInclusive - 1;
      for (const day of daysIn(from, until)) {
        const observedAt = bestSlipHistoricalObservationAt(day);
        let input;
        try {
          input = await readBestSlipHistoricalInputs(database, { day, observedAt, auditedAt, competitionIds });
        } catch (error) {
          if (!(error instanceof DatabaseOperationError)) throw error;
          unavailable.push({ day, phase, stage: 'input', reason: error.code });
          continue;
        }
        const capture = buildBestSlipHistoricalSlates(input, { scopeHash, reconstructedAt: auditedAt });
        captures.push(capture);
        coverage.push({ day, phase, examined: input.examined, verifiedForecasts: input.verifiedForecasts,
          pricedFixtures: input.pricedFixtures, unresolvedOccurrences: input.unresolvedOccurrences,
          eligiblePicks: new Set(input.offers.map(item => item.selection.fixtureId)).size,
          exactOffers: input.offers.length, combinations: capture.slates.length,
          partialCoverage: input.partialCoverage, searchLimited: capture.searchLimited });
        if (!capture.slates.length) continue;
        try {
          const selections = capture.slates.flatMap(({ slip }) => slip.selections);
          const results = await readBestSlipHistoricalResults(database, { selections, observationAt: observedAt, availableAt, competitionIds });
          receipts.push(gradeBestSlipHistoricalDay(capture, { availableAt, recordedAt: auditedAt, results }));
        } catch (error) {
          if (!(error instanceof DatabaseOperationError)) throw error;
          unavailable.push({ day, phase, stage: 'settlement', reason: error.code });
        }
      }
    }
    if (!captures.length) throw new Error('The historical input reader returned no available days.');
    const evaluation = evaluateBestSlipHistoricalStudy({ captures, receipts, scopeHash, windows, assessedAt: auditedAt });
    process.stdout.write(JSON.stringify({ profile, windows, auditedAt, coverage, unavailable, evaluation }) + '\n');
  } finally { await database.disconnect(); }
}

try { await main(); } catch {
  process.stderr.write('Historical Best Slips study failed. No publication was attempted.\n');
  process.exitCode = 1;
}
