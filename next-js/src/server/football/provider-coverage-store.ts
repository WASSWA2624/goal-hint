import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { FootballProviderCoverage, Prisma } from "../generated/prisma/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballArchiveReplayRequest, type ApiFootballValidatedResponse } from "./api-football-contract.ts";
import { parseProviderCoverageTarget, prepareProviderResponsePage, providerCoverageProgress, providerResponsePageLocator,
  type ParsedProviderCoverageTarget, type ProviderCoverageProgress, type ProviderCoverageTarget } from "./provider-coverage-contract.ts";
import { footballSourceHash, readFootballSourcePagePayload } from "./source-page-payload.ts";

type Tx = Prisma.TransactionClient;
type Database = Pick<DatabaseRuntime, "query" | "transaction">;
type Ticket = Readonly<{ target: ParsedProviderCoverageTarget; revision: number; leaseUntil: number }>;
type ReplayWindow = Pick<ApiFootballArchiveReplayRequest, "notBefore" | "now" | "maxResponseBytes">;
type FailureStatus = Extract<ProviderCoverageProgress["status"],
  "unavailable" | "not_applicable" | "retryable_failure" | "blocked_by_quota" | "blocked_by_access">;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const lease = z.number().int().min(1).max(2_147_483_647);
const count = z.number().int().min(0).max(4_294_967_295);
const millisecond = z.number().int().min(0).max(Date.UTC(9999, 11, 31, 23, 59, 59, 999));
const reason = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u);
const accepted = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("complete"), responseId: hash }),
  z.strictObject({ status: z.literal("partial"), responseId: hash, reason, remaining: count.nullable(), nextRetryAt: millisecond.optional() }),
]);
type AcceptedOutcome = z.infer<typeof accepted>;
type AcceptedStatus = Omit<Extract<AcceptedOutcome, { status: "complete" }>, "responseId"> |
  Omit<Extract<AcceptedOutcome, { status: "partial" }>, "responseId">;
