import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma, FootballFixture, FootballImport, FootballTeam, FootballCompetition } from "../generated/prisma/client.ts";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { fixtureResultValue, insertFixtureResult } from "../results/result-write.ts";
import type { NormalizedFixture, NormalizedTeam, NormalizedCompetition, SourceTimestamps } from "./api-football-normalize.ts";
import type { CatalogAuthority, CatalogPreparedBatch, CatalogSelection, CatalogTeamMapping } from "./catalog-contract.ts";
import { normalizeCatalogSearch, isSafeCatalogLogo, parseCatalogTeamMapping, catalogScopeKey, assertCatalogPreparedBatch, parseCatalogEvidenceRef } from "./catalog-input.ts";

const PROVIDER = "api-football";
const MAX_VERSION = 18_446_744_073_709_551_615n;
export const catalogPersistenceUnavailable = "catalog-persistence-unavailable";
export const historyReplayKind = "history-fixture-replay";
export const historyReplayScopePrefix = "goal-hint:history-fixture-replay:v1:";
const historyReplayChunkSize = 40;
const replayed = "archive-replay-complete", replaySegment = "archive-replay-segment";
const fixtureRelations = { homeTeam: { include: { providers: true } }, awayTeam: { include: { providers: true } },
  season: { include: { competition: true } } } as const;
type StoredFixture = Prisma.FootballFixtureGetPayload<{ include: typeof fixtureRelations }>;
type SharedHistory<Entity> = Map<string, { before: Entity; aliasesAdded: { name: string; normalizedSearch: string; observedAt: UtcInstant }[] }>;
type FixtureFields = Pick<FootballFixture, "homeTeamId" | "awayTeamId" | "seasonId" | "round" | "kickoff" | "eatDate" | "status" |
  "providerStatus" | "elapsedMinutes" | "regulationHome" | "regulationAway" | "regulationEvidenceRef" | "regulationVerifiedAt">;
type ReplaySegment = Readonly<{ id: string; scopeKey: string; reference: string; fingerprint: string; start: number; end: number }>;

function replayScopeKey(parentId: string): string {
  return createHash("sha256").update(historyReplayScopePrefix + parentId).digest("hex");
}

