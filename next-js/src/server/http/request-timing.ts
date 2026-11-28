import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Operation = "matches-list" | "matches-summary" | "matches-document" | "best-slips-list" | "best-slips-document"
  | "slip-share" | "shared-slip" | "account-login" | "account-session" | "admin-users" | "admin-user-detail";
type Phase = { name: string; durationMs: number; failed?: true };
type Timing = { id: string; operation: Operation; start: number; phases: Phase[] };
const current = new AsyncLocalStorage<Timing>();
const maximumPhases = 16;
const slowRequestMs = 2_000;

function elapsed(start: number) {
  return Math.round(performance.now() - start);
}

function timing(operation: Operation): Timing {
  return { operation, id: randomUUID(), start: performance.now(), phases: [] };
}

function report(entry: Timing, durationMs: number, status: number) {
  if (status < 500 && durationMs < slowRequestMs) return;
  console.warn(JSON.stringify({ event: "request-timing", requestId: entry.id, operation: entry.operation,
    durationMs, status, phases: entry.phases }));
}

/** Phase names are fixed labels at call sites. Never include input, identifiers or exception text. */
export async function timedRequestPhase<T>(name: string, work: () => Promise<T>): Promise<T> {
  const entry = current.getStore();
  if (!entry || entry.phases.length >= maximumPhases) return work();
  const start = performance.now();
  const phase: Phase = { name, durationMs: 0 };
  entry.phases.push(phase);
  try { return await work(); }
  catch (error) { phase.failed = true; throw error; }
  finally { phase.durationMs = elapsed(start); }
}

/** Correlates the browser response with a fixed-operation trace on the server. */
export function withRequestTiming<Args extends unknown[]>(operation: Operation, handler: (...args: Args) => Promise<Response>) {
  return (...args: Args) => {
    const entry = timing(operation);
    return current.run(entry, async () => {
      let response: Response;
      try { response = await handler(...args); }
      catch (error) { report(entry, elapsed(entry.start), 500); throw error; }
      const durationMs = elapsed(entry.start);
      response.headers.set("X-Request-Id", entry.id);
      response.headers.append("Server-Timing", `app;dur=${durationMs}`);
      report(entry, durationMs, response.status);
      return response;
    });
  };
}

/** Times the server data read for a streamed document independently of browser paint. */
export function withDocumentTiming<T>(operation: Operation, work: () => Promise<T>, unavailable?: (result: T) => boolean): Promise<T> {
  const entry = timing(operation);
  return current.run(entry, async () => {
    try {
      const result = await work();
      report(entry, elapsed(entry.start), unavailable?.(result) ? 503 : 200);
      return result;
    } catch (error) {
      report(entry, elapsed(entry.start), 500);
      throw error;
    }
  });
}
