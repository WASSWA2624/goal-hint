import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { jobFail, type JobQueue } from "./job-contract.ts";
import type { JobRegistry } from "./job-registry.ts";

/** Host-owned identity adapter. It must verify current issuer/audience/expiry,
 * revocation and the named workload's enqueue permission, not trust body claims. */
export type JobTriggerIdentity = Readonly<{ authorize(request: Request): boolean | Promise<boolean> }>;
export function createBearerJobIdentity(readSecret: () => string | null): JobTriggerIdentity {
  return Object.freeze({ authorize(request: Request) {
    const secret = readSecret(), header = request.headers.get("authorization");
    if (!secret || !/^[A-Za-z0-9_-]{32,256}$/u.test(secret) || !header || header.length > 264) return false;
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    return timingSafeEqual(expected, createHash("sha256").update(header).digest());
  } });
}
export async function readPrivateJobBody(request: Request): Promise<unknown> {
  if (!request.body || request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return jobFail("invalid-request");
  const reader = request.body.getReader(); let size = 0, timedOut = false; const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 2000);
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65_536) return jobFail("invalid-request"); chunks.push(value);
    }
    if (timedOut) return jobFail("invalid-request");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
/** Reusable private adapter only; no public route or handler is registered. */
export function createJobTrigger(input: Readonly<{ queue: JobQueue; registry: JobRegistry; identity: JobTriggerIdentity }>) {
  return async (request: Request): Promise<Response> => {
    try { if (await input.identity.authorize(request) !== true) return Response.json({ error: "unauthorized" }, { status: 401 }); }
    catch { return Response.json({ error: "unauthorized" }, { status: 401 }); }
    if (request.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405, headers: { Allow: "POST" } });
    let envelope;
    try { envelope = input.registry.validate(await readPrivateJobBody(request)); }
    catch { return Response.json({ error: "invalid-request" }, { status: 400 }); }
    try {
      const job = await input.queue.enqueue(envelope);
      return Response.json({ jobId: job.id, state: job.state }, { status: 202, headers: { "Cache-Control": "no-store" } });
    } catch { return Response.json({ error: "unavailable" }, { status: 503 }); }
  };
}