function replayImportId(scope: string, segment: number | "complete"): string {
  const bytes = createHash("sha256").update(`${scope}:${segment}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 128;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class CatalogStoreError extends Error {
  readonly reason: "not-authorized" | "conflicting-import" | "invalid-state" | "coordination-failed" | "unavailable";
  constructor(reason: CatalogStoreError["reason"]) {
    super(`Football catalog ${reason}; private storage diagnostics are withheld.`);
    this.name = "CatalogStoreError"; this.reason = reason;
  }
}
function fail(reason: CatalogStoreError["reason"]): never { throw new CatalogStoreError(reason); }
function trusted<Data>(verify: ((value: Data) => boolean) | undefined, value: Data): boolean {
  try { return verify?.(value) === true; } catch { return false; }
}
const instant = (date: Date): UtcInstant => utcInstantFromEpochMilliseconds(date.getTime());
const timestamp = (value: UtcInstant | null): Date | null => value === null ? null : new Date(value);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const same = (first: unknown, second: unknown) => first instanceof Date && second instanceof Date
  ? first.getTime() === second.getTime() : first === second;
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return fail("invalid-state");
  return value;
}
function fresh(source: SourceTimestamps, previous: { retrievedAt: Date; providerUpdatedAt: Date | null }): boolean {
  return source.retrievedAt >= previous.retrievedAt.getTime() && (source.providerUpdatedAt === null ||
    previous.providerUpdatedAt === null || source.providerUpdatedAt >= previous.providerUpdatedAt.getTime());
}
function permittedLogo(incoming: { url: string | null; rights: string }, previous: string | null, authority: CatalogAuthority): string | null {
  if (incoming.rights === "approved" && incoming.url !== null && isSafeCatalogLogo(incoming.url) && trusted(authority.verifyLogo, incoming.url)) return incoming.url;
  return previous !== null && isSafeCatalogLogo(previous) && trusted(authority.verifyLogo, previous) ? previous : null;
}
function authorize(batch: CatalogPreparedBatch, authority: CatalogAuthority) {
  try {
    authority.authorize(batch.request);
    if (authority.verifyRetention({ selection: batch.selection, evidenceRef: batch.request.retentionEvidenceRef,
      purpose: "structured-catalog-and-audit-history", rawPayloadsStored: false }) !== true) fail("not-authorized");
  } catch { fail("not-authorized"); }
}
export function catalogImportSummary(row: FootballImport) {
  return Object.freeze({ id: row.id, requestFingerprint: row.requestFingerprint, fingerprint: row.fingerprint,
    status: row.status as CatalogPreparedBatch["status"], observedAt: instant(row.observedAt), recordedAt: instant(row.recordedAt),
    receivedCount: row.receivedCount, importedCount: row.importedCount, rejectedCount: row.rejectedCount,
    requestsDispatched: row.requestsDispatched, fixtureIds: Object.freeze(stringArray(row.fixtureIds)),
    changedFixtureIds: Object.freeze(stringArray(row.changedFixtureIds)), reasons: Object.freeze(stringArray(row.reasons)) });
}
export type CatalogImportSummary = ReturnType<typeof catalogImportSummary>;
export function catalogFixtureSnapshot(row: StoredFixture) {
  const externalIds = (value: StoredFixture["homeTeam"]) => Object.freeze(value.providers
    .filter((mapping) => mapping.provider === PROVIDER).map((mapping) => Number(mapping.externalId))
    .filter((externalId) => Number.isSafeInteger(externalId) && externalId > 0).sort((first, second) => first - second));
  const team = (value: FootballTeam) => Object.freeze({ id: value.id, name: value.name, country: value.country,
    logoUrl: value.logoUrl !== null && isSafeCatalogLogo(value.logoUrl) ? value.logoUrl : null });
  const competition = row.season.competition;
  return Object.freeze({ id: row.id, externalId: Number(row.externalId), homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId, homeExternalIds: externalIds(row.homeTeam), awayExternalIds: externalIds(row.awayTeam),
    seasonId: row.seasonId, round: row.round, kickoff: row.kickoff === null ? null : instant(row.kickoff),
    eatDate: row.eatDate === null ? null : parseReportingDate(row.eatDate.toISOString().slice(0, 10)),
    status: row.status as SettlementStatus, providerStatus: row.providerStatus, elapsedMinutes: row.elapsedMinutes,
    regulationScore: row.regulationHome === null || row.regulationAway === null ? null : Object.freeze({ verified: true as const,
      period: "regulation-including-stoppage-time" as const, home: row.regulationHome, away: row.regulationAway }),
    regulationEvidenceRef: row.regulationEvidenceRef, regulationVerifiedAt: row.regulationVerifiedAt === null ? null : instant(row.regulationVerifiedAt),
    retrievedAt: instant(row.retrievedAt), providerUpdatedAt: row.providerUpdatedAt === null ? null : instant(row.providerUpdatedAt),
    dataVersion: row.dataVersion, homeTeam: team(row.homeTeam), awayTeam: team(row.awayTeam),
    season: Object.freeze({ year: row.season.year, competition: Object.freeze({ id: competition.id, name: competition.name,
      country: competition.country, logoUrl: competition.logoUrl !== null && isSafeCatalogLogo(competition.logoUrl) ? competition.logoUrl : null,
      countryFlagUrl: competition.countryFlagUrl !== null && isSafeCatalogLogo(competition.countryFlagUrl) ? competition.countryFlagUrl : null }) }) });
}
export type CatalogFixtureSnapshot = ReturnType<typeof catalogFixtureSnapshot>;
export type CatalogMutationCoordinator = (mutation: Readonly<{
  transaction: Prisma.TransactionClient;
  before: CatalogFixtureSnapshot | null;
  proposed: Readonly<FixtureFields>;
  observation?: NormalizedFixture;
  evidenceRef?: string;
  apply(): Promise<CatalogFixtureSnapshot>;
  retain(): Promise<CatalogFixtureSnapshot>;
}>) => Promise<unknown>;

/** Take this lock before fixture locks when coordinating writes with the catalog. */
export async function lockCatalog(transaction: Prisma.TransactionClient) {
  await transaction.$executeRaw`INSERT INTO FootballCatalogLock (provider) VALUES (${PROVIDER})
    ON DUPLICATE KEY UPDATE provider = VALUES(provider)`;
  await transaction.$queryRaw`SELECT provider FROM FootballCatalogLock WHERE provider = ${PROVIDER} FOR UPDATE`;
}
async function lockFixture(transaction: Prisma.TransactionClient, id: string) {
  await transaction.$queryRaw`SELECT id FROM FootballFixture WHERE id = ${id} FOR UPDATE`;
}
function fields(row: FootballFixture): FixtureFields {
  return { homeTeamId: row.homeTeamId, awayTeamId: row.awayTeamId, seasonId: row.seasonId, round: row.round,
    kickoff: row.kickoff, eatDate: row.eatDate, status: row.status, providerStatus: row.providerStatus,
    elapsedMinutes: row.elapsedMinutes, regulationHome: row.regulationHome, regulationAway: row.regulationAway,
    regulationEvidenceRef: row.regulationEvidenceRef, regulationVerifiedAt: row.regulationVerifiedAt };
}

async function recordHistoricalResult(tx: Prisma.TransactionClient, fixture: StoredFixture,
  observation: NormalizedFixture, importId: string, existing: boolean) {
  if (existing && fixture.activeCycleId !== null) return;
  const observedAt = new Date(observation.source.retrievedAt);
  const value = fixtureResultValue(fixture, { ...observation, externalFixtureId: observation.id });
  if (!value.regulation.verified) return fail("invalid-state");
  const state = existing ? await tx.fixtureResultState.findUnique({ where: { fixtureId: fixture.id } }) : null;
  if (existing) {
    if (state?.resultId != null || state && [state.firstTrackedAt, state.firstFinalAt, state.lastSyncAt]
      .some((at) => at !== null && at > observedAt)) return;
    const lifecycle = await tx.fixtureLifecycleState.findUnique({ where: { fixtureId: fixture.id },
      select: { issue: true, retrievedAt: true } });
    if (lifecycle && (lifecycle.issue !== null || lifecycle.retrievedAt > observedAt)) return;
    if (await tx.predictionCycle.findFirst({ where: { fixtureId: fixture.id }, select: { id: true } }) ||
      await tx.fixtureResult.findFirst({ where: { fixtureId: fixture.id }, select: { id: true } })) return;
  }
  const resultId = await insertFixtureResult(tx, { fixtureId: fixture.id, fixtureVersion: fixture.dataVersion, previousId: null,
    observationId: evidenceFingerprint({ importId, fixtureId: fixture.id, observedAt: observation.source.retrievedAt }),
    observedAt: observation.source.retrievedAt, providerUpdatedAt: observation.source.providerUpdatedAt,
    regulationVerifiedAt: fixture.regulationVerifiedAt, value, contentHash: evidenceFingerprint(value) });
  const data = { resultId, firstFinalAt: state?.firstFinalAt ?? observedAt, lastSyncAt: observedAt };
  if (state) await tx.fixtureResultState.update({ where: { fixtureId: fixture.id }, data });
  else await tx.fixtureResultState.create({ data: { fixtureId: fixture.id, firstTrackedAt: observedAt, ...data } });
}
const visibleKeys = ["homeTeamId", "awayTeamId", "seasonId", "round", "kickoff", "eatDate", "status", "providerStatus",
  "elapsedMinutes", "regulationHome", "regulationAway"] as const;
function materialChanges(before: FixtureFields | null, after: FixtureFields): Record<string, unknown> {
  return Object.fromEntries(visibleKeys.filter((key) => before === null || !same(before[key], after[key])).map((key) =>
    [key, { before: before?.[key] ?? null, after: after[key] }]));
}
function remember<Entity extends { id: string }>(history: SharedHistory<Entity>, row: Entity) {
  let entry = history.get(row.id);
  if (!entry) { entry = { before: row, aliasesAdded: [] }; history.set(row.id, entry); }
  return entry;
}
function sharedChanges<Entity extends FootballTeam | FootballCompetition>(history: SharedHistory<Entity>, row: Entity) {
  const entry = history.get(row.id);
  if (!entry) return null;
  // A flag change alone never versions fixtures (see `competition`), but it is audited beside a versioned change.
  const visible = (entity: Entity): Record<string, unknown> => ({ name: entity.name, country: entity.country, logoUrl: entity.logoUrl,
    ...("code" in entity ? { code: entity.code, national: entity.national } : { type: entity.type, countryFlagUrl: entity.countryFlagUrl }) });
  const before = visible(entry.before), after = visible(row);
  return { id: row.id, fields: Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value)
    .map(([key, value]) => [key, { before: before[key], after: value }])), aliasesAdded: entry.aliasesAdded };
}

/** All provider I/O happens before this bounded transaction, which serializes catalog identity writes. */
export function createFootballCatalogStore(database: DatabaseRuntime, options: Readonly<{
  clock?: Clock; coordinateFixtureMutation?: CatalogMutationCoordinator; transactionTimeoutMs?: number;
  historicalResults?: true;
}> = {}) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const transactionTimeout = options.transactionTimeoutMs ?? 30_000;
  const historical = options.historicalResults === true;
  if (!Number.isSafeInteger(transactionTimeout) || transactionTimeout < 1 || transactionTimeout > 120_000) fail("invalid-state");
  async function write<Result>(operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
    mode: "catalog" | "fixture-transaction" | "historical" | "receipt-only" = "catalog"): Promise<Result> {
    const receiptOnly = mode === "receipt-only";
    const historicalWrite = mode === "historical" || receiptOnly;
    const retryConflicts = mode !== "fixture-transaction" && options.coordinateFixtureMutation === undefined;
    try {
      // Reuse the prepared batch on a retry. Provider I/O has already finished.
      for (let attempt = 0; ; attempt++) {
        let domainError: CatalogStoreError | undefined;
        try { return await database.transaction(async (transaction) => {
          try {
            if (!receiptOnly) await lockCatalog(transaction);
            return await operation(transaction);
          }
          catch (error) { if (error instanceof CatalogStoreError) domainError = error; throw error; }
        }, { maxWait: 10_000, timeout: transactionTimeout, isolationLevel: "ReadCommitted" }); }
        catch (error) {
          if (domainError) throw domainError;
          const code = error !== null && typeof error === "object" && "code" in error ? error.code : null;
          const transient = retryConflicts && (code === "conflict" || historicalWrite && code === "lock-timeout");
          // The primary key arbitrates receipt-only races; the next read checks both fingerprints.
          if (attempt >= 2 || !(transient || receiptOnly && code === "constraint")) throw error;
          if (historicalWrite && transient) await delay(100 * (attempt + 1));
        }
      }
    } catch (error) { if (error instanceof CatalogStoreError) throw error; return fail("unavailable"); }
  }
  async function applyMutation(transaction: Prisma.TransactionClient, before: StoredFixture | null, proposed: FixtureFields,
    operation: () => Promise<StoredFixture>, observation?: NormalizedFixture, evidenceRef?: string): Promise<{ row: StoredFixture; applied: boolean }> {
    let calls = 0, result: StoredFixture | undefined, pending: Promise<StoredFixture> | undefined;
    let applied = false;
    const apply = () => {
      if (++calls !== 1) fail("coordination-failed");
      applied = true;
      pending = operation().then((row) => { result = row; return row; });
      const snapshot = pending.then(catalogFixtureSnapshot);
      // An invalid coordinator may throw before awaiting its apply() result.
      void snapshot.catch(() => {});
      return snapshot;
    };
    const retain = async () => {
      if (++calls !== 1 || !before) return fail("coordination-failed");
      result = before; pending = Promise.resolve(before);
      return catalogFixtureSnapshot(before);
    };
    try {
      if (options.coordinateFixtureMutation) await options.coordinateFixtureMutation({ transaction,
        before: before === null ? null : catalogFixtureSnapshot(before), proposed: Object.freeze(proposed),
        ...(observation ? { observation } : {}), ...(evidenceRef ? { evidenceRef } : {}), apply, retain });
      else {
        if (before?.activeCycleId && (!same(before.kickoff, proposed.kickoff) || before.status !== proposed.status))
          fail("coordination-failed");
        await apply();
      }
    } catch {
      await pending?.catch(() => {});
      fail("coordination-failed");
    }
    if (calls !== 1 || pending === undefined) fail("coordination-failed");
    await pending;
    if (result === undefined) return fail("coordination-failed");
    return { row: await transaction.footballFixture.findUniqueOrThrow({ where: { id: result.id }, include: fixtureRelations }), applied };
  }
  async function team(transaction: Prisma.TransactionClient, input: NormalizedTeam, authority: CatalogAuthority, changed: Set<string>, history: SharedHistory<FootballTeam>) {
    const mapping = await transaction.footballTeamProvider.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(input.id) } }, include: { team: true } });
    if (historical && mapping) return mapping.teamId;
    let current: FootballTeam;
    if (!mapping) {
      current = await transaction.footballTeam.create({ data: { id: randomUUID(), name: input.name,
        nameSearch: input.name === null ? null : normalizeCatalogSearch(input.name), code: input.code, country: input.country,
        countrySearch: input.country === null ? null : normalizeCatalogSearch(input.country), national: input.national,
        logoUrl: permittedLogo(input.logo, null, authority), retrievedAt: new Date(input.source.retrievedAt),
        providerUpdatedAt: timestamp(input.source.providerUpdatedAt) } });
      await transaction.footballTeamProvider.create({ data: { provider: PROVIDER, externalId: BigInt(input.id), teamId: current.id,
        mappedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
    } else {
      current = mapping.team;
      if (fresh(input.source, current)) {
        const data = { name: input.name ?? current.name, code: input.code ?? current.code, country: input.country ?? current.country,
          national: input.national ?? current.national, logoUrl: permittedLogo(input.logo, current.logoUrl, authority) };
        if (Object.entries(data).some(([key, value]) => !same(current[key as keyof typeof data], value))) {
          changed.add(current.id); remember(history, current);
        }
        current = await transaction.footballTeam.update({ where: { id: current.id }, data: { ...data,
          nameSearch: data.name === null ? null : normalizeCatalogSearch(data.name), countrySearch: data.country === null ? null : normalizeCatalogSearch(data.country),
          retrievedAt: new Date(input.source.retrievedAt), providerUpdatedAt: timestamp(input.source.providerUpdatedAt) ?? current.providerUpdatedAt } });
      }
    }
    if (input.name !== null) {
      const normalizedSearch = normalizeCatalogSearch(input.name), key = { teamId: current.id, normalizedSearch };
      const alias = await transaction.footballTeamAlias.findUnique({ where: { teamId_normalizedSearch: key } });
      if (!alias) {
        await transaction.footballTeamAlias.create({ data: { ...key, name: input.name, observedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
        if (mapping) {
          changed.add(current.id); remember(history, current).aliasesAdded.push({ name: input.name, normalizedSearch, observedAt: input.source.retrievedAt });
        }
      } else if (input.source.retrievedAt > alias.observedAt.getTime()) await transaction.footballTeamAlias.update({ where: { teamId_normalizedSearch: key },
        data: { observedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
    }
    return current.id;
  }
  async function competition(transaction: Prisma.TransactionClient, input: NormalizedCompetition, authority: CatalogAuthority, changed: Set<string>, history: SharedHistory<FootballCompetition>) {
    const mapping = await transaction.footballCompetitionProvider.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(input.id) } }, include: { competition: true } });
    if (historical && mapping) return mapping.competitionId;
    let current: FootballCompetition;
    if (!mapping) {
      current = await transaction.footballCompetition.create({ data: { id: randomUUID(), name: input.name,
        nameSearch: input.name === null ? null : normalizeCatalogSearch(input.name), country: input.country,
        countrySearch: input.country === null ? null : normalizeCatalogSearch(input.country), type: input.type,
        logoUrl: permittedLogo(input.logo, null, authority), countryFlagUrl: permittedLogo(input.countryFlag, null, authority),
        retrievedAt: new Date(input.source.retrievedAt), providerUpdatedAt: timestamp(input.source.providerUpdatedAt) } });
      await transaction.footballCompetitionProvider.create({ data: { provider: PROVIDER, externalId: BigInt(input.id), competitionId: current.id,
        mappedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
    } else {
      current = mapping.competition;
      if (fresh(input.source, current)) {
        const data = { name: input.name ?? current.name, country: input.country ?? current.country, type: input.type ?? current.type,
          logoUrl: permittedLogo(input.logo, current.logoUrl, authority) };
        if (Object.entries(data).some(([key, value]) => !same(current[key as keyof typeof data], value))) {
          changed.add(current.id); remember(history, current);
        }
        // The country flag is decoration of the (versioned) country name: a later null or unapproved flag keeps the stored
        // one, and a flag change alone bumps no fixture version. Otherwise the first sync after the flag column ships would
        // version every stored fixture of every competition in a worldwide date import inside one catalog transaction.
        // Public reads still see it at once: every FootballCompetition update advances the `global:catalog` cache tag.
        // The flag belongs to the country, so when the (versioned) country itself changes, the old flag is not kept: the
        // competition shows the row's new flag, or none until a later row brings one.
        const countryFlagUrl = permittedLogo(input.countryFlag, same(data.country, current.country) ? current.countryFlagUrl : null, authority);
        current = await transaction.footballCompetition.update({ where: { id: current.id }, data: { ...data, countryFlagUrl,
          nameSearch: data.name === null ? null : normalizeCatalogSearch(data.name), countrySearch: data.country === null ? null : normalizeCatalogSearch(data.country),
          retrievedAt: new Date(input.source.retrievedAt), providerUpdatedAt: timestamp(input.source.providerUpdatedAt) ?? current.providerUpdatedAt } });
      }
    }
    if (input.name !== null) {
      const normalizedSearch = normalizeCatalogSearch(input.name), key = { competitionId: current.id, normalizedSearch };
      const alias = await transaction.footballCompetitionAlias.findUnique({ where: { competitionId_normalizedSearch: key } });
      if (!alias) {
        await transaction.footballCompetitionAlias.create({ data: { ...key, name: input.name, observedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
        if (mapping) {
          changed.add(current.id); remember(history, current).aliasesAdded.push({ name: input.name, normalizedSearch, observedAt: input.source.retrievedAt });
        }
      } else if (input.source.retrievedAt > alias.observedAt.getTime()) await transaction.footballCompetitionAlias.update({ where: { competitionId_normalizedSearch: key },
        data: { observedAt: new Date(input.source.retrievedAt), sourceRef: input.source.endpoint } });
    }
    for (const season of input.seasons) await upsertSeason(transaction, current.id, season.year, input.source, season);
    return current.id;
  }
  async function upsertSeason(transaction: Prisma.TransactionClient, competitionId: string, year: number, source: SourceTimestamps,
    metadata?: NormalizedCompetition["seasons"][number]) {
    const current = await transaction.footballSeason.findUnique({ where: { competitionId_year: { competitionId, year } } });
    if (!current) return transaction.footballSeason.create({ data: { id: randomUUID(), competitionId, year,
      current: metadata?.current ?? null, ...(metadata ? { coverage: json(metadata.coverage) } : {}),
      retrievedAt: new Date(source.retrievedAt), providerUpdatedAt: timestamp(source.providerUpdatedAt) } });
    if (historical || !fresh(source, current)) return current;
    const previousCoverage = current.coverage !== null && typeof current.coverage === "object" && !Array.isArray(current.coverage) ? current.coverage : {};
    const coverage = metadata ? { ...previousCoverage, ...Object.fromEntries(Object.entries(metadata.coverage).filter(([, value]) => value !== null)) } : previousCoverage;
    return transaction.footballSeason.update({ where: { id: current.id }, data: { current: metadata?.current ?? current.current,
      ...(metadata ? { coverage: json(coverage) } : {}), retrievedAt: new Date(source.retrievedAt), providerUpdatedAt: timestamp(source.providerUpdatedAt) ?? current.providerUpdatedAt } });
  }
  async function writeImport(batch: CatalogPreparedBatch, authority: CatalogAuthority, persistenceDeferred = false,
    replay?: ReplaySegment): Promise<CatalogImportSummary> {
    assertCatalogPreparedBatch(batch, authority);
    authorize(batch, authority);
    if (persistenceDeferred && !historical) fail("invalid-state");
    if (historical && (batch.selection.kind !== "fixtures" || batch.selection.query.competitionId === undefined ||
      batch.selection.query.season === undefined)) fail("invalid-state");
    const receiptOnly = historical && (persistenceDeferred || batch.status !== "complete" || batch.rows.fixtures.length === 0);
    const importId = replay?.id ?? batch.request.id, fingerprint = replay?.fingerprint ?? batch.fingerprint;
    const fixtures = replay ? batch.rows.fixtures.slice(replay.start, replay.end) : batch.rows.fixtures;
    return write(async (transaction) => {
      authorize(batch, authority);
      const existing = await transaction.footballImport.findUnique({ where: { id: importId } });
      if (existing) {
        if (existing.fingerprint !== fingerprint || existing.requestFingerprint !== batch.requestFingerprint) fail("conflicting-import");
        return catalogImportSummary(existing);
      }
      const receivedCount = fixtures.length + batch.rows.teams.length + batch.rows.competitions.length + batch.invalidRows;
      const recordedAt = new Date(clock.now());
      async function appendReceipt(fixtureIds: readonly string[], changedFixtureIds: readonly string[]) {
        authorize(batch, authority);
        return transaction.footballImport.create({ data: { id: importId, fingerprint,
          requestFingerprint: batch.requestFingerprint, selection: json(batch.selection), scopeKey: replay?.scopeKey ?? batch.scopeKey, provider: PROVIDER,
          kind: replay ? historyReplayKind : batch.selection.kind, status: persistenceDeferred || replay ? "partial" : batch.status,
          observedAt: new Date(batch.observedAt), recordedAt, receivedCount,
          importedCount: historical ? fixtureIds.length : receivedCount - batch.invalidRows, rejectedCount: batch.invalidRows,
          requestsDispatched: batch.requestsDispatched,
          reasons: json(replay ? [replaySegment] : persistenceDeferred ? [...batch.reasons, catalogPersistenceUnavailable].sort() : batch.reasons),
          missingIds: json(batch.missingIds), missingCoverage: json(batch.missingCoverage),
          provenance: json(batch.provenance), retentionEvidenceRef: batch.request.retentionEvidenceRef,
          subsetEvidenceRef: replay?.reference ?? batch.request.knownSubset?.evidenceRef ?? null, fixtureIds: json(fixtureIds), changedFixtureIds: json(changedFixtureIds) } });
      }
      // Historical observations can record coverage without touching identities or results.
      if (receiptOnly) return catalogImportSummary(await appendReceipt([], []));
      // Import receipts and audits are append-only: both are inserted once, with final values, at the end.
      const audits: { id: string; fixtureId: string; dataVersion: bigint; observedAt: UtcInstant; changes: Record<string, unknown> }[] = [];
      const audit = (row: StoredFixture, observedAt: UtcInstant, changes: Record<string, unknown>) => {
        audits.push({ id: randomUUID(), fixtureId: row.id, dataVersion: row.dataVersion, observedAt, changes });
      };
      const changedTeams = new Set<string>(), changedCompetitions = new Set<string>(), changedFixtures = new Set<string>(), insertedFixtures = new Set<string>(), fixtureIds: string[] = [];
      const teamHistory: SharedHistory<FootballTeam> = new Map(), competitionHistory: SharedHistory<FootballCompetition> = new Map();
      const priorSnapshot = (row: StoredFixture): StoredFixture => ({ ...row,
        homeTeam: { ...(teamHistory.get(row.homeTeamId)?.before ?? row.homeTeam), providers: row.homeTeam.providers },
        awayTeam: { ...(teamHistory.get(row.awayTeamId)?.before ?? row.awayTeam), providers: row.awayTeam.providers },
        season: { ...row.season, competition: competitionHistory.get(row.season.competitionId)?.before ?? row.season.competition } });
      for (const input of batch.rows.teams) await team(transaction, input, authority, changedTeams, teamHistory);
      for (const input of batch.rows.competitions) await competition(transaction, input, authority, changedCompetitions, competitionHistory);
      for (const input of fixtures) {
        const score = input.regulationScore;
        const scoreEvidence = batch.scoreEvidenceRefs?.[String(input.id)];
        const proof = score === null ? null : { fixtureId: score.fixtureId, providerStatus: score.providerStatus,
          sourceField: score.sourceField, period: score.period, home: score.home, away: score.away };
        const verified = score?.verified === true && scoreEvidence && proof !== null && trusted(authority.verifyRegulationScore, proof);
        if (historical && (!verified || !isPlayedFinalStatus(input.status) || input.kickoff === null ||
          input.kickoff >= input.source.retrievedAt || input.source.retrievedAt > recordedAt.getTime())) continue;
        const findExisting = () => transaction.footballFixture.findUnique({ where: { provider_externalId: {
          provider: PROVIDER, externalId: BigInt(input.id),
        } }, include: fixtureRelations });
        const archivedFixture = historical ? await findExisting() : null;
        if (archivedFixture) {
          // Preserve current identities, scores and prediction history. An exact match may seed its first result record.
          const mapping = await transaction.footballCompetitionProvider.findUnique({ where: {
            provider_externalId: { provider: PROVIDER, externalId: BigInt(input.competition.id) },
          } });
          if (archivedFixture.season.competitionId !== mapping?.competitionId || archivedFixture.season.year !== input.competition.season ||
            !archivedFixture.homeTeam.providers.some((row) => row.provider === PROVIDER && row.externalId === BigInt(input.homeTeam.id)) ||
            !archivedFixture.awayTeam.providers.some((row) => row.provider === PROVIDER && row.externalId === BigInt(input.awayTeam.id)) ||
            archivedFixture.kickoff?.getTime() !== input.kickoff || archivedFixture.status !== input.status || archivedFixture.providerStatus !== input.providerStatus ||
            archivedFixture.regulationHome !== score!.home || archivedFixture.regulationAway !== score!.away || archivedFixture.regulationEvidenceRef !== scoreEvidence ||
            archivedFixture.regulationVerifiedAt === null || archivedFixture.regulationVerifiedAt.getTime() > input.source.retrievedAt) continue;
          fixtureIds.push(archivedFixture.id);
          if (fresh(input.source, archivedFixture)) {
            await lockFixture(transaction, archivedFixture.id);
            await recordHistoricalResult(transaction, archivedFixture, input, importId, true);
          }
          continue;
        }
        const homeTeamId = await team(transaction, input.homeTeam, authority, changedTeams, teamHistory), awayTeamId = await team(transaction, input.awayTeam, authority, changedTeams, teamHistory);
        const competitionId = await competition(transaction, input.competition, authority, changedCompetitions, competitionHistory);
        const season = await upsertSeason(transaction, competitionId, input.competition.season!, input.competition.source);
        const previous = historical ? null : await findExisting();
        if (homeTeamId === awayTeamId) fail("invalid-state");
        if (previous) { fixtureIds.push(previous.id); await lockFixture(transaction, previous.id); }
        if (previous && !fresh(input.source, previous) && !options.coordinateFixtureMutation) continue;
        const status = input.status === "unknown" && previous ? previous.status : input.status;
        const kickoff = input.kickoff === null ? previous?.kickoff ?? null : new Date(input.kickoff);
        const providerStatus = input.status === "unknown" && previous ? previous.providerStatus : input.providerStatus ?? previous?.providerStatus ?? null;
        const keepScore = previous && previous.status === status && previous.providerStatus === providerStatus;
        const proposed: FixtureFields = { homeTeamId, awayTeamId, seasonId: season.id, round: input.competition.round ?? previous?.round ?? null, kickoff,
          eatDate: kickoff === null ? null : new Date(`${getReportingDate(instant(kickoff))}T00:00:00.000Z`), status,
          providerStatus, elapsedMinutes: input.elapsedMinutes ?? previous?.elapsedMinutes ?? null,
          regulationHome: verified ? score.home : keepScore ? previous.regulationHome : null,
          regulationAway: verified ? score.away : keepScore ? previous.regulationAway : null,
          regulationEvidenceRef: verified ? scoreEvidence : keepScore ? previous.regulationEvidenceRef : null,
          regulationVerifiedAt: verified ? new Date(input.source.retrievedAt) : keepScore ? previous.regulationVerifiedAt : null };
        const changes = materialChanges(previous ? fields(previous) : null, proposed), material = Object.keys(changes).length > 0;
        if (previous && previous.dataVersion >= MAX_VERSION && material) fail("invalid-state");
        const metadata = { retrievedAt: new Date(input.source.retrievedAt), providerUpdatedAt: timestamp(input.source.providerUpdatedAt) ?? previous?.providerUpdatedAt ?? null };
        if (!previous || material || options.coordinateFixtureMutation) {
          const { row, applied } = await applyMutation(transaction, previous ? priorSnapshot(previous) : null, proposed, () => previous
            ? transaction.footballFixture.update({ where: { id: previous.id }, data: { ...proposed, ...metadata,
              ...(material ? { dataVersion: { increment: 1n } } : {}) }, include: fixtureRelations })
            : transaction.footballFixture.create({ data: { id: randomUUID(), provider: PROVIDER, externalId: BigInt(input.id), ...proposed, ...metadata }, include: fixtureRelations }),
            input, `catalog-import:${importId}`);
          if (!previous) {
            fixtureIds.push(row.id); insertedFixtures.add(row.id);
            if (historical) await recordHistoricalResult(transaction, row, input, importId, false);
          }
          if (applied && material) { changedFixtures.add(row.id); audit(row, input.source.retrievedAt, changes); }
        } else await transaction.footballFixture.update({ where: { id: previous.id }, data: { ...metadata,
          regulationEvidenceRef: proposed.regulationEvidenceRef, regulationVerifiedAt: proposed.regulationVerifiedAt } });
      }
      // Shared identity/alias changes affect every fixture that renders those shared records.
      if (changedTeams.size || changedCompetitions.size) {
        const affected = await transaction.footballFixture.findMany({ where: { OR: [
          { homeTeamId: { in: [...changedTeams] } }, { awayTeamId: { in: [...changedTeams] } },
          { season: { competitionId: { in: [...changedCompetitions] } } }], id: { notIn: [...insertedFixtures] } }, include: fixtureRelations });
        for (const previous of affected) {
          if (changedFixtures.has(previous.id)) continue;
          await lockFixture(transaction, previous.id);
          if (previous.dataVersion >= MAX_VERSION) fail("invalid-state");
          const { row } = await applyMutation(transaction, priorSnapshot(previous), fields(previous), () => transaction.footballFixture.update({
            where: { id: previous.id }, data: { dataVersion: { increment: 1n } }, include: fixtureRelations }));
          changedFixtures.add(row.id); audit(row, batch.observedAt,
            { sharedIdentity: { teamIds: [...changedTeams], competitionIds: [...changedCompetitions] } });
        }
        // Include shared changes in the same version audit, even for directly changed fixtures.
        const audited = new Map((await transaction.footballFixture.findMany({ where: { id: { in: [...new Set(audits.map((entry) => entry.fixtureId))] } },
          include: fixtureRelations })).map((row) => [row.id, row]));
        for (const entry of audits) {
          const fixture = audited.get(entry.fixtureId)!;
          const sharedIdentity = { teams: [fixture.homeTeam, fixture.awayTeam]
            .map((row) => sharedChanges(teamHistory, row)).filter((value) => value !== null),
          competitions: [sharedChanges(competitionHistory, fixture.season.competition)].filter((value) => value !== null) };
          if (sharedIdentity.teams.length || sharedIdentity.competitions.length) entry.changes = { ...entry.changes, sharedIdentity };
        }
      }
      const receipt = await appendReceipt(fixtureIds, [...changedFixtures]);
      for (const entry of audits) await transaction.footballFixtureAudit.create({ data: { id: entry.id, fixtureId: entry.fixtureId,
        importId, dataVersion: entry.dataVersion, observedAt: new Date(entry.observedAt), changes: json(entry.changes) } });
      return catalogImportSummary(receipt);
    }, receiptOnly ? "receipt-only" : historical ? "historical" : "catalog");
  }
  /** Apply one checksummed observation without monopolizing the live catalog lock. */
  async function replayHistory(batch: CatalogPreparedBatch, authority: CatalogAuthority, pageId: string, maxChunks: number, signal?: AbortSignal) {
    assertCatalogPreparedBatch(batch, authority);
    authorize(batch, authority);
    if (!historical || !/^[a-f0-9]{64}$/u.test(pageId) || !Number.isSafeInteger(maxChunks) || maxChunks < 1 || maxChunks > 10 ||
      batch.status !== "complete" || batch.selection.kind !== "fixtures" || batch.selection.query.competitionId === undefined ||
      batch.selection.query.season === undefined || !batch.rows.fixtures.length || batch.requestsDispatched !== 0 ||
      batch.provenance.length !== 1 || batch.provenance[0]?.fromCache !== true) fail("invalid-state");

    const parentId = batch.request.id, scopeKey = replayScopeKey(parentId), completionId = replayImportId(scopeKey, "complete");
    const originalProvenance = batch.provenance.map((page) => ({ ...page, fromCache: false }));
    const parent = await database.query((client) => client.footballImport.findUnique({ where: { id: parentId } }));
    if (!parent || parent.scopeKey !== batch.scopeKey || parent.provider !== PROVIDER || parent.kind !== "fixtures" ||
      parent.status !== "partial" || parent.requestsDispatched !== 1 || parent.importedCount !== 0 || parent.rejectedCount !== 0 ||
      parent.observedAt.getTime() !== batch.observedAt || parent.receivedCount !== batch.rows.fixtures.length ||
      parent.retentionEvidenceRef !== batch.request.retentionEvidenceRef ||
      evidenceFingerprint(parent.reasons) !== evidenceFingerprint([catalogPersistenceUnavailable]) ||
      evidenceFingerprint(parent.provenance) !== evidenceFingerprint(originalProvenance)) fail("invalid-state");
    const reference = `history-source:${pageId}:import:${parentId}`;
    const chunkCount = Math.ceil(batch.rows.fixtures.length / historyReplayChunkSize);
    const plan = Array.from({ length: chunkCount }, (_, index): ReplaySegment => {
      const start = index * historyReplayChunkSize, end = Math.min(start + historyReplayChunkSize, batch.rows.fixtures.length);
      return { id: replayImportId(scopeKey, index), scopeKey, reference: `${reference}:${start}-${end}`, start, end,
        fingerprint: evidenceFingerprint([batch.fingerprint, reference, start, end]) };
    });
    const findChunks = (client: Prisma.TransactionClient) => client.footballImport.findMany({ where: { id: { in: plan.map(({ id }) => id) } } });
    function verifiedChunks(rows: readonly FootballImport[]) {
      const saved = new Map(rows.map((row) => [row.id, row]));
      for (const segment of plan) {
        const row = saved.get(segment.id);
        if (row && (row.fingerprint !== segment.fingerprint || row.requestFingerprint !== batch.requestFingerprint ||
          row.scopeKey !== scopeKey || row.kind !== historyReplayKind || row.status !== "partial" ||
          row.subsetEvidenceRef !== segment.reference || row.requestsDispatched !== 0 || row.receivedCount !== segment.end - segment.start ||
          row.importedCount < 0 || row.importedCount > row.receivedCount)) fail("conflicting-import");
      }
      return saved;
    }
    const saved = verifiedChunks(await database.query(findChunks));
    let written = 0, imported = 0;
    for (const segment of plan) {
      if (saved.has(segment.id)) continue;
      if (signal?.aborted || written >= maxChunks) return { written, imported, complete: false };
      const receipt = await writeImport(batch, authority, false, segment);
      written++;
      imported += receipt.importedCount;
    }
    if (signal?.aborted) return { written, imported, complete: false };
    const completionFingerprint = evidenceFingerprint([batch.fingerprint, reference, plan.map(({ fingerprint }) => fingerprint)]);
    await write(async (client) => {
      authorize(batch, authority);
      const complete = await client.footballImport.findUnique({ where: { id: completionId } });
      if (complete) {
        if (complete.fingerprint !== completionFingerprint || complete.requestFingerprint !== batch.requestFingerprint) fail("conflicting-import");
        return;
      }
      const chunks = verifiedChunks(await findChunks(client));
      if (chunks.size !== plan.length) fail("invalid-state");
      await client.footballImport.create({ data: { id: completionId, fingerprint: completionFingerprint,
        requestFingerprint: batch.requestFingerprint, selection: json(batch.selection), scopeKey, provider: PROVIDER,
        kind: historyReplayKind, status: "complete", observedAt: new Date(batch.observedAt), recordedAt: new Date(clock.now()),
        receivedCount: batch.rows.fixtures.length, importedCount: [...chunks.values()].reduce((sum, row) => sum + row.importedCount, 0),
        rejectedCount: 0, requestsDispatched: 0, reasons: json([replayed]), missingIds: json([]), missingCoverage: json(batch.missingCoverage),
        provenance: json(batch.provenance), retentionEvidenceRef: batch.request.retentionEvidenceRef, subsetEvidenceRef: reference,
        fixtureIds: json([]), changedFixtureIds: json([]) } });
    }, "receipt-only");
    return { written, imported, complete: true };
  }
  async function registerTeamMapping(input: CatalogTeamMapping, authority: CatalogAuthority, retentionEvidenceRef: string) {
    const mapping = parseCatalogTeamMapping(input);
    if (mapping.observedAt > clock.now()) fail("invalid-state");
    retentionEvidenceRef = parseCatalogEvidenceRef(retentionEvidenceRef);
    const selection: CatalogSelection = { kind: "teams", query: { teamId: mapping.externalId } };
    const authorizeMapping = () => {
      try { authority.authorizeMapping(mapping); } catch { fail("not-authorized"); }
      if (!trusted(authority.verifyRetention, { selection, evidenceRef: retentionEvidenceRef,
        purpose: "structured-catalog-and-audit-history" as const, rawPayloadsStored: false as const })) fail("not-authorized");
    };
    authorizeMapping();
    return write(async (transaction) => {
      authorizeMapping();
      const candidate = await transaction.footballTeamProvider.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(mapping.candidateExternalId) } } });
      const existing = await transaction.footballTeamProvider.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(mapping.externalId) } } });
      const verified = mapping.evidenceRef !== null && trusted(authority.verifyMapping, mapping);
      const reason = !verified ? "unverified-mapping" : !candidate ? "unknown-candidate" : existing && existing.teamId !== candidate.teamId ? "conflicting-mapping" : "verified-mapping";
      const resolved = reason === "verified-mapping";
      const reviewKey = { provider: PROVIDER, externalId: BigInt(mapping.externalId), candidateExternalId: BigInt(mapping.candidateExternalId) };
      const priorReview = await transaction.footballIdentityReview.findUnique({ where: { provider_externalId_candidateExternalId: reviewKey } });
      // An older or weaker duplicate proposal cannot erase attributable resolution evidence.
      if (priorReview && (priorReview.observedAt.getTime() > mapping.observedAt || priorReview.status === "resolved" && !resolved)) {
        authorizeMapping();
        const retainedResolution = priorReview.status === "resolved" && existing !== null && candidate !== null && existing.teamId === candidate.teamId;
        return Object.freeze({ status: retainedResolution ? "resolved" as const : "unresolved" as const,
          reviewId: priorReview.id, teamId: retainedResolution ? existing!.teamId : null, reason: priorReview.reason });
      }
      if (resolved && candidate && !existing) await transaction.footballTeamProvider.create({ data: { provider: PROVIDER,
        externalId: BigInt(mapping.externalId), teamId: candidate.teamId, mappedAt: new Date(mapping.observedAt),
        evidenceRef: mapping.evidenceRef, sourceRef: mapping.sourceRef } });
      const review = await transaction.footballIdentityReview.upsert({ where: { provider_externalId_candidateExternalId: reviewKey },
      create: { id: randomUUID(), provider: PROVIDER, externalId: BigInt(mapping.externalId), candidateExternalId: BigInt(mapping.candidateExternalId),
        status: resolved ? "resolved" : "pending", reason, sourceRef: mapping.sourceRef, evidenceRef: mapping.evidenceRef, observedAt: new Date(mapping.observedAt) },
      update: { status: resolved ? "resolved" : "pending", reason, sourceRef: mapping.sourceRef, evidenceRef: mapping.evidenceRef, observedAt: new Date(mapping.observedAt) } });
      authorizeMapping();
      return Object.freeze({ status: resolved ? "resolved" as const : "unresolved" as const, reviewId: review.id,
        teamId: resolved ? candidate!.teamId : null, reason });
    });
  }
  async function dateCoverage(selection: CatalogSelection) {
    if (selection.kind !== "fixtures") fail("invalid-state");
    const scopeKey = catalogScopeKey(selection);
    return database.transaction(async (client) => {
      const latest = await client.footballImport.findFirst({ where: { scopeKey }, orderBy: [{ observedAt: "desc" }, { sequence: "desc" }] });
      const lastComplete = await client.footballImport.findFirst({ where: { scopeKey, status: "complete" }, orderBy: [{ observedAt: "desc" }, { sequence: "desc" }] });
      const query = selection.query;
      const where: Prisma.FootballFixtureWhereInput = { provider: PROVIDER,
        ...(query.fixtureId === undefined ? {} : { externalId: BigInt(query.fixtureId) }),
        ...(query.round === undefined ? {} : { round: query.round }),
        ...(query.date === undefined ? {} : { eatDate: new Date(`${parseReportingDate(query.date)}T00:00:00.000Z`) }),
        ...(query.from === undefined ? {} : { eatDate: { gte: new Date(`${parseReportingDate(query.from)}T00:00:00.000Z`), lte: new Date(`${parseReportingDate(query.to)}T00:00:00.000Z`) } }),
        ...(query.competitionId === undefined && query.season === undefined ? {} : { season: {
          ...(query.season === undefined ? {} : { year: query.season }),
          ...(query.competitionId === undefined ? {} : { competition: { providers: { some: { provider: PROVIDER, externalId: BigInt(query.competitionId) } } } }) } }),
        ...(query.teamId === undefined ? {} : { OR: [{ homeTeam: { providers: { some: { provider: PROVIDER, externalId: BigInt(query.teamId) } } } },
          { awayTeam: { providers: { some: { provider: PROVIDER, externalId: BigInt(query.teamId) } } } }] }) };
      const matches = await client.footballFixture.findMany({ where, select: { id: true } });
      const providerReturnedEmpty = latest?.status === "complete" && latest.receivedCount === 0;
      const state = !latest ? "unknown" : providerReturnedEmpty && matches.length === 0 ? "complete-empty" : latest.status;
      return Object.freeze({ state, importId: latest?.id ?? null, observedAt: latest ? instant(latest.observedAt) : null,
        providerReturnedEmpty, knownFixtureIds: Object.freeze(matches.map((row) => row.id)), lastCompleteImportId: lastComplete?.id ?? null });
    }, { isolationLevel: "RepeatableRead", timeout: transactionTimeout });
  }
  return Object.freeze({
    importBatch: (batch: CatalogPreparedBatch, authority: CatalogAuthority) => writeImport(batch, authority),
    deferImport: (batch: CatalogPreparedBatch, authority: CatalogAuthority) => writeImport(batch, authority, true),
    replayHistory,
    async hasReplayedImport(parentId: string) {
      const scopeKey = replayScopeKey(parentId), id = replayImportId(scopeKey, "complete");
      const row = await database.query((client) => client.footballImport.findUnique({ where: { id } }));
      return row?.scopeKey === scopeKey && row.kind === historyReplayKind && row.status === "complete" && row.requestsDispatched === 0;
    },
    registerTeamMapping, dateCoverage,
    findImport: async (id: string) => database.query(async (client) => {
      const row = await client.footballImport.findUnique({ where: { id } }); return row ? catalogImportSummary(row) : null;
    }),
    fixtureByProviderId: async (externalId: number) => {
      if (!Number.isSafeInteger(externalId) || externalId <= 0) fail("invalid-state");
      return database.query(async (client) => {
        const row = await client.footballFixture.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(externalId) } }, include: fixtureRelations });
        return row ? catalogFixtureSnapshot(row) : null;
      });
    },
    searchTeams: async (query: string, { limit = 50 }: Readonly<{ limit?: number }> = {}) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || query.length > 512) fail("invalid-state");
      const search = normalizeCatalogSearch(query);
      if (search === "") return Object.freeze([]);
      return database.query((client) => client.footballTeam.findMany({ where: { OR: [{ nameSearch: { contains: search } },
        { aliases: { some: { normalizedSearch: { contains: search } } } }] }, include: { aliases: true }, take: limit, orderBy: { nameSearch: "asc" } }));
    },
    withFixtureTransaction: <Result>(fixtureId: string, operation: (transaction: Prisma.TransactionClient, snapshot: CatalogFixtureSnapshot) => Promise<Result>, existingTransaction?: Prisma.TransactionClient) => {
      const execute = async (transaction: Prisma.TransactionClient) => {
        if (existingTransaction) await lockCatalog(transaction);
        await lockFixture(transaction, fixtureId);
        const row = await transaction.footballFixture.findUnique({ where: { id: fixtureId }, include: fixtureRelations });
        if (!row) return fail("invalid-state");
        return operation(transaction, catalogFixtureSnapshot(row));
      };
      return existingTransaction ? execute(existingTransaction) : write(execute, "fixture-transaction");
    },
  });
}
export type FootballCatalogStore = ReturnType<typeof createFootballCatalogStore>;
