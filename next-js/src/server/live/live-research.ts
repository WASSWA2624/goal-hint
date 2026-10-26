import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { assertOperationAllowed, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import type { CostAuthority, CostAttempt, CostPeriodPolicy, CostUsage, CostStore } from "../cost-control/cost-contract.ts";
import { costFingerprint, costUsdPicosFromCents, parseCostUsage, parseCostRate } from "../cost-control/cost-input.ts";
import { createCostGateway } from "../cost-control/cost-gateway.ts";
import { createMysqlCostStore } from "../cost-control/cost-mysql-store.ts";
import { createPolicyCostService } from "../cost-control/cost-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { EvidenceAuthority, EvidenceContext, EvidenceSource } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, evidenceSourceId, freezeEvidence } from "../evidence/evidence-input.ts";
import { createEvidenceSourceFetcher, type EvidenceSourceNetworkPolicy } from "../evidence/evidence-network.ts";
import { createResearchEvidenceAdapter, type ResearchEvidencePlan, type ResearchProviderBinding } from "../evidence/evidence-research.ts";
import type { JobHandlerContext } from "../jobs/job-registry.ts";
import type { ModelVersion } from "../predictor/predictor-contract.ts";
import type { RefreshMember } from "../refresh/refresh-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import { liveAiAccountingWindow } from "./live-ai-model.ts";
import { liveAiAllocation, liveAiEvidencePolicy } from "./live-ai-plan.ts";
import type { LiveReferences } from "./live-plan.ts";

import { liveResearchRules } from "./live-research-policy.ts";
export { liveResearchRules } from "./live-research-policy.ts";
const same = (a: unknown, b: unknown) => evidenceFingerprint(a) === evidenceFingerprint(b);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: string) => value.replace(/<[^>]*>/gu, " ").replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gu, " ").replace(/\s+/gu, " ").trim();
function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/u.test(value)) return null;
  const at = Date.parse(value); return Number.isSafeInteger(at) && at >= 0 ? at : null;
}
function article(html: string, names: readonly string[], context: EvidenceContext) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/giu)];
  const metadata: Record<string, unknown>[] = [];
  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script[1]!);
      const values = Array.isArray(parsed) ? parsed : record(parsed) && Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
      for (const value of values) if (record(value) && ["NewsArticle", "Article", "SportsArticle"].includes(String(value["@type"]))) metadata.push(value);
    } catch { /* Malformed metadata is unavailable, never a source of guessed clocks. */ }
  }
  const meta = metadata.find((value) => timestamp(value.datePublished) !== null);
  if (!meta) return null;
  const publishedAt = timestamp(meta.datePublished)!, updatedAt = timestamp(meta.dateModified);
  if (publishedAt > context.cutoffAt || context.analysisAt - publishedAt > liveResearchRules.freshnessMs ||
    updatedAt !== null && (updatedAt < publishedAt || updatedAt > context.cutoffAt)) return null;
  const paragraphs = [...html.replace(/<(?:script|style|nav|footer)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|footer)>/giu, "")
    .matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/giu)].map((match) => text(match[1]!));
  if (typeof meta.articleBody === "string") paragraphs.unshift(text(meta.articleBody));
  const excerpt = paragraphs.find((value) => value.length >= 40 && value.length <= liveResearchRules.maxExtractCharacters &&
    names.some((name) => value.toLocaleLowerCase("en").includes(name.toLocaleLowerCase("en"))) &&
    /injur|suspend|squad|line.?up|scor|assist|minutes|manager|coach|venue|neutral|pitch|weather|travel|schedule|rest|qualif|final|title|relegat/iu.test(value));
  if (!excerpt) return null;
  const title = typeof meta.headline === "string" ? text(meta.headline).slice(0, 200) : "Verified publisher football report";
  return { excerpt, title, publishedAt, updatedAt };
}

