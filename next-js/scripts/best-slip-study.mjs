import { constants } from 'node:fs';
import { link, open, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { addReportingDays, getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { getRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createReadOnlyDatabase } from '../src/server/database/client.ts';
import { publicOddsEnabled } from '../src/server/odds/public-odds-policy.ts';
import { bestSlipStudyScopeHash, captureBestSlipStudy } from '../src/server/slips/best-slip-study-capture.ts';
import { parseBestSlipStudyCapture, parseBestSlipStudyReceipt } from '../src/server/slips/best-slip-study-contract.ts';
import { evaluateBestSlipStudy } from '../src/server/slips/best-slip-study-evaluation.ts';
import { observeBestSlipStudyResults } from '../src/server/slips/best-slip-study-results.ts';

const maximumFileBytes = 4_194_304;
const captureName = /^capture-(\d{4}-\d{2}-\d{2})(?:-([a-f0-9]{64}))?\.json$/u;
const receiptName = /^outcome-([a-f0-9]{64})-(\d{1,15})\.json$/u;
const reportingDay = at => getReportingDate(utcInstantFromEpochMilliseconds(at));

function isPrivate(info) {
  return !process.getuid || (info.uid === process.getuid() && (info.mode & 0o077) === 0);
}

async function privateDirectory(input) {
  if (!input || !isAbsolute(input)) throw new Error('An absolute private directory is required.');
  const path = await realpath(input);
  const info = await stat(path);
  if (!info.isDirectory() || !isPrivate(info)) throw new Error('The account must own the private study directory.');
  return path;
}

async function readRecord(path, validate) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximumFileBytes || !isPrivate(info)) throw new Error('Invalid private study record.');
    return validate(JSON.parse(await file.readFile('utf8')));
  } finally { await file.close(); }
}

async function storeRecord(directory, name, value) {
  const data = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(data) > maximumFileBytes) throw new Error('Study record exceeds its size budget.');
  const temporary = join(directory, '.study-' + randomUUID());
  try {
    await writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
    await link(temporary, join(directory, name));
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return false;
  } finally { await unlink(temporary).catch(error => { if (error?.code !== 'ENOENT') throw error; }); }
}

async function readCaptures(directory, names, scopeHash, include = () => true) {
  const captures = new Map();
  for (const name of names) {
    const [, day, fileScope] = captureName.exec(name) ?? [];
    if (!day || !include(day) || (fileScope && fileScope !== scopeHash)) continue;
    const capture = await readRecord(join(directory, name), parseBestSlipStudyCapture);
    if (reportingDay(capture.capturedAt) !== day || (fileScope && fileScope !== capture.scopeHash)) {
      throw new Error('Capture filename and seal disagree.');
    }
    if (capture.scopeHash !== scopeHash) continue;
    if (captures.has(day)) throw new Error('Duplicate Best Slips study capture for the reporting day and scope.');
    captures.set(day, capture);
  }
  return captures;
}

async function readReceipt(directory, name) {
  const [, hash, at] = receiptName.exec(name);
  const receipt = await readRecord(join(directory, name), parseBestSlipStudyReceipt);
  if (receipt.captureHash !== hash || receipt.observedAt !== Number(at)) throw new Error('Outcome filename and seal disagree.');
  return receipt;
}

