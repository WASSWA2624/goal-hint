import { createServerMeasurements, withServerMeasurement } from '../../../src/server/monitoring/server-measurements.ts';

// Timing stays beside the measured JavaScript service. CLI orchestration and
// acceptance thresholds belong to the native Python verifier.
export async function benchmark({ iterations, rounds, wrapperCalls }) {
  const collector = createServerMeasurements(60_000), samples = [];
  const families = ['feed', 'detail', 'revision', 'performance', 'other'];
  const outcomes = ['success', 'failure', 'hit', 'miss', 'unavailable'];
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    for (let index = 0; index < iterations; index++) {
      collector.record(families[index % 5], outcomes[Math.floor(index / 5) % 5], index % 500);
    }
    if (round) samples.push((performance.now() - started) * 1000 / iterations);
  }
  const response = new Response(null), disabled = withServerMeasurement('feed', async () => response);
  let preservesIdentity = true;
  const started = performance.now();
  for (let index = 0; index < wrapperCalls; index++) preservesIdentity &&= await disabled() === response;
  const snapshot = collector.read();
  return { snapshot, samples, preservesIdentity, serializedBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    disabledWrapperMicrosecondsPerCall: (performance.now() - started) * 1000 / wrapperCalls };
}