/** Only fetched article text with original metadata is research. Search snippets never become claims. */
export function createBraveResearchBinding(options: Readonly<{ policy: RuntimePolicy; verify: EvidenceVerifier;
  names(context: EvidenceContext): Promise<readonly string[]>; fetcher?: typeof fetch; clock?: Clock;
  sourceFetcher?: Pick<ReturnType<typeof createEvidenceSourceFetcher>, "fetch"> }>) {
  const { policy } = options, hosts = policy.choices.research.hosts ?? [], clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const proofs = new Map<string, { usage: string; owner: string; period: string; job: string }>();
  const authorize = () => assertOperationAllowed(policy, "research", options.verify);
  const network: EvidenceSourceNetworkPolicy = { sourceId: "approved-football-news", hosts, queryNames: [],
    contentTypes: ["text/html", "application/xhtml+xml"], maxRequests: 1, maxRedirects: 0,
    maxBytes: liveResearchRules.maxArticleBytes, maxTextCharacters: liveResearchRules.maxArticleBytes,
    timeoutMs: 4000, evidenceRef: policy.choices.research.licenseRef! };
  const sourceFetcher = options.sourceFetcher ?? createEvidenceSourceFetcher({ authorize,
    verifyPolicy: (value) => same(value, network), verifyUrl: (url) => hosts.includes(new URL(url).hostname) });
  const binding: ResearchProviderBinding = { provider: liveResearchRules.provider, contractVersion: liveResearchRules.contract,
    evidenceRef: policy.choices.research.licenseRef!, async search(input) {
      const started = performance.now(), names = await options.names(input.context);
      if (names.length !== 2 || names.some((name) => !name.trim() || name.length > 100) || hosts.length === 0) throw new Error("Research identity unavailable.");
      const query = `${names.map((name) => `"${name.replace(/["\\]/gu, "")}"`).join(" OR ")} football injuries squad scorer lineup venue weather schedule`;
      const url = new URL(liveResearchRules.endpoint);
      url.search = new URLSearchParams({ q: query, count: String(liveResearchRules.maxResults), freshness: "pw", result_filter: "web",
        extra_snippets: "false", text_decorations: "false", spellcheck: "false" }).toString();
      input.transport.signal.throwIfAborted(); authorize();
      const response = await (options.fetcher ?? fetch)(url.href, { headers: { "X-Subscription-Token": input.credential, accept: "application/json" },
        signal: input.transport.signal, redirect: "error", cache: "no-store", credentials: "omit" });
      if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";")[0] !== "application/json" || !response.body)
        throw new Error("Research provider unavailable.");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try { while (true) { input.transport.signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength; if (bytes > liveResearchRules.maxSearchBytes) { await reader.cancel(); throw new Error("Research response too large."); }
        chunks.push(part.value); } } finally { reader.releaseLock(); }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!record(raw) || !record(raw.web) || !Array.isArray(raw.web.results)) throw new Error("Research response invalid.");
      const sources: EvidenceSource[] = [], seen = new Set<string>();
      // One search and at most two article requests; no redirects or retries.
      for (const item of raw.web.results.slice(0, liveResearchRules.maxResults)) {
        if (seen.size >= liveResearchRules.maxArticles) break;
        if (!record(item) || typeof item.url !== "string") continue;
        let sourceUrl: URL; try { sourceUrl = new URL(item.url); } catch { continue; }
        if (!hosts.includes(sourceUrl.hostname) || sourceUrl.protocol !== "https:" || sourceUrl.search || seen.has(sourceUrl.href)) continue;
        seen.add(sourceUrl.href); authorize(); input.transport.signal.throwIfAborted();
        const fetched = await sourceFetcher.fetch(sourceUrl.href, network, { signal: input.transport.signal });
        if (fetched.status !== "fetched") continue;
        const extracted = article(fetched.text, names, input.context); if (!extracted) continue;
        const retrievedAt = clock.now(), body = { kind: "news" as const, sourceKey: evidenceFingerprint(sourceUrl.href), syndicationKey: evidenceFingerprint(extracted.excerpt.toLowerCase()),
          version: liveResearchRules.contract, publisher: sourceUrl.hostname, title: extracted.title, sourceUrl: sourceUrl.href,
          publishedAt: utcInstantFromEpochMilliseconds(extracted.publishedAt), retrievedAt,
          providerUpdatedAt: extracted.updatedAt === null ? null : utcInstantFromEpochMilliseconds(extracted.updatedAt),
          binding: { fixtureId: input.context.fixtureId, fixtureVersion: input.context.fixtureVersion, externalFixtureId: input.context.externalFixtureId,
            homeTeamId: input.context.home.teamId, awayTeamId: input.context.away.teamId, homeExternalId: input.context.home.externalId, awayExternalId: input.context.away.externalId },
          evidenceRef: policy.choices.evidencePolicyRef!, reuse: { evidenceRef: policy.choices.research.licenseRef!, allowSummary: true,
            retainUntil: utcInstantFromEpochMilliseconds(retrievedAt + liveResearchRules.retentionMs) },
          claims: [{ kind: "news" as const, subjectTeamId: null, key: `article-${evidenceFingerprint(sourceUrl.href)}`,
            value: { claim: extracted.excerpt }, summary: extracted.excerpt,
            certainty: /rumou?r|reportedly|unconfirmed|could|may\s|doubt/iu.test(extracted.excerpt) ? "unknown" as const : "confirmed" as const,
            asOfAt: utcInstantFromEpochMilliseconds(extracted.updatedAt ?? extracted.publishedAt) }] };
        sources.push({ id: evidenceSourceId(body), ...body });
      }
      const usage = parseCostUsage({ attemptId: input.transport.permit.attemptId,
        reconciliationId: costFingerprint({ attempt: input.transport.permit.attemptId, response: raw }), kind: "complete",
        observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }, elapsedMs: Math.ceil(performance.now() - started),
        observedUsdPicos: liveResearchRules.requestUsdPicos, invoicedUsdPicos: null, observedAt: clock.now(), evidenceRef: liveResearchRules.documentation });
      proofs.set(usage.reconciliationId, { usage: costFingerprint(usage), job: input.transport.permit.jobId,
        period: input.transport.permit.periodId, owner: input.transport.permit.ownerToken });
      if (proofs.size > 1024) proofs.delete(proofs.keys().next().value!);
      return freezeEvidence({ value: { sources }, usage });
    } };
  return { binding, verifyUsage(usage: CostUsage, attempt: CostAttempt) {
    const proof = proofs.get(usage.reconciliationId); return !!proof && proof.usage === costFingerprint(usage) &&
      usage.attemptId === attempt.request.attemptId && attempt.request.category === "research" && attempt.request.provider === liveResearchRules.provider &&
      proof.job === attempt.request.jobId && proof.period === attempt.periodId && proof.owner === attempt.ownerToken;
  } };
}

