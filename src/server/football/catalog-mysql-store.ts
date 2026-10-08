import "server-only";

import { randomUUID } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma, FootballFixture, FootballImport, FootballTeam, FootballCompetition } from "../generated/prisma/client.ts";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { NormalizedTeam, NormalizedCompetition, SourceTimestamps } from "./api-football-normalize.ts";
import type { CatalogAuthority, CatalogPreparedBatch, CatalogSelection, CatalogTeamMapping } from "./catalog-contract.ts";
import { normalizeCatalogSearch, isSafeCatalogLogo, parseCatalogTeamMapping, catalogScopeKey, assertCatalogPreparedBatch, parseCatalogEvidenceRef } from "./catalog-input.ts";

const PROVIDER = "api-football";
const MAX_VERSION = 18_446_744_073_709_551_615n;
const fixtureRelations = { homeTeam: true, awayTeam: true, season: { include: { competition: true } } } as const;
type StoredFixture = Prisma.FootballFixtureGetPayload<{ include: typeof fixtureRelations }>;
type SharedHistory<Entity> = Map<string, { before: Entity; aliasesAdded: { name: string; normalizedSearch: string; observedAt: UtcInstant }[] }>;
type FixtureFields = Pick<FootballFixture, "homeTeamId" | "awayTeamId" | "seasonId" | "round" | "kickoff" | "eatDate" | "status" |
  "providerStatus" | "elapsedMinutes" | "regulationHome" | "regulationAway" | "regulationEvidenceRef" | "regulationVerifiedAt">;

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
  const team = (value: FootballTeam) => Object.freeze({ id: value.id, name: value.name, country: value.country,
    logoUrl: value.logoUrl !== null && isSafeCatalogLogo(value.logoUrl) ? value.logoUrl : null });
  const competition = row.season.competition;
  return Object.freeze({ id: row.id, externalId: Number(row.externalId), homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId, seasonId: row.seasonId, round: row.round, kickoff: row.kickoff === null ? null : instant(row.kickoff),
    eatDate: row.eatDate === null ? null : parseReportingDate(row.eatDate.toISOString().slice(0, 10)),
    status: row.status as SettlementStatus, providerStatus: row.providerStatus, elapsedMinutes: row.elapsedMinutes,
    regulationScore: row.regulationHome === null || row.regulationAway === null ? null : Object.freeze({ verified: true as const,
      period: "regulation-including-stoppage-time" as const, home: row.regulationHome, away: row.regulationAway }),
    regulationEvidenceRef: row.regulationEvidenceRef, regulationVerifiedAt: row.regulationVerifiedAt === null ? null : instant(row.regulationVerifiedAt),
    retrievedAt: instant(row.retrievedAt), providerUpdatedAt: row.providerUpdatedAt === null ? null : instant(row.providerUpdatedAt),
    dataVersion: row.dataVersion, homeTeam: team(row.homeTeam), awayTeam: team(row.awayTeam),
    season: Object.freeze({ year: row.season.year, competition: Object.freeze({ id: competition.id, name: competition.name,
      country: competition.country, logoUrl: competition.logoUrl !== null && isSafeCatalogLogo(competition.logoUrl) ? competition.logoUrl : null }) }) });
}
export type CatalogFixtureSnapshot = ReturnType<typeof catalogFixtureSnapshot>;
export type CatalogMutationCoordinator = (mutation: Readonly<{
  transaction: Prisma.TransactionClient;
  before: CatalogFixtureSnapshot | null;
  proposed: Readonly<FixtureFields>;
  apply(): Promise<CatalogFixtureSnapshot>;
}>) => Promise<unknown>;

async function lockCatalog(transaction: Prisma.TransactionClient) {
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
  const visible = (entity: Entity): Record<string, unknown> => ({ name: entity.name, country: entity.country, logoUrl: entity.logoUrl,
    ...("code" in entity ? { code: entity.code, national: entity.national } : { type: entity.type }) });
  const before = visible(entry.before), after = visible(row);
  return { id: row.id, fields: Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value)
    .map(([key, value]) => [key, { before: before[key], after: value }])), aliasesAdded: entry.aliasesAdded };
}

