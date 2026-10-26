import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createBraveResearchBinding, createLiveResearchRuntime, liveResearchRules, verifyLiveResearchSource } from '../src/server/live/live-research.ts';
import { liveAiModel } from '../src/server/live/live-ai-model.ts';
import { liveReferences } from '../src/server/live/live-plan.ts';
import { createResearchEvidenceAdapter } from '../src/server/evidence/evidence-research.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { evidenceContext, evidenceAuthority, evidencePolicy, EVIDENCE_NOW } from './helpers/evidence-fixtures.mjs';
import { buildPredictorPrompt } from '../src/server/predictor/predictor-prompt.ts';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { costJob, costPeriod, costRequest } from './helpers/cost-fixtures.mjs';
import { memoryCostStore } from './helpers/cost-memory-store.mjs';

const context = evidenceContext(), policy = parseRuntimePolicy({ NODE_ENV: 'development', GOAL_HINT_OPERATION_SCOPE: 'trial',
  GOAL_HINT_RESEARCH_ENABLED: 'true', RESEARCH_API_KEY: 'synthetic-research', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget',
  GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: '100', GOAL_HINT_JOB_REQUEST_LIMIT: '2', GOAL_HINT_JOB_TIMEOUT_SECONDS: '60',
  GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence',
  GOAL_HINT_RESEARCH_PROVIDER: 'brave-search', GOAL_HINT_RESEARCH_LICENSE_REF: 'synthetic-license', GOAL_HINT_RESEARCH_HOSTS: 'club.example' });
