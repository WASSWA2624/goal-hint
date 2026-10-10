import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { jobHash } from "../jobs/job-input.ts";
import { alertRules, evaluateMonitoring } from "./monitoring-rules.ts";
import { authorizeMonitoring, budgetCategories, monitoringFail, monitoringPolicySchema, monitoringRef,
  monitoringSnapshotSchema, parseMonitoring, type MonitoringAuthority } from "./monitoring-contract.ts";

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const alertMessageSchema = z.strictObject({ event: z.literal("operations-alert"), id: jobHash, incidentId: jobHash,
  rule: z.enum(alertRules), scope: z.enum(["application", ...budgetCategories]), owner: monitoringRef, destination: monitoringRef,
  policyRef: monitoringRef, severity: z.enum(["warning", "critical"]), status: z.enum(["firing", "resolved"]),
  openedAt: counter, changedAt: counter, value: z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d{1,12})?$/u), z.null()]),
  runbook: z.literal("docs/operations-monitoring.md"), correlations: monitoringSnapshotSchema.shape.correlations.max(5),
});
export type AlertMessage = z.infer<typeof alertMessageSchema>;
const slotSchema = z.strictObject({ key: z.string().max(80), message: alertMessageSchema, lastSeenAt: counter,
  deliveredId: jobHash.nullable(), claimToken: jobHash.nullable(), claimUntil: counter,
});
export const monitoringStateSchema = z.strictObject({ version: z.literal(1), policyHash: jobHash.nullable(), at: counter, observedAt: counter, sequence: counter,
  slots: z.array(slotSchema).max(64),
}).refine((v) => new Set(v.slots.map((s) => s.key)).size === v.slots.length &&
  v.slots.every((s) => s.key === `${s.message.rule}:${s.message.scope}`));
export type MonitoringState = z.infer<typeof monitoringStateSchema>;
export const emptyMonitoringState = (): MonitoringState => ({ version: 1, policyHash: null, at: 0, observedAt: 0, sequence: 0, slots: [] });
export type MonitoringStore = Readonly<{ transaction<T>(operation: (state: MonitoringState, now: number) => Promise<T>): Promise<T> }>;
export type MonitoringSink = Readonly<{ destination: string; publish(message: AlertMessage, signal: AbortSignal): Promise<void> }>;

