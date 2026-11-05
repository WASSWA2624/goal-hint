import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runIntelligenceReport, syntheticIntelligenceDataset } from '../scripts/intelligence-report.mjs';
import { captureShadowSlipForEvaluation } from '../src/server/slips/shadow-slip-evaluation.ts';
import { selectShadowSlips } from '../src/server/slips/shadow-slip-selection.ts';
import { shadowAt, shadowCandidate, shadowModel } from './helpers/shadow-slip-fixtures.mjs';

test('readiness loads no services and claims no actual observations or qualification', async () => {
  const report = await runIntelligenceReport([]);
  assert.equal(report.mode, 'off'); assert.equal(report.actualObservations, 0);
  assert.equal(report.aiRequests, 0); assert.equal(report.productionQualified, false);
  await assert.rejects(runIntelligenceReport(['--dataset', 'private-input.json']), /arguments/);
});

test('synthetic walkthrough archives reproducibly and refuses replacement of its original results', async () => {
  const parent = path.resolve('.tmp/intelligence-command-tests'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'report-'));
  const first = await runIntelligenceReport(['--demo', '--directory', directory]);
  const original = await readFile(first.archive, 'utf8');
  assert.equal(first.mode, 'synthetic'); assert.equal(first.providerRequests, 0);
  const bundle = JSON.parse(original);
  assert.equal(bundle.publicClaimAuthorized, false);
  assert.equal(bundle.wholeSlips.status, 'unavailable');
  assert.ok(bundle.report); assert.equal(bundle.dataset.fixtures.length, 6);
  assert.deepEqual(await runIntelligenceReport(['--demo', '--directory', directory]), first);
  await writeFile(first.archive, '{}');
  await assert.rejects(runIntelligenceReport(['--demo', '--directory', directory]), /archive-conflict/);
  await writeFile(first.archive, original);
});

async function verifiedSlipFixture() {
  const parent = path.resolve('.tmp/intelligence-command-tests'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'slip-evidence-'));
  const candidate = shadowCandidate('synthetic-cli-fixture', '2.50');
  const slip = selectShadowSlips({ candidates: [candidate], model: shadowModel([candidate]), asOf: shadowAt }).bands[0].slips[0];
  const capture = captureShadowSlipForEvaluation({ id: 'synthetic-cli-slip', mode: 'synthetic', capturedAt: shadowAt,
    evidenceCutoffAt: shadowAt - 1000, modelVersion: 'synthetic-v1', evidenceReference: 'synthetic-cli-capture', band: '1.5-5',
    slip, oddsObservedAt: [shadowAt - 2000] });
  const result = { fixtureId: candidate.selection.fixtureId, cycleId: null, scheduledKickoffAt: candidate.selection.kickoffAt,
    observedAt: shadowAt + 7_200_000, evidenceReference: 'synthetic-cli-result', context: { status: 'finished-regulation',
      cycleEligibility: { eligible: true }, regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home: 2, away: 0 } } };
  const dataset = { ...syntheticIntelligenceDataset(), slips: { captures: [capture], results: [result], asOf: result.observedAt } };
  const file = path.join(directory, 'dataset.json'); await writeFile(file, JSON.stringify(dataset));
  let sequence = 0;
  async function authority(extra) {
    const verifier = path.join(directory, `authority-${++sequence}.mjs`);
    // These privileged local verifiers approve synthetic fixture identities only.
    await writeFile(verifier, `export const authority = { authorizeDataset(dataset) {
      if (dataset.mode !== 'synthetic') throw new Error('Synthetic fixture only');
    }, verifyHistory: row => row.evidenceRef === 'synthetic-only-not-accuracy-evidence', ${extra} };`);
    return verifier;
  }
  return { directory, dataset, file, authority };
}
const approvedSlipCapture = "verifySlipCapture: capture => capture.id === 'synthetic-cli-slip'";
const approvedSlipResult = "verifySlipResult: result => result.evidenceReference === 'synthetic-cli-result'";
const dataArguments = (fixture, authority) => ['--dataset', fixture.file, '--authority', authority, '--directory', fixture.directory];

test('verified local slip evidence is archived with evaluated original outcomes and explicit quote convention', async () => {
  const fixture = await verifiedSlipFixture(), authority = await fixture.authority(`${approvedSlipCapture}, ${approvedSlipResult}`);
  const result = await runIntelligenceReport(dataArguments(fixture, authority)), bundle = JSON.parse(await readFile(result.archive, 'utf8'));
  assert.equal(bundle.wholeSlips.status, 'evaluated');
  assert.equal(bundle.wholeSlips.report.originals[0].hash, fixture.dataset.slips.captures[0].hash);
  assert.equal(bundle.wholeSlips.report.originals[0].outcome, 'won');
  assert.equal(bundle.wholeSlips.report.overall.sampleCount, 1);
  assert.equal(bundle.wholeSlips.report.overall.illustrativeReturns.returnUnits, 2.5);
  assert.equal(bundle.wholeSlips.report.overall.illustrativeReturns.quoteConvention, 'captured-two-decimal-total-quote');
  assert.equal(bundle.productionQualified, false); assert.equal(bundle.publicClaimAuthorized, false);
  assert.equal(bundle.providerRequests, 0); assert.equal(bundle.aiRequests, 0);
  assert.deepEqual(await runIntelligenceReport(dataArguments(fixture, authority)), result, 'identical verified inputs reuse the original archive');
});

test('slip command rejects missing or false capture/result authority and mismatched source modes', async () => {
  const fixture = await verifiedSlipFixture();
  for (const verifier of [approvedSlipCapture, approvedSlipResult,
    `verifySlipCapture: () => false, ${approvedSlipResult}`, `${approvedSlipCapture}, verifySlipResult: () => false`]) {
    const authority = await fixture.authority(verifier);
    await assert.rejects(runIntelligenceReport(dataArguments(fixture, authority)), /unverified-slip-evidence/);
  }
  const original = fixture.dataset.slips.captures[0];
  fixture.dataset.slips.captures[0] = { ...original, mode: 'prospective' };
  await writeFile(fixture.file, JSON.stringify(fixture.dataset));
  const authority = await fixture.authority(`${approvedSlipCapture}, ${approvedSlipResult}`);
  await assert.rejects(runIntelligenceReport(dataArguments(fixture, authority)), /unverified-slip-evidence/);
});
