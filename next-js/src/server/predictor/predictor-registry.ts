import "server-only";

import type { ModelAuthority, ModelPin, ModelVersion, ModelVersionStore } from "./predictor-contract.ts";
import { createModelPin, createModelVersion, parseModelPin, parseModelVersion, PredictorInputError } from "./predictor-input.ts";

export class ModelRegistryError extends Error {
  readonly reason: "invalid-request" | "not-authorized" | "unconfigured" | "conflicting-pin" | "capacity-exhausted" | "unavailable";
  constructor(reason: ModelRegistryError["reason"]) {
    super("Predictor model registry is invalid or unavailable. Private diagnostics are withheld.");
    this.name = "ModelRegistryError"; this.reason = reason;
  }
}
const fail = (reason: ModelRegistryError["reason"]): never => { throw new ModelRegistryError(reason); };
function checked(value: unknown, expected: true | undefined): void {
  if (value === expected) return;
  // A mistakenly asynchronous authority is denied, and its rejection is
  // drained so it cannot become a process-wide unhandled rejection.
  void Promise.resolve(value).catch(() => {});
  return fail("not-authorized");
}
export function assertModelAuthorized(model: ModelVersion, authority: ModelAuthority): void {
  try {
    checked(authority.authorize(model), undefined); checked(authority.verifyModel(model), true);
    checked(authority.verifyCalibration(model), true); checked(authority.verifyEvaluation(model), true);
  } catch { return fail("not-authorized"); }
}
const identity = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) return fail("invalid-request");
  return value;
};
/** Per-process pins complement the caller's durable owning-job identity. An
 * existing job must restore its independently verified prior pin after restart;
 * durable orchestration belongs to 020, not the model configuration table. */
export function createModelRegistry(options: Readonly<{
  store: ModelVersionStore; authority: ModelAuthority; maxPins: number;
  verifyPriorPin?: (pin: ModelPin) => boolean;
}>) {
  if (!Number.isSafeInteger(options.maxPins) || options.maxPins < 1 || options.maxPins > 100_000) return fail("invalid-request");
  const invocations = new Map<string, ModelPin>(), jobs = new Map<string, string>();
  async function find(id: string): Promise<ModelVersion | null> {
    identity(id);
    try {
      const stored = await options.store.find(id);
      if (stored === null) return null;
      const model = parseModelVersion(stored);
      if (model.id !== id) return fail("unavailable");
      assertModelAuthorized(model, options.authority);
      return model;
    } catch (error) {
      if (error instanceof ModelRegistryError) throw error;
      return fail("unavailable");
    }
  }
  async function register(configuration: unknown): Promise<ModelVersion> {
    let model: ModelVersion;
    try { model = createModelVersion(configuration); }
    catch { return fail("invalid-request"); }
    assertModelAuthorized(model, options.authority);
    try {
      const stored = parseModelVersion(await options.store.save(model, options.authority));
      if (stored.id !== model.id) return fail("unavailable");
      assertModelAuthorized(stored, options.authority);
      return stored;
    } catch (error) {
      if (error instanceof ModelRegistryError) throw error;
      return fail("unavailable");
    }
  }
  async function pin(input: Readonly<{
    invocationId: string; jobId: string; modelVersionId: string; priorPin?: ModelPin;
  }>): Promise<ModelPin> {
    let pin: ModelPin;
    try {
      if (Object.keys(input).some((key) => !["invocationId", "jobId", "modelVersionId", "priorPin"].includes(key))) return fail("invalid-request");
      pin = createModelPin({ version: 1, invocationId: input.invocationId, jobId: input.jobId, modelVersionId: input.modelVersionId });
      if (input.priorPin !== undefined) {
        const previous = parseModelPin(input.priorPin);
        if (previous.jobId !== pin.jobId || previous.modelVersionId !== pin.modelVersionId) return fail("conflicting-pin");
        checked(options.verifyPriorPin?.(previous), true);
      }
    } catch (error) {
      if (error instanceof ModelRegistryError) throw error;
      if (error instanceof PredictorInputError) return fail("invalid-request");
      return fail("not-authorized");
    }
    const knownInvocation = invocations.get(pin.invocationId), knownJob = jobs.get(pin.jobId);
    if ((knownInvocation !== undefined && (knownInvocation.modelVersionId !== pin.modelVersionId || knownInvocation.jobId !== pin.jobId)) ||
      (knownJob !== undefined && knownJob !== pin.modelVersionId)) return fail("conflicting-pin");
    if ((!invocations.has(pin.invocationId) && invocations.size >= options.maxPins) ||
      (!jobs.has(pin.jobId) && jobs.size >= options.maxPins)) return fail("capacity-exhausted");
    const model = await find(pin.modelVersionId);
    if (model === null) return fail("unconfigured");
    // A competing invocation may have pinned the same job while storage awaited.
    const currentInvocation = invocations.get(pin.invocationId), currentJob = jobs.get(pin.jobId);
    if ((currentInvocation !== undefined && (currentInvocation.modelVersionId !== pin.modelVersionId || currentInvocation.jobId !== pin.jobId)) ||
      (currentJob !== undefined && currentJob !== pin.modelVersionId)) return fail("conflicting-pin");
    if ((!invocations.has(pin.invocationId) && invocations.size >= options.maxPins) ||
      (!jobs.has(pin.jobId) && jobs.size >= options.maxPins)) return fail("capacity-exhausted");
    assertModelAuthorized(model, options.authority);
    invocations.set(pin.invocationId, pin); jobs.set(pin.jobId, pin.modelVersionId);
    return pin;
  }
  async function resolve(value: unknown): Promise<Readonly<{ pin: ModelPin; model: ModelVersion }>> {
    let pin: ModelPin;
    try { pin = parseModelPin(value); } catch { return fail("invalid-request"); }
    const verified = await pinModel(pin), model = await find(verified.modelVersionId);
    if (model === null) return fail("unconfigured");
    return Object.freeze({ pin: verified, model });
  }
  async function pinModel(previous: ModelPin): Promise<ModelPin> {
    const invocation = invocations.get(previous.invocationId);
    const known = invocation?.modelVersionId === previous.modelVersionId && invocation.jobId === previous.jobId &&
      jobs.get(previous.jobId) === previous.modelVersionId;
    return pin({ invocationId: previous.invocationId, jobId: previous.jobId, modelVersionId: previous.modelVersionId,
      ...(known ? {} : { priorPin: previous }) });
  }
  return Object.freeze({ register, find, pin, resolve });
}
export type ModelRegistry = ReturnType<typeof createModelRegistry>;