const rejected = z.strictObject({
  status: z.enum(["unavailable", "not_applicable", "retryable_failure", "blocked_by_quota", "blocked_by_access"]),
  reason, remaining: count.nullable().optional(), nextRetryAt: millisecond.optional(),
});
const pending = z.strictObject({ status: z.enum(["not_requested", "queued"]), remaining: count.nullable().optional() });
const requiresReview = new Set(["blocked_by_access", "not_applicable", "unavailable"]);
const databaseTime = async (tx: Tx) =>
  (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
const nullableDate = (value: number | null) => value === null ? null : new Date(value);
const nullableTime = (value: Date | null) => value?.getTime() ?? null;

function checkpoint(row: FootballProviderCoverage) {
  return providerCoverageProgress.parse({ status: row.status, reason: row.reason, attempts: row.attempts, updatedAt: row.updatedAt.getTime(),
    lastAttemptAt: nullableTime(row.lastAttemptAt), lastResponseId: row.lastResponseId, lastCompleteAt: nullableTime(row.lastCompleteAt),
    nextRetryAt: nullableTime(row.nextRetryAt), remaining: row.remaining });
}

function transportTarget(request: Pick<ApiFootballArchiveReplayRequest, "requestKey" | "requestParameters" | "endpoint" | "contractVersion">) {
  if (request.contractVersion !== API_FOOTBALL_CONTRACT_VERSION) throw new Error("Unsupported provider archive contract.");
  const { page, ...parameters } = request.requestParameters;
  if (page !== undefined && !/^[1-9][0-9]*$/u.test(page)) throw new Error("Invalid provider archive page.");
  return parseProviderCoverageTarget({ resource: "provider-response", endpoint: request.endpoint,
    scope: { context: request.endpoint === "accountStatus" ? "account" : "reference", requestKey: hash.parse(request.requestKey) },
    parameters,
    page: page === undefined ? 1 : Number(page), section: "envelope" });
}

function locatorMatches(page: { id: string; endpoint: string; selectorHash: string; contract: string; retrievedAt: Date; contentHash: string },
  locator: ReturnType<typeof providerResponsePageLocator>) {
  return page.endpoint === locator.endpoint && page.selectorHash === locator.selectorHash && page.contract === API_FOOTBALL_CONTRACT_VERSION &&
    page.id === footballSourceHash(JSON.stringify([page.endpoint, page.selectorHash, page.retrievedAt.getTime(), page.contentHash]));
}

/** The private append-only receipt survives a crash without granting authority to advance a checkpoint. */
export function createMysqlProviderCoverageStore(database: Database) {
  async function rawPage(target: ParsedProviderCoverageTarget, window: ReplayWindow) {
    const notBefore = millisecond.parse(window.notBefore), now = millisecond.parse(window.now);
    const maxResponseBytes = count.positive().parse(window.maxResponseBytes);
    if (notBefore > now) return null;
    const locator = providerResponsePageLocator(target);
    const page = await database.query((client) => client.footballHistorySourcePage.findFirst({
      where: { endpoint: locator.endpoint, selectorHash: locator.selectorHash, contract: API_FOOTBALL_CONTRACT_VERSION,
        retrievedAt: { gte: new Date(notBefore), lte: new Date(now) } },
      orderBy: [{ retrievedAt: "desc" }, { id: "desc" }],
    }));
    if (!page || !locatorMatches(page, locator)) return null;
    try {
      const body = await readFootballSourcePagePayload(page);
      return body.byteLength > maxResponseBytes ? null : { responseId: page.id, body,
        retrievedAt: utcInstantFromEpochMilliseconds(page.retrievedAt.getTime()) };
    } catch { return null; }
  }

  async function saveRaw(target: ParsedProviderCoverageTarget, observedAt: number, body: Uint8Array, expectedRows?: number) {
    const data = await prepareProviderResponsePage({ target, observedAt, body });
    if (expectedRows !== undefined && expectedRows !== data.rowCount) throw new Error("Provider archive row count differs from the receipt.");
    await database.query((client) => client.footballHistorySourcePage.createMany({ skipDuplicates: true, data }));
    return data.id;
  }

  async function finish<Result>(ticket: Ticket, outcome: AcceptedOutcome | z.infer<typeof rejected>,
    normalize: ((tx: Tx) => Promise<Result>) | null, responseTarget = ticket.target) {
    let expiredDuringNormalization = false;
    try {
      return await database.transaction(async (tx) => {
        const at = await databaseTime(tx);
        if (at >= ticket.leaseUntil) return null;
        const row = await tx.footballProviderCoverage.findUnique({ where: { key: ticket.target.key } });
        if (!row || row.status !== "fetching" || row.revision !== ticket.revision || nullableTime(row.nextRetryAt) !== ticket.leaseUntil) return null;
        const previous = checkpoint(row), complete = outcome.status === "complete";
        let lastResponseId = previous.lastResponseId, observedAt: number | null = null;
        if ("responseId" in outcome) {
          const source = await tx.footballHistorySourcePage.findUnique({ where: { id: outcome.responseId },
            select: { id: true, endpoint: true, selectorHash: true, contract: true, retrievedAt: true, contentHash: true } });
          if (!source || !locatorMatches(source, providerResponsePageLocator(responseTarget)) || source.retrievedAt.getTime() > at) {
            throw new Error("Provider receipt does not belong to the checkpoint.");
          }
          if (lastResponseId !== null && lastResponseId !== source.id) {
            const previousSource = await tx.footballHistorySourcePage.findUnique({ where: { id: lastResponseId }, select: { retrievedAt: true } });
            if (previousSource && previousSource.retrievedAt.getTime() >= source.retrievedAt.getTime()) return null;
          }
          lastResponseId = source.id;
          observedAt = source.retrievedAt.getTime();
        }
        // lastCompleteAt is the completed receipt's observation time. updatedAt is the checkpoint commit time.
        const alreadyComplete = observedAt !== null && observedAt === previous.lastCompleteAt && lastResponseId === previous.lastResponseId;
        const resolution = complete || alreadyComplete ? { status: "complete", reason: null, lastCompleteAt: observedAt,
          remaining: 0, nextRetryAt: null } : { status: outcome.status, reason: outcome.reason, lastCompleteAt: previous.lastCompleteAt,
          remaining: outcome.remaining === undefined ? previous.remaining : outcome.remaining,
          nextRetryAt: outcome.nextRetryAt === undefined ? null : Math.max(at, outcome.nextRetryAt) };
        const progress = providerCoverageProgress.parse({ ...previous, ...resolution, updatedAt: at, lastResponseId });
        const changed = await tx.footballProviderCoverage.updateMany({ where: { key: ticket.target.key, revision: ticket.revision, status: "fetching",
          nextRetryAt: { equals: new Date(ticket.leaseUntil), gt: new Date(at) } },
        data: { revision: { increment: 1 }, status: progress.status, reason: progress.reason, updatedAt: new Date(at),
          lastResponseId: progress.lastResponseId, lastCompleteAt: nullableDate(progress.lastCompleteAt),
          nextRetryAt: nullableDate(progress.nextRetryAt), remaining: progress.remaining } });
        if (changed.count !== 1) return null;
        const value = normalize !== null && !alreadyComplete ? await normalize(tx) : null;
        if (await databaseTime(tx) >= ticket.leaseUntil) {
          expiredDuringNormalization = true;
          throw new Error("Provider checkpoint lease expired.");
        }
        return { progress, value };
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
    } catch (error) {
      if (expiredDuringNormalization) return null;
      throw error;
    }
  }

  return Object.freeze({
    archive: Object.freeze({
      async save({ requestKey, provenance, body, rowCount }: ApiFootballValidatedResponse) {
        const { endpoint, requestParameters, contractVersion, currentPage, retrievedAt } = provenance;
        const target = transportTarget({ requestKey, endpoint, requestParameters, contractVersion });
        if (currentPage !== null && currentPage !== target.page) throw new Error("Provider archive pagination differs from the request.");
        await saveRaw(target, retrievedAt, body, rowCount);
      },
      async replay(request: ApiFootballArchiveReplayRequest) {
        const page = await rawPage(transportTarget(request), request);
        return page && { body: page.body, retrievedAt: page.retrievedAt };
      },
    }),
    async read(input: ProviderCoverageTarget) {
      const target = parseProviderCoverageTarget(input);
      const row = await database.query((client) => client.footballProviderCoverage.findUnique({ where: { key: target.key } }));
      return row === null ? null : checkpoint(row);
    },
    async stage(input: ProviderCoverageTarget, state: z.input<typeof pending>) {
      const target = parseProviderCoverageTarget(input), { status, remaining } = pending.parse(state);
      return database.transaction(async (tx) => {
        const at = await databaseTime(tx);
        const row = await tx.footballProviderCoverage.findUnique({ where: { key: target.key } });
        if (!row) return (await tx.footballProviderCoverage.createMany({ skipDuplicates: true, data: { ...target,
          status, revision: 1, attempts: 0, updatedAt: new Date(at), remaining: remaining ?? null } })).count === 1;
        if (row.status !== "not_requested" || status !== "queued") return false;
        return (await tx.footballProviderCoverage.updateMany({ where: { key: target.key, revision: row.revision },
          data: { status, revision: { increment: 1 }, updatedAt: new Date(at),
            ...(remaining === undefined ? {} : { remaining }) } })).count === 1;
      }, { isolationLevel: "ReadCommitted" });
    },
    async begin(input: ProviderCoverageTarget, options: { leaseMs: number; resumeBlocked?: true }): Promise<Ticket | null> {
      const target = parseProviderCoverageTarget(input), leaseMs = lease.parse(options.leaseMs);
      return database.transaction(async (tx) => {
        const at = await databaseTime(tx), leaseUntil = at + leaseMs;
        const row = await tx.footballProviderCoverage.findUnique({ where: { key: target.key } });
        if (row?.nextRetryAt && row.nextRetryAt.getTime() > at) return null;
        if (row && row.nextRetryAt === null && requiresReview.has(row.status) && options.resumeBlocked !== true) return null;
        const revision = (row?.revision ?? 0) + 1;
        const changed = row ? await tx.footballProviderCoverage.updateMany({ where: { key: target.key, revision: row.revision },
          data: { revision, status: "fetching", reason: null, attempts: { increment: 1 }, updatedAt: new Date(at),
            lastAttemptAt: new Date(at), nextRetryAt: new Date(leaseUntil) } })
          : await tx.footballProviderCoverage.createMany({ skipDuplicates: true, data: { ...target, status: "fetching", revision,
            attempts: 1, updatedAt: new Date(at), lastAttemptAt: new Date(at), nextRetryAt: new Date(leaseUntil) } });
        return changed.count === 1 ? Object.freeze({ target, revision, leaseUntil }) : null;
      }, { isolationLevel: "ReadCommitted" });
    },
    retain(ticket: Ticket, receipt: Readonly<{ observedAt: number; body: Uint8Array }>) {
      return saveRaw(ticket.target, receipt.observedAt, receipt.body);
    },
    retained(input: ProviderCoverageTarget, window: ReplayWindow) {
      return rawPage(parseProviderCoverageTarget(input), window);
    },
    complete<Result>(ticket: Ticket, outcome: z.input<typeof accepted>, normalize: (tx: Tx) => Promise<Result>) {
      return finish(ticket, accepted.parse(outcome), normalize);
    },
    async completeArchived<Result>(ticket: Ticket, receipt: Readonly<{ requestKey: string; observedAt: number }>, outcome: AcceptedStatus,
      normalize: (tx: Tx) => Promise<Result>) {
      const { endpoint, parameters, page } = ticket.target;
      const requestParameters = page === 1 ? parameters : { ...parameters, page: String(page) };
      const sourceTarget = transportTarget({ requestKey: receipt.requestKey, endpoint, requestParameters, contractVersion: API_FOOTBALL_CONTRACT_VERSION });
      const locator = providerResponsePageLocator(sourceTarget), retrievedAt = new Date(millisecond.parse(receipt.observedAt));
      const pages = await database.query((client) => client.footballHistorySourcePage.findMany({
        where: { endpoint: locator.endpoint, selectorHash: locator.selectorHash, contract: API_FOOTBALL_CONTRACT_VERSION, retrievedAt },
        select: { id: true }, take: 2,
      }));
      if (pages.length !== 1) return null;
      return finish(ticket, accepted.parse({ ...outcome, responseId: pages[0]!.id }), normalize, sourceTarget);
    },
    fail(ticket: Ticket, outcome: Readonly<{ status: FailureStatus; reason: string; remaining?: number | null; nextRetryAt?: number }>) {
      return finish(ticket, rejected.parse(outcome), null);
    },
  });
}
