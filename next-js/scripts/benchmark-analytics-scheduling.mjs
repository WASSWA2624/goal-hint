/**
 * Isolate analytics read scheduling with identical synthetic inputs and a bounded
 * five-connection queue. No database, private configuration or external requests.
 *
 * node --conditions=react-server scripts/benchmark-analytics-scheduling.mjs \
 *   --baseline <baseline-checkout>/next-js/src/server/analytics/analytics-report.ts \
 *   --output .tmp/analytics-scheduling-results.json
 *
 * The baseline module must retain its original imports/dependencies. These are
 * scheduling measurements, not production database or browser response times.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createAnalyticsReporter as after } from "../src/server/analytics/analytics-report.ts";

const { values } = parseArgs({ options: {
  baseline: { type: "string" }, output: { type: "string", default: ".tmp/analytics-scheduling-results.json" },
  samples: { type: "string", default: "9" },
} });
if (!values.baseline) throw new Error("Provide --baseline with the original analytics-report.ts module path.");
const count = Number(values.samples);
if (!Number.isInteger(count) || count < 3 || count > 51 || count % 2 !== 1) throw new Error("--samples must be an odd integer from 3 to 51.");
const baseline = resolve(values.baseline), current = fileURLToPath(new URL("../src/server/analytics/analytics-report.ts", import.meta.url));
if (baseline === current) throw new Error("The baseline must be a separate unchanged module.");
const { createAnalyticsReporter: before } = await import(pathToFileURL(baseline).href);
const query = { from: "2026-10-10", to: "2026-10-10", compare: "previous", filters: {} };
const now = () => Date.parse("2026-10-11T00:00:00Z");

function database() {
  let active = 0, maximum = 0, queries = 0;
  const queue = [];
  function drain() {
    while (active < 5 && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active++; maximum = Math.max(maximum, active);
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
    }
  }
  const schedule = task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
  return {
    query: operation => operation({ $queryRaw: sql => schedule(async () => {
      queries++;
      await new Promise(resolve => setTimeout(resolve, sql.sql.includes("GROUP BY weekday, hour") ? 180 : 8));
      return [];
    }) }),
    counts: () => ({ queries, maximum }),
  };
}

async function measure(create) {
  const db = database(), start = performance.now();
  const result = await create(db, { now }).report(query);
  return { durationMs: Math.round((performance.now() - start) * 1000) / 1000, ...db.counts(), result };
}

await measure(before); await measure(after);
const samples = { before: [], after: [] };
for (let run = 0; run < count; run++) {
  for (const [name, create] of run % 2 ? [["after", after], ["before", before]] : [["before", before], ["after", after]]) {
    const sample = await measure(create), prior = samples.before[0] ?? samples.after[0];
    if (prior) {
      assert.deepEqual(sample.result, prior.result, "Report output must remain identical.");
      assert.equal(sample.queries, prior.queries, "The change must not add queries.");
    }
    assert.ok(sample.maximum <= 5, "The simulated connection limit must remain bounded.");
    samples[name].push(sample);
  }
}
function statistics(rows) {
  const sorted = rows.map(row => row.durationMs).sort((a, b) => a - b);
  return { medianMs: sorted[Math.floor(count / 2)], minMs: sorted[0], maxMs: sorted.at(-1),
    samplesMs: rows.map(row => row.durationMs), queriesPerReport: rows[0].queries,
    maximumActiveQueries: Math.max(...rows.map(row => row.maximum)) };
}
const fingerprint = async path => createHash("sha256").update(await readFile(path)).digest("hex");
const report = {
  synthetic: true,
  description: "Real report functions with a five-connection simulated query queue; one heatmap read takes 180ms, each other read 8ms. Fixed empty rows and no database/external access. This isolates scheduling, not deployed database or browser latency.",
  baselineSourceSha256: await fingerprint(baseline), currentSourceSha256: await fingerprint(current),
  samples: count, interleaved: true, outputIdentical: true, before: statistics(samples.before), after: statistics(samples.after),
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
