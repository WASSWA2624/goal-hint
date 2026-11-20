import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { reconcileOddsCatalog } from "../../domain/market-registry.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballBounds, type ApiFootballResult } from "../football/api-football-contract.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import type { NormalizedInPlayOdds } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { recentInPlayOddsForRemapping, retainInPlayOddsHistory, type InPlayFixtureOccurrence, type InPlayFixtureOdds } from "./in-play-odds-history.ts";
import { mapInPlayOdds, reviewedInPlayCatalog } from "./in-play-odds-mapping.ts";
import { inPlayOddsFreshMs } from "./in-play-odds-read.ts";

const dayMs = 86_400_000, minuteMs = 60_000;
export const inPlayOddsPollIntervalMs = minuteMs;
const provider = "api-football";
type Adapter = Pick<ReturnType<typeof createApiFootballAdapter>["odds"], "inPlay" | "inPlayBets">;
type PollState = { nextPollAt: Date; catalogDueAt: Date; catalogJson: unknown };
type Fixture = InPlayFixtureOccurrence & { homeExternalId: bigint; awayExternalId: bigint; leagueExternalId: bigint; season: number };
type Previous = { fixtureId: string; kickoffAt: Date; homeTeamId: string; awayTeamId: string; semanticHash: string;
  checkedAt: Date; changedAt: Date; providerUpdatedAt: Date | null; withdrawnAt: Date | null };

function active(now: number) {
  return Prisma.sql`f.provider = ${provider}
    AND (f.status = 'live' OR (f.status = 'scheduled' AND f.kickoff >= ${new Date(now - 45 * minuteMs)}
      AND f.kickoff <= ${new Date(now + 15 * minuteMs)}) OR
      (f.status IN ('finished-regulation','finished-extra-time','finished-penalties','abandoned') AND
        COALESCE((SELECT rs.firstFinalAt FROM FixtureResultState rs WHERE rs.fixtureId=f.id), f.retrievedAt) >= ${new Date(now - 20 * minuteMs)}))`;
}

function bounds(now: number, deadline: number, catalog: boolean): ApiFootballBounds {
  return {
    priority: "enrichment", deadlineAt: utcInstantFromEpochMilliseconds(Math.min(deadline, now + 10_000)),
    timeoutMs: 8_000, maxRequests: 1, maxPages: 1, maxRows: catalog ? 1_000 : 3_000,
    maxResponseBytes: catalog ? 256 * 1024 : 24 * 1024 * 1024,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0,
  };
}

function savedCatalog(raw: unknown): { names: Record<string, string>; hash: string | null } {
  try {
    const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { names: {}, hash: null };
    if ("namespace" in value && value.namespace === "in-play" && "entries" in value && Array.isArray(value.entries)) {
      return { names: reviewedInPlayCatalog(value.entries), hash: evidenceFingerprint(value.entries) };
    }
    return { names: reviewedInPlayCatalog(Object.entries(value).flatMap(([id, name]) => typeof name === "string" ? [{ id: Number(id), name }] : [])), hash: null };
  } catch { return { names: {}, hash: null }; }
}

function competitionScope(competitionIds: readonly number[] | undefined) {
  return competitionIds ? Prisma.sql`AND EXISTS (SELECT 1 FROM FootballSeason s JOIN FootballCompetitionProvider c ON
    c.competitionId=s.competitionId AND c.provider=f.provider WHERE s.id=f.seasonId AND c.externalId IN (${Prisma.join(competitionIds)}))`
    : Prisma.empty;
}
async function claim(database: DatabaseRuntime, now: number, competitionIds: readonly number[] | undefined) {
  const [candidate] = await database.query((tx) => tx.$queryRaw<{ ready: number }[]>`
    SELECT 1 AS ready FROM FootballFixture f WHERE ${active(now)} ${competitionScope(competitionIds)} LIMIT 1`);
  if (!candidate) return null;
  return database.transaction(async (tx) => {
    await tx.$executeRaw`INSERT IGNORE INTO InPlayOddsPollState (provider, nextPollAt, catalogDueAt, catalogJson)
      VALUES (${provider}, ${new Date(0)}, ${new Date(0)}, JSON_OBJECT())`;
    const [previous] = await tx.$queryRaw<PollState[]>`SELECT nextPollAt, catalogDueAt, catalogJson
      FROM InPlayOddsPollState WHERE provider = ${provider} FOR UPDATE`;
    if (!previous || previous.nextPollAt.getTime() > now) return null;
    const fence = new Date(now + inPlayOddsPollIntervalMs);
    await tx.$executeRaw`UPDATE InPlayOddsPollState SET nextPollAt = ${fence} WHERE provider = ${provider}`;
    return { fence, catalogDueAt: previous.catalogDueAt.getTime(), catalog: savedCatalog(previous.catalogJson) };
  });
}