async function collect(directory, requestedDay, names, probe = false) {
  const policy = getRuntimePolicy();
  const environment = process.env.GOAL_HINT_DEPLOYMENT_ENVIRONMENT;
  if (!['development', 'staging', 'production'].includes(environment) || !publicOddsEnabled())
    throw new Error('A validated study target and verified odds rights are required.');
  const { bookmakerId: primaryBookmakerId } = policy.choices.odds;
  if (!Number.isSafeInteger(primaryBookmakerId) || primaryBookmakerId <= 0)
    throw new Error('A configured primary bookmaker is required.');
  const options = { environment, primaryBookmakerId };
  const competitionIds = policy.choices.competitionIds ?? [];
  const scopeHash = bestSlipStudyScopeHash(competitionIds, options);
  const database = createReadOnlyDatabase(policy);
  try {
    const [session] = await database.query(tx => tx.$queryRaw`SELECT @@SESSION.transaction_read_only AS readOnly`);
    if (Number(session?.readOnly) !== 1) throw new Error('The study database session is not read-only.');
    if (probe) {
      const capture = await captureBestSlipStudy(database, competitionIds, options);
      return { mode: 'probe', day: reportingDay(capture.capturedAt), observedAt: capture.observedAt, scopeHash: capture.scopeHash,
        examined: capture.examined, eligible: capture.eligible, combinations: capture.slates.length,
        searchLimited: capture.searchLimited, partialCoverage: capture.partialCoverage };
    }
    const day = reportingDay(Date.now());
    const oldest = addReportingDays(day, -7);
    const targetDay = requestedDay && parseReportingDate(requestedDay);
    const captures = await readCaptures(directory, names, scopeHash, date => targetDay ? date === targetDay : date >= oldest && date <= day);
    const recipients = targetDay ? [captures.get(targetDay)]
      : [...captures.entries()].filter(([date, capture]) => date < day && capture.slates.length).map(([, capture]) => capture);
    if (targetDay && !recipients[0]) throw new Error('There is no original capture for that reporting day.');
    let receipts = 0;
    for (const capture of recipients) {
      const prefix = 'outcome-' + capture.hash + '-';
      const previousName = names.filter(name => name.startsWith(prefix) && receiptName.test(name)).sort((a, b) =>
        Number(receiptName.exec(b)[2]) - Number(receiptName.exec(a)[2]))[0];
      const previous = previousName ? await readReceipt(directory, previousName) : null;
      const result = await observeBestSlipStudyResults(database, capture);
      if (previous && JSON.stringify(previous.outcomes) === JSON.stringify(result.outcomes)) continue;
      if (await storeRecord(directory, prefix + result.observedAt + '.json', result)) receipts++;
    }
    if (targetDay) return { mode: 'results', receipts };
    let capture = captures.get(day), stored = false;
    if (!capture) {
      const candidate = await captureBestSlipStudy(database, competitionIds, options);
      const captureDay = reportingDay(candidate.capturedAt);
      const name = 'capture-' + captureDay + '-' + scopeHash + '.json';
      stored = await storeRecord(directory, name, candidate);
      capture = stored ? candidate : await readRecord(join(directory, name), parseBestSlipStudyCapture);
      if (reportingDay(capture.capturedAt) !== captureDay || capture.scopeHash !== scopeHash)
        throw new Error('A conflicting study capture already exists.');
    }
    return { mode: 'capture', day: reportingDay(capture.capturedAt), observedAt: capture.observedAt,
      scopeHash: capture.scopeHash, captureHash: capture.hash, examined: capture.examined, eligible: capture.eligible,
      combinations: capture.slates.length, searchLimited: capture.searchLimited, partialCoverage: capture.partialCoverage, stored, receipts };
  } finally { await database.disconnect(); }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    directory: { type: 'string' }, date: { type: 'string' }, scope: { type: 'string' },
    'fit-from': { type: 'string' }, 'fit-until': { type: 'string' },
    'holdout-from': { type: 'string' }, 'holdout-until': { type: 'string' },
  } });
  const [mode] = positionals;
  if (positionals.length !== 1 || !['probe', 'collect', 'results', 'evaluate'].includes(mode))
    throw new Error('Choose probe, collect, results or evaluate.');
  const directory = await privateDirectory(values.directory);
  const names = (await readdir(directory)).sort();
  let report;
  if (mode === 'evaluate') {
    if (values.date || !values.scope) throw new Error('Evaluate requires a scope and declared chronological windows.');
    const captures = [...(await readCaptures(directory, names, values.scope)).values()];
    const captureHashes = new Set(captures.map(({ hash }) => hash));
    const receipts = [];
    for (const name of names) {
      const captureHash = receiptName.exec(name)?.[1];
      if (captureHashes.has(captureHash)) receipts.push(await readReceipt(directory, name));
    }
    report = evaluateBestSlipStudy({ captures, receipts, scopeHash: values.scope, assessedAt: Date.now(),
      windows: { fitFrom: values['fit-from'], fitUntil: values['fit-until'],
        holdoutFrom: values['holdout-from'], holdoutUntil: values['holdout-until'] } });
  } else {
    if ((mode === 'results') !== Boolean(values.date) || values.scope || values['fit-from'] ||
      values['fit-until'] || values['holdout-from'] || values['holdout-until']) throw new Error('Invalid study selection.');
    report = await collect(directory, values.date, names, mode === 'probe');
  }
  process.stdout.write(JSON.stringify(report) + '\n');
}

try { await main(); } catch {
  process.stderr.write('Best Slips study failed. No publication was attempted.\n');
  process.exitCode = 1;
}
