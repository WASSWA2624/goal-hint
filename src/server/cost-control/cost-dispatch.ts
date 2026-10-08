import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { CostJobPolicy } from "./cost-contract.ts";
import type { CostTransportContext } from "./cost-gateway.ts";

export type CostDispatchWorkflow = Readonly<{ signal: AbortSignal; deadlineAt: number; check(): void }>;
export class CostDispatchError extends Error {
  readonly reason: "operation-not-authorized" | "clock-regression" | "timeout";
  constructor(reason: CostDispatchError["reason"]) {
    super("Provider dispatch cannot proceed. Private authorization details are withheld.");
    this.name = "CostDispatchError"; this.reason = reason;
  }
}
function synchronous(value: unknown): unknown {
  if (value instanceof Promise) void value.catch(() => undefined);
  return value;
}

/** A final boundary inside the cost gateway's one-attempt callback. Synchronous
 * approval latency counts against launch, transport and workflow windows. */
export async function dispatchCostProvider<Value>(options: Readonly<{
  job: CostJobPolicy; transport: CostTransportContext; workflow?: CostDispatchWorkflow | undefined;
  clock?: Clock | undefined; authorize(): void; credential(): string | null | undefined;
}>, operation: (input: Readonly<{ transport: CostTransportContext; credential: string }>) => Promise<Value>): Promise<Value> {
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  const enteredAt = performance.now(), enteredNow = now(), launchWindow = options.transport.permit.launchBefore - enteredNow;
  function check() {
    try {
      if (synchronous(options.workflow?.check()) !== undefined || synchronous(options.authorize()) !== undefined)
        throw new Error();
    } catch { throw new CostDispatchError("operation-not-authorized"); }
  }
  check();
  if (options.transport.signal.aborted || options.workflow?.signal.aborted) throw new CostDispatchError("timeout");
  const credential = options.credential();
  if (typeof credential !== "string" || credential.length === 0) throw new CostDispatchError("operation-not-authorized");
  try { if (synchronous(options.workflow?.check()) !== undefined) throw new Error(); }
  catch { throw new CostDispatchError("operation-not-authorized"); }
  const currentNow = now(), elapsed = performance.now() - enteredAt;
  const paidDeadline = Math.min(options.job.deadlineAt, options.job.startsAt + options.job.timeLimitMs) - options.job.fallbackReserveMs;
  const timeoutMs = Math.floor(Math.min(options.transport.timeoutMs - elapsed, paidDeadline - currentNow,
    options.workflow === undefined ? Infinity : options.workflow.deadlineAt - currentNow));
  if (currentNow < enteredNow) throw new CostDispatchError("clock-regression");
  if (options.transport.signal.aborted || options.workflow?.signal.aborted ||
    currentNow >= options.transport.permit.launchBefore || elapsed >= launchWindow || timeoutMs < 1)
    throw new CostDispatchError("timeout");
  const transport = Object.freeze({ ...options.transport, timeoutMs,
    signal: options.workflow === undefined ? options.transport.signal : AbortSignal.any([options.transport.signal, options.workflow.signal]) });
  return operation(Object.freeze({ transport, credential }));
}