async function writeCurrentPrices(tx: Prisma.TransactionClient, matches: readonly InPlayFixtureOdds[], catalog: Record<string, string>,
  changedAt: Date, displayAllowed: () => boolean, remapping: boolean) {
  if (!displayAllowed() || matches.length === 0) return 0;
  const identities = [...new Set(matches.map(({ fixture }) => fixture.id))];
  const previous = await tx.$queryRaw<Previous[]>`SELECT fixtureId, kickoffAt, homeTeamId, awayTeamId,
    semanticHash, checkedAt, changedAt, providerUpdatedAt, withdrawnAt FROM FixtureInPlayOdds WHERE fixtureId IN (${Prisma.join(identities)})`;
  const byFixture = new Map(previous.map((entry) => [entry.fixtureId, entry]));
  let changed = 0;
  const updates = [];
  for (const { fixture, row } of new Map(matches.map((entry) => [entry.fixture.id, entry])).values()) {
    const prior = byFixture.get(fixture.id);
    const { providerUpdatedAt: update, retrievedAt } = row.source, received = new Date(retrievedAt);
    const sameOccurrence = prior?.kickoffAt.getTime() === fixture.kickoffAt.getTime()
      && prior.homeTeamId === fixture.homeTeamId && prior.awayTeamId === fixture.awayTeamId;
    if (sameOccurrence && (prior.checkedAt > received || !remapping && prior.checkedAt >= received ||
      remapping && prior.withdrawnAt !== null || prior.providerUpdatedAt !== null &&
      (update === null || update < prior.providerUpdatedAt.getTime()))) continue;
    // A malformed group cannot remove an existing price or make an older one look freshly checked.
    if (sameOccurrence && row.partialBets?.length && !row.finished && !row.blocked && !row.stopped) continue;
    const body = mapInPlayOdds(row, catalog, true);
    if (body.state === "unavailable" && (!prior || remapping)) continue;
    const hash = evidenceFingerprint(body);
    const material = !sameOccurrence || prior.semanticHash !== hash;
    const changedOffer = material || prior.withdrawnAt !== null;
    if (remapping && !changedOffer) continue;
    if (changedOffer) changed++;
    updates.push(Prisma.sql`SELECT ${fixture.id} AS fixtureId, ${fixture.kickoffAt} AS kickoffAt, ${fixture.homeTeamId} AS homeTeamId,
      ${fixture.awayTeamId} AS awayTeamId, ${received} AS checkedAt, ${changedOffer ? changedAt : prior.changedAt} AS changedAt,
      ${update === null ? null : new Date(update)} AS providerUpdatedAt, NULL AS withdrawnAt, ${hash} AS semanticHash,
      ${JSON.stringify(body)} AS bodyJson`);
  }
  for (let offset = 0; offset < updates.length; offset += 100) {
    if (displayAllowed() !== true) break;
    const offered = Prisma.join(updates.slice(offset, offset + 100), " UNION ALL ");
    // The poll fence owns both writes. Keep the fixture key immutable under column-scoped grants.
    await tx.$executeRaw`INSERT IGNORE INTO FixtureInPlayOdds (fixtureId, kickoffAt, homeTeamId, awayTeamId, checkedAt, changedAt,
      providerUpdatedAt, withdrawnAt, semanticHash, bodyJson) ${offered}`;
    await tx.$executeRaw`UPDATE FixtureInPlayOdds p JOIN (${offered}) incoming ON incoming.fixtureId = p.fixtureId
      SET p.bodyJson = IF(p.semanticHash <> incoming.semanticHash, incoming.bodyJson, p.bodyJson),
        p.kickoffAt = incoming.kickoffAt, p.homeTeamId = incoming.homeTeamId, p.awayTeamId = incoming.awayTeamId,
        p.checkedAt = incoming.checkedAt, p.changedAt = incoming.changedAt, p.providerUpdatedAt = incoming.providerUpdatedAt,
        p.withdrawnAt = NULL, p.semanticHash = incoming.semanticHash
      WHERE p.checkedAt < incoming.checkedAt OR ${remapping} AND p.checkedAt = incoming.checkedAt AND p.withdrawnAt IS NULL`;
  }
  return changed;
}

