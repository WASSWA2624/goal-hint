import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProviderCoverageTarget, prepareProviderResponsePage, providerCoverageProgress, providerCoverageStates }
  from "../src/server/football/provider-coverage-contract.ts";
import { readFootballSourcePagePayload } from "../src/server/football/source-page-payload.ts";

const observedAt = Date.UTC(2026, 9, 1);
const request = { resource: "player-profile", endpoint: "playerStatistics", scope: { context: "historical", season: 2025, competitionId: 39 },
  parameters: { season: "2025", league: "39" }, page: 2, section: "all" };

test("checkpoints identify resource, scope, endpoint, page and section independently", () => {
  const scope = parseProviderCoverageTarget(request);
  assert.equal(scope.key, parseProviderCoverageTarget({ ...request, parameters: { league: "39", season: "2025" },
    scope: { season: 2025, competitionId: 39, context: "historical" } }).key);
  for (const patch of [{ resource: "player-statistics" }, { endpoint: "playerProfiles" }, { page: 1 }, { section: "home" },
    { scope: { ...request.scope, teamId: 18 } }]) assert.notEqual(parseProviderCoverageTarget({ ...request, ...patch }).key, scope.key);
  assert.throws(() => parseProviderCoverageTarget({ ...request, endpoint: "fixtures" }));
  assert.throws(() => parseProviderCoverageTarget({ ...request, parameters: { "x-apisports-key": "untrusted" } }));
  assert.throws(() => parseProviderCoverageTarget({ ...request, parameters: { page: "2" } }));
});

test("states preserve unknown remaining work and require evidence for completion", () => {
  const base = { status: "not_requested", reason: null, attempts: 0, updatedAt: observedAt, lastAttemptAt: null,
    lastResponseId: null, lastCompleteAt: null, nextRetryAt: null, remaining: null };
  const complete = { ...base, status: "complete", attempts: 1, lastAttemptAt: observedAt - 2,
    lastResponseId: "a".repeat(64), lastCompleteAt: observedAt, remaining: 0 };
  const active = ["not_requested", "queued", "fetching"];
  for (const status of providerCoverageStates) {
    const value = status === "complete" ? complete : { ...base, status, reason: active.includes(status) ? null : "scoped-evidence-pending" };
    assert.equal(providerCoverageProgress.parse(value).status, status);
  }
  assert.throws(() => providerCoverageProgress.parse({ ...base, status: "blocked_by_quota" }));
  assert.throws(() => providerCoverageProgress.parse({ ...complete, remaining: null }));
  assert.throws(() => providerCoverageProgress.parse({ ...complete, lastResponseId: null }));
  assert.throws(() => providerCoverageProgress.parse({ ...complete, nextRetryAt: observedAt - 1 }));
});

test("private envelope replay preserves bytes, unknown fields and null without inferring completion", async () => {
  const target = parseProviderCoverageTarget(request);
  const input = Buffer.from(`{
    "get":"players", "parameters":{"league":"39","season":"2025","page":"2"}, "errors":[],
    "results":1,"paging":{"current":2,"total":3},"response":[{"team":{"metadata":null},"futureId":18446744073709551615}]
  }`);
  const page = await prepareProviderResponsePage({ target, observedAt, body: input });
  assert.equal(page.endpoint, "raw:playerStatistics");
  assert.equal(page.rowCount, 1);
  assert.equal((await prepareProviderResponsePage({ target, observedAt, body: input })).id, page.id);
  assert.deepEqual(await readFootballSourcePagePayload(page), input);
  const empty = Buffer.from(input.toString().replace('"results":1', '"results":0').replace(/\[\{"team".*\}\]/u, "[]"));
  assert.equal((await prepareProviderResponsePage({ target, observedAt, body: empty })).rowCount, 0);
  const wrong = Buffer.from(input.toString().replace('"current":2', '"current":1'));
  await assert.rejects(prepareProviderResponsePage({ target, observedAt, body: wrong }), /archive scope/u);
  const wrongScope = Buffer.from(input.toString().replace('"league":"39"', '"league":"40"'));
  await assert.rejects(prepareProviderResponsePage({ target, observedAt, body: wrongScope }), /archive scope/u);
  const failed = Buffer.from(input.toString().replace('"errors":[]', '"errors":{"requests":"rate limit"}'));
  await assert.rejects(prepareProviderResponsePage({ target, observedAt, body: failed }));
});

test("a provider-confirmed empty first page is archived without making the scope complete", async () => {
  const target = parseProviderCoverageTarget({ ...request, page: 1 });
  const source = { get: "players", parameters: request.parameters, errors: [], results: 0,
    paging: { current: 1, total: 0 }, response: [] };
  const prepare = (body) => prepareProviderResponsePage({ target, observedAt, body: Buffer.from(JSON.stringify(body)) });
  assert.equal((await prepare(source)).rowCount, 0);
  await assert.rejects(prepare({ ...source, results: 1, response: [{ id: 1 }] }), /archive scope/u);
});