export function verifyLiveResearchSource(source: EvidenceSource, context: EvidenceContext, policy: RuntimePolicy): boolean {
  if (!policy.capabilities.research || source.kind !== "news" || source.version !== liveResearchRules.contract ||
    source.evidenceRef !== policy.choices.evidencePolicyRef || source.reuse.evidenceRef !== policy.choices.research.licenseRef ||
    source.sourceUrl === null || source.publishedAt === null || source.publishedAt > context.cutoffAt ||
    context.analysisAt - source.publishedAt > liveResearchRules.freshnessMs || source.claims.length !== 1) return false;
  try {
    const url = new URL(source.sourceUrl), claim = source.claims[0]!;
    return (policy.choices.research.hosts ?? []).includes(url.hostname) && source.publisher === url.hostname && url.protocol === "https:" &&
      source.sourceKey === evidenceFingerprint(url.href) && source.syndicationKey === evidenceFingerprint(claim.summary.toLowerCase()) &&
      claim.kind === "news" && claim.subjectTeamId === null && claim.summary === claim.value.claim &&
      claim.summary.length <= liveResearchRules.maxExtractCharacters && claim.key === `article-${evidenceFingerprint(url.href)}`;
  } catch { return false; }
}

export async function createLiveResearchRuntime(options: Readonly<{ policy: RuntimePolicy; verify: EvidenceVerifier; refs: LiveReferences;
  database: DatabaseRuntime; model: ModelVersion; evidenceAuthority: EvidenceAuthority; fallbackReserveMs: number;
  fetcher?: typeof fetch; clock?: Clock; costStore?: CostStore;
  sourceFetcher?: Pick<ReturnType<typeof createEvidenceSourceFetcher>, "fetch"> }>) {
  const { policy, database } = options, clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  if (policy.choices.research.provider !== liveResearchRules.provider || !policy.choices.research.hosts?.length)
    throw new Error("Optional research needs the supported provider and exact approved source hosts.");
  const allocation = liveAiAllocation(policy, options.model, clock.now(), options.fallbackReserveMs);
  const assigned = allocation.research; if (!assigned) throw new Error("Research allocation unavailable.");
  const accountId = evidenceFingerprint({ provider: liveResearchRules.provider, account: policy.choices.research.licenseRef });
  const plans = new Map<string, ResearchEvidencePlan>();
  const authorize = () => assertOperationAllowed(policy, "research", options.verify);
  const transport = createBraveResearchBinding({ policy, verify: options.verify, clock, ...(options.fetcher ? { fetcher: options.fetcher } : {}), ...(options.sourceFetcher ? { sourceFetcher: options.sourceFetcher } : {}),
    async names(context) {
      const teams = await database.query((tx) => tx.footballTeam.findMany({ where: { id: { in: [context.home.teamId, context.away.teamId] } }, select: { id: true, name: true } }));
      return [context.home.teamId, context.away.teamId].flatMap((id) => teams.find((team) => team.id === id)?.name ?? []);
    } });
  function period(at: number): CostPeriodPolicy {
    const window = liveAiAccountingWindow(utcInstantFromEpochMilliseconds(at));
    return { accountId, category: "research", periodId: evidenceFingerprint({ accountId, month: window.name }), startsAt: window.startsAt, endsAt: window.endsAt,
      capUsdPicos: costUsdPicosFromCents(policy.choices.budgets.researchMonthlyUsdCents!), openingChargedUsdPicos: 0n, evidenceRef: policy.choices.budgets.approvalRef! };
  }
  const rate = (at: number) => { const window = liveAiAccountingWindow(utcInstantFromEpochMilliseconds(at)); return { category: "research" as const,
    provider: liveResearchRules.provider, model: null, version: `brave-search-2026-10-27-${window.name}`, currency: "USD", startsAt: window.startsAt, endsAt: window.endsAt,
    usdConversion: { numerator: "1", denominator: "1", evidenceRef: liveResearchRules.documentation }, rounding: "ceil-per-component" as const,
    billingRule: "measured-usage" as const, rates: { requests: { amount: "5", perUnits: 1000 }, inputTokens: null, outputTokens: null, billedUnits: null }, evidenceRef: liveResearchRules.documentation }; };
  const authority: CostAuthority = { authorize, verifyPeriod: (value) => same(value, period(value.startsAt)),
    verifyJob: (value) => same(value, plans.get(value.jobId)?.job), verifyRequest: (value) => same(value, plans.get(value.jobId)?.request),
    verifyRate: (value) => same(value, parseCostRate(rate(value.startsAt))), verifyUsage: transport.verifyUsage };
  const costs = createPolicyCostService({ accountId, category: "research", store: options.costStore ?? createMysqlCostStore(database), authority, runtimePolicy: policy,
    verifyEvidence: options.verify, allocation, verifyAllocation: (value) => same(value, allocation), rateFor: (request) => rate(plans.get(request.jobId)!.job.startsAt) });
  const adapter = createResearchEvidenceAdapter({ runtimePolicy: policy, verifyEvidence: options.verify, authority: options.evidenceAuthority,
    gateway: createCostGateway({ service: costs, authorize, clock }), binding: transport.binding, clock,
    verifyBinding: (binding, _context, plan) => binding.search === transport.binding.search && same(plan, plans.get(plan.job.jobId)) });
  return { costs, async prepare(member: RefreshMember, context: JobHandlerContext): Promise<Readonly<{ sources: readonly EvidenceSource[]; reason: string | null }>> {
    if (context.remainingMs() <= member.entry.envelope.fallbackReserveMs + assigned.primaryTimeLimitMs + 5000) return { sources: [], reason: "fallback-time-reserved" };
    const startsAt = clock.now(), window = rate(startsAt), deadlineAt = utcInstantFromEpochMilliseconds(Math.min(context.deadlineAt, member.cycle.cutoffAt));
    const plan: ResearchEvidencePlan = { job: { accountId, category: "research", jobId: member.jobId, workKey: refreshReference(member.jobId, "research"),
      costCapUsdPicos: assigned.costCapUsdPicos, requestLimit: 1, inputTokenLimit: 0, outputTokenLimit: 0, billedUnitLimit: 0,
      startsAt, deadlineAt, timeLimitMs: assigned.primaryTimeLimitMs + allocation.fallbackReserveMs, fallbackReserveMs: allocation.fallbackReserveMs,
      evidenceRef: allocation.evidenceRef }, request: { accountId, category: "research", attemptId: refreshReference(member.jobId, "research-attempt"), jobId: member.jobId,
      rateVersion: window.version, provider: liveResearchRules.provider, model: null, maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 },
      timeoutMs: assigned.primaryTimeLimitMs - 1000, priority: { kind: "fixture", kickoffAt: member.context.kickoffAt }, evidenceRef: options.refs.refresh },
      maxSources: liveResearchRules.maxArticles, targetIndependentSources: 1, maxResponseBytes: 16000,
      // The shared bridge counts both the retained claim value and its matching summary.
      maxExtractCharacters: liveResearchRules.maxArticles * liveResearchRules.maxExtractCharacters * 2, evidenceRef: options.refs.evidence };
    plans.set(member.jobId, plan);
    try {
      const initialized = await costs.initialize(period(startsAt)); if (initialized.status !== "initialized") return { sources: [], reason: "accounting-unavailable" };
      const result = await adapter.collect(member.context, liveAiEvidencePolicy(options.refs), plan, { signal: context.signal, deadlineAt,
        check() { if (context.signal.aborted) throw new Error("Research cancelled."); authorize(); } });
      await context.recordUsage({ provider: "research", requestReference: plan.request.attemptId, costReference: plan.job.workKey,
        phase: result.requestCountUnknown ? "uncertain" : "completed", requests: result.requestsDispatched, durationMs: null });
      return { sources: result.sources, reason: result.status === "denied" ? result.reason : result.sources.length === 0 ? "no-qualified-articles" : null };
    } finally { plans.delete(member.jobId); }
  } };
}
