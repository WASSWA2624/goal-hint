import assert from 'node:assert/strict';
import { createServerMeasurements, withServerMeasurement } from '../src/server/monitoring/server-measurements.ts';

// Local CPU microbenchmark, not browser CWV, a load test or a production percentile.
const iterations = 250_000, collector = createServerMeasurements(60_000);
const families = ['feed', 'detail', 'revision', 'performance', 'other'];
const outcomes = ['success', 'failure', 'hit', 'miss', 'unavailable'];
const samples = [];
for (let round = 0; round < 6; round++) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) collector.record(families[i % 5], outcomes[Math.floor(i / 5) % 5], i % 500);
  if (round) samples.push((performance.now() - start) * 1000 / iterations);
}
const snapshot = collector.read();
assert.equal(snapshot.series.length, 25);
assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 16_384);
assert.equal(snapshot.series.reduce((sum, s) => sum + s.count, 0), iterations * 6);
const response = new Response(null), handler = async () => response, disabled = withServerMeasurement('feed', handler);
const start = performance.now();
for (let i = 0; i < 50_000; i++) assert.equal(await disabled(), response);
console.log(JSON.stringify({ evidence: 'local-in-process-microbenchmark', iterationsPerRound: iterations, rounds: 5,
  medianMicrosecondsPerRecord: samples.sort((a, b) => a - b)[2], disabledWrapperMicrosecondsPerCall: (performance.now() - start) * 1000 / 50_000,
  series: snapshot.series.length, serializedBytes: Buffer.byteLength(JSON.stringify(snapshot)), productionFieldEvidence: false }));
