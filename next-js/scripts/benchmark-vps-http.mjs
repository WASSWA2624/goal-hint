/** Measure a fixed anonymous GET workload against an isolated instance or hosted staging. */
import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

const routes = {
  "matches-page": "/en/matches",
  "matches-list": "/api/matches?when=today&result=pending&page=1&pageSize=50",
  "matches-more": "/api/matches?when=today&result=pending&page=1&pageSize=50&through=2&leagues=0",
  "matches-summary": "/api/matches/summary?when=today",
  "best-slips-list": "/api/best-slips?period=today",
  "account-session": "/api/account/session",
};
const defaultRoutes = Object.keys(routes).filter(name => name !== "matches-more");
const stagingOrigin = "https://test.goalhint.com";
const stagingLimits = { concurrency: 2, minimumIntervalMs: 500, requests: 650, durationMs: 15 * 60_000 };
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 GoalHintOperatorBenchmark/1.0";
const usage = `Usage: node scripts/benchmark-vps-http.mjs --origin <loopback|staging> [--staging]
  [--route <name>]... [--runs 100] [--warmup 2] [--concurrency 1]
  [--interval-ms 500] [--timeout-ms 40000]

Selected routes default to ${defaultRoutes.join(", ")}.
Select matches-more explicitly to measure the bounded continuation.
Hosted staging requires --origin ${stagingOrigin} --staging.
Writes one JSON report to stdout. Request failures set exit code 1.`;