async function storePrices(database: DatabaseRuntime, rows: readonly NormalizedInPlayOdds[], catalog: Record<string, string>,
  retrievedAt: number, complete: boolean, fence: Date, allowed: () => boolean, displayAllowed: () => boolean,
  competitionIds: readonly number[] | undefined) {
  const received = new Date(retrievedAt);
  return database.transaction(async (tx) => {
    const [state] = await tx.$queryRaw<{ nextPollAt: Date }[]>`SELECT nextPollAt FROM InPlayOddsPollState
      WHERE provider = ${provider} FOR UPDATE`;
    if (!allowed() || state?.nextPollAt.getTime() !== fence.getTime()) return 0;
    const fixtures = !rows.length ? [] : await tx.$queryRaw<Fixture[]>`
      SELECT f.id, f.externalId AS providerId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
        h.externalId AS homeExternalId, a.externalId AS awayExternalId, c.externalId AS leagueExternalId, s.year AS season
      FROM FootballFixture f JOIN FootballSeason s ON s.id = f.seasonId
      JOIN FootballCompetitionProvider c ON c.competitionId = s.competitionId AND c.provider = f.provider
      JOIN FootballTeamProvider h ON h.teamId = f.homeTeamId AND h.provider = f.provider
      JOIN FootballTeamProvider a ON a.teamId = f.awayTeamId AND a.provider = f.provider
      WHERE f.provider = ${provider} AND f.kickoff <= ${received} AND f.externalId IN (${Prisma.join(rows.map(({ fixtureId }) => BigInt(fixtureId)))})`;
    const providerRows = new Map(rows.map((row) => [row.fixtureId, row]));
    const matched = fixtures.flatMap((fixture) => {
      const row = providerRows.get(Number(fixture.providerId));
      if (!row || row.homeTeamId !== Number(fixture.homeExternalId) || row.awayTeamId !== Number(fixture.awayExternalId)
        || row.competitionId !== Number(fixture.leagueExternalId) || row.season !== fixture.season ||
        row.source.providerUpdatedAt !== null && row.source.providerUpdatedAt < fixture.kickoffAt.getTime() ||
        competitionIds && !competitionIds.includes(row.competitionId)) return [];
      return [{ fixture, row }];
    });
    await retainInPlayOddsHistory(tx, matched, new Set(providerRows.keys()), catalog, retrievedAt, inPlayOddsFreshMs, complete, competitionIds);
    if (!allowed()) throw new Error("In-play odds retention authority changed.");
    let changed = await writeCurrentPrices(tx, matched, catalog, received, displayAllowed, false);
    if (!allowed()) throw new Error("In-play odds retention authority changed.");
    const publicOffers = displayAllowed() === true;
    if (!complete && publicOffers) return changed;
    const omit = publicOffers && rows.length ? Prisma.sql`AND f.externalId NOT IN (${Prisma.join([...providerRows.keys()])})` : Prisma.empty;
    const order = publicOffers ? Prisma.sql`p.checkedAt < ${received}` : Prisma.sql`p.checkedAt <= ${received}`;
    changed += await tx.$executeRaw`UPDATE FixtureInPlayOdds p JOIN FootballFixture f ON f.id=p.fixtureId
      SET p.withdrawnAt = ${received}, p.changedAt = ${received}
      WHERE f.provider = ${provider} AND p.checkedAt >= ${new Date(retrievedAt - inPlayOddsFreshMs)} AND ${order}
        AND p.withdrawnAt IS NULL ${omit} ${competitionScope(competitionIds)}`;
    return changed;
  });
}

function acceptedPage<T>(response: ApiFootballResult<T>, endpoint: "inPlayOdds" | "inPlayOddsBets", openedAt: number, now: number) {
  if (response.status === "failed" || response.requestsDispatched !== 1 || response.provenance.length !== 1) return null;
  const [page] = response.provenance;
  if (!page || page.provider !== provider || page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || page.endpoint !== endpoint ||
    page.fromCache || page.quota.kind !== "success" || page.currentPage !== 1 ||
    page.totalPages === null || !(page.totalPages >= 1 || page.totalPages === 0 && response.data.length === 0) ||
    Object.keys(page.requestParameters).length !== 0 ||
    page.retrievedAt < openedAt || page.retrievedAt > now) return null;
  const complete = page.totalPages <= 1 && response.status === "complete" && response.completeness.complete &&
    response.completeness.invalidRows === 0 && response.completeness.missingIds.length === 0 &&
    response.completeness.reasons.length === 0 && response.error === null;
  return { page, complete };
}

function completeCatalog(response: ApiFootballResult<{ id: number; name: string }>) {
  const names = new Map<number, string | null>(response.data.map(({ id, name }) => [id, name]));
  if (names.size !== response.data.length) return [];
  for (const reason of response.completeness.missingCoverage) {
    const id = Number(/^odds-catalog-name:([1-9]\d{0,9})$/u.exec(reason)?.[1]);
    if (Number.isSafeInteger(id) && id <= 4_294_967_295 && !names.has(id)) names.set(id, null);
  }
  return [...names].sort(([left], [right]) => left - right).map(([id, name]) => ({ id, name }));
}

