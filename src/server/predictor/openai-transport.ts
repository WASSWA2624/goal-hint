import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { CostAttempt, CostUsage } from "../cost-control/cost-contract.ts";
import { costFingerprint, parseCostPermit, parseCostQuantities, parseCostUsage } from "../cost-control/cost-input.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import type { ModelVersion } from "./predictor-contract.ts";
import { parseModelVersion } from "./predictor-input.ts";
import type { PrimaryAiProviderBinding } from "./predictor-adapter.ts";
import { assertPreparedPredictorPrompt } from "./predictor-prompt.ts";
import type { PredictorTransportMetadata } from "./predictor-output.ts";

export const openAiTransportRules = Object.freeze({ endpoint: "https://api.openai.com/v1/responses",
  model: "gpt-6.1-sol", contract: "openai-responses-v1", inputFramingTokens: 1024,
  shortContextTokens: 272_000, maximumOutputTokens: 128_000, maximumReceipts: 4096 });

/** Provider bodies, prompts and credentials never enter an error or diagnostic. */
export class OpenAiTransportError extends Error {
  constructor() { super("AI provider response is unavailable or invalid."); this.name = "OpenAiTransportError"; }
}
const invalid = (): never => { throw new OpenAiTransportError(); };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function providerInstant(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value * 1000) || value < 0) return invalid();
  return utcInstantFromEpochMilliseconds(value * 1000);
}
async function readJson(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (type !== "application/json" || length !== null && (!/^\d+$/u.test(length) || Number(length) > limit) || !response.body) {
    void response.body?.cancel().catch(() => {}); return invalid();
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  try {
    if (signal.aborted) cancel();
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read(); signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { cancel(); return invalid(); }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

/** One reviewed, non-streaming paid request; the caller's gateway owns authorization and retries. */
export function createOpenAiBinding(options: Readonly<{ model: ModelVersion; fetcher?: typeof fetch; clock?: Clock }>) {
  const model = parseModelVersion(options.model);
  if (model.provider !== "openai" || model.model !== openAiTransportRules.model || model.providerModelVersion !== model.model ||
    model.contractVersion !== openAiTransportRules.contract) return invalid();
  const fetcher = options.fetcher ?? fetch, clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  type Proof = { usage: string; maximum: string; metadata: string; snapshot: string; model: string;
    job: string; period: string; owner: string };
  const proofs = new Map<string, Proof>();
  const binding: PrimaryAiProviderBinding = Object.freeze({ provider: model.provider, model: model.model,
    providerModelVersion: model.providerModelVersion, contractVersion: model.contractVersion,
    async generate(input) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const pinned = parseModelVersion(input.model), permit = parseCostPermit(input.transport.permit);
        const maximum = parseCostQuantities(input.transport.maximum);
        if (pinned.id !== model.id || input.pin.modelVersionId !== model.id || input.pin.invocationId !== permit.attemptId ||
          input.pin.jobId !== permit.jobId || !/^[\x21-\x7e]{1,512}$/u.test(input.credential) || maximum.requests !== 1 ||
          maximum.outputTokens < 1 || maximum.outputTokens > openAiTransportRules.maximumOutputTokens ||
          maximum.inputTokens < 1 || maximum.inputTokens >= openAiTransportRules.shortContextTokens ||
          maximum.billedUnits < maximum.inputTokens || !Number.isSafeInteger(input.transport.timeoutMs) ||
          input.transport.timeoutMs < 1 || input.transport.timeoutMs > 2_147_483_647) return invalid();
        assertPreparedPredictorPrompt(input.prompt, input.snapshot, model);
        const body = JSON.stringify({ model: model.model, instructions: input.prompt.instructions, input: input.prompt.inputJson,
          store: false, stream: false, background: false, service_tier: "default", tools: [], tool_choice: "none",
          reasoning: { effort: "low" }, max_output_tokens: maximum.outputTokens, truncation: "disabled",
          text: { format: { type: "json_schema", name: "goal_hint_prediction", strict: true, schema: input.prompt.schema } } });
        const bytes = Buffer.byteLength(body, "utf8");
        if (input.prompt.bytes > model.bounds.maxInputBytes || bytes > model.bounds.maxInputBytes + 4096 ||
          bytes + openAiTransportRules.inputFramingTokens > maximum.inputTokens) return invalid();
        const startedAt = utcInstantFromEpochMilliseconds(clock.now()), start = performance.now();
        const controller = new AbortController();
        const signal = AbortSignal.any([input.transport.signal, controller.signal]);
        timeout = setTimeout(() => controller.abort(), input.transport.timeoutMs);
        signal.throwIfAborted();
        const response = await fetcher(openAiTransportRules.endpoint, { method: "POST",
          headers: { authorization: `Bearer ${input.credential}`, "content-type": "application/json", accept: "application/json" },
          body, signal, redirect: "error", credentials: "omit", cache: "no-store" });
        if (!response.ok || response.redirected || response.status !== 200 ||
          response.url && response.url !== openAiTransportRules.endpoint) {
          void response.body?.cancel().catch(() => {}); return invalid();
        }
        const requestId = response.headers.get("x-request-id");
        if (requestId === null || !/^[A-Za-z0-9_-]{1,128}$/u.test(requestId)) {
          void response.body?.cancel().catch(() => {}); return invalid();
        }
        // The JSON envelope can repeat instructions/input/schema, independently of the output cap.
        const raw = await readJson(response, Math.min(16_777_216, model.bounds.maxInputBytes + model.bounds.maxOutputBytes * 2 + 65_536), signal);
        signal.throwIfAborted();
        const retrievedAt = utcInstantFromEpochMilliseconds(clock.now()), elapsedMs = Math.ceil(performance.now() - start);
        if (retrievedAt < startedAt || elapsedMs >= input.transport.timeoutMs || !record(raw) || raw.object !== "response" ||
          typeof raw.id !== "string" || !/^resp_[A-Za-z0-9_-]{1,200}$/u.test(raw.id) || raw.model !== model.providerModelVersion ||
          !["completed", "incomplete", "failed", "cancelled"].includes(String(raw.status)) || raw.service_tier !== "default" ||
          raw.store !== false || !Array.isArray(raw.output)) return invalid();
        const createdAt = providerInstant(raw.created_at);
        const completedAt = raw.completed_at === undefined || raw.completed_at === null ? null : providerInstant(raw.completed_at);
        if (createdAt > retrievedAt || completedAt !== null && (completedAt < createdAt || completedAt > retrievedAt)) return invalid();
        let text: string | null = null;
        let usable = raw.status === "completed" && raw.error === null && raw.incomplete_details === null;
        for (const item of raw.output) {
          if (!record(item)) return invalid();
          if (item.type === "reasoning") continue;
          if (item.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) return invalid();
          if (item.status !== "completed") usable = false;
          for (const content of item.content) {
            if (!record(content)) return invalid();
            if (content.type === "refusal") { usable = false; continue; }
            if (content.type !== "output_text" || typeof content.text !== "string") return invalid();
            if (text !== null) usable = false;
            else text = content.text;
          }
        }
        let output: unknown = null;
        if (usable && text !== null && Buffer.byteLength(text, "utf8") <= model.bounds.maxOutputBytes) {
          try { const parsed: unknown = JSON.parse(text); if (record(parsed)) output = parsed; }
          catch { /* Authentic measured usage remains accountable when the model output is invalid. */ }
        }
        const usage = raw.usage;
        if (!record(usage) || !count(usage.input_tokens) || !count(usage.output_tokens) || !count(usage.total_tokens) ||
          usage.total_tokens !== usage.input_tokens + usage.output_tokens || !record(usage.input_tokens_details) ||
          !count(usage.input_tokens_details.cached_tokens) || !count(usage.input_tokens_details.cache_write_tokens) ||
          !record(usage.output_tokens_details) || !count(usage.output_tokens_details.reasoning_tokens)) return invalid();
        const inputTokens = usage.input_tokens, outputTokens = usage.output_tokens;
        const cached = usage.input_tokens_details.cached_tokens, written = usage.input_tokens_details.cache_write_tokens;
        if (cached + written > inputTokens || usage.output_tokens_details.reasoning_tokens > outputTokens ||
          inputTokens > maximum.inputTokens || outputTokens > maximum.outputTokens || written > maximum.billedUnits) return invalid();
        const evidenceRef = `openai-responses:${raw.id}:${requestId}`;
        const metadata: PredictorTransportMetadata = Object.freeze({
          // created_at is request creation. Only a documented completion clock can establish generation.
          generatedAt: completedAt !== null && completedAt >= input.snapshot.context.analysisAt ? completedAt : null,
          retrievedAt, providerUpdatedAt: null, evidenceRef });
        const observedUsdPicos = BigInt(inputTokens - cached - written) * 2_000_000n + BigInt(cached) * 100_000n +
          BigInt(written) * 2_500_000n + BigInt(outputTokens) * 10_000_000n;
        const receipt: CostUsage = parseCostUsage({ attemptId: permit.attemptId,
          reconciliationId: costFingerprint({ contract: openAiTransportRules.contract, response: raw.id, request: requestId, attempt: permit.attemptId }),
          kind: "complete", observedQuantities: { requests: 1, inputTokens, outputTokens, billedUnits: written }, elapsedMs,
          observedUsdPicos, invoicedUsdPicos: null, observedAt: retrievedAt, evidenceRef });
        proofs.set(receipt.reconciliationId, { usage: costFingerprint(receipt), maximum: costFingerprint(maximum),
          metadata: evidenceFingerprint(metadata), snapshot: input.snapshot.hash, model: model.id,
          job: permit.jobId, period: permit.periodId, owner: permit.ownerToken });
        if (proofs.size > openAiTransportRules.maximumReceipts) proofs.delete(proofs.keys().next().value!);
        return freezeEvidence({ value: { output, metadata }, usage: receipt });
      } catch { return invalid(); }
      finally { if (timeout !== undefined) clearTimeout(timeout); }
    } });
  return Object.freeze({ binding,
    verifyUsage(usage: CostUsage, attempt: CostAttempt): boolean {
      try {
        const receipt = parseCostUsage(usage), proof = proofs.get(receipt.reconciliationId);
        return proof !== undefined && proof.usage === costFingerprint(receipt) && receipt.attemptId === attempt.request.attemptId &&
          proof.maximum === costFingerprint(attempt.request.maximum) && attempt.request.provider === model.provider &&
          attempt.request.model === model.model && attempt.request.category === "ai" && proof.job === attempt.request.jobId &&
          proof.period === attempt.periodId && proof.owner === attempt.ownerToken;
      } catch { return false; }
    },
    verifyTransport(metadata: PredictorTransportMetadata, current: ModelVersion, snapshot: EvidenceSnapshot): boolean {
      try {
        if (parseModelVersion(current).id !== model.id) return false;
        const fingerprint = evidenceFingerprint(metadata);
        return [...proofs.values()].some((proof) => proof.metadata === fingerprint && proof.model === current.id && proof.snapshot === snapshot.hash);
      } catch { return false; }
    } });
}