/** A single fixed-size outbox; transactions serialize detection and fenced delivery claims. */
export function createOperationsMonitor(options: Readonly<{ policy: unknown; authority: MonitoringAuthority;
  store: MonitoringStore; sink: MonitoringSink }>) {
  const policy = parseMonitoring(monitoringPolicySchema, options.policy), hash = evidenceFingerprint(policy);
  if (options.sink.destination !== policy.destination) monitoringFail("invalid-input");
  async function transact<T>(operation: (state: MonitoringState, now: number) => Promise<T>) {
    await authorizeMonitoring(options.authority, policy, "notify");
    return options.store.transaction(async (state, now) => {
      await authorizeMonitoring(options.authority, policy, "notify");
      if (state.policyHash !== null && state.policyHash !== hash) monitoringFail("policy-conflict");
      if (now < state.at) monitoringFail("unavailable");
      state.policyHash = hash; state.at = now;
      state.slots = state.slots.filter((s) => now - (s.message.status === "resolved" ? s.message.changedAt : s.lastSeenAt) < policy.retentionMs);
      const result = await operation(state, now);
      await authorizeMonitoring(options.authority, policy, "notify");
      return result;
    });
  }
  return Object.freeze({
    async observe(input: unknown) {
      const snapshot = parseMonitoring(monitoringSnapshotSchema, input), conditions = evaluateMonitoring(snapshot, policy);
      return transact(async (state, now) => {
        if (snapshot.at > now || now - snapshot.at > policy.evidenceMaxAgeMs) monitoringFail("invalid-input");
        if (snapshot.at < state.observedAt) return { changed: 0, pending: state.slots.filter((s) => s.deliveredId !== s.message.id).length };
        state.observedAt = snapshot.at;
        let changed = 0;
        for (const condition of conditions) {
          if (condition.active === null) continue; // Unknown evidence cannot clear an incident.
          const key = `${condition.rule}:${condition.scope}`, slot = state.slots.find((s) => s.key === key);
          if (!slot && !condition.active) continue;
          const status = condition.active ? "firing" : "resolved";
          if (slot) slot.lastSeenAt = now;
          if (slot && slot.message.status === status && slot.message.severity === condition.severity &&
            (!condition.active || now - slot.message.changedAt < policy.reminderMs)) continue;
          const openedAt = slot && slot.message.status === "firing" ? slot.message.openedAt : now;
          if (state.sequence >= Number.MAX_SAFE_INTEGER) monitoringFail("unavailable");
          const sequence = ++state.sequence;
          const incidentId = slot && slot.message.status === "firing" ? slot.message.incidentId : evidenceFingerprint([hash, key, now, sequence]);
          const message = parseMonitoring(alertMessageSchema, { event: "operations-alert", id: evidenceFingerprint([incidentId, status, now, sequence]),
            incidentId, rule: condition.rule, scope: condition.scope, owner: policy.owner, destination: policy.destination,
            policyRef: policy.evidenceRef, severity: condition.severity, status, openedAt, changedAt: now, value: condition.value,
            runbook: "docs/operations-monitoring.md", correlations: snapshot.correlations.slice(0, 5) });
          if (slot) { slot.message = message; slot.claimToken = null; slot.claimUntil = 0; }
          else state.slots.push({ key, message, lastSeenAt: now, deliveredId: null, claimToken: null, claimUntil: 0 });
          changed++;
        }
        return { changed, pending: state.slots.filter((s) => s.deliveredId !== s.message.id).length };
      });
    },
    async deliver(signal: AbortSignal = new AbortController().signal) {
      let delivered = 0, failed = 0;
      // Bound notification I/O and the number of database round trips per invocation.
      for (let i = 0; i < 8 && !signal.aborted; i++) {
        const claim = await transact(async (state, now) => {
          const slot = state.slots.find((s) => s.deliveredId !== s.message.id && s.claimUntil <= now);
          if (!slot) return null;
          slot.claimToken = randomBytes(32).toString("hex"); slot.claimUntil = now + 30_000;
          return { message: slot.message, token: slot.claimToken };
        });
        if (!claim) break;
        try {
          await authorizeMonitoring(options.authority, policy, "notify");
          const deadline = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
          let abort: (() => void) | undefined;
          try {
            await Promise.race([Promise.resolve().then(() => {
              if (deadline.aborted) monitoringFail("unavailable");
              return options.sink.publish(claim.message, deadline);
            }),
              new Promise<never>((_, reject) => {
                abort = () => reject(new Error("Notification interrupted."));
                if (deadline.aborted) abort(); else deadline.addEventListener("abort", abort, { once: true });
              })]);
          } finally { if (abort) deadline.removeEventListener("abort", abort); }
          await transact(async (state) => {
            const slot = state.slots.find((s) => s.message.id === claim.message.id && s.claimToken === claim.token);
            if (slot && slot.claimUntil > state.at) { slot.deliveredId = claim.message.id; slot.claimToken = null; slot.claimUntil = 0; delivered++; }
          });
        } catch { failed++; break; } // Retain the bounded claim for retry; never log the transport error.
      }
      return { delivered, failed };
    },
  });
}

/** Process-local verification sink. No network, file, visitor IDs or raw errors. */
export function createLocalMonitoringSink(destination = "local-test", retentionMs = 60_000, capacity = 64, now = Date.now) {
  if (!monitoringRef.safeParse(destination).success || !Number.isInteger(capacity) || capacity < 1 || capacity > 256 ||
    !Number.isInteger(retentionMs) || retentionMs < 1000 || retentionMs > 7 * 86_400_000) monitoringFail("invalid-input");
  const messages = new Map<string, { message: AlertMessage; at: number }>();
  const prune = () => { for (const [id, value] of messages) if (now() - value.at >= retentionMs) messages.delete(id); };
  return Object.freeze({ destination,
    async publish(input: AlertMessage, signal: AbortSignal) {
      if (signal.aborted) monitoringFail("unavailable");
      const message = parseMonitoring(alertMessageSchema, input);
      if (message.destination !== destination) monitoringFail("invalid-input");
      prune(); if (messages.has(message.id)) return;
      if (messages.size >= capacity) messages.delete(messages.keys().next().value!);
      messages.set(message.id, { message, at: now() });
    },
    read() { prune(); return Object.freeze([...messages.values()].map((v) => v.message)); },
  });
}
