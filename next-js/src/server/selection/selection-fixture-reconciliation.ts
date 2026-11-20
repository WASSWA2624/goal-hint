import "server-only";

import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { CatalogInputError, catalogScopeKey, parseCatalogImportRequest } from "../football/catalog-input.ts";
import { CatalogStoreError } from "../football/catalog-mysql-store.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { SelectionLease, SelectionPolicy } from "./selection-contract.ts";
import { verifiedFixturePage } from "./fixture-import-receipt.ts";

const provider = "api-football";
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const batchSize = 20;
const upcomingStatuses = "TBD-NS-PST" as const;

export class HourlyScheduleQuotaUnavailable extends Error {
  constructor() {
    super("Provider quota is unavailable for hourly schedule imports.");
    this.name = "HourlyScheduleQuotaUnavailable";
  }
}

function batchId(runId: string, scope: number | string) {
  const hash = evidenceFingerprint(["hourly-fixture-reconciliation", runId, scope]);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function fixtureIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

export type ForwardFixtureSweep = Readonly<{
  completeScopes: number; partialScopes: number; unavailableScopes: number; deferredScopes: number; failedScopes: number;
  retainedScopes: number; competitionsWithoutSeason: number; scannedFixtures: number; changedFixtures: number; requests: number;
}>;

/** Reconcile only known identities omitted by the completed date sweep. */
export function createHourlyFixtureReconciler(options: Readonly<{
  database: DatabaseRuntime;
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  policy: SelectionPolicy;
  clock?: Clock;
  includeOverdue?: boolean;
  onLookupFailure?(reason: string, fixtureCount: number): void;
}>) {
  const { database, importer, policy } = options;
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const { deadlineMs, ...bounds } = policy.importBounds;
  const batches = bounds.maxRequests;
  const batchCapacity = Math.min(batchSize, bounds.maxRows);
  const competitionIds = policy.competitionIds.map(BigInt);

  async function owns(lease: SelectionLease) {
    return database.query((client) => client.dailyRun.findFirst({ where: { id: lease.runId, ownerId: lease.ownerId,
      fence: lease.fence, leaseExpiresAt: { gt: new Date(clock.now()) } }, select: { leaseExpiresAt: true } }));
  }

  async function sweepUpcoming(lease: SelectionLease, scheduledFor: number, signal = new AbortController().signal): Promise<ForwardFixtureSweep> {
    const nextSlot = utcInstantFromEpochMilliseconds(scheduledFor + hourMs);
    const year = Number(getReportingDate(utcInstantFromEpochMilliseconds(scheduledFor)).slice(0, 4));
    const seasons = await database.query((client) => client.footballSeason.findMany({ where: {
      OR: [{ current: true }, { year: { gte: year } }, { year: year - 1, current: null }],
      competition: { providers: { some: { provider, externalId: { in: competitionIds } } } },
    }, select: { year: true, competition: { select: { providers: { where: { provider, externalId: { in: competitionIds } },
      select: { externalId: true }, orderBy: { externalId: "asc" } } } } }, orderBy: [{ year: "asc" }, { competitionId: "asc" }] }));
    const targets = seasons.flatMap(({ year: season, competition }) => competition.providers.map(({ externalId }) => {
      const selection = { kind: "fixtures", query: { competitionId: Number(externalId), season, status: upcomingStatuses } } as const;
      const scopeKey = catalogScopeKey(selection);
      return { selection, scopeKey, id: batchId(lease.runId, scopeKey) };
    }));
    const report = { completeScopes: 0, partialScopes: 0, unavailableScopes: 0, deferredScopes: 0, failedScopes: 0,
      retainedScopes: 0, competitionsWithoutSeason: competitionIds.length - new Set(targets.map(({ selection }) => selection.query.competitionId)).size,
      scannedFixtures: 0, changedFixtures: 0, requests: 0 };
    if (targets.length === 0) return report;

    // Reuse the canonical indexed import ledger. A complete page stays fresh for a day;
    // partial, failed and unvisited seasons advance independently of today's date receipt.
    const recent = await database.query((client) => client.$queryRaw<{ scopeKey: string; observedAt: Date; completeAt: Date | null }[]>(Prisma.sql`
      SELECT scopeKey, MAX(observedAt) AS observedAt,
        MAX(CASE WHEN status = 'complete' AND rejectedCount = 0 AND requestsDispatched > 0 THEN observedAt END) AS completeAt
      FROM FootballImport
      WHERE provider = ${provider} AND kind = 'fixtures' AND scopeKey IN (${Prisma.join(targets.map(({ scopeKey }) => scopeKey))})
        AND observedAt >= ${new Date(scheduledFor - dayMs)}
      GROUP BY scopeKey`));
    const receipts = new Map(recent.map((row) => [row.scopeKey, row]));
    const start = (Math.floor(scheduledFor / hourMs) * batches) % targets.length;
    const rotated = [...targets.slice(start), ...targets.slice(0, start)];
    const missing = rotated.filter(({ scopeKey }) => !receipts.get(scopeKey)?.completeAt);
    const due = missing.filter(({ scopeKey }) => (receipts.get(scopeKey)?.observedAt.getTime() ?? 0) < scheduledFor).sort((left, right) =>
      (receipts.get(left.scopeKey)?.observedAt.getTime() ?? 0) - (receipts.get(right.scopeKey)?.observedAt.getTime() ?? 0));
    report.retainedScopes = targets.length - missing.length;
    report.deferredScopes = missing.length;
    const usedThisSlot = recent.filter(({ observedAt }) => observedAt.getTime() >= scheduledFor).length;
    for (const { id, selection } of due.slice(0, Math.max(0, batches - usedThisSlot))) {
      if (signal.aborted || clock.now() >= nextSlot) break;
      const owner = await owns(lease);
      if (!owner?.leaseExpiresAt) break;
      const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(nextSlot, clock.now() + deadlineMs, owner.leaseExpiresAt.getTime()));
      const check = () => {
        if (signal.aborted || clock.now() >= deadlineAt) throw new CatalogStoreError("unavailable");
      };
      try {
        const receipt = await importer.import({ id, selection, retentionEvidenceRef: policy.retentionEvidenceRef,
          bounds: { ...bounds, deadlineAt: nextSlot, maxRequests: 1, maxPages: 1, cacheMaxAgeMs: 0, priority: "enrichment" } },
        undefined, { signal, deadlineAt, check });
        if (receipt.requestsDispatched === 0 && receipt.status === "failed") break;
        report.requests += receipt.requestsDispatched;
        report.deferredScopes--;
        report.scannedFixtures += receipt.receivedCount;
        report.changedFixtures += receipt.changedFixtureIds.length;
        if (receipt.status === "complete") report.completeScopes++;
        else if (receipt.status === "partial" || receipt.status === "degraded") report.partialScopes++;
        else if (receipt.reasons.some((reason) => ["authentication-error", "subscription-expired", "coverage-error"].includes(reason))) report.unavailableScopes++;
        else report.failedScopes++;
      } catch (error) {
        if (signal.aborted || clock.now() >= deadlineAt || error instanceof HourlyScheduleQuotaUnavailable) break;
        report.deferredScopes--;
        report.failedScopes++;
        options.onLookupFailure?.(lookupFailure(error) ?? "unavailable", 0);
      }
    }
    return report;
  }

  function lookupFailure(error: unknown) {
    return error instanceof DatabaseOperationError ? error.code :
      error instanceof CatalogStoreError && ["unavailable", "coordination-failed", "invalid-state"].includes(error.reason) ? error.storageCode ?? error.reason :
      error instanceof CatalogInputError && ["invalid-result", "unverified-observation"].includes(error.reason) ? error.reason : null;
  }

  return Object.freeze({
    sweepUpcoming,
    async reconcile(lease: SelectionLease, scheduledFor: number, signal = new AbortController().signal, replayOnly = false): Promise<readonly string[]> {
      const nextSlot = utcInstantFromEpochMilliseconds(scheduledFor + hourMs);
      const attemptIds = Array.from({ length: batches }, (_, index) => batchId(lease.runId, index));
      const attempts = await database.query((client) => client.dailyRunImport.findMany({ where: { runId: lease.runId, finishedAt: { not: null } },
        select: { id: true, eatDate: true }, orderBy: { attempt: "desc" } }));
      const latest = new Map<string, string>();
      for (const { eatDate, id } of attempts) {
        const date = eatDate.toISOString().slice(0, 10);
        if (!latest.has(date)) latest.set(date, id);
      }
      const imports = await database.query((client) => client.footballImport.findMany({
        where: { id: { in: [...latest.values(), ...attemptIds] }, provider, kind: "fixtures" },
        select: { id: true, selection: true, status: true, observedAt: true, provenance: true, fixtureIds: true,
          rejectedCount: true, requestsDispatched: true },
      }));
      const byId = new Map(imports.map((receipt) => [receipt.id, receipt]));
      const confirmed = new Set<string>();
      const lookedUp = new Set<number>();
      const reused = new Set<string>();
      for (const id of attemptIds) {
        const receipt = byId.get(id);
        if (!receipt) continue;
        reused.add(id);
        const request = parseCatalogImportRequest({ id, selection: receipt.selection, retentionEvidenceRef: policy.retentionEvidenceRef,
          bounds: { ...bounds, deadlineAt: nextSlot } });
        if (request.selection.kind !== "fixtures" || request.selection.query.fixtureIds === undefined) continue;
        const ids = request.selection.query.fixtureIds;
        for (const externalId of ids) lookedUp.add(externalId);
        const observedAt = receipt.observedAt.getTime();
        if (receipt.rejectedCount === 0 && receipt.requestsDispatched === 1 && observedAt >= scheduledFor && observedAt < nextSlot &&
          verifiedFixturePage(receipt.provenance, { [ids.length === 1 ? "id" : "ids"]: ids.join("-") }, observedAt)) {
          for (const fixtureId of fixtureIds(receipt.fixtureIds)) confirmed.add(fixtureId);
        }
      }
      if (replayOnly) return [...confirmed];
      const completeDates: Date[] = [];
      const seen = new Set<string>();
      for (const [date, id] of latest) {
        const receipt = byId.get(id);
        if (!receipt) continue;
        const observedAt = receipt.observedAt.getTime();
        if (observedAt < scheduledFor || observedAt >= nextSlot || receipt.requestsDispatched < 1 ||
          !verifiedFixturePage(receipt.provenance, { date }, observedAt)) continue;
        for (const fixtureId of fixtureIds(receipt.fixtureIds)) seen.add(fixtureId);
        if (receipt.status === "complete" && receipt.rejectedCount === 0) completeDates.push(new Date(`${date}T00:00:00Z`));
      }
      const availableAttempts = attemptIds.filter((id) => !reused.has(id));
      if (!completeDates.length || !availableAttempts.length || signal.aborted || clock.now() >= nextSlot) return [...confirmed];

      const candidates = await database.query((client) => client.footballFixture.findMany({
        where: {
          provider, eatDate: { in: completeDates }, retrievedAt: { lt: new Date(scheduledFor) },
          OR: [{ status: "scheduled", kickoff: options.includeOverdue ? { not: null } : { gte: new Date(scheduledFor) } }, { status: "postponed" }],
          externalId: { gt: 0n, lte: BigInt(Number.MAX_SAFE_INTEGER), notIn: [...lookedUp].map(BigInt) },
          season: { competition: { providers: { some: { provider, externalId: { in: competitionIds } } } } },
        },
        select: { id: true, externalId: true },
        orderBy: [{ eatDate: "asc" }, { kickoff: "asc" }, { externalId: "asc" }],
      }));
      const omitted = candidates.filter(({ id }) => !seen.has(id) && !confirmed.has(id))
        .map(({ externalId }) => Number(externalId))
        .slice(0, availableAttempts.length * batchCapacity);
      for (const [index, id] of availableAttempts.entries()) {
        const ids = omitted.slice(index * batchCapacity, (index + 1) * batchCapacity);
        if (ids.length === 0 || signal.aborted || clock.now() >= nextSlot) break;
        const owner = await owns(lease);
        if (!owner?.leaseExpiresAt) break;
        const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(nextSlot, clock.now() + deadlineMs, owner.leaseExpiresAt.getTime()));
        const check = () => {
          if (signal.aborted || clock.now() >= deadlineAt) throw new Error("Hourly fixture reconciliation expired.");
        };
        const request = { id, selection: { kind: "fixtures", query: { fixtureIds: ids } },
          retentionEvidenceRef: policy.retentionEvidenceRef,
          bounds: { ...bounds, deadlineAt: nextSlot, maxRequests: 1, maxPages: 1, maxRows: ids.length, cacheMaxAgeMs: 0 },
        } as const;
        let receipt: Awaited<ReturnType<typeof importer.import>>;
        try {
          receipt = await importer.import(request, undefined, { signal, deadlineAt, check });
        } catch (error) {
          if (signal.aborted || clock.now() >= deadlineAt || error instanceof HourlyScheduleQuotaUnavailable) break;
          // These IDs supplement the sealed date receipts. A failed lookup proves no fixture identity.
          const reason = lookupFailure(error);
          if (reason === null) throw error;
          options.onLookupFailure?.(reason, ids.length);
          break;
        }
        if (receipt.rejectedCount === 0 && receipt.requestsDispatched === 1 &&
          receipt.observedAt >= scheduledFor && receipt.observedAt < nextSlot) {
          for (const fixtureId of receipt.fixtureIds) confirmed.add(fixtureId);
        }
      }
      return [...confirmed];
    },
  });
}
