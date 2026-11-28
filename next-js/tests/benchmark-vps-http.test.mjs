import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { parseBenchmarkOptions, runBenchmark } from "../scripts/benchmark-vps-http.mjs";

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("accepts approved origins and fixed routes while enforcing the staging pressure limits", () => {
  const staging = ["--origin", "https://test.goalhint.com", "--staging"];
  const options = parseBenchmarkOptions([...staging, "--route", "matches-more", "--concurrency", "2"]);
  assert.equal(options.staging, true);
  assert.equal(options.workload.routes[0].name, "matches-more");
  assert.ok(options.workload.routes[0].path.includes("through=2"));
  assert.throws(() => parseBenchmarkOptions(staging.slice(0, 2)), /with --staging/u);
  assert.throws(() => parseBenchmarkOptions([...staging, "--interval-ms", "499"]), /500/u);
  assert.throws(() => parseBenchmarkOptions([...staging, "--runs", "101"]), /100/u);
  assert.throws(() => parseBenchmarkOptions([...staging, "--concurrency", "3"]), /1 to 2/u);
  for (const origin of ["https://goalhint.com", "https://test.goalhint.com.example.org", "http://test.goalhint.com"]) {
    assert.throws(() => parseBenchmarkOptions(["--origin", origin, "--staging"]), /loopback origin/u);
  }
  for (const origin of ["http://127.0.0.1:3000/other", "http://127.0.0.1:3000/?x=1", "http://user@127.0.0.1:3000"]) {
    assert.throws(() => parseBenchmarkOptions(["--origin", origin]), /without a path/u);
  }
  assert.throws(() => parseBenchmarkOptions([...staging, "--route", "constructor"]), /Choose distinct/u);
  assert.throws(() => parseBenchmarkOptions([...staging, "--route", "matches-list", "--route", "matches-list"]), /Choose distinct/u);
});

test("keeps warmup separate and reports the same workload and bounded route mix on repeat", async t => {
  const paths = [];
  let active = 0;
  let peak = 0;
  const origin = await listen(t, async (request, response) => {
    paths.push(request.url);
    peak = Math.max(peak, ++active);
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.flushHeaders();
    await delay(20);
    active--;
    response.end("fixture");
  });
  const options = parseBenchmarkOptions(["--origin", origin, "--route", "matches-page", "--route", "account-session",
    "--runs", "3", "--warmup", "1", "--concurrency", "2", "--interval-ms", "0"]);
  const first = await runBenchmark(options);
  const repeat = await runBenchmark(options);
  assert.equal(first.workloadId, repeat.workloadId);
  const pair = ["/en/matches", "/api/account/session"];
  assert.deepEqual(paths, Array.from({ length: 8 }, () => pair).flat());
  assert.equal(peak, 2);
  assert.equal(first.stopped, null);
  assert.equal(first.warmup.total.requests, 2);
  assert.equal(first.measured.total.requests, 6);
  const summary = first.measured.routes["matches-page"];
  assert.deepEqual(summary.statuses, { 200: 3 });
  assert.equal(summary.completeMs.samples, 3);
  assert.ok(summary.completeMs.p50 > summary.ttfbMs.p50);
  assert.ok(summary.completeMs.p99 >= summary.completeMs.p95);
  assert.ok(summary.successfulPerSecond > 0);
});

test("counts HTTP and timeout failures and does not follow a redirect", async t => {
  const paths = [];
  const origin = await listen(t, (request, response) => {
    paths.push(request.url);
    if (request.url === "/en/matches") {
      response.writeHead(302, { Location: "/other" }).end();
    }
  });
  const report = await runBenchmark(parseBenchmarkOptions(["--origin", origin, "--route", "matches-page",
    "--route", "account-session", "--runs", "1", "--warmup", "0", "--timeout-ms", "100", "--interval-ms", "0"]));
  assert.deepEqual(paths, ["/en/matches", "/api/account/session"]);
  assert.deepEqual(report.measured.total.errors, { http: 1, timeout: 1 });
  assert.deepEqual(report.measured.total.statuses, { 302: 1 });
  assert.deepEqual(report.measured.total.ttfbMs, { samples: 0, p50: null, p95: null, p99: null });
});

test("halts measured work when the staging warmup encounters throttling", async t => {
  const origin = await listen(t, (_request, response) => response.writeHead(429).end());
  const options = parseBenchmarkOptions(["--origin", origin, "--route", "account-session", "--runs", "2"]);
  const report = await runBenchmark({ ...options, staging: true });
  assert.equal(report.stopped, "staging-rate-limited");
  assert.equal(report.warmup.total.requests, 1);
  assert.equal(report.measured.total.requests, 0);
});