function verifiedLiveRows(rows: readonly NormalizedInPlayOdds[], retrievedAt: number) {
  const identified = new Map<number, NormalizedInPlayOdds>(), ambiguous = new Set<number>();
  for (const row of rows) {
    if (row.source.provider !== provider || row.source.endpoint !== "/odds/live" || row.source.retrievedAt !== retrievedAt ||
      row.source.providerUpdatedAt !== null && (!Number.isSafeInteger(row.source.providerUpdatedAt) ||
        row.source.providerUpdatedAt < 0 || row.source.providerUpdatedAt > retrievedAt)) continue;
    if (identified.has(row.fixtureId)) ambiguous.add(row.fixtureId);
    identified.set(row.fixtureId, row);
  }
  return [...identified.values()].filter(row => !ambiguous.has(row.fixtureId));
}

export function createInPlayOddsPoller(options: Readonly<{
  database: DatabaseRuntime; adapter: Adapter; now(): number; enabled(): boolean; displayAllowed(): boolean;
  retentionAllowed?: () => boolean;
  competitionIds?: readonly number[];
}>) {
  const { database, adapter, now } = options;
  const competitionIds = options.competitionIds && [...new Set(options.competitionIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  const allowed = () => options.enabled() === true && (competitionIds === undefined || competitionIds.length > 0) &&
    (options.retentionAllowed ?? options.displayAllowed)() === true;
  let nextTick = 0, running = false;
  return Object.freeze({ async poll() {
    let requests = 0, reprojected = 0;
    const result = (outcome: string, changed = 0) => ({ outcome, requests, changed });
    if (!allowed()) return result("disabled");
    const start = now();
    if (running || start < nextTick) return result("waiting");
    running = true;
    nextTick = start + inPlayOddsPollIntervalMs;
    try {
      const claimed = await claim(database, start, competitionIds);
      if (!claimed || !allowed()) return result("quiet");
      const deadline = claimed.fence.getTime();
      let catalog = claimed.catalog.names;
      if (claimed.catalogDueAt <= start) {
        const openedAt = now(), response = await adapter.inPlayBets(bounds(openedAt, deadline, true));
        requests += response.requestsDispatched;
        const observation = acceptedPage(response, "inPlayOddsBets", openedAt, now());
        const catalogRows = observation?.complete ? completeCatalog(response) : [];
        const updated = catalogRows.length > 0;
        if (!allowed()) return result("disabled");
        const catalogNext = updated ? reconcileOddsCatalog("in-play", catalogRows) : null;
        if (catalogNext) catalog = reviewedInPlayCatalog(catalogNext);
        const cycle = observation && catalogNext ? { checkedAt: observation.page.retrievedAt, entries: catalogNext } : null;
        const value = cycle ? Prisma.sql`, catalogJson = ${JSON.stringify({ namespace: "in-play", ...cycle })}` : Prisma.empty;
        reprojected = await database.transaction(async (tx) => {
          const saved = await tx.$executeRaw`UPDATE InPlayOddsPollState SET
            catalogDueAt = ${new Date(start + (updated ? dayMs : 15 * minuteMs))} ${value}
            WHERE provider = ${provider} AND nextPollAt = ${claimed.fence}`;
          if (!saved || !cycle || !options.displayAllowed() || evidenceFingerprint(cycle.entries) === claimed.catalog.hash) return 0;
          const retained = await recentInPlayOddsForRemapping(tx, cycle.checkedAt, inPlayOddsFreshMs, competitionIds);
          const changed = await writeCurrentPrices(tx, retained, catalog, new Date(cycle.checkedAt), options.displayAllowed, true);
          if (!allowed()) throw new Error("In-play odds retention authority changed.");
          return changed;
        });
      }
      if (!allowed() || now() >= deadline) return result("expired", reprojected);
      const openedAt = now(), response = await adapter.inPlay(bounds(openedAt, deadline, false));
      requests += response.requestsDispatched;
      const observation = acceptedPage(response, "inPlayOdds", openedAt, now());
      if (!observation || !allowed()) return result(response.error?.reason ?? "incomplete", reprojected);
      const rows = verifiedLiveRows(response.data, observation.page.retrievedAt);
      const complete = observation.complete && rows.length === response.data.length;
      const changed = await storePrices(database, rows, catalog, observation.page.retrievedAt, complete, claimed.fence,
        allowed, options.displayAllowed, competitionIds);
      return result(complete && rows.every(row => !row.partialBets?.length) ? "complete" : "partial", changed + reprojected);
    } catch {
      return result("unavailable", reprojected);
    } finally { running = false; }
  } });
}