function boundedInteger(value, name, minimum, maximum) {
  if (!/^\d+$/u.test(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return Number(value);
}

export function parseBenchmarkOptions(args) {
  const { values } = parseArgs({ args, options: {
    origin: { type: "string" }, staging: { type: "boolean" }, route: { type: "string", multiple: true },
    runs: { type: "string", default: "100" }, warmup: { type: "string", default: "2" },
    concurrency: { type: "string", default: "1" }, "interval-ms": { type: "string", default: "500" },
    "timeout-ms": { type: "string", default: "40000" },
  } });
  const origin = URL.parse(values.origin);
  if (!origin || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password ||
    !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("Provide an HTTP or HTTPS origin without a path, query, fragment or credentials.");
  }
  const staging = origin.origin === stagingOrigin;
  if (staging ? !values.staging : values.staging || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error(`Use a loopback origin or ${stagingOrigin} with --staging.`);
  }
  const names = values.route ?? defaultRoutes;
  if (new Set(names).size !== names.length || names.some(name => !Object.hasOwn(routes, name))) {
    throw new Error(`Choose distinct --route names from ${Object.keys(routes).join(", ")}.`);
  }
  const runs = boundedInteger(values.runs, "runs", 1, staging ? 100 : 1000);
  const warmup = boundedInteger(values.warmup, "warmup", 0, staging ? 5 : 20);
  const concurrency = boundedInteger(values.concurrency, "concurrency", 1, staging ? stagingLimits.concurrency : 16);
  const intervalMs = boundedInteger(values["interval-ms"], "interval-ms", staging ? stagingLimits.minimumIntervalMs : 0, 60_000);
  const timeoutMs = boundedInteger(values["timeout-ms"], "timeout-ms", 1, 60_000);
  if (staging && names.length * (warmup + runs) > stagingLimits.requests) {
    throw new Error(`Staging allows at most ${stagingLimits.requests} requests including warmup.`);
  }
  return { origin, staging, workload: {
    routes: names.map(name => ({ name, path: routes[name] })),
    runsPerRoute: runs, warmupPerRoute: warmup, concurrency, intervalMs, timeoutMs,
  } };
}

function requestSample(origin, route, agent, timeoutMs, runSignal) {
  const path = route.path;
  const document = !path.startsWith("/api/");
  const transport = origin.protocol === "https:" ? https : http;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([runSignal, timeoutSignal]);
  const headers = document ? {
    Accept: "text/html",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  } : { Accept: "application/json" };
  return new Promise(resolve => {
    const started = performance.now();
    let status = null;
    let ttfbMs = null;
    const finish = error => resolve({ status, ttfbMs, completeMs: performance.now() - started, error });
    const failed = () => finish(runSignal.aborted ? "run-deadline" : timeoutSignal.aborted ? "timeout" : "transport");
    const request = transport.get(new URL(path, origin), { agent, signal,
      headers: { ...headers, "User-Agent": userAgent, "Accept-Encoding": "gzip" } }, response => {
      status = response.statusCode;
      ttfbMs = performance.now() - started;
      response.once("end", () => finish(status === 200 ? null : "http"));
      response.once("error", failed);
      response.resume();
    });
    request.once("error", failed);
  });
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function distribution(values) {
  const sorted = values.toSorted((left, right) => left - right);
  return {
    samples: sorted.length,
    ...Object.fromEntries([50, 95, 99].map(percentile =>
      [`p${percentile}`, sorted.length ? round(sorted[Math.ceil(percentile / 100 * sorted.length) - 1]) : null])),
  };
}

function summarize(samples, durationMs) {
  const passed = samples.filter(sample => !sample.error);
  const errors = {};
  const statuses = {};
  for (const sample of samples) {
    if (sample.status !== null) statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
    if (sample.error) errors[sample.error] = (errors[sample.error] ?? 0) + 1;
  }
  return {
    requests: samples.length,
    successful: passed.length,
    failed: samples.length - passed.length,
    requestsPerSecond: durationMs ? round(samples.length * 1000 / durationMs) : 0,
    successfulPerSecond: durationMs ? round(passed.length * 1000 / durationMs) : 0,
    statuses, errors,
    ttfbMs: distribution(passed.map(sample => sample.ttfbMs)),
    completeMs: distribution(passed.map(sample => sample.completeMs)),
  };
}

export async function runBenchmark({ origin, staging, workload }) {
  const { routes: workloadRoutes, runsPerRoute, warmupPerRoute, concurrency, intervalMs, timeoutMs } = workload;
  const agentOptions = { keepAlive: true, maxSockets: concurrency };
  const agent = origin.protocol === "https:"
    ? new https.Agent({ ...agentOptions, rejectUnauthorized: true })
    : new http.Agent(agentOptions);
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  let stopped = null;
  let nextStart = performance.now();
  let availabilityFailures = 0;
  const deadline = staging ? setTimeout(() => {
    stopped ??= "run-deadline";
    controller.abort();
  }, stagingLimits.durationMs) : undefined;

  async function phase(perRoute) {
    const started = performance.now();
    const results = Object.fromEntries(workloadRoutes.map(({ name }) => [name, []]));
    const total = perRoute * workloadRoutes.length;
    const active = new Set();
    let peakInFlight = 0;
    for (let index = 0; index < total && !stopped; index++) {
      if (active.size >= concurrency) await Promise.race(active);
      const waitMs = Math.ceil(nextStart - performance.now());
      if (!stopped && waitMs > 0) {
        try {
          await delay(waitMs, undefined, { signal: controller.signal });
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        }
      }
      if (stopped) break;
      // Cycle through the same ordered route mix in both warmup and measured work.
      const route = workloadRoutes[index % workloadRoutes.length];
      nextStart = performance.now() + intervalMs;
      const request = requestSample(origin, route, agent, timeoutMs, controller.signal).then(sample => {
        results[route.name].push(sample);
        if (staging && sample.status === 429) stopped ??= "staging-rate-limited";
        if (staging && (sample.status >= 500 || sample.error === "timeout" || sample.error === "transport")) {
          availabilityFailures++;
          if (availabilityFailures >= 5) stopped ??= "staging-availability-errors";
        }
      }).finally(() => active.delete(request));
      active.add(request);
      peakInFlight = Math.max(peakInFlight, active.size);
    }
    await Promise.all(active);
    const durationMs = performance.now() - started;
    return {
      plannedRequests: total,
      peakInFlight,
      durationMs: round(durationMs),
      total: summarize(Object.values(results).flat(), durationMs),
      routes: Object.fromEntries(Object.entries(results).map(([name, samples]) => [name, summarize(samples, durationMs)])),
    };
  }

  try {
    const warmup = await phase(warmupPerRoute);
    const measured = await phase(runsPerRoute);
    return {
      version: 1, startedAt, origin: origin.origin, workload,
      workloadId: createHash("sha256").update(JSON.stringify(workload)).digest("hex"),
      stopped, warmup, measured,
    };
  } finally {
    clearTimeout(deadline);
    agent.destroy();
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") {
      console.log(usage);
    } else {
      const report = await runBenchmark(parseBenchmarkOptions(args));
      console.log(JSON.stringify(report, null, 2));
      if (report.stopped || report.warmup.total.failed || report.measured.total.failed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
