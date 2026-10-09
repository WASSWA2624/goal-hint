import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { createPublicResponseCache, publicCacheRules, type PublicCacheStore } from "./public-cache.ts";

type Tx = Prisma.TransactionClient;
export async function readPublicCacheGenerations(tx: Tx, tags: readonly string[]) {
  const rows = tags.length ? await tx.publicCacheTag.findMany({ where: { tag: { in: [...tags] } } }) : [];
  return Object.fromEntries(tags.map((tag) => [tag, String(rows.find((row) => row.tag === tag)?.generation ?? 0n)]));
}
export function createMysqlPublicCacheStore(database: DatabaseRuntime): PublicCacheStore {
  const store: PublicCacheStore = {
    async lookup(key, tags) {
      return database.transaction(async (tx) => {
        const stamp = await readPublicCacheGenerations(tx, tags), entry = await tx.publicResponseCache.findUnique({ where: { key } });
        const current = entry && evidenceFingerprint(entry.generations) === evidenceFingerprint(stamp);
        return { generations: stamp, value: current ? entry.body : null, createdAt: current ? entry.createdAt.getTime() : null,
          expiresAt: current ? entry.expiresAt.getTime() : null };
      }, { isolationLevel: "RepeatableRead", maxWait: 1000, timeout: 3000 });
    },
    async fill(key, tags, stamp, value, createdAt, expiresAt) {
      return database.transaction(async (tx) => {
        if (evidenceFingerprint(await readPublicCacheGenerations(tx, tags)) !== evidenceFingerprint(stamp)) return false;
        const body = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
        const data = { generations: { ...stamp }, body, createdAt: new Date(createdAt), expiresAt: new Date(expiresAt) };
        await tx.publicResponseCache.upsert({ where: { key }, create: { key, ...data }, update: data });
        // A commit after this snapshot can still invalidate this fill. Every hit
        // compares its stored stamp, so such a row is immediately unservable.
        return true;
      }, { isolationLevel: "RepeatableRead", maxWait: 1000, timeout: 3000 });
    },
    async reconcile(limit = publicCacheRules.recoveryBatch) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("Invalid cache recovery batch.");
      return database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: bigint; tag: string; generation: bigint }[]>`SELECT id, tag, generation FROM PublicCacheInvalidation
          WHERE acknowledgedAt IS NULL ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
        // Trigger invalidation and journal insertion commit together. Never ack
        // a corrupt/missing generation; the transaction remains retryable.
        const stamps = await readPublicCacheGenerations(tx, [...new Set(rows.map((row) => row.tag))]);
        if (rows.some((row) => BigInt(stamps[row.tag] ?? "0") < row.generation)) throw new Error("Cache invalidation is incomplete.");
        const acknowledged = rows.length ? (await tx.publicCacheInvalidation.updateMany({ where: { id: { in: rows.map((row) => row.id) }, acknowledgedAt: null },
          data: { acknowledgedAt: new Date() } })).count : 0;
        // Disposable bodies have a bounded lifetime and can be swept in small
        // batches. Durable journals/generations are retained for recovery/audit.
        const expired = await tx.$queryRaw<{ key: string }[]>`SELECT \`key\` FROM PublicResponseCache WHERE expiresAt <= UTC_TIMESTAMP(3)
          ORDER BY expiresAt, \`key\` LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
        const removed = expired.length ? (await tx.publicResponseCache.deleteMany({ where: { key: { in: expired.map((row) => row.key) } } })).count : 0;
        return { acknowledged, removed };
      }, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 5000 });
    },
  };
  return Object.freeze(store);
}
export function createMysqlPublicResponseCache(database: DatabaseRuntime, now = Date.now) {
  return createPublicResponseCache(createMysqlPublicCacheStore(database), now);
}