const configured = { ...policy, capabilities: { ...policy.capabilities, research: true } };
const excerpt = 'Synthetic United confirms that its leading scorer is suspended for the next match after the disciplinary decision.';
const html = (body = excerpt, published = EVIDENCE_NOW - 60_000, modified = null) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle',
  headline: 'Synthetic squad announcement', datePublished: new Date(published).toISOString(), ...(modified === null ? {} : { dateModified: new Date(modified).toISOString() }) })}</script><p>${body}</p>`;
function setup(options = {}) {
  let searches = 0, fetches = 0;
  const binding = createBraveResearchBinding({ policy, verify: () => true, clock: { now: () => EVIDENCE_NOW }, names: async () => ['Synthetic United', 'Synthetic City'],
    fetcher: async (url, init) => { searches++; assert.equal(init.headers['X-Subscription-Token'], 'synthetic-research');
      assert.equal(new URL(url).origin, 'https://api.search.brave.com'); assert.equal(new URL(url).searchParams.get('count'), '4');
      return Response.json({ web: { results: options.results ?? [{ url: 'https://club.example/squad', description: 'Unverified search snippet must never become evidence.' }] } }); },
    sourceFetcher: { async fetch(url, network) { fetches++; assert.deepEqual(network.hosts, ['club.example']);
      return options.fetchDenied ? { status: 'denied', reason: 'unavailable', requests: 1 } : { status: 'fetched', text: options.html ?? html(), sourceUrl: url, finalUrl: url, bytes: 200, requests: 1, contentType: 'text/html' }; } } });
  const transport = { signal: new AbortController().signal, maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }, timeoutMs: 14000,
    permit: { attemptId: 'a'.repeat(64), jobId: 'b'.repeat(64), periodId: 'c'.repeat(64), ownerToken: 'd'.repeat(64) } };
  return { binding, transport, async run() { return binding.binding.search({ context, policy: evidencePolicy(), plan: {}, transport, credential: 'synthetic-research' }); },
    counts: () => ({ searches, fetches }) };
}

test('configured research invokes one search, fetches original attributed article, and reaches independent AI context', async () => {
  const h = setup(), result = await h.run(); assert.deepEqual(h.counts(), { searches: 1, fetches: 1 });
  assert.equal(result.value.sources.length, 1); const source = result.value.sources[0];
  assert.equal(source.claims[0].summary, excerpt); assert.equal(source.publisher, 'club.example'); assert.equal(source.sourceUrl, 'https://club.example/squad');
  assert.equal(source.publishedAt, EVIDENCE_NOW - 60_000); assert.equal(source.retrievedAt, EVIDENCE_NOW);
  assert.equal(verifyLiveResearchSource(source, context, configured), true);
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy({ minimum: { requireVenue: false } }), sources: [source] }, evidenceAuthority());
  const prompt = buildPredictorPrompt({ snapshot, model: modelVersion(), authority: { evidence: evidenceAuthority(), verifyModel: () => true, verifyTransmission: () => true } }); assert.ok(prompt.inputJson.includes(excerpt));
  assert.equal(prompt.inputJson.includes('Unverified search snippet'), false);
  assert.equal(result.usage.observedUsdPicos, liveResearchRules.requestUsdPicos);
  assert.equal(h.binding.verifyUsage(result.usage, { request: { attemptId: h.transport.permit.attemptId, jobId: h.transport.permit.jobId, category: 'research', provider: 'brave-search' },
    periodId: h.transport.permit.periodId, ownerToken: h.transport.permit.ownerToken }), true);
});

test('search snippets, unknown/future/stale publication clocks, future updates, and unrelated teams cannot supply research', async () => {
  for (const content of ['<p>Search snippet only.</p>', html().replace(/\.000Z/gu, '.000'), html(excerpt, EVIDENCE_NOW + 1), html(excerpt, EVIDENCE_NOW - 4 * 86_400_000),
    html(excerpt, EVIDENCE_NOW - 60_000, EVIDENCE_NOW + 1), html('An unrelated club confirms its scorer is injured and unavailable for selection for the upcoming match.')]) {
    const h = setup({ html: content }); assert.deepEqual((await h.run()).value.sources, []);
  }
});

test('only permitted exact HTTPS hosts are fetched, articles are deduplicated, and no more than two are requested', async () => {
  const h = setup({ results: [{ url: 'http://club.example/insecure' }, { url: 'https://evil.example/a' }, { url: 'https://club.example/a?token=private' },
    { url: 'https://club.example/a' }, { url: 'https://club.example/b' }] });
  await h.run(); assert.deepEqual(h.counts(), { searches: 1, fetches: 1 });
  const bounded = setup({ results: [{ url: 'https://club.example/a' }, { url: 'https://club.example/a' }, { url: 'https://club.example/b' }, { url: 'https://club.example/c' }] });
  assert.equal((await bounded.run()).value.sources.length, 2); assert.deepEqual(bounded.counts(), { searches: 1, fetches: 2 });
});

test('unconfigured research adapter performs no search and records unavailable coverage accurately', async () => {
  const period = costPeriod('no-research', 'research'), job = costJob(period, 'no-research');
  const request = costRequest(job, 'no-research', { priority: { kind: 'fixture', kickoffAt: context.kickoffAt } });
  let calls = 0;
  const adapter = createResearchEvidenceAdapter({ runtimePolicy: policy, verifyEvidence: () => true, authority: evidenceAuthority(),
    binding: null, gateway: { async execute() { calls++; throw new Error('must not call'); } }, verifyBinding: () => true });
  const result = await adapter.collect(context, evidencePolicy(), { job, request, maxSources: 2, targetIndependentSources: 1,
    maxResponseBytes: 16000, maxExtractCharacters: 1000, evidenceRef: 'synthetic-research' });
  assert.equal(result.reason, 'unconfigured'); assert.equal(result.requestsDispatched, 0); assert.equal(calls, 0);
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy({ minimum: { requireVenue: false } }), sources: [] }, evidenceAuthority());
  assert.equal(snapshot.coverage.limitedNews, true); assert.equal(snapshot.coverage.sufficient, true);
});

test('unsupported research provider or missing source policy fails before accounting or network use', async () => {
  for (const research of [{ ...policy.choices.research, provider: 'unsupported-search' }, { ...policy.choices.research, hosts: null }]) {
    let calls = 0;
    await assert.rejects(createLiveResearchRuntime({ policy: { ...policy, choices: { ...policy.choices, research } },
      verify: () => true, refs: {}, model: {}, fallbackReserveMs: 60000, evidenceAuthority: evidenceAuthority(),
      database: { async query() { calls++; throw new Error('must not query'); } }, fetcher: async () => { calls++; throw new Error('must not fetch'); } }),
    /supported provider and exact approved source hosts/u);
    assert.equal(calls, 0);
  }
});

test('the live preparation binding actually executes an accounted research attempt and returns valid evidence', async () => {
  const env = { NODE_ENV: 'development', GOAL_HINT_OPERATION_SCOPE: 'trial', GOAL_HINT_AI_ENABLED: 'true', AI_API_KEY: 'synthetic-ai',
    GOAL_HINT_AI_PROVIDER: 'openai', GOAL_HINT_AI_MODEL: 'gpt-6.1-sol', GOAL_HINT_CALIBRATION_REF: 'synthetic-none',
    GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS: '100', GOAL_HINT_RESEARCH_ENABLED: 'true', RESEARCH_API_KEY: 'synthetic-research',
    GOAL_HINT_RESEARCH_PROVIDER: 'brave-search', GOAL_HINT_RESEARCH_LICENSE_REF: 'synthetic-license', GOAL_HINT_RESEARCH_HOSTS: 'club.example',
    GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS: '100', GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness',
    GOAL_HINT_PIPELINE_INTEGRITY_REF: 'synthetic-integrity', GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'synthetic-retention',
    GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'synthetic-public', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget', GOAL_HINT_JOB_REQUEST_LIMIT: '8', GOAL_HINT_JOB_TIMEOUT_SECONDS: '180', GOAL_HINT_JOB_TOKEN_LIMIT: '100000' };
  const runtimePolicy = parseRuntimePolicy(env), clock = { value: EVIDENCE_NOW }, usage = []; let searches = 0;
  const runtime = await createLiveResearchRuntime({ policy: runtimePolicy, model: liveAiModel(runtimePolicy), verify: () => true,
    refs: liveReferences(runtimePolicy), fallbackReserveMs: 60000, clock: { now: () => clock.value }, costStore: memoryCostStore(clock),
    evidenceAuthority: evidenceAuthority(), database: { async query(fn) { return fn({ footballTeam: { async findMany() {
      return [{ id: context.home.teamId, name: 'Synthetic United' }, { id: context.away.teamId, name: 'Synthetic City' }]; } } }); } },
    fetcher: async () => { searches++; return Response.json({ web: { results: [{ url: 'https://club.example/squad-a' }, { url: 'https://club.example/squad-b' }] } }); },
    sourceFetcher: { async fetch(url) { const report = `${excerpt} ${url.endsWith('a') ? 'A' : 'B'}`.padEnd(450, 'x');
      return { status: 'fetched', text: html(report), sourceUrl: url, finalUrl: url, bytes: 200, requests: 1, contentType: 'text/html' }; } } });
  const result = await runtime.prepare({ jobId: 'b'.repeat(64), context, cycle: { cutoffAt: EVIDENCE_NOW + 600000 }, entry: { envelope: { fallbackReserveMs: 60000 } } },
    { remainingMs: () => 180000, deadlineAt: EVIDENCE_NOW + 180000, signal: new AbortController().signal, async recordUsage(value) { usage.push(value); } });
  assert.equal(result.reason, null); assert.equal(searches, 1); assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every(source => source.claims[0].summary.length === 450));
  assert.equal(usage[0].requests, 1); assert.equal(usage[0].phase, 'completed');
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy({ minimum: { requireVenue: false } }), sources: result.sources }, evidenceAuthority());
  assert.equal(snapshot.sources.length, 2); assert.equal(snapshot.facts[0].values[0].summary.length, 450);
});