/** All provider I/O happens before this bounded transaction, which serializes catalog identity writes. */
export function createFootballCatalogStore(database: DatabaseRuntime, options: Readonly<{
  clock?: Clock; coordinateFixtureMutation?: CatalogMutationCoordinator; transactionTimeoutMs?: number;
}> = {}) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const transactionTimeout = options.transactionTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(transactionTimeout) || transactionTimeout < 1 || transactionTimeout > 120_000) fail("invalid-state");
  async function write<Result>(operation: (transaction: Prisma.TransactionClient) => Promise<Result>, retryConflicts = options.coordinateFixtureMutation === undefined): Promise<Result> {
    try {
      // The callback contains only transactional writes; retry a genuine deadlock, never external I/O.
      for (let attempt = 0; ; attempt++) {
        let domainError: CatalogStoreError | undefined;
        try { return await database.transaction(async (transaction) => {
          try { await lockCatalog(transaction); return await operation(transaction); }
          catch (error) { if (error instanceof CatalogStoreError) domainError = error; throw error; }
        }, { maxWait: 10_000, timeout: transactionTimeout, isolationLevel: "ReadCommitted" }); }
        catch (error) {
          if (domainError) throw domainError;
          if (!retryConflicts || !(error !== null && typeof error === "object" && "code" in error && error.code === "conflict") || attempt >= 2) throw error;
        }
      }
    } catch (error) { if (error instanceof CatalogStoreError) throw error; return fail("unavailable"); }
  }
  async function applyMutation(transaction: Prisma.TransactionClient, before: StoredFixture | null, proposed: FixtureFields,
    operation: () => Promise<StoredFixture>): Promise<StoredFixture> {
    let calls = 0, result: StoredFixture | undefined, pending: Promise<StoredFixture> | undefined;
    const apply = () => {
      if (++calls !== 1) fail("coordination-failed");
      pending = operation().then((row) => { result = row; return row; });
      const snapshot = pending.then(catalogFixtureSnapshot);
      // An invalid coordinator may throw before awaiting its apply() result.
      void snapshot.catch(() => {});
      return snapshot;
    };
    try {
      if (options.coordinateFixtureMutation) await options.coordinateFixtureMutation({ transaction,
        before: before === null ? null : catalogFixtureSnapshot(before), proposed: Object.freeze(proposed), apply });
      else await apply();
    } catch {
      await pending?.catch(() => {});
      fail("coordination-failed");
    }
    if (calls !== 1 || pending === undefined) fail("coordination-failed");
    await pending;
    if (result === undefined) return fail("coordination-failed");
    return result;
  }
  async function team(transaction: Prisma.TransactionClient, input: NormalizedTeam, authority: CatalogAuthority, changed: Set<string>, history: SharedHistory<FootballTeam>) {
    const mapping = await transaction.footballTeamProvider.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(input.id) } }, include: { team: true } });
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
    let current: FootballCompetition;
    if (!mapping) {
      current = await transaction.footballCompetition.create({ data: { id: randomUUID(), name: input.name,
        nameSearch: input.name === null ? null : normalizeCatalogSearch(input.name), country: input.country,
        countrySearch: input.country === null ? null : normalizeCatalogSearch(input.country), type: input.type,
        logoUrl: permittedLogo(input.logo, null, authority), retrievedAt: new Date(input.source.retrievedAt), providerUpdatedAt: timestamp(input.source.providerUpdatedAt) } });
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
        current = await transaction.footballCompetition.update({ where: { id: current.id }, data: { ...data,
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
    if (!fresh(source, current)) return current;
    const previousCoverage = current.coverage !== null && typeof current.coverage === "object" && !Array.isArray(current.coverage) ? current.coverage : {};
    const coverage = metadata ? { ...previousCoverage, ...Object.fromEntries(Object.entries(metadata.coverage).filter(([, value]) => value !== null)) } : previousCoverage;
    return transaction.footballSeason.update({ where: { id: current.id }, data: { current: metadata?.current ?? current.current,
      ...(metadata ? { coverage: json(coverage) } : {}), retrievedAt: new Date(source.retrievedAt), providerUpdatedAt: timestamp(source.providerUpdatedAt) ?? current.providerUpdatedAt } });
  }
  async function audit(transaction: Prisma.TransactionClient, row: StoredFixture, importId: string, observedAt: UtcInstant, changes: Record<string, unknown>) {
    await transaction.footballFixtureAudit.create({ data: { id: randomUUID(), fixtureId: row.id, importId,
      dataVersion: row.dataVersion, observedAt: new Date(observedAt), changes: json(changes) } });
  }
  async function importBatch(batch: CatalogPreparedBatch, authority: CatalogAuthority): Promise<CatalogImportSummary> {
    assertCatalogPreparedBatch(batch, authority);
    authorize(batch, authority);
    return write(async (transaction) => {
      authorize(batch, authority);
      const existing = await transaction.footballImport.findUnique({ where: { id: batch.request.id } });
      if (existing) {
        if (existing.fingerprint !== batch.fingerprint || existing.requestFingerprint !== batch.requestFingerprint) fail("conflicting-import");
        return catalogImportSummary(existing);
      }
      const receivedCount = batch.rows.fixtures.length + batch.rows.teams.length + batch.rows.competitions.length + batch.invalidRows;
      await transaction.footballImport.create({ data: { id: batch.request.id, fingerprint: batch.fingerprint, requestFingerprint: batch.requestFingerprint,
        selection: json(batch.selection), scopeKey: batch.scopeKey, provider: PROVIDER, kind: batch.selection.kind, status: batch.status,
        observedAt: new Date(batch.observedAt), recordedAt: new Date(clock.now()), receivedCount, importedCount: receivedCount - batch.invalidRows,
        rejectedCount: batch.invalidRows, requestsDispatched: batch.requestsDispatched, reasons: json(batch.reasons),
        missingIds: json(batch.missingIds), missingCoverage: json(batch.missingCoverage), provenance: json(batch.provenance),
        retentionEvidenceRef: batch.request.retentionEvidenceRef, subsetEvidenceRef: batch.request.knownSubset?.evidenceRef ?? null,
        fixtureIds: [], changedFixtureIds: [] } });
      const changedTeams = new Set<string>(), changedCompetitions = new Set<string>(), changedFixtures = new Set<string>(), insertedFixtures = new Set<string>(), fixtureIds: string[] = [];
      const teamHistory: SharedHistory<FootballTeam> = new Map(), competitionHistory: SharedHistory<FootballCompetition> = new Map();
      const priorSnapshot = (row: StoredFixture): StoredFixture => ({ ...row,
        homeTeam: teamHistory.get(row.homeTeamId)?.before ?? row.homeTeam,
        awayTeam: teamHistory.get(row.awayTeamId)?.before ?? row.awayTeam,
        season: { ...row.season, competition: competitionHistory.get(row.season.competitionId)?.before ?? row.season.competition } });
      for (const input of batch.rows.teams) await team(transaction, input, authority, changedTeams, teamHistory);
      for (const input of batch.rows.competitions) await competition(transaction, input, authority, changedCompetitions, competitionHistory);
      for (const input of batch.rows.fixtures) {
        const homeTeamId = await team(transaction, input.homeTeam, authority, changedTeams, teamHistory), awayTeamId = await team(transaction, input.awayTeam, authority, changedTeams, teamHistory);
        const competitionId = await competition(transaction, input.competition, authority, changedCompetitions, competitionHistory);
        const season = await upsertSeason(transaction, competitionId, input.competition.season!, input.competition.source);
        const previous = await transaction.footballFixture.findUnique({ where: { provider_externalId: { provider: PROVIDER, externalId: BigInt(input.id) } }, include: fixtureRelations });
        if (homeTeamId === awayTeamId) fail("invalid-state");
        if (previous) { fixtureIds.push(previous.id); await lockFixture(transaction, previous.id); }
        if (previous && !fresh(input.source, previous)) continue;
        const status = input.status === "unknown" && previous ? previous.status : input.status;
        const kickoff = input.kickoff === null ? previous?.kickoff ?? null : new Date(input.kickoff);
        const providerStatus = input.status === "unknown" && previous ? previous.providerStatus : input.providerStatus ?? previous?.providerStatus ?? null;
        const score = input.regulationScore;
        const scoreEvidence = batch.scoreEvidenceRefs?.[String(input.id)];
        const proof = score === null ? null : { fixtureId: score.fixtureId, providerStatus: score.providerStatus,
          sourceField: score.sourceField, period: score.period, home: score.home, away: score.away };
        const verified = score?.verified === true && scoreEvidence && proof !== null && trusted(authority.verifyRegulationScore, proof);
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
        if (!previous || material) {
          const row = await applyMutation(transaction, previous ? priorSnapshot(previous) : null, proposed, () => previous
            ? transaction.footballFixture.update({ where: { id: previous.id }, data: { ...proposed, ...metadata, dataVersion: { increment: 1n } }, include: fixtureRelations })
            : transaction.footballFixture.create({ data: { id: randomUUID(), provider: PROVIDER, externalId: BigInt(input.id), ...proposed, ...metadata }, include: fixtureRelations }));
          if (!previous) { fixtureIds.push(row.id); insertedFixtures.add(row.id); }
          changedFixtures.add(row.id); await audit(transaction, row, batch.request.id, input.source.retrievedAt, changes);
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
          const row = await applyMutation(transaction, priorSnapshot(previous), fields(previous), () => transaction.footballFixture.update({
            where: { id: previous.id }, data: { dataVersion: { increment: 1n } }, include: fixtureRelations }));
          changedFixtures.add(row.id); await audit(transaction, row, batch.request.id, batch.observedAt,
            { sharedIdentity: { teamIds: [...changedTeams], competitionIds: [...changedCompetitions] } });
        }
        // Include shared changes in the same version audit, even for directly changed fixtures.
        const audits = await transaction.footballFixtureAudit.findMany({ where: { importId: batch.request.id },
          include: { fixture: { include: fixtureRelations } } });
        for (const entry of audits) {
          const sharedIdentity = { teams: [entry.fixture.homeTeam, entry.fixture.awayTeam]
            .map((row) => sharedChanges(teamHistory, row)).filter((value) => value !== null),
          competitions: [sharedChanges(competitionHistory, entry.fixture.season.competition)].filter((value) => value !== null) };
          if (sharedIdentity.teams.length || sharedIdentity.competitions.length) {
            const original = entry.changes !== null && typeof entry.changes === "object" && !Array.isArray(entry.changes) ? entry.changes : {};
            await transaction.footballFixtureAudit.update({ where: { id: entry.id }, data: { changes: json({ ...original, sharedIdentity }) } });
          }
        }
      }
      authorize(batch, authority);
      return catalogImportSummary(await transaction.footballImport.update({ where: { id: batch.request.id },
        data: { fixtureIds: json(fixtureIds), changedFixtureIds: json([...changedFixtures]) } }));
    });
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
  return Object.freeze({ importBatch, registerTeamMapping, dateCoverage,
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
    withFixtureTransaction: <Result>(fixtureId: string, operation: (transaction: Prisma.TransactionClient, snapshot: CatalogFixtureSnapshot) => Promise<Result>) => write(async (transaction) => {
      await lockFixture(transaction, fixtureId);
      const row = await transaction.footballFixture.findUnique({ where: { id: fixtureId }, include: fixtureRelations });
      if (!row) return fail("invalid-state");
      return operation(transaction, catalogFixtureSnapshot(row));
    }, false),
  });
}
export type FootballCatalogStore = ReturnType<typeof createFootballCatalogStore>;
